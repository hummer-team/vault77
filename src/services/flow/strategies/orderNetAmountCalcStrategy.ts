/**
 * OrderNetAmountCalcStrategy
 *
 * Builds DuckDB SQL for fn_ecom_order_net_amount_calc (订单净额计算 — 退款后实收).
 *
 * SQL pipeline (CTE):
 *   src        → filtered source table (userWhere injected here)
 *   base_calc  → per-row net_amount + refund_rate with COALESCE + excluded status handling
 *   SELECT * FROM base_calc
 *
 * postProcess:
 *   Enriches 5 derived fields (net_amount_rounded, refund_rate_percent,
 *   refund_risk_tag, is_abnormal, order_status_cn) + generates 3 InsightItem cards.
 *   Empty result → warning InsightItem.
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
  type NetAmountCalcConfig,
  type ValidationError,
} from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// Field match patterns — exported for Drawer auto-match
// ============================================================================

/**
 * Regex patterns for auto-matching column names (English + Chinese).
 * Used by OrderNetAmountCalcDrawer to pre-fill column selectors.
 */
export const FIELD_MATCH_PATTERNS: Record<string, RegExp> = {
  payAmountCol:      /(实付|pay[_\s]?amount|payment)/i,
  refundAmountCol:   /(退款|refund[_\s]?amount)/i,
  rejectionAmountCol: /(拒签|reject|refuse)/i,
  orderStatusCol:    /(order[_\s]?status|订单状态)/i,
  orderIdCol:        /^(order[_\s]?id|orderid|order[_\s]?no|orderno|trans[_\s]?id|bill[_\s]?id)$|订单|单号|交易|流水/i,
  userIdCol:         /^(user[_\s]?id|userid|member[_\s]?id|memberid|customer[_\s]?id|buyer[_\s]?id|account[_\s]?id)$|用户|会员|买家/i,
  skuIdCol:          /^(sku[_\s]?id|skuid|product[_\s]?id|productid|item[_\s]?id|goods[_\s]?id)$|商品|产品|sku/i,
  orderTimeCol:      /^(order[_\s]?time|order[_\s]?date|created[_\s]?at|create[_\s]?time|transaction[_\s]?time|purchase[_\s]?time)$|下单|创建时间|交易时间/i,
};

// ============================================================================
// Default config
// ============================================================================

export const DEFAULT_NET_AMOUNT_CONFIG: NetAmountCalcConfig = {
  fieldMapping: {
    payAmountCol: '',
    refundAmountCol: '',
    rejectionAmountCol: '',
    orderStatusCol: '',
  },
  formulaSlots: {
    slot1: { operator: '+', column: '' },
    slot2: { operator: '-', column: '' },
    slot3: { operator: '-', column: '' },
  },
  excludedStatuses: 'CANCELLED',
};

// ============================================================================
// Row type returned by DuckDB
// ============================================================================

interface BaseCalcRow {
  order_id?: string;
  user_id?: string;
  sku_id?: string;
  order_time?: string;
  pay_amount: number;
  refund_amount: number;
  rejection_amount: number;
  order_status: string;
  net_amount_raw: number;
  refund_rate_raw: number;
  is_valid: boolean;
}

// ============================================================================
// Order status CN mapping (Q5 方案 A — hardcoded)
// ============================================================================

const ORDER_STATUS_CN_MAP: Record<string, string> = {
  PAID: '已支付',
  CANCELLED: '已取消',
  REFUNDED: '已退款',
  DELIVERED: '已送达',
  SHIPPED: '已发货',
  PENDING: '待处理',
  CONFIRMED: '已确认',
  CLOSED: '已关闭',
};

// ============================================================================
// Strategy
// ============================================================================

export class OrderNetAmountCalcStrategy extends BaseStrategy {
  readonly type = OperatorType.NET_AMOUNT_CALC;
  readonly name = '订单净额计算（退款后实收）';

  /** Shared config between buildOperatorSql and postProcess (strategy-pattern-rules §三) */
  private _lastConfig: NetAmountCalcConfig | null = null;

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
    const cfg = (selectNode?.data as { netAmountCalcConfig?: NetAmountCalcConfig } | undefined)
      ?.netAmountCalcConfig;

    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    const requiredFields: Array<{ key: keyof NetAmountCalcConfig['fieldMapping']; label: string }> = [
      { key: 'payAmountCol',      label: '实付金额列' },
      { key: 'refundAmountCol',   label: '退款金额列' },
      { key: 'rejectionAmountCol', label: '拒签金额列' },
      { key: 'orderStatusCol',    label: '订单状态列' },
    ];

