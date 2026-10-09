/**
 * OrderProfitMarginCalcStrategy
 *
 * Builds DuckDB SQL for fn_ecom_order_profit_margin_calc (订单毛利/净利率自动计算).
 *
 * SQL pipeline (CTE):
 *   src        → filtered source table (userWhere injected here)
 *   base_calc  → per-row gross_profit_raw + gross_margin_raw + is_negative_margin
 *   classified → risk_level classification (高风险/预警/健康)
 *   SELECT * FROM classified
 *
 * postProcess:
 *   Enriches 4 derived fields (gross_profit, gross_margin, gross_profit_rounded,
 *   gross_margin_percent) + generates 3 InsightItem cards.
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
  type ProfitMarginCalcConfig,
  type ValidationError,
} from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// Field match patterns — exported for Drawer auto-match
// ============================================================================

/**
 * Regex patterns for auto-matching column names (English + Chinese).
 * Used by OrderProfitMarginCalcDrawer to pre-fill column selectors.
 */
export const FIELD_MATCH_PATTERNS: Record<string, RegExp> = {
  netAmountCol:    /(净额|实收|net[_\s]?amount)/i,
  costCol:         /(成本|进货价|采购价|cost|cogs)/i,
  shippingFeeCol:  /(运费|物流费|shipping|freight)/i,
  platformFeeCol:  /(佣金|平台费|commission|platform[_\s]?fee)/i,
  serviceFeeCol:   /(服务费|service[_\s]?fee)/i,
  orderIdCol:      /^(order[_\s]?id|orderid|order[_\s]?no|orderno|trans[_\s]?id|bill[_\s]?id)$|订单|单号|交易|流水/i,
  userIdCol:       /^(user[_\s]?id|userid|member[_\s]?id|memberid|customer[_\s]?id|buyer[_\s]?id|account[_\s]?id)$|用户|会员|买家/i,
  skuIdCol:        /^(sku[_\s]?id|skuid|product[_\s]?id|productid|item[_\s]?id|goods[_\s]?id)$|商品|产品|sku/i,
  orderTimeCol:    /^(order[_\s]?time|order[_\s]?date|created[_\s]?at|create[_\s]?time|transaction[_\s]?time|purchase[_\s]?time)$|下单|创建时间|交易时间/i,
  categoryCol:     /(类目|分类|category|cate[_\s]?id)/i,
  channelCol:      /(渠道|来源|channel|source)/i,
};

// ============================================================================
// Default config
// ============================================================================

export const DEFAULT_PROFIT_MARGIN_CONFIG: ProfitMarginCalcConfig = {
  fieldMapping: {
    netAmountCol: '',
    costCol: '',
  },
  formulaSlots: {
    slot1: { operator: '+', column: '' },
    slot2: { operator: '-', column: '' },
    slot3: { operator: '-', column: '' },
    slot4: { operator: '-', column: '' },
    slot5: { operator: '-', column: '' },
  },
  warningThresholdPct: 5,
};

// ============================================================================
// Row type returned by DuckDB
// ============================================================================

interface ClassifiedRow {
  order_id?: string;
  user_id?: string;
  sku_id?: string;
  order_time?: string;
  category?: string;
  channel?: string;
  net_amount: number;
  cost: number;
  shipping_fee?: number;
  platform_fee?: number;
  service_fee?: number;
  gross_profit_raw: number;
  gross_margin_raw: number;
  is_negative_margin: boolean;
  risk_level: string;
}

// ============================================================================
// Strategy
// ============================================================================

export class OrderProfitMarginCalcStrategy extends BaseStrategy {
  readonly type = OperatorType.PROFIT_MARGIN_CALC;
  readonly name = '订单毛利/净利率自动计算';

  /** Shared config between buildOperatorSql and postProcess (strategy-pattern-rules §三) */
  private _lastConfig: ProfitMarginCalcConfig | null = null;

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
    const cfg = (selectNode?.data as { profitMarginCalcConfig?: ProfitMarginCalcConfig } | undefined)
      ?.profitMarginCalcConfig;

    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    const requiredFields: Array<{ key: keyof ProfitMarginCalcConfig['fieldMapping']; label: string }> = [
      { key: 'netAmountCol', label: '订单净额列' },
      { key: 'costCol',      label: '商品成本列' },
    ];

