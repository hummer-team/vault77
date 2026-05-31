/**
 * OrderFunnelAnalysisStrategy
 *
 * Builds DuckDB SQL for fn_ecom_order_funnel_analysis (订单全链路漏斗转化分析).
 *
 * SQL pipeline (CTE):
 *   src              → filter excluded statuses + userWhere (condition nodes)
 *   [repurchase_users]  → optional CTE when repurchase step enabled (COUNT DISTINCT user_id ≥ 2)
 *   counts           → single-row aggregation: COUNT per enabled step
 *   SELECT * FROM counts
 *
 * postProcess:
 *   Transforms single-row counts → per-step funnel rows
 *   Computes step-over-step conversion_rate, drop_rate, abs_conversion_rate (vs first step)
 *   Generates 4 InsightItems:
 *     1. bottleneck step (warning/critical)
 *     2. overall conversion rate (insight)
 *     3. per-step order count table (order)
 *     4. optimization direction (critical/safe)
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type OperatorInsightsData,
  type InsightItem,
  type OperatorDisplayConfig,
  type OrderFunnelAnalysisConfig,
  type FunnelStepKey,
  type ValidationError,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

/** Human-readable labels for each funnel step */
const STEP_LABELS: Record<FunnelStepKey, string> = {
  order:      '下单',
  pay:        '支付',
  confirm:    '审核确认',
  ship:       '发货',
  receive:    '签收',
  review:     '评价',
  repurchase: '复购',
};

/** Optimization suggestions per bottleneck step key */
const STEP_SUGGESTIONS: Record<FunnelStepKey, string> = {
  order:      '',
  pay:        '支付流失高，建议优化支付页面或增加支付方式',
  confirm:    '审核流失高，建议简化审核流程或提升自动审核率',
  ship:       '发货流失高，建议优化仓储效率并推行24h发货承诺',
  receive:    '签收流失高，建议优化物流时效并提供实时追踪',
  review:     '评价率低，建议签收后自动推送评价引导',
  repurchase: '复购率低，建议推出复购优惠券或会员积分体系',
};

/** Canonical step order for SQL generation and display */
const STEP_ORDER: FunnelStepKey[] = [
  'order', 'pay', 'confirm', 'ship', 'receive', 'review', 'repurchase',
];

// ============================================================================
// Row type returned by DuckDB (single-row aggregation)
// ============================================================================

type CountRow = Record<string, number | bigint | null>;

// ============================================================================
// Strategy
// ============================================================================

export class OrderFunnelAnalysisStrategy extends BaseStrategy {
  readonly type = OperatorType.ORDER_FUNNEL_ANALYSIS;
  readonly name = '订单全链路漏斗转化分析';