    for (const { key, label } of requiredFields) {
      if (!cfg.fieldMapping[key]) {
        errors.push({
          nodeId,
          nodeType: FlowNodeType.SELECT,
          severity: ValidationSeverity.ERROR,
          message: `net amount calc: 请选择${label}`,
        });
      }
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
    const cfg = (selectNode?.data as { netAmountCalcConfig?: NetAmountCalcConfig } | undefined)
      ?.netAmountCalcConfig;

    if (!tableName || !cfg) {
      logger.warn(`[${this.name}.buildOperatorSql] missing table or config — returning empty`);
      return 'SELECT 1 WHERE false';
    }

    // Store config for postProcess (strategy-pattern-rules §三)
    this._lastConfig = cfg;

    const tbl = `"${tableName}"`;
    const fm = cfg.fieldMapping;
    const payCol = `"${fm.payAmountCol}"`;
    const refundCol = `"${fm.refundAmountCol}"`;
    const rejectCol = `"${fm.rejectionAmountCol}"`;
    const statusCol = `"${fm.orderStatusCol}"`;

    // Optional columns
    const orderIdCol = fm.orderIdCol ? `"${fm.orderIdCol}"` : null;
    const userIdCol = fm.userIdCol ? `"${fm.userIdCol}"` : null;
    const skuIdCol = fm.skuIdCol ? `"${fm.skuIdCol}"` : null;
    const orderTimeCol = fm.orderTimeCol ? `"${fm.orderTimeCol}"` : null;

    // Formula operators from slots
    const op2 = cfg.formulaSlots.slot2.operator;
    const op3 = cfg.formulaSlots.slot3.operator;

    // Excluded statuses → SQL IN list
    const excludedList = cfg.excludedStatuses
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => `'${s.toUpperCase()}'`)
      .join(', ');

