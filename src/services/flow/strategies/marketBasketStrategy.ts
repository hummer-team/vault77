/**
 * MarketBasketStrategy
 *
 * Builds DuckDB association rules SQL for fn_ecom_market_basket (关联销售建议).
 * Phase-1: Pure DuckDB SQL self-join computes 2-item association rules.
 *
 * Data flow:
 *   buildOperatorSql → DuckDB: Pass-1 frequent-item prune (Apriori) + B2B bulk-order
 *                              filter + 2-item self-join produces per-pair rules table
 *                              (product_a, product_b, support, confidence_ab,
 *                               confidence_ba, lift, co_count)
 *   postProcess      → Top-5 InsightItem cards (by lift DESC) + full detail table
 *
 * Phase-2 upgrade path: replace postProcess to call find_association_patterns() Wasm
 * after DuckDB pre-filter. min_support_count = Math.round(totalOrders * minSupport).
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
  type MarketBasketConfig,
  type ValidationError,
} from '../types';

// ============================================================================
// Row type from DuckDB result
// ============================================================================

interface PairRow {
  product_a: string;
  product_b: string;
  co_count: number | bigint;
  support: number;
  confidence_ab: number;
  confidence_ba: number;
  lift: number;
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_MARKET_BASKET_CONFIG: Required<MarketBasketConfig> = {
  orderIdCol:       'order_id',
  productIdCol:     'product_id',
  minSupport:       0.01,    // 1%
  minConfidence:    0.30,    // 30%
  minLift:          1.2,
  maxItemsPerOrder: 50,
  topN:             100,
};

// ============================================================================
// Strategy
// ============================================================================

export class MarketBasketStrategy extends BaseStrategy {
  readonly type = OperatorType.MARKET_BASKET;
  readonly name = '关联销售建议';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  /** Captures config from the most recent buildOperatorSql so postProcess can access it */
  private _lastConfig: MarketBasketConfig | null = null;

  /**
   * Validates operator-specific configuration.
   */
  protected override validateOperatorSpecific(nodes: FlowNode[], _edges: FlowEdge[]): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { marketBasketConfig?: MarketBasketConfig } | undefined)
      ?.marketBasketConfig;

    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    if (!cfg.orderIdCol) {
      errors.push({ nodeId, nodeType: FlowNodeType.SELECT, severity: ValidationSeverity.ERROR, message: 'market basket: orderIdCol is required' });
    }
    if (!cfg.productIdCol) {
      errors.push({ nodeId, nodeType: FlowNodeType.SELECT, severity: ValidationSeverity.ERROR, message: 'market basket: productIdCol is required' });
    }
    if (cfg.orderIdCol && cfg.productIdCol && cfg.orderIdCol === cfg.productIdCol) {
      errors.push({ nodeId, nodeType: FlowNodeType.SELECT, severity: ValidationSeverity.ERROR, message: 'market basket: orderIdCol and productIdCol must differ' });
    }

    return errors;
  }

  /**
   * Build the DuckDB association rules SQL.
   *
   * Phase-1 pipeline (pure SQL):
   *   item_freq     — Pass-1 Apriori prune: items appearing in < minSupport% orders are dropped
   *   order_size    — Filter B2B bulk orders (> maxItemsPerOrder items)
   *   filtered_txn  — Keep only frequent items within non-bulk orders
   *   valid_orders  — Drop orders with < 2 items remaining
   *   clean_txn     — Final clean transaction table
   *   totals        — Total distinct order count (for support denominator)
   *   item_counts   — Per-item order frequency (for confidence denominator)
   *   pairs         — Self-join (a < b canonical direction) → co-occurrence count
   *   Final SELECT  — Compute support/confidence/lift, apply threshold filters
   *
   * NOTE: DuckDB does not support SELECT-alias references in WHERE.
   *       Expressions are repeated verbatim.
   */
  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _ph: Record<string, unknown> | undefined,
    _userWhere: string
  ): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const rawCfg = (selectNode?.data as { marketBasketConfig?: MarketBasketConfig } | undefined)
      ?.marketBasketConfig;

    const cfg: Required<MarketBasketConfig> = {
      ...DEFAULT_MARKET_BASKET_CONFIG,
      ...rawCfg,
    };
    this._lastConfig = cfg;

    if (!tableName) {
      console.warn(`[${this.name}.buildOperatorSql] no table found — falling back to empty`);
      return 'SELECT 1 WHERE false';
    }

    const { orderIdCol, productIdCol, minSupport, minConfidence, minLift, maxItemsPerOrder, topN } = cfg;
    const tbl = `"${tableName}"`;
    const oid = `"${orderIdCol}"`;
    const pid = `"${productIdCol}"`;

    return `
WITH item_freq AS (
  SELECT ${pid} AS product_id,
         COUNT(DISTINCT ${oid}) AS order_count
  FROM ${tbl}
  GROUP BY ${pid}
  HAVING order_count >= CAST(${minSupport} * (
    SELECT COUNT(DISTINCT ${oid}) FROM ${tbl}
  ) AS INTEGER)
),
order_size AS (
  SELECT ${oid} AS order_id
  FROM ${tbl}
  GROUP BY ${oid}
  HAVING COUNT(*) <= ${maxItemsPerOrder}
),
filtered_txn AS (
  SELECT t.${oid} AS order_id,
         t.${pid} AS product_id
  FROM ${tbl} t
  INNER JOIN item_freq  i ON t.${pid} = i.product_id
  INNER JOIN order_size o ON t.${oid} = o.order_id
),
valid_orders AS (
  SELECT order_id
  FROM filtered_txn
  GROUP BY order_id
  HAVING COUNT(*) >= 2
),
clean_txn AS (
  SELECT f.order_id, f.product_id
  FROM filtered_txn f
  INNER JOIN valid_orders v ON f.order_id = v.order_id
),
totals AS (
  SELECT COUNT(DISTINCT order_id) AS n FROM clean_txn
),
item_counts AS (
  SELECT product_id, COUNT(DISTINCT order_id) AS cnt
  FROM clean_txn
  GROUP BY product_id
),
pairs AS (
  SELECT a.product_id AS product_a,
         b.product_id AS product_b,
         COUNT(*) AS co_count
  FROM clean_txn a
  JOIN clean_txn b
    ON a.order_id = b.order_id
   AND a.product_id < b.product_id
  GROUP BY a.product_id, b.product_id
)
SELECT
  product_a,
  product_b,
  co_count,
  ROUND(co_count * 1.0 / t.n, 4)                                                              AS support,
  ROUND(co_count * 1.0 / fa.cnt, 4)                                                            AS confidence_ab,
  ROUND(co_count * 1.0 / fb.cnt, 4)                                                            AS confidence_ba,
  ROUND((co_count * 1.0 / t.n) / ((fa.cnt * 1.0 / t.n) * (fb.cnt * 1.0 / t.n)), 4)           AS lift
FROM pairs
JOIN item_counts fa ON fa.product_id = pairs.product_a
JOIN item_counts fb ON fb.product_id = pairs.product_b
CROSS JOIN totals t
WHERE ROUND(co_count * 1.0 / t.n, 4) >= ${minSupport}
  AND GREATEST(
        ROUND(co_count * 1.0 / fa.cnt, 4),
        ROUND(co_count * 1.0 / fb.cnt, 4)
      ) >= ${minConfidence}
  AND ROUND((co_count * 1.0 / t.n) / ((fa.cnt * 1.0 / t.n) * (fb.cnt * 1.0 / t.n)), 4) >= ${minLift}
ORDER BY lift DESC
LIMIT ${topN}
`.trim();
  }

  /**
   * Build InsightItem cards and detail table rows from DuckDB rule pairs.
   *
   * @param queryResult - Raw DuckDB result from buildOperatorSql
   * @returns AnalysisResult with insightsData and full association rules table
   */
  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    const rows = (queryResult?.data ?? []) as PairRow[];
    const cfg = this._lastConfig ?? DEFAULT_MARKET_BASKET_CONFIG;

    // ── Empty result ──────────────────────────────────────────────────────
    if (rows.length === 0) {
      const emptyInsight: InsightItem = {
        id: 'mb-no-rules',
        cardType: 'standard',
        iconKey: 'warning',
        title: 'No Association Rules Found',
        description: `No item pairs satisfy support ≥ ${(cfg.minSupport * 100).toFixed(1)}%, confidence ≥ ${(cfg.minConfidence * 100).toFixed(0)}%, lift ≥ ${cfg.minLift}. Try lowering the thresholds.`,
        sortOrder: 0,
        metrics: [
          { label: 'No Rules', value: 0, unit: '' },
        ],
      };
      return {
        type: this.type,
        sql: '',
        data: [],
        schema: [],
        insightsData: { insights: [emptyInsight] },
      };
    }

    // ── Top-5 InsightItem cards by lift ───────────────────────────────────
    const top5 = rows.slice(0, 5);
    const insights: InsightItem[] = top5.map((row, idx) => {
      const lift = Number(row.lift);
      const iconKey: InsightItem['iconKey'] =
        lift > 2.0 ? 'insight' : lift >= 1.2 ? 'order' : 'warning';

      return {
        id: `mb-pair-${idx}`,
        cardType: 'standard',
        iconKey,
        title: `${row.product_a} → ${row.product_b}`,
        description: `Every 100 orders, ~${(Number(row.support) * 100).toFixed(0)} orders co-purchased both items.`,
        sortOrder: idx,
        metrics: [
          { label: 'Lift',      value: lift,                         unit: '×' },
          { label: 'Support',   value: Number(row.support) * 100,    unit: '%' },
          { label: 'Conf A→B',  value: Number(row.confidence_ab) * 100, unit: '%' },
          { label: 'Co-orders', value: Number(row.co_count),         unit: '单' },
        ],
      };
    });

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: rows.length,
        totalFilterRecordCount: rows.length,
      },
      insights,
    };

    // ── Detail table rows ─────────────────────────────────────────────────
    const tableData = rows.map((row) => ({
      product_a:       row.product_a,
      product_b:       row.product_b,
      support:         Number(row.support),
      confidence_ab:   Number(row.confidence_ab),
      confidence_ba:   Number(row.confidence_ba),
      lift:            Number(row.lift),
      co_count:        Number(row.co_count),
    }));

    const schema: { name: string; type: string }[] = [
      { name: 'product_a',      type: 'VARCHAR' },
      { name: 'product_b',      type: 'VARCHAR' },
      { name: 'support',        type: 'DOUBLE' },
      { name: 'confidence_ab',  type: 'DOUBLE' },
      { name: 'confidence_ba',  type: 'DOUBLE' },
      { name: 'lift',           type: 'DOUBLE' },
      { name: 'co_count',       type: 'INTEGER' },
    ];

    const displayConfig: import('../types').OperatorDisplayConfig = {
      defaultSort: { column: 'lift', order: 'descend' },
      columnTooltips: {
        product_a:      'Product A — first item in the association rule',
        product_b:      'Product B — second item in the association rule',
        support:        'Support — fraction of orders that contain both items',
        confidence_ab:  'Confidence A→B — among orders with A, how many also have B',
        confidence_ba:  'Confidence B→A — among orders with B, how many also have A',
        lift:           'Lift — ratio of observed to expected co-purchase rate; >1 = positive association',
        co_count:       'Co-orders — absolute number of orders containing both items (sample size)',
      },
    };

    return {
      type: this.type,
      sql: '',
      data: tableData,
      schema,
      insightsData,
      displayConfig,
    };
  }
}