  private _lastConfig: OrderFunnelAnalysisConfig | null = null;

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[],
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { orderFunnelAnalysisConfig?: OrderFunnelAnalysisConfig } | undefined)
      ?.orderFunnelAnalysisConfig;

    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    if (!cfg.orderIdCol) {
      errors.push({
        nodeId,
        nodeType: FlowNodeType.SELECT,
        severity: ValidationSeverity.ERROR,
        message: 'funnel analysis: 请选择订单ID列',
      });
    }

    if (!cfg.steps.order?.colName) {
      errors.push({
        nodeId,
        nodeType: FlowNodeType.SELECT,
        severity: ValidationSeverity.ERROR,
        message: 'funnel analysis: 下单时间列（create_time）为必填',
      });
    }

    if (cfg.steps.repurchase?.enabled && !cfg.userIdCol) {
      errors.push({
        nodeId,
        nodeType: FlowNodeType.SELECT,
        severity: ValidationSeverity.ERROR,
        message: 'funnel analysis: 启用复购步骤需要选择用户ID列',
      });
    }

    return errors;
  }

  // --------------------------------------------------------------------------
  // buildOperatorSql
  // --------------------------------------------------------------------------

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _ph: Record<string, unknown> | undefined,
    userWhere: string,
  ): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { orderFunnelAnalysisConfig?: OrderFunnelAnalysisConfig } | undefined)
      ?.orderFunnelAnalysisConfig;

    if (!tableName || !cfg) {
      console.warn(`[${this.name}.buildOperatorSql] missing table or config — returning empty`);
      return 'SELECT 1 WHERE false';
    }

    this._lastConfig = cfg;

    const { orderIdCol, steps, userIdCol, excludeStatuses, orderStatusCol } = cfg;
    const tbl = `"${tableName}"`;
    const oid = `"${orderIdCol}"`;
    const statusCol = orderStatusCol || 'order_status';

    // Build WHERE parts for src CTE
    const whereParts: string[] = [];

    if (excludeStatuses) {
      const statusList = excludeStatuses
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (statusList.length > 0) {
        const quoted = statusList.map((s) => `'${s}'`).join(', ');
        whereParts.push(`"${statusCol}" NOT IN (${quoted})`);
      }
    }

    if (userWhere) {
      whereParts.push(userWhere.replace(/^WHERE\s+/i, ''));
    }

    const whereClause = whereParts.length > 0 ? `\n  WHERE ${whereParts.join(' AND ')}` : '';

    // CTEs
    const ctes: string[] = [
      `src AS (\n  SELECT * FROM ${tbl}${whereClause}\n)`,
    ];

    // Optional repurchase_users CTE
    const repurchaseEnabled = steps.repurchase?.enabled && Boolean(userIdCol);
    if (repurchaseEnabled && userIdCol) {
      ctes.push(
        `repurchase_users AS (\n  SELECT "${userIdCol}" FROM src GROUP BY "${userIdCol}" HAVING COUNT(*) >= 2\n)`,
      );
    }

    // Build count expressions — one per enabled step (excluding 'order' anchor which is always included)
    const countExprs: string[] = [
      `COUNT(DISTINCT ${oid}) AS cnt_order`,
    ];

    for (const key of STEP_ORDER.slice(1)) {
      if (!steps[key]?.enabled || !steps[key]?.colName) continue;

      if (key === 'repurchase') {
        if (repurchaseEnabled && userIdCol) {
          countExprs.push(
            `(SELECT COUNT(DISTINCT "${userIdCol}") FROM repurchase_users) AS cnt_repurchase`,
          );
        }
      } else {
        const col = `"${steps[key].colName}"`;
        countExprs.push(
          `COUNT(DISTINCT CASE WHEN ${col} IS NOT NULL THEN ${oid} END) AS cnt_${key}`,
        );
      }
    }

    ctes.push(`counts AS (\n  SELECT ${countExprs.join(',\n    ')} FROM src\n)`);

    return `WITH ${ctes.join(',\n')}\nSELECT * FROM counts`;
  }

  // --------------------------------------------------------------------------
  // postProcess
  // --------------------------------------------------------------------------

  async postProcess(
    queryResult: { data: unknown[]; schema: unknown[] },
  ): Promise<AnalysisResult> {
    const rows = queryResult.data as CountRow[];

    if (!this._lastConfig || rows.length === 0) {
      return this._buildEmptyResult(queryResult);
    }

    const cfg = this._lastConfig;
    const { steps } = cfg;

    // Helper: safe number from BigInt or null
    const safeNum = (v: number | bigint | null | undefined): number => {
      if (v == null) return 0;
      return typeof v === 'bigint' ? Number(v) : v;
    };

    // Build ordered enabled steps with their counts
    interface StepStat {
      key: FunnelStepKey;
      label: string;
      count: number;
    }

    const row = rows[0];
    const cntOrder = safeNum(row['cnt_order']);
    const stats: StepStat[] = [
      { key: 'order', label: STEP_LABELS.order, count: cntOrder },
    ];

    for (const key of STEP_ORDER.slice(1)) {
      if (steps[key]?.enabled && steps[key]?.colName) {
        stats.push({ key, label: STEP_LABELS[key], count: safeNum(row[`cnt_${key}`]) });
      }
    }

    // Build funnel rows with conversion / drop rates
    interface FunnelRow {
      step: string;
      count: number;
      conversion_rate: number;
      drop_rate: number;
      abs_conversion_rate: number;
    }

    const funnelRows: FunnelRow[] = stats.map((s, i) => {
      const prev = i === 0 ? s.count : stats[i - 1].count;
      const convRate = prev > 0 ? Math.round((s.count / prev) * 1000) / 10 : 0;
      const absRate  = cntOrder > 0 ? Math.round((s.count / cntOrder) * 1000) / 10 : 0;
      return {
        step: s.label,
        count: s.count,
        conversion_rate: i === 0 ? 100 : convRate,
        drop_rate:       i === 0 ? 0   : Math.round((100 - convRate) * 10) / 10,
        abs_conversion_rate: absRate,
      };
    });

    // Find bottleneck: step (excluding anchor) with highest drop_rate
    const bottleneckRow = funnelRows.slice(1).reduce<FunnelRow | null>(
      (worst, r) => (!worst || r.drop_rate > worst.drop_rate ? r : worst),
      null,
    );
    const bottleneckKey = bottleneckRow
      ? (stats.find((s) => s.label === bottleneckRow.step)?.key ?? 'pay')
      : null;

    // Overall conversion = last step / first step
    const lastFunnel = funnelRows[funnelRows.length - 1];
    const overallRate = cntOrder > 0
      ? Math.round((lastFunnel.count / cntOrder) * 1000) / 10
      : 0;

    // ---- InsightItem 1: bottleneck ----
    const bottleneckItem: InsightItem = bottleneckRow && bottleneckKey
      ? {
          id: 'funnel-bottleneck',
          cardType: 'standard',
          iconKey: bottleneckRow.drop_rate >= 30 ? 'critical' : 'warning',
          title: `瓶颈步骤：${bottleneckRow.step}`,
          sortOrder: 1,
          description: `环比流失率 ${bottleneckRow.drop_rate}%，仅 ${bottleneckRow.count.toLocaleString()} 单到达此步骤`,
          suggestion: STEP_SUGGESTIONS[bottleneckKey],
          metrics: [
            { label: '流失率', value: bottleneckRow.drop_rate, unit: '%', highlight: true },
            { label: '到达量', value: bottleneckRow.count, unit: '单' },
            { label: '绝对转化', value: bottleneckRow.abs_conversion_rate, unit: '%' },
          ],
        }
      : {
          id: 'funnel-no-bottleneck',
          cardType: 'standard',
          iconKey: 'safe',
          title: '无明显瓶颈',
          sortOrder: 1,
          description: '各步骤转化率均衡，暂无显著流失节点',
        };

    // ---- InsightItem 2: overall conversion ----
    const overallItem: InsightItem = {
      id: 'funnel-overall',
      cardType: 'standard',
      iconKey: 'insight',
      title: '整体转化率',
      sortOrder: 2,
      description: `共 ${cntOrder.toLocaleString()} 笔订单参与漏斗分析，最终 ${lastFunnel.count.toLocaleString()} 单完成「${lastFunnel.step}」`,
      metrics: [
        { label: '整体转化', value: overallRate, unit: '%', highlight: true },
        { label: '下单量', value: cntOrder, unit: '单' },
        { label: '末步到达', value: lastFunnel.count, unit: '单' },
      ],
    };

    // ---- InsightItem 3: per-step counts ----
    const stepSummary = funnelRows
      .map((r) => `${r.step} ${r.count.toLocaleString()}单`)
      .join(' → ');

    const countsItem: InsightItem = {
      id: 'funnel-step-counts',
      cardType: 'standard',
      iconKey: 'order',
      title: '各步骤订单数',
      sortOrder: 3,
      description: stepSummary,
      metrics: funnelRows.slice(0, 4).map((r) => ({
        label: r.step,
        value: r.count,
        unit: '单',
      })),
    };

    // ---- InsightItem 4: optimization direction ----
    const optimizeItem: InsightItem = {
      id: 'funnel-optimize',
      cardType: 'standard',
      iconKey: bottleneckRow && bottleneckRow.drop_rate >= 30 ? 'critical' : 'safe',
      title: '优化方向',
      sortOrder: 4,
      description: bottleneckKey
        ? STEP_SUGGESTIONS[bottleneckKey]
        : '当前各步骤转化表现良好，建议持续监控复购路径',
    };

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount:       cntOrder,
        totalFilterRecordCount: cntOrder,
        totalOrderCount:        cntOrder,
      },
      insights: [bottleneckItem, overallItem, countsItem, optimizeItem],
    };

    const displayConfig: OperatorDisplayConfig = {
      defaultSort: { column: 'count', order: 'descend' },
      columnTooltips: {
        step:               '漏斗步骤名称',
        count:              '该步骤到达的去重订单数',
        conversion_rate:    '环比转化率 = 当前步骤 / 上一步骤',
        drop_rate:          '环比流失率 = 1 - 环比转化率',
        abs_conversion_rate: '绝对转化率 = 当前步骤 / 下单量',
      },
    };

    return {
      type: OperatorType.ORDER_FUNNEL_ANALYSIS,
      sql: '',
      data: funnelRows as unknown as Record<string, unknown>[],
      schema: queryResult.schema as unknown[],
      insightsData,
      displayConfig,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _buildEmptyResult(queryResult: { data: unknown[]; schema: unknown[] }): AnalysisResult {
    return {
      type: OperatorType.ORDER_FUNNEL_ANALYSIS,
      sql: '',
      data: [],
      schema: queryResult.schema as unknown[],
      insightsData: { insights: [] },
      displayConfig: {},
    };
  }
}