    // WHERE clause injection into src CTE
    const whereClause = userWhere
      ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '')}`
      : '';

    // Build optional column selections
    const optionalCols: string[] = [];
    if (orderIdCol) optionalCols.push(`    ${orderIdCol} AS order_id`);
    if (userIdCol) optionalCols.push(`    ${userIdCol} AS user_id`);
    if (skuIdCol) optionalCols.push(`    ${skuIdCol} AS sku_id`);
    if (orderTimeCol) optionalCols.push(`    ${orderTimeCol} AS order_time`);
    const optionalColsStr = optionalCols.length > 0 ? optionalCols.join(',\n') + ',\n' : '';

    // CTE: src → base_calc → SELECT
    const srcCte = `src AS (\n  SELECT * FROM ${tbl}${whereClause}\n)`;

    const baseCalcCte = `base_calc AS (
  SELECT
${optionalColsStr}    ${payCol} AS pay_amount,
    ${refundCol} AS refund_amount,
    ${rejectCol} AS rejection_amount,
    ${statusCol} AS order_status,
    CASE
      WHEN UPPER(${statusCol}) IN (${excludedList}) THEN 0.0
      ELSE COALESCE(${payCol}, 0) ${op2} COALESCE(${refundCol}, 0) ${op3} COALESCE(${rejectCol}, 0)
    END AS net_amount_raw,
    CASE
      WHEN COALESCE(${payCol}, 0) <= 0 THEN 0.0
      ELSE COALESCE(${refundCol}, 0) / ${payCol}
    END AS refund_rate_raw,
    CASE
      WHEN UPPER(${statusCol}) IN (${excludedList}) THEN false
      ELSE true
    END AS is_valid
  FROM src
)`;

    return `WITH ${srcCte},\n${baseCalcCte}\nSELECT * FROM base_calc`;
  }

  // --------------------------------------------------------------------------
  // postProcess
  // --------------------------------------------------------------------------

  async postProcess(
    queryResult: { data: unknown[]; schema: unknown[] },
  ): Promise<AnalysisResult> {
    const rows = queryResult.data as BaseCalcRow[];

    if (rows.length === 0) {
      return this._buildEmptyResult(queryResult);
    }

    // Retrieve config stored by buildOperatorSql (strategy-pattern-rules §三)
    const _cfg = this._lastConfig ?? DEFAULT_NET_AMOUNT_CONFIG;
    logger.debug(`[${this.name}.postProcess] processing ${rows.length} rows, excludedStatuses=${_cfg.excludedStatuses}`);

    // Safe number conversion
    const safeNum = (v: number | bigint | null | undefined): number => {
      if (v == null) return 0;
      return typeof v === 'bigint' ? Number(v) : v;
    };

    // Enrich rows with 5 derived fields
    const enrichedRows = rows.map((row) => {
      const netAmount = safeNum(row.net_amount_raw);
      const refundRate = safeNum(row.refund_rate_raw);
      const isValid = row.is_valid !== false;
      const netAmountRounded = Math.round(netAmount * 100) / 100;
      const refundRatePercent = `${(refundRate * 100).toFixed(2)}%`;
      const refundRiskTag = refundRate > 0.5 ? 'high' : refundRate > 0.2 ? 'medium' : 'low';
      const isAbnormal = !isValid && netAmount < 0;
      const orderStatusCn = ORDER_STATUS_CN_MAP[row.order_status?.toUpperCase()] ?? row.order_status ?? '';

      return {
        ...row,
        ...(row.order_id != null ? { order_id: row.order_id } : {}),
        ...(row.user_id != null ? { user_id: row.user_id } : {}),
        ...(row.sku_id != null ? { sku_id: row.sku_id } : {}),
        ...(row.order_time != null ? { order_time: row.order_time } : {}),
        net_amount: netAmount,
        net_amount_rounded: netAmountRounded,
        refund_rate: refundRate,
        refund_rate_percent: refundRatePercent,
        refund_risk_tag: refundRiskTag,
        is_valid: isValid,
        is_abnormal: isAbnormal,
        order_status_cn: orderStatusCn,
      };
    });

    // Compute insight statistics
    const validRows = enrichedRows.filter((r) => r.is_valid);
    const totalNetAmount = validRows.reduce((sum, r) => sum + r.net_amount, 0);
    const avgNetAmount = validRows.length > 0 ? totalNetAmount / validRows.length : 0;

    const riskDistribution = { high: 0, medium: 0, low: 0 };
    for (const row of enrichedRows) {
      riskDistribution[row.refund_risk_tag as keyof typeof riskDistribution]++;
    }

    const abnormalCount = enrichedRows.filter((r) => r.is_abnormal).length;
    const abnormalRate = enrichedRows.length > 0 ? abnormalCount / enrichedRows.length : 0;

    // ---- InsightItem 1: net-amount-summary ----
    const summaryItem: InsightItem = {
      id: 'net-amount-summary',
      cardType: 'standard',
      iconKey: 'order',
      title: '净额汇总',
      sortOrder: 1,
      description: `共 ${enrichedRows.length} 笔订单，其中有效订单 ${validRows.length} 笔`,
      metrics: [
        { label: '有效订单数', value: validRows.length, unit: '单' },
        { label: '总净额', value: totalNetAmount, unit: '元', highlight: true },
        { label: '平均净额', value: avgNetAmount, unit: '元' },
      ],
    };

    // ---- InsightItem 2: refund-risk-distribution ----
    const riskItem: InsightItem = {
      id: 'refund-risk-distribution',
      cardType: 'standard',
      iconKey: 'insight',
      title: '退款风险分布',
      sortOrder: 2,
      description: '按退款率划分订单风险等级',
      metrics: [
        { label: '高风险', value: riskDistribution.high, unit: '单' },
        { label: '中风险', value: riskDistribution.medium, unit: '单' },
        { label: '低风险', value: riskDistribution.low, unit: '单' },
      ],
    };

    // ---- InsightItem 3: abnormal-order-alert ----
    const abnormalItem: InsightItem = {
      id: 'abnormal-order-alert',
      cardType: 'standard',
      iconKey: abnormalCount > 0 ? 'critical' : 'safe',
      title: '异常订单警报',
      sortOrder: 3,
      description: abnormalCount > 0
        ? `发现 ${abnormalCount} 笔无效且净额为负的异常订单`
        : '未发现异常订单，数据正常',
      metrics: [
        { label: '异常订单数', value: abnormalCount, unit: '单', highlight: abnormalCount > 0 },
        { label: '异常率', value: abnormalRate, unit: '%' },
      ],
      suggestion: abnormalCount > 0
        ? '建议排查异常订单的退款/拒签原因，关注高风险订单的资损情况'
        : undefined,
    };

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: enrichedRows.length,
        totalFilterRecordCount: validRows.length,
        totalOrderCount: enrichedRows.length,
      },
      insights: [summaryItem, riskItem, abnormalItem],
    };

    // Display config
    const displayConfig: OperatorDisplayConfig = {
      defaultSort: { column: 'net_amount', order: 'descend' },
      columnFormatters: {
        net_amount: { type: 'currency_signed', unit: '元', precision: 2 },
        refund_rate: { type: 'ratio_to_fold', precision: 2 },
      },
      columnTooltips: {
        net_amount: '订单净额 = 实付 - 退款 - 拒签（取消订单为0）',
        net_amount_rounded: '净额保留2位小数',
        refund_rate: '退款率 = 退款金额 / 实付金额',
        refund_rate_percent: '退款率百分比',
        refund_risk_tag: '退款风险等级：high/medium/low',
        is_valid: '是否为有效订单（非排除状态）',
        is_abnormal: '是否为异常订单（无效且净额为负）',
        order_status_cn: '订单状态中文映射',
      },
    };

    return {
      type: OperatorType.NET_AMOUNT_CALC,
      sql: '',
      data: enrichedRows as unknown as Record<string, unknown>[],
      schema: queryResult.schema as unknown[],
      insightsData,
      displayConfig,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _buildEmptyResult(queryResult: { data: unknown[]; schema: unknown[] }): AnalysisResult {
    const warningItem: InsightItem = {
      id: 'net-amount-empty',
      cardType: 'standard',
      iconKey: 'warning',
      title: '暂无订单净额数据',
      sortOrder: 1,
      description: '未查询到有效的订单数据，请检查数据源或筛选条件',
    };

    return {
      type: OperatorType.NET_AMOUNT_CALC,
      sql: '',
      data: [],
      schema: queryResult.schema as unknown[],
      insightsData: { insights: [warningItem] },
      displayConfig: {},
    };
  }
}
