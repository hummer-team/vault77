/**
 * FulfillmentEfficiencyStrategy
 *
 * Builds DuckDB SQL for fn_ecom_fulfillment_efficiency (履约时效分析).
 *
 * SQL pipeline (CTE):
 *   order_metrics  → per-order diff_hours + is_le_hours flags (userWhere injected here)
 *   aggregated     → GROUP BY region, carrier with AVG +达标率 aggregations
 *   SELECT * FROM aggregated ORDER BY order_count DESC
 *
 * postProcess:
 *   Formats *_rate columns as percent_signed, avg_* as decimal(2).
 *   Generates single InsightItem card with key metrics.
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
  type FulfillmentEfficiencyConfig,
  type ValidationError,
} from '../types';

// ============================================================================
// Field match patterns — exported for Drawer auto-match
// ============================================================================

/**
 * Regex patterns for auto-matching column names (English + Chinese).
 * Used by FulfillmentEfficiencyDrawer to pre-fill column selectors.
 */
export const FIELD_MATCH_PATTERNS: Record<string, RegExp> = {
  payTimeColumn:     /^(pay[_\s]?time|支付时间|付款时间|payment[_\s]?time|支付日期)$/i,
  shipTimeColumn:    /^(ship[_\s]?time|发货时间|出库时间|dispatch[_\s]?time|发货日期|logistics[_\s]?time)$/i,
  receiveTimeColumn: /^(receive[_\s]?time|签收时间|收货时间|delivery[_\s]?time|收货日期|签收日期)$/i,
  regionColumn:      /^(region|地区|区域|province|省|city|城市|area|地域|收货地区|收货区域)$/i,
  carrierColumn:     /^(carrier|物流|物流商|物流商名称|courier|express|快递公司|logistics[_\s]?company|shipping[_\s]?company)$/i,
};

// ============================================================================
// Row type returned by DuckDB
// ============================================================================

interface AggregatedRow {
  region: string;
  carrier: string;
  order_count: number | bigint;
  avg_pay_to_ship_hours: number;
  avg_ship_to_receive_hours: number;
  avg_total_hours: number;
  pay_to_ship_on_time_rate: number;
  ship_to_receive_on_time_rate: number;
  overall_on_time_rate: number;
}

// ============================================================================
// Strategy
// ============================================================================

export class FulfillmentEfficiencyStrategy extends BaseStrategy {
  readonly type = OperatorType.FULFILLMENT_EFFICIENCY;
  readonly name = '履约时效分析';

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
    const cfg = (selectNode?.data as { fulfillmentEfficiencyConfig?: FulfillmentEfficiencyConfig } | undefined)
      ?.fulfillmentEfficiencyConfig;

    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    const requiredFields: Array<{ key: keyof FulfillmentEfficiencyConfig; label: string }> = [
      { key: 'payTimeColumn',     label: '支付时间列' },
      { key: 'shipTimeColumn',    label: '发货时间列' },
      { key: 'receiveTimeColumn', label: '签收时间列' },
      { key: 'regionColumn',     label: '地区列' },
      { key: 'carrierColumn',    label: '物流商列' },
    ];

