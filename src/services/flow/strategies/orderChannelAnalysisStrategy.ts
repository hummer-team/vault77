/**
 * OrderChannelAnalysisStrategy
 *
 * Builds DuckDB SQL for fn_ecom_order_channel_analysis (订单渠道/来源/平台归因分析).
 *
 * SQL pipeline (pure aggregation, no WASM):
 *   src  → filter by userWhere (condition nodes)
 *   agg  → GROUP BY dimensionCol: order_count, total_amount, total_profit,
 *           avg_order_value, roi, refund_rate
 *   final → SELECT * FROM agg ORDER BY roi DESC
 *
 * postProcess:
 *   TOP-N channels (topN, default 3) by total_amount DESC → InsightItems (iconKey: 'order')
 *   1 lowest-efficiency channel by roi ASC → 1 InsightItem (iconKey: 'warning')
 *   roiThreshold (default 0.3) controls the suggestion tone for Top1 channel
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
  type OrderChannelAnalysisConfig,
  type ValidationError,
} from '../types';

// ============================================================================
// Row type returned by DuckDB
// ============================================================================

interface ChannelRow {
  dimension_label: string;
  order_count: number | bigint;
  total_amount: number;
  total_profit: number;
  avg_order_value: number;
  roi: number;
  refund_rate: number;
}

// ============================================================================
// Display label map for dimension type
// ============================================================================

const DIMENSION_LABEL: Record<string, string> = {
  channel:   '渠道',
  source:    '来源',
  platform:  '平台',
  live_room: '直播间',
};

// ============================================================================
// Strategy
// ============================================================================

export class OrderChannelAnalysisStrategy extends BaseStrategy {
  readonly type = OperatorType.ORDER_CHANNEL_ANALYSIS;
  readonly name = '渠道归因分析';

  private _lastConfig: OrderChannelAnalysisConfig | null = null;

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  // ============================================================================
  // Validation
  // ============================================================================

  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[]
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { orderChannelAnalysisConfig?: OrderChannelAnalysisConfig } | undefined)
      ?.orderChannelAnalysisConfig;

    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    const required: Array<[keyof OrderChannelAnalysisConfig, string]> = [
      ['dimensionCol',   '维度列（dimensionCol）为必填'],
      ['orderIdCol',     '订单ID列（orderIdCol）为必填'],
      ['netAmountCol',   '销售额列（netAmountCol）为必填'],
      ['grossProfitCol', '毛利润列（grossProfitCol）为必填'],
    ];

    for (const [field, message] of required) {
      if (!cfg[field]) {
        errors.push({
          nodeId,
          nodeType: FlowNodeType.SELECT,
          severity: ValidationSeverity.ERROR,
          message: `channel analysis: ${message}`,
        });
      }
    }

    // Validate refund-rate-specific columns when mode = 'amount'
    if (cfg.refundRateMode === 'amount' && !cfg.refundAmountCol) {
      errors.push({
        nodeId,
        nodeType: FlowNodeType.SELECT,
        severity: ValidationSeverity.ERROR,
        message: 'channel analysis: refundAmountCol required when refundRateMode is "amount"',
      });
    }

    return errors;
  }

  // ============================================================================
  // SQL builder
  // ============================================================================

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _ph: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const tableNode  = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName  = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { orderChannelAnalysisConfig?: OrderChannelAnalysisConfig } | undefined)
      ?.orderChannelAnalysisConfig;

    if (!tableName || !cfg) {
      console.warn(`[${this.name}.buildOperatorSql] missing table or config — returning empty`);
      return 'SELECT 1 WHERE false';
    }

    this._lastConfig = cfg;

    const {
      dimensionCol,
      orderIdCol,
      netAmountCol,
      grossProfitCol,
      refundRateMode,
      isRefundCol,
      refundAmountCol,
    } = cfg;

    const tbl  = `"${tableName}"`;
    const dim  = `"${dimensionCol}"`;
    const oid  = `"${orderIdCol}"`;
    const amt  = `"${netAmountCol}"`;
    const prof = `"${grossProfitCol}"`;

    // --- src CTE: inject userWhere (condition nodes connectivity) ---
    const whereClause = userWhere ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '')}` : '';
    const srcCte = `src AS (\n  SELECT * FROM ${tbl}${whereClause}\n)`;

    // --- refund_rate expression ---
    let refundExpr: string;
    if (refundRateMode === 'amount' && refundAmountCol) {
      const ramt = `"${refundAmountCol}"`;
      refundExpr = `ROUND(SUM(${ramt}) / NULLIF(SUM(${amt}), 0), 4)`;
    } else if (isRefundCol) {
      // Mode A (count-based): refunded orders / total orders
      const iref = `"${isRefundCol}"`;
      refundExpr = `ROUND(SUM(CASE WHEN ${iref} = 1 THEN 1 ELSE 0 END) * 1.0 / NULLIF(COUNT(DISTINCT ${oid}), 0), 4)`;
    } else {
      // No refund column configured — return 0
      refundExpr = 'CAST(0 AS DOUBLE)';
    }

    // --- agg CTE ---
    const aggCte = `agg AS (
  SELECT
    ${dim}                                                                              AS dimension_label,
    COUNT(DISTINCT ${oid})                                                              AS order_count,
    ROUND(SUM(${amt}), 2)                                                               AS total_amount,
    ROUND(SUM(${prof}), 2)                                                              AS total_profit,
    ROUND(SUM(${amt}) / NULLIF(COUNT(DISTINCT ${oid}), 0), 2)                          AS avg_order_value,
    ROUND(SUM(${prof}) / NULLIF(SUM(${amt}), 0), 4)                                    AS roi,
    ${refundExpr}                                                                       AS refund_rate
  FROM src
  GROUP BY ${dim}
)`;

    return `WITH ${srcCte},\n${aggCte}\nSELECT * FROM agg\nORDER BY roi DESC`;
  }

  // ============================================================================
  // postProcess
  // ============================================================================

  async postProcess(
    queryResult: { data: unknown[]; schema: unknown[] }
  ): Promise<AnalysisResult> {
    const rows = queryResult.data as ChannelRow[];

    if (rows.length === 0) {
      return this.buildEmptyResult(queryResult);
    }

    const dimType = this._lastConfig?.dimension ?? 'channel';
    const dimLabel = DIMENSION_LABEL[dimType] ?? '维度';
    const topN = Math.max(1, Math.min(10, this._lastConfig?.topN ?? 3));
    const roiThreshold = this._lastConfig?.roiThreshold ?? 0.3;

    // --- TOP-N by total_amount DESC ---
    const byAmount = [...rows].sort(
      (a, b) => Number(b.total_amount) - Number(a.total_amount)
    );
    const topRows = byAmount.slice(0, topN);

    // --- 1 lowest by roi ASC ---
    const byRoi = [...rows].sort(
      (a, b) => Number(a.roi) - Number(b.roi)
    );
    const lowestRoi = byRoi[0];

    const insights: InsightItem[] = [];

    // TOP-N insight cards
    topRows.forEach((row, idx) => {
      const label = String(row.dimension_label ?? '—');
      const amount = Number(row.total_amount);
      const orderCnt = Number(row.order_count);
      const roi = Number(row.roi);
      const refundRate = Number(row.refund_rate);

      insights.push({
        id: `channel-top-${idx + 1}`,
        cardType: 'standard',
        iconKey: 'order',
        title: `${dimLabel}Top${idx + 1}：${label}`,
        sortOrder: idx + 1,
        description: `销售额 ¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，ROI ${(roi * 100).toFixed(1)}%，退款率 ${(refundRate * 100).toFixed(1)}%`,
        suggestion: this.buildTopSuggestion(label, amount, roi, idx, roiThreshold),
        metrics: [
          { label: '订单量',  value: orderCnt,                                  unit: '单',  highlight: idx === 0 },
          { label: '销售额',  value: Math.round(amount),                        unit: '元' },
          { label: 'ROI',     value: Number((roi * 100).toFixed(1)),            unit: '%' },
          { label: '退款率',  value: Number((refundRate * 100).toFixed(1)),     unit: '%' },
        ],
      });
    });

    // Lowest ROI insight card (only if not already in top3 or if rows > 1)
    if (rows.length > 1 && lowestRoi) {
      const label = String(lowestRoi.dimension_label ?? '—');
      const roi = Number(lowestRoi.roi);
      const amount = Number(lowestRoi.total_amount);
      const orderCnt = Number(lowestRoi.order_count);
      const refundRate = Number(lowestRoi.refund_rate);

      insights.push({
        id: 'channel-low-roi',
        cardType: 'standard',
        iconKey: 'warning',
        title: `低效${dimLabel}：${label}`,
        sortOrder: insights.length + 1,
        description: `ROI 仅 ${(roi * 100).toFixed(1)}%，销售额 ¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，退款率 ${(refundRate * 100).toFixed(1)}%`,
        suggestion: `「${label}」ROI 在所有${dimLabel}中最低，建议核查该${dimLabel}的获客成本、客单质量与退款原因，考虑压缩预算或优化投放策略。`,
        metrics: [
          { label: '订单量',  value: orderCnt,                                  unit: '单' },
          { label: '销售额',  value: Math.round(amount),                        unit: '元' },
          { label: 'ROI',     value: Number((roi * 100).toFixed(1)),            unit: '%',  highlight: true },
          { label: '退款率',  value: Number((refundRate * 100).toFixed(1)),     unit: '%' },
        ],
      });
    }

    const totalOrderCount = rows.reduce((s, r) => s + Number(r.order_count ?? 0), 0);

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount:       rows.length,
        totalFilterRecordCount: rows.length,
        totalOrderCount,
      },
      insights,
    };

    const displayConfig: OperatorDisplayConfig = {
      defaultSort: { column: 'total_amount', order: 'descend' },
      columnTooltips: {
        dimension_label: `${dimLabel}分组值`,
        order_count:     '去重订单量',
        total_amount:    '净销售额（SUM）',
        total_profit:    '毛利润（SUM）',
        avg_order_value: '客单价 = 销售额 / 订单量',
        roi:             'ROI = 毛利润 / 销售额',
        refund_rate:     '退款率（按订单数或金额，取决于配置）',
      },
    };

    return {
      type: OperatorType.ORDER_CHANNEL_ANALYSIS,
      sql: '',
      data: rows as unknown as Record<string, unknown>[],
      schema: queryResult.schema as unknown[],
      insightsData,
      displayConfig,
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private buildTopSuggestion(label: string, amount: number, roi: number, rank: number, roiThreshold: number): string {
    if (rank === 0) {
      if (roi > roiThreshold) {
        return `「${label}」是最高销售额渠道且 ROI 优秀（${(roi * 100).toFixed(1)}%，超过基准线 ${(roiThreshold * 100).toFixed(0)}%），建议持续加大投入，优先保障该渠道资源。`;
      }
      return `「${label}」销售额最高，但 ROI 仍有提升空间（${(roi * 100).toFixed(1)}%，低于基准线 ${(roiThreshold * 100).toFixed(0)}%），建议分析其高流量是否转化为实际利润。`;
    }
    if (rank === 1) {
      return `「${label}」排名第 2（销售额 ¥${Math.round(amount).toLocaleString()}），建议对标 Top1 渠道寻找增长差距。`;
    }
    return `「${label}」排名第 ${rank + 1}，销售额 ¥${Math.round(amount).toLocaleString()}，可作为潜力渠道重点跟进。`;
  }

  private buildEmptyResult(queryResult: { data: unknown[]; schema: unknown[] }): AnalysisResult {
    return {
      type:    OperatorType.ORDER_CHANNEL_ANALYSIS,
      sql:     '',
      data:    [],
      schema:  queryResult.schema as unknown[],
      insightsData: {
        summary:  { totalRecordCount: 0, totalFilterRecordCount: 0 },
        insights: [],
      },
    };
  }
}
