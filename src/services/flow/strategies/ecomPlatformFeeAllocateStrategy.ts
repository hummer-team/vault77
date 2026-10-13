/**
 * EcomPlatformFeeAllocateStrategy
 *
 * Builds DuckDB SQL for fn_ecom_platform_fee_allocate (平台佣金/服务费自动分摊).
 *
 * SQL pipeline (CTE):
 *   src      → filtered source table (userWhere injected here)
 *   ord      → per-order aggregation: total_weight + per-fee dedup (MAX per partition)
 *   alloc    → per-row allocation: weight / total_weight * fee_amount
 *   agg      → rounding adjustment: tail-diff to max weight row
 *   fin      → final SELECT with ROUND(..., 2) and EXCLUDE internal columns
 *
 * postProcess: builds insightsData with 4 cards:
 *   ① total allocated amount (¥)
 *   ② order count
 *   ③ max cost ratio (%)
 *   ④ warning if any zero-weight orders (iconKey: 'warning' | 'safe')
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
  type FeeAllocateConfig,
  type ValidationError,
} from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// Field match patterns (for drawer auto-fill)
// ============================================================================

export const FIELD_MATCH_PATTERNS: Record<string, RegExp> = {
  orderIdCol: /订单[_-]?id|order[_-]?id/i,
  skuIdCol: /商品[_-]?id|sku[_-]?id|product[_-]?id|item[_-]?id/i,
  orderNetAmountCol: /订单[_-]?净额|order[_-]?net[_-]?amount|order[_-]?total/i,
  skuNetAmountCol: /商品[_-]?净额|sku[_-]?net[_-]?amount|item[_-]?amount/i,
  platformFeeCol: /平台[_-]?佣金|platform[_-]?fee|commission/i,
  serviceFeeCol: /服务[_-]?费|service[_-]?fee/i,
  orderTimeCol: /下单[_-]?时间|order[_-]?time|created[_-]?at/i,
  categoryCol: /类目|category/i,
  channelCol: /渠道|channel/i,
};

// ============================================================================
// Row type
// ============================================================================

interface AllocRow {
  [key: string]: unknown;
}

// ============================================================================
// Strategy
// ============================================================================

export class EcomPlatformFeeAllocateStrategy extends BaseStrategy {
  readonly type = OperatorType.PLATFORM_FEE_ALLOCATE;
  readonly name = '平台佣金/服务费自动分摊';

  /** Shared config between buildOperatorSql and postProcess */
  private _lastConfig: FeeAllocateConfig | null = null;

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
    const cfg = (selectNode?.data as { feeAllocateConfig?: FeeAllocateConfig } | undefined)
      ?.feeAllocateConfig;

    // No config → not yet configured, not an error
    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    const requiredFields: Array<{ key: keyof FeeAllocateConfig['fieldMapping']; label: string }> = [
      { key: 'orderIdCol', label: '订单ID列' },
      { key: 'skuIdCol', label: '商品行ID列' },
      { key: 'orderNetAmountCol', label: '订单净额列' },
      { key: 'skuNetAmountCol', label: '商品净额列' },
      { key: 'platformFeeCol', label: '平台佣金列' },
      { key: 'serviceFeeCol', label: '服务费列' },
    ];

    for (const { key, label } of requiredFields) {
      if (!cfg.fieldMapping[key]) {
        errors.push({
          nodeId,
          nodeType: FlowNodeType.SELECT,
          severity: ValidationSeverity.ERROR,
          message: `缺少必填字段: ${label}`,
        });
      }
    }

    return errors;
  }

  // --------------------------------------------------------------------------
  // SQL generation
  // --------------------------------------------------------------------------

  override buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _ph?: unknown,
    userWhere?: string,
  ): string {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const tableName =
      (nodes.find((n) => n.type === FlowNodeType.TABLE)?.data as { tableName?: string })
        ?.tableName ?? '';

    const cfg = (selectNode?.data as { feeAllocateConfig?: FeeAllocateConfig } | undefined)
      ?.feeAllocateConfig;

    if (!tableName || !cfg) {
      logger.warn('[EcomPlatformFeeAllocate] Missing table or config');
      return 'SELECT 1 WHERE false';
    }

    this._lastConfig = cfg;

    // Note: fieldMapping.skuIdCol is validated in validateOperatorSpecific and
    // used by the drawer; SQL granularity is order_id + deterministic source row.
    const {
      orderIdCol,
      orderNetAmountCol: ONA,
      skuNetAmountCol: SNA,
      platformFeeCol: PF,
      serviceFeeCol: SF,
    } = cfg.fieldMapping;

    // Fee dedup expressions: MAX per order partition (cross-row fill safe)
    const feePlatformExpr = `MAX(COALESCE("${PF}", 0)) OVER (PARTITION BY "${orderIdCol}")`;
    const feeServiceExpr = `MAX(COALESCE("${SF}", 0)) OVER (PARTITION BY "${orderIdCol}")`;
    const feeTotalExpr = `(${feePlatformExpr} + ${feeServiceExpr})`;

    // Weight = sku net amount (amount-ratio mode, default)
    const weightExpr = `COALESCE("${SNA}", 0)`;
    const weightTotalExpr = `SUM(${weightExpr}) OVER (PARTITION BY "${orderIdCol}")`;

    // WHERE clause
    const whereClause = userWhere
      ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '')}`
      : '';

    // EXCLUDE list — synced with ORDER BY (_src_rn internal)
    const excludeCols = [
      '_src_rn',
      '_fee_platform',
      '_fee_service',
      '_fee_total',
      '_weight',
      '_weight_total',
      '_alloc_platform',
      '_alloc_service',
      '_alloc_raw',
      '_order_alloc_sum',
      '_max_weight_row',
      // NOTE: _is_zero_weight is intentionally NOT excluded — it is an
      // auxiliary check column consumed by insight card 4.
    ];

    const sql = `WITH src AS (
  SELECT *, ROW_NUMBER() OVER () AS _src_rn FROM "${tableName}"${whereClause}
),
ord AS (
  SELECT
    *,
    ${feePlatformExpr} AS _fee_platform,
    ${feeServiceExpr} AS _fee_service,
    ${feeTotalExpr} AS _fee_total,
    ${weightExpr} AS _weight,
    ${weightTotalExpr} AS _weight_total,
    CASE WHEN ${weightTotalExpr} = 0 THEN true ELSE false END AS _is_zero_weight
  FROM src
),
alloc AS (
  SELECT
    *,
    ROUND(_weight / NULLIF(_weight_total, 0) * _fee_platform, 2) AS _alloc_platform,
    ROUND(_weight / NULLIF(_weight_total, 0) * _fee_service, 2) AS _alloc_service,
    ROUND(_weight / NULLIF(_weight_total, 0) * _fee_total, 2) AS _alloc_raw,
    SUM(ROUND(_weight / NULLIF(_weight_total, 0) * _fee_total, 2))
      OVER (PARTITION BY "${orderIdCol}") AS _order_alloc_sum,
    ROW_NUMBER() OVER (
      PARTITION BY "${orderIdCol}"
      ORDER BY _weight DESC, COALESCE("${SNA}", 0) DESC, _src_rn ASC
    ) = 1 AS _max_weight_row
  FROM ord
),
agg AS (
  SELECT
    * EXCLUDE (${excludeCols.join(', ')}),
    CASE
      WHEN _is_zero_weight THEN 0
      WHEN _max_weight_row THEN ROUND(_alloc_raw + (_fee_total - _order_alloc_sum), 2)
      ELSE _alloc_raw
    END AS allocated_fee,
    CASE
      WHEN _is_zero_weight THEN 0
      ELSE ROUND(_alloc_raw / NULLIF(_fee_total, 0), 4)
    END AS alloc_ratio_pct,
    CASE
      WHEN _is_zero_weight THEN 0
      WHEN _max_weight_row AND ABS(_fee_total - _order_alloc_sum) > 0.001 THEN 1
      ELSE 0
    END AS is_rounding_adjust,
    ROUND(
      COALESCE("${SNA}", 0) / NULLIF(SUM(COALESCE("${SNA}", 0)) OVER (PARTITION BY "${orderIdCol}"), 0)
        * COALESCE("${ONA}", 0),
      2
    ) AS product_net_profit
  FROM alloc
)
SELECT * FROM agg
ORDER BY "${orderIdCol}", _src_rn`;

    return sql;
  }

  // --------------------------------------------------------------------------
  // Post-process: insight cards + enriched schema
  // --------------------------------------------------------------------------

  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const queryResult = data as {
      data: AllocRow[];
      schema: Record<string, string>[];
    };

    if (!queryResult?.data?.length) {
      return this._buildEmptyResult(queryResult?.schema ?? []);
    }

    const cfg = this._lastConfig;
    const rows = queryResult.data;

    // Card ①: total allocated fee
    const totalAllocated = rows.reduce(
      (sum, r) => sum + (Number(r.allocated_fee) || 0),
      0,
    );

    // Card ②: order count (distinct order IDs)
    const orderCol = cfg?.fieldMapping.orderIdCol ?? '';
    const orderIds = new Set(rows.map((r) => r[orderCol]));
    const orderCount = orderIds.size;

    // Card ③: max cost ratio
    const maxRatio = rows.reduce(
      (max, r) => Math.max(max, Number(r.alloc_ratio_pct) || 0),
      0,
    );

    // Card ④: zero-weight warning
    const hasZeroWeight = rows.some((r) => r._is_zero_weight === true);

    // Insight cards per plan: 3 metric cards + zero-weight warning card (iconKey 'warning'/'safe')
    const insights: InsightItem[] = [
      {
        id: 'fee-allocate-total',
        cardType: 'standard',
        iconKey: 'insight',
        title: '分摊总额',
        sortOrder: 1,
        metrics: [
          { label: '分摊佣金/服务费合计', value: totalAllocated, unit: '元' },
        ],
      },
      {
        id: 'fee-allocate-orders',
        cardType: 'standard',
        iconKey: 'order',
        title: '涉及订单',
        sortOrder: 2,
        metrics: [
          { label: '订单数', value: orderCount, unit: '单' },
        ],
      },
      {
        id: 'fee-allocate-max-ratio',
        cardType: 'standard',
        iconKey: 'price',
        title: '最高费率',
        sortOrder: 3,
        description: '单行分摊费用占订单费用总额的最大比例',
        metrics: [
          { label: '最高分摊费率', value: maxRatio , unit: '%', highlight: hasZeroWeight },
        ],
      },
      {
        id: 'fee-allocate-zero-weight',
        cardType: 'standard',
        iconKey: hasZeroWeight ? 'warning' : 'safe',
        title: hasZeroWeight ? '零权重订单' : '权重正常',
        sortOrder: 4,
        description: hasZeroWeight
          ? '存在权重全为 0 的订单，其分摊结果已置 0，请检查净额字段'
          : '所有订单行权重正常',
        suggestion: hasZeroWeight ? '请核对商品净额列是否填写完整，或改用其他分摊权重模式' : undefined,
      },
    ];

    // Enriched schema: reuse queryResult.schema + add auxiliary columns
    const auxiliaryColumns = [
      { name: 'allocated_fee', type: 'DOUBLE' },
      { name: 'alloc_ratio_pct', type: 'DOUBLE' },
      { name: 'is_rounding_adjust', type: 'INTEGER' },
      { name: 'product_net_profit', type: 'DOUBLE' },
    ];

    const enrichedSchema = [
      ...queryResult.schema,
      ...auxiliaryColumns,
    ];

    // alloc_ratio_pct is stored as a 0-1 fraction; the percent_signed
    // formatter renders it as a percentage (plan revision round 2, P2).
    const displayConfig = {
      columnFormatters: {
        allocated_fee: { type: 'currency_signed' as const, unit: '元', precision: 2 },
        alloc_ratio_pct: { type: 'percent_signed' as const, precision: 2 },
        product_net_profit: { type: 'currency_signed' as const, unit: '元', precision: 2 },
      },
      columnTooltips: {
        allocated_fee: '按商品净额占比分摊的平台佣金+服务费（尾差补偿已并入最大权重行）',
        alloc_ratio_pct: '该行分摊费用占该订单费用总额的比例（0-1）',
        is_rounding_adjust: '1 表示该行吸收了订单内的四舍五入尾差',
        product_net_profit: '分摊后商品净额（用于成本分析）',
        _is_zero_weight: 'true 表示该订单所有行权重为 0，分摊结果置 0',
      },
    } as OperatorDisplayConfig;

    return {
      type: OperatorType.PLATFORM_FEE_ALLOCATE,
      sql: '',
      data: rows,
      schema: enrichedSchema as unknown[],
      insightsData: { insights } as OperatorInsightsData,
      displayConfig,
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private _buildEmptyResult(schema: Record<string, string>[]): AnalysisResult {
    const warningItem: InsightItem = {
      id: 'fee-allocate-empty',
      cardType: 'standard',
      iconKey: 'warning',
      title: '分摊结果',
      sortOrder: 1,
      description: '无数据，请检查上游表与算子配置',
    };

    const auxiliaryColumns = [
      { name: 'allocated_fee', type: 'DOUBLE' },
      { name: 'alloc_ratio_pct', type: 'DOUBLE' },
      { name: 'is_rounding_adjust', type: 'INTEGER' },
      { name: 'product_net_profit', type: 'DOUBLE' },
    ];

    const enrichedSchema = [...schema, ...auxiliaryColumns];

    return {
      type: OperatorType.PLATFORM_FEE_ALLOCATE,
      sql: '',
      data: [],
      schema: enrichedSchema as unknown[],
      insightsData: { insights: [warningItem] } as OperatorInsightsData,
      displayConfig: {} as OperatorDisplayConfig,
    };
  }
}