    for (const { key, label } of requiredFields) {
      if (!cfg.fieldMapping[key]) {
        errors.push({
          nodeId,
          nodeType: FlowNodeType.SELECT,
          severity: ValidationSeverity.ERROR,
          message: `毛利计算: 请选择${label}`,
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
    const cfg = (selectNode?.data as { profitMarginCalcConfig?: ProfitMarginCalcConfig } | undefined)
      ?.profitMarginCalcConfig;

    if (!tableName || !cfg) {
      logger.warn(`[${this.name}.buildOperatorSql] missing table or config — returning empty`);
      return 'SELECT 1 WHERE false';
    }

    // Store config for postProcess (strategy-pattern-rules §三)
    this._lastConfig = cfg;

    const tbl = `"${tableName}"`;
    const fm = cfg.fieldMapping;
    const netCol = `"${fm.netAmountCol}"`;
    const costCol = `"${fm.costCol}"`;

    // Optional columns
    const orderIdCol = fm.orderIdCol ? `"${fm.orderIdCol}"` : null;
    const userIdCol = fm.userIdCol ? `"${fm.userIdCol}"` : null;
    const skuIdCol = fm.skuIdCol ? `"${fm.skuIdCol}"` : null;
    const orderTimeCol = fm.orderTimeCol ? `"${fm.orderTimeCol}"` : null;
    const categoryCol = fm.categoryCol ? `"${fm.categoryCol}"` : null;
    const channelCol = fm.channelCol ? `"${fm.channelCol}"` : null;

    // Formula operators from slots (slot1 is always '+' for net_amount)
    const op2 = cfg.formulaSlots.slot2.operator;  // cost
    const op3 = cfg.formulaSlots.slot3.operator;  // shipping_fee
    const op4 = cfg.formulaSlots.slot4.operator;  // platform_fee
    const op5 = cfg.formulaSlots.slot5.operator;  // service_fee

    // WHERE clause injection into src CTE
    const whereClause = userWhere
      ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '')}`
      : '';

    // Build optional column selections for base_calc
    const optionalCols: string[] = [];
    if (orderIdCol) optionalCols.push(`    ${orderIdCol} AS order_id`);
    if (userIdCol) optionalCols.push(`    ${userIdCol} AS user_id`);
    if (skuIdCol) optionalCols.push(`    ${skuIdCol} AS sku_id`);
    if (orderTimeCol) optionalCols.push(`    ${orderTimeCol} AS order_time`);
    if (categoryCol) optionalCols.push(`    ${categoryCol} AS category`);
    if (channelCol) optionalCols.push(`    ${channelCol} AS channel`);

    // Build optional fee columns and formula parts
    const feeCols: string[] = [];
    const formulaParts: string[] = [
      `COALESCE(${netCol}, 0)`,  // slot1 always +
    ];

    // slot2: cost (always present, required)
    formulaParts.push(`${op2} COALESCE(${costCol}, 0)`);

    // slot3: shipping_fee (optional)
    if (fm.shippingFeeCol) {
      const shippingCol = `"${fm.shippingFeeCol}"`;
      feeCols.push(`    ${shippingCol} AS shipping_fee`);
      formulaParts.push(`${op3} COALESCE(${shippingCol}, 0)`);
    }

    // slot4: platform_fee (optional)
    if (fm.platformFeeCol) {
      const platformCol = `"${fm.platformFeeCol}"`;
      feeCols.push(`    ${platformCol} AS platform_fee`);
      formulaParts.push(`${op4} COALESCE(${platformCol}, 0)`);
    }

    // slot5: service_fee (optional)
    if (fm.serviceFeeCol) {
      const serviceCol = `"${fm.serviceFeeCol}"`;
      feeCols.push(`    ${serviceCol} AS service_fee`);
      formulaParts.push(`${op5} COALESCE(${serviceCol}, 0)`);
    }

    // Gross profit expression
    const grossExpr = formulaParts.join(' ');

    // Build null count expression for data quality tracking (Q11)
    const nullCheckParts: string[] = [
      `CASE WHEN ${costCol} IS NULL THEN 1 ELSE 0 END`,
    ];
    if (fm.shippingFeeCol) {
      nullCheckParts.push(`CASE WHEN "${fm.shippingFeeCol}" IS NULL THEN 1 ELSE 0 END`);
    }
    if (fm.platformFeeCol) {
      nullCheckParts.push(`CASE WHEN "${fm.platformFeeCol}" IS NULL THEN 1 ELSE 0 END`);
    }
    if (fm.serviceFeeCol) {
      nullCheckParts.push(`CASE WHEN "${fm.serviceFeeCol}" IS NULL THEN 1 ELSE 0 END`);
    }
    const nullCountExpr = nullCheckParts.join(' + ');

    // Optional columns string
    const optionalColsStr = optionalCols.length > 0 ? optionalCols.join(',\n') + ',\n' : '';
    // Fee columns string
    const feeColsStr = feeCols.length > 0 ? feeCols.join(',\n') + ',\n' : '';

    // Threshold value (with fallback to 0.05 if invalid)
    const thresholdPct = cfg.warningThresholdPct;
    const thresholdValue = Number.isFinite(thresholdPct) && thresholdPct >= 0
      ? thresholdPct / 100
      : 0.05;

    // CTE: src → base_calc → classified → SELECT
    const srcCte = `src AS (\n  SELECT * FROM ${tbl}${whereClause}\n)`;

    const baseCalcCte = `base_calc AS (
  SELECT
${optionalColsStr}    ${netCol} AS net_amount,
    ${costCol} AS cost,
${feeColsStr}    ${grossExpr} AS gross_profit_raw,
    CASE
      WHEN COALESCE(${netCol}, 0) <= 0 THEN 0.0
      ELSE (${grossExpr}) / COALESCE(${netCol}, 0)
    END AS gross_margin_raw,
    CASE
      WHEN (${grossExpr}) < 0 THEN true
      ELSE false
    END AS is_negative_margin,
    ${nullCountExpr} AS null_fee_count
  FROM src
)`;

    const classifiedCte = `classified AS (
  SELECT *,
    CASE
      WHEN net_amount <= 0 THEN '高风险'
      WHEN gross_profit_raw < 0 THEN '高风险'
      WHEN gross_margin_raw < ${thresholdValue} THEN '预警'
      ELSE '健康'
    END AS risk_level
  FROM base_calc
)`;

    return `WITH ${srcCte},\n${baseCalcCte},\n${classifiedCte}\nSELECT * FROM classified`;
  }

  // --------------------------------------------------------------------------
  // postProcess
  // --------------------------------------------------------------------------

  async postProcess(
    queryResult: { data: unknown[]; schema: unknown[] },
  ): Promise<AnalysisResult> {
    const rows = queryResult.data as ClassifiedRow[];

    if (rows.length === 0) {
      return this._buildEmptyResult(queryResult);
    }

    // Retrieve config stored by buildOperatorSql (strategy-pattern-rules §三)
    const _cfg = this._lastConfig ?? DEFAULT_PROFIT_MARGIN_CONFIG;
    logger.debug(`[${this.name}.postProcess] processing ${rows.length} rows, warningThresholdPct=${_cfg.warningThresholdPct}`);

    // Safe number conversion
    const safeNum = (v: number | bigint | null | undefined): number => {
      if (v == null) return 0;
      return typeof v === 'bigint' ? Number(v) : v;
    };

    // Enrich rows with 4 derived fields
    const enrichedRows = rows.map((row) => {
      const grossProfit = safeNum(row.gross_profit_raw);
      const grossMargin = safeNum(row.gross_margin_raw);
      const grossProfitRounded = Math.round(grossProfit * 100) / 100;
      const grossMarginPercent = `${(grossMargin * 100).toFixed(2)}%`;

      return {
        ...row,
        ...(row.order_id != null ? { order_id: row.order_id } : {}),
        ...(row.user_id != null ? { user_id: row.user_id } : {}),
        ...(row.sku_id != null ? { sku_id: row.sku_id } : {}),
        ...(row.order_time != null ? { order_time: row.order_time } : {}),
        ...(row.category != null ? { category: row.category } : {}),
        ...(row.channel != null ? { channel: row.channel } : {}),
        ...(row.shipping_fee != null ? { shipping_fee: safeNum(row.shipping_fee) } : {}),
        ...(row.platform_fee != null ? { platform_fee: safeNum(row.platform_fee) } : {}),
        ...(row.service_fee != null ? { service_fee: safeNum(row.service_fee) } : {}),
        gross_profit: grossProfit,
        gross_margin: grossMargin,
        gross_profit_rounded: grossProfitRounded,
        gross_margin_percent: grossMarginPercent,
      };
    });

    // Compute insight statistics
    const totalGrossProfit = enrichedRows.reduce((sum, r) => sum + r.gross_profit, 0);
    const avgGrossMargin = enrichedRows.length > 0
      ? enrichedRows.reduce((sum, r) => sum + r.gross_margin, 0) / enrichedRows.length
      : 0;
    const negativeMarginCount = enrichedRows.filter((r) => r.is_negative_margin).length;
    const warningCount = enrichedRows.filter((r) => r.risk_level === '预警').length;
    const negativeMarginRate = enrichedRows.length > 0 ? negativeMarginCount / enrichedRows.length : 0;
    const warningRate = enrichedRows.length > 0 ? warningCount / enrichedRows.length : 0;

    // Count rows with NULL cost/fee data (Q11 data quality tracking)
    const nullFeeCountRows = enrichedRows.reduce((sum, r) => {
      const nullCount = (r as any).null_fee_count;
      return sum + (typeof nullCount === 'number' && nullCount > 0 ? 1 : 0);
    }, 0);

    // Find deepest loss
    const deepestLoss = enrichedRows.reduce((min, r) => {
      return r.gross_profit < min ? r.gross_profit : min;
    }, 0);

    // ---- InsightItem 1: profit-margin-summary ----
    const summaryItem: InsightItem = {
      id: 'profit-margin-summary',
      cardType: 'standard',
      iconKey: 'order',
      title: '毛利总览',
      sortOrder: 1,
      description: `共 ${enrichedRows.length} 笔订单毛利数据`,
      metrics: [
        { label: '总毛利额', value: totalGrossProfit, unit: '元', highlight: true },
        { label: '平均毛利率', value: avgGrossMargin, unit: '%' },
        { label: '订单数', value: enrichedRows.length, unit: '单' },
      ],
    };

    // ---- InsightItem 2: negative-margin-alert ----
    const negativeItem: InsightItem = {
      id: 'negative-margin-alert',
      cardType: 'standard',
      iconKey: negativeMarginCount > 0 ? 'critical' : 'safe',
      title: '负毛利订单',
      sortOrder: 2,
      description: negativeMarginCount > 0
        ? `发现 ${negativeMarginCount} 笔负毛利订单，最深亏损 ${deepestLoss.toFixed(2)} 元`
        : '未发现负毛利订单，数据正常',
      metrics: [
        { label: '负毛利订单数', value: negativeMarginCount, unit: '单' },
        { label: '负毛利占比', value: negativeMarginRate, unit: '%', highlight: negativeMarginCount > 0 },
      ],
      suggestion: negativeMarginCount > 0
        ? '建议排查负毛利订单的成本与费用结构，关注已取消订单是否已通过条件节点过滤'
        : undefined,
    };

    // ---- InsightItem 3: low-margin-warning ----
    const warningItem: InsightItem = {
      id: 'low-margin-warning',
      cardType: 'standard',
      iconKey: 'insight',
      title: '低毛利预警',
      sortOrder: 3,
      description: (warningCount > 0
        ? `发现 ${warningCount} 笔低毛利订单（毛利率 < ${_cfg.warningThresholdPct}%）`
        : `所有订单毛利率均高于 ${_cfg.warningThresholdPct}% 阈值`) +
        (nullFeeCountRows > 0 ? `（${nullFeeCountRows} 行成本/费用数据质量缺失，已按 0 计算）` : ''),
      metrics: [
        { label: '预警订单数', value: warningCount, unit: '单' },
        { label: '预警占比', value: warningRate, unit: '%' },
        { label: '当前阈值', value: _cfg.warningThresholdPct / 100, unit: '%' },
      ],
      suggestion: warningCount > 0
        ? '建议优化产品定价或降低成本，提升整体毛利水平'
        : undefined,
    };

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: enrichedRows.length,
        totalFilterRecordCount: enrichedRows.length,
        totalOrderCount: enrichedRows.length,
      },
      insights: [summaryItem, negativeItem, warningItem],
    };

    // Display config
    const displayConfig: OperatorDisplayConfig = {
      defaultSort: { column: 'gross_profit', order: 'descend' },
      columnFormatters: {
        gross_profit: { type: 'currency_signed', unit: '元', precision: 2 },
        gross_profit_rounded: { type: 'currency_signed', unit: '元', precision: 2 },
        gross_margin: { type: 'ratio_to_fold', precision: 2 },
        risk_level: { type: 'risk_badge' },
      },
      columnTooltips: {
        net_amount: '订单净额（映射列）',
        cost: '商品成本（映射列）',
        shipping_fee: '运费（映射列，可选）',
        platform_fee: '平台佣金（映射列，可选）',
        service_fee: '服务费（映射列，可选）',
        gross_profit_raw: '毛利原始值 = 净额 ± 成本 ± 运费 ± 佣金 ± 服务费',
        gross_margin_raw: '毛利率原始值 = 毛利 / 净额（净额≤0时为0）',
        is_negative_margin: '是否为负毛利订单',
        risk_level: '风险等级：高风险/预警/健康（由SQL判定）',
        gross_profit: '毛利（JS展示列）',
        gross_margin: '毛利率（JS展示列）',
        gross_profit_rounded: '毛利保留2位小数',
        gross_margin_percent: '毛利率百分比格式',
      },
    };

    // Filter out internal SQL columns (null_fee_count is for Q11 statistics only)
    const filteredSchema = (queryResult.schema as { name: string; type: string }[]).filter(
      (col) => col.name !== 'null_fee_count'
    );

    // Enrich schema with 4 JS-computed columns
    const enrichedSchema = [
      ...filteredSchema,
      { name: 'gross_profit', type: 'DOUBLE' },
      { name: 'gross_margin', type: 'DOUBLE' },
      { name: 'gross_profit_rounded', type: 'DOUBLE' },
      { name: 'gross_margin_percent', type: 'VARCHAR' },
    ];

    return {
      type: OperatorType.PROFIT_MARGIN_CALC,
      sql: '',
      // SAFETY: enrichedRows is an array of objects with dynamic keys from spread operator
      data: enrichedRows as unknown as Record<string, unknown>[],
      // SAFETY: enrichedSchema is an array of column definitions matching the schema structure
      schema: enrichedSchema as unknown[],
      insightsData,
      displayConfig,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private _buildEmptyResult(queryResult: { data: unknown[]; schema: unknown[] }): AnalysisResult {
    const warningItem: InsightItem = {
      id: 'profit-margin-empty',
      cardType: 'standard',
      iconKey: 'warning',
      title: '暂无毛利数据',
      sortOrder: 1,
      description: '未查询到有效的订单数据，请检查数据源或筛选条件',
    };

    // Filter out internal SQL columns (consistent with main path)
    const filteredSchema = (queryResult.schema as { name: string; type: string }[]).filter(
      (col) => col.name !== 'null_fee_count'
    );

    // Enrich schema with 4 JS-computed columns (consistent with main path)
    const enrichedSchema = [
      ...filteredSchema,
      { name: 'gross_profit', type: 'DOUBLE' },
      { name: 'gross_margin', type: 'DOUBLE' },
      { name: 'gross_profit_rounded', type: 'DOUBLE' },
      { name: 'gross_margin_percent', type: 'VARCHAR' },
    ];

    return {
      type: OperatorType.PROFIT_MARGIN_CALC,
      sql: '',
      data: [],
      schema: enrichedSchema as unknown[],
      insightsData: { insights: [warningItem] },
      displayConfig: {},
    };
  }
}