    for (const { key, label } of requiredFields) {
      if (!cfg[key]) {
        errors.push({
          nodeId,
          nodeType: FlowNodeType.SELECT,
          severity: ValidationSeverity.ERROR,
          message: `fulfillment efficiency: 请选择${label}`,
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
    const cfg = (selectNode?.data as { fulfillmentEfficiencyConfig?: FulfillmentEfficiencyConfig } | undefined)
      ?.fulfillmentEfficiencyConfig;

    if (!tableName || !cfg) {
      console.warn(`[${this.name}.buildOperatorSql] missing table or config — returning empty`);
      return 'SELECT 1 WHERE false';
    }

    const tbl = `"${tableName}"`;
    const payCol = `"${cfg.payTimeColumn}"`;
    const shipCol = `"${cfg.shipTimeColumn}"`;
    const receiveCol = `"${cfg.receiveTimeColumn}"`;
    const regionCol = `"${cfg.regionColumn}"`;
    const carrierCol = `"${cfg.carrierColumn}"`;

    const payToShipTh = cfg.payToShipThreshold;
    const shipToReceiveTh = cfg.shipToReceiveThreshold;
    const onTimeTh = cfg.onTimeThreshold;

    // Build WHERE clause for order_metrics CTE
    const whereClause = userWhere
      ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '')}`
      : '';

    // CTE 1: order_metrics — per-order time diff + on-time flags
    const orderMetricsCte = `order_metrics AS (
  SELECT
    ${regionCol} AS region,
    ${carrierCol} AS carrier,
    diff_hours(${payCol}, ${shipCol}) AS pay_to_ship_hours,
    diff_hours(${shipCol}, ${receiveCol}) AS ship_to_receive_hours,
    diff_hours(${payCol}, ${receiveCol}) AS total_hours,
    is_le_hours(${payCol}, ${shipCol}, ${payToShipTh}) AS pay_to_ship_on_time,
    is_le_hours(${shipCol}, ${receiveCol}, ${shipToReceiveTh}) AS ship_to_receive_on_time,
    is_le_hours(${payCol}, ${receiveCol}, ${onTimeTh}) AS overall_on_time
  FROM ${tbl}${whereClause}
)`;

    // CTE 2: aggregated — GROUP BY region + carrier
    const aggregatedCte = `aggregated AS (
  SELECT
    region,
    carrier,
    COUNT(*) AS order_count,
    ROUND(AVG(pay_to_ship_hours), 2) AS avg_pay_to_ship_hours,
    ROUND(AVG(ship_to_receive_hours), 2) AS avg_ship_to_receive_hours,
    ROUND(AVG(total_hours), 2) AS avg_total_hours,
    ROUND(AVG(CASE WHEN pay_to_ship_on_time THEN 1.0 ELSE 0.0 END), 4) AS pay_to_ship_on_time_rate,
    ROUND(AVG(CASE WHEN ship_to_receive_on_time THEN 1.0 ELSE 0.0 END), 4) AS ship_to_receive_on_time_rate,
    ROUND(AVG(CASE WHEN overall_on_time THEN 1.0 ELSE 0.0 END), 4) AS overall_on_time_rate
  FROM order_metrics
  GROUP BY region, carrier
)`;

    return `WITH ${orderMetricsCte},\n${aggregatedCte}\nSELECT * FROM aggregated\nORDER BY order_count DESC`;
  }

  // --------------------------------------------------------------------------
  // postProcess
  // --------------------------------------------------------------------------

  async postProcess(
    queryResult: { data: unknown[]; schema: unknown[] },
  ): Promise<AnalysisResult> {
    const rows = queryResult.data as AggregatedRow[];

    if (rows.length === 0) {
      return this._buildEmptyResult(queryResult);
    }

    // Safe number conversion for BigInt
    const safeNum = (v: number | bigint | null | undefined): number => {
      if (v == null) return 0;
      return typeof v === 'bigint' ? Number(v) : v;
    };

    // Compute global summary metrics
    let totalOrders = 0;
    let weightedOnTime = 0;

    for (const row of rows) {
      const count = safeNum(row.order_count);
      totalOrders += count;
      weightedOnTime += count * (row.overall_on_time_rate ?? 0);
    }

    const globalOnTimeRate = totalOrders > 0 ? weightedOnTime / totalOrders : 0;

    // Build formatted data rows
    const formattedRows = rows.map((row) => ({
      region: row.region,
      carrier: row.carrier,
      order_count: safeNum(row.order_count),
      avg_pay_to_ship_hours: row.avg_pay_to_ship_hours,
      avg_ship_to_receive_hours: row.avg_ship_to_receive_hours,
      avg_total_hours: row.avg_total_hours,
      pay_to_ship_on_time_rate: row.pay_to_ship_on_time_rate,
      ship_to_receive_on_time_rate: row.ship_to_receive_on_time_rate,
      overall_on_time_rate: row.overall_on_time_rate,
    }));

    // Find best and worst performers
    const sorted = [...formattedRows].sort((a, b) => b.overall_on_time_rate - a.overall_on_time_rate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // ---- InsightItem: overall summary ----
    const summaryItem: InsightItem = {
      id: 'fulfillment-summary',
      cardType: 'standard',
      iconKey: 'insight',
      title: '履约时效总览',
      sortOrder: 1,
      description: `共分析 ${totalOrders.toLocaleString()} 笔订单，覆盖 ${rows.length} 个区域×物流商组合`,
      metrics: [
        { label: '总订单数', value: totalOrders, unit: '单' },
        { label: '整体达标率', value: globalOnTimeRate, unit: '%', highlight: true },
        { label: '分析组合数', value: rows.length, unit: '组' },
      ],
    };

    // ---- InsightItem: best performer ----
    const bestItem: InsightItem = {
      id: 'fulfillment-best',
      cardType: 'standard',
      iconKey: 'safe',
      title: `最优组合：${best.region} · ${best.carrier}`,
      sortOrder: 2,
      description: `达标率 ${(best.overall_on_time_rate * 100).toFixed(1)}%，平均总时效 ${best.avg_total_hours.toFixed(1)}h`,
      metrics: [
        { label: '达标率', value: best.overall_on_time_rate, unit: '%', highlight: true },
        { label: '平均时效', value: best.avg_total_hours, unit: 'h' },
        { label: '订单数', value: best.order_count, unit: '单' },
      ],
    };

    // ---- InsightItem: worst performer ----
    const worstItem: InsightItem = {
      id: 'fulfillment-worst',
      cardType: 'standard',
      iconKey: worst.overall_on_time_rate < 0.5 ? 'critical' : 'warning',
      title: `待优化组合：${worst.region} · ${worst.carrier}`,
      sortOrder: 3,
      description: `达标率仅 ${(worst.overall_on_time_rate * 100).toFixed(1)}%，平均总时效 ${worst.avg_total_hours.toFixed(1)}h`,
      suggestion: '建议与该物流商协商时效承诺，或考虑切换物流渠道',
      metrics: [
        { label: '达标率', value: worst.overall_on_time_rate, unit: '%', highlight: true },
        { label: '平均时效', value: worst.avg_total_hours, unit: 'h' },
        { label: '订单数', value: worst.order_count, unit: '单' },
      ],
    };

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: totalOrders,
        totalFilterRecordCount: Math.round(totalOrders * globalOnTimeRate),
        totalOrderCount: totalOrders,
      },
      insights: [summaryItem, bestItem, worstItem],
    };

    // Display config with column formatters
    const displayConfig: OperatorDisplayConfig = {
      defaultSort: { column: 'order_count', order: 'descend' },
      columnFormatters: {
        pay_to_ship_on_time_rate: { type: 'percent_signed', precision: 1 },
        ship_to_receive_on_time_rate: { type: 'percent_signed', precision: 1 },
        overall_on_time_rate: { type: 'percent_signed', precision: 1 },
      },
      columnTooltips: {
        region: '收货地区',
        carrier: '物流商名称',
        order_count: '该组合的订单数',
        avg_pay_to_ship_hours: '支付→发货平均时长（小时）',
        avg_ship_to_receive_hours: '发货→签收平均时长（小时）',
        avg_total_hours: '支付→签收平均总时长（小时）',
        pay_to_ship_on_time_rate: '支付→发货达标率',
        ship_to_receive_on_time_rate: '发货→签收达标率',
        overall_on_time_rate: '全链路达标率',
      },
    };

    return {
      type: OperatorType.FULFILLMENT_EFFICIENCY,
      sql: '',
      data: formattedRows as unknown as Record<string, unknown>[],
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
      id: 'fulfillment-empty',
      cardType: 'standard',
      iconKey: 'warning',
      title: '暂无履约时效数据',
      sortOrder: 1,
      description: '未查询到有效的履约时效数据，请检查数据源或筛选条件',
    };

    return {
      type: OperatorType.FULFILLMENT_EFFICIENCY,
      sql: '',
      data: [],
      schema: queryResult.schema as unknown[],
      insightsData: { insights: [warningItem] },
      displayConfig: {},
    };
  }
}
