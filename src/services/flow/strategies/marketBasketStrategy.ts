/**
 * MarketBasketStrategy
 *
 * Builds DuckDB association rules SQL for fn_ecom_market_basket (关联销售建议).
 *
 * Two execution modes driven by config.enableTriples:
 *
 * Phase-1 (enableTriples = false, default):
 *   buildOperatorSql → Full DuckDB pipeline: Apriori prune + B2B filter + 2-item
 *                      self-join → pair rules table (product_a, product_b, support,
 *                      confidence_ab, confidence_ba, lift, co_count)
 *   postProcess      → Parse pair rows directly → Top-5 InsightItems + detail table
 *
 * Phase-2 (enableTriples = true):
 *   buildOperatorSql → DuckDB pre-filter only → clean transaction table
 *                      (order_id, product_id)
 *   postProcess      → Arrow IPC → find_association_patterns() Wasm (FP-Growth)
 *                    → derive confidence/lift from frequent itemsets
 *                    → Top-5 InsightItems (2-item + 3-item mixed) + detail table
 */

import init, { find_association_patterns } from '../../../../wasm/fast_insight_engine.js';
import * as arrow from 'apache-arrow';
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
// Row types
// ============================================================================

/** DuckDB result row for Phase-1 (self-join mode) */
interface PairRow {
  product_a: string;
  product_b: string;
  co_count: number | bigint;
  support: number;
  confidence_ab: number;
  confidence_ba: number;
  lift: number;
}

/** DuckDB result row for Phase-2 (clean transaction mode) */
interface TransactionRow {
  order_id: string;
  product_id: string;
}

/** Parsed pattern from FP-Growth Wasm output */
interface PatternRow {
  items: string[];
  support: number;  // absolute count
}

/** Unified processed rule (2-item or 3-item) */
interface RuleRow {
  product_a: string;
  product_b: string;
  product_c: string;   // empty string for 2-item rules
  support: number;     // ratio
  confidence: number;  // best direction for 2-item; AB→C for 3-item
  lift: number;
  co_count: number;    // absolute support count
  rule_type: '2-item' | '3-item';
}

// ============================================================================
// Defaults
// ============================================================================

export const DEFAULT_MARKET_BASKET_CONFIG: Required<MarketBasketConfig> = {
  orderIdCol:       'order_id',
  productIdCol:     'product_id',
  minSupport:       0.01,
  minConfidence:    0.30,
  minLift:          1.2,
  maxItemsPerOrder: 50,
  topN:             100,
  enableTriples:    false,
};

// ============================================================================
// Strategy
// ============================================================================

export class MarketBasketStrategy extends BaseStrategy {
  readonly type = OperatorType.MARKET_BASKET;
  readonly name = '关联销售建议';

  private wasmInitialized = false;

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  private _lastConfig: Required<MarketBasketConfig> | null = null;

  // ============================================================================
  // Validation
  // ============================================================================

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

  // ============================================================================
  // SQL builders
  // ============================================================================

  /**
   * Build the DuckDB SQL.
   *
   * enableTriples = false → Phase-1: full self-join pipeline returns pair rules
   * enableTriples = true  → Phase-2: pre-filter only returns clean (order_id, product_id)
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

    return cfg.enableTriples
      ? this.buildCleanTxnSql(cfg, tableName)
      : this.buildAssocRulesSql(cfg, tableName);
  }

  /**
   * Phase-1: Full association rules pipeline (DuckDB 2-item self-join).
   *
   * NOTE: DuckDB does not allow SELECT-alias references in WHERE.
   *       Expressions are repeated verbatim in the WHERE clause.
   */
  private buildAssocRulesSql(cfg: Required<MarketBasketConfig>, tableName: string): string {
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
   * Phase-2: Pre-filter only — output clean (order_id, product_id) for Wasm.
   *
   * Same Apriori prune + B2B filter as Phase-1, but skips self-join.
   * postProcess handles FP-Growth computation.
   */
  private buildCleanTxnSql(cfg: Required<MarketBasketConfig>, tableName: string): string {
    const { orderIdCol, productIdCol, minSupport, maxItemsPerOrder } = cfg;
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
)
SELECT f.order_id, f.product_id
FROM filtered_txn f
INNER JOIN valid_orders v ON f.order_id = v.order_id
`.trim();
  }

  // ============================================================================
  // Wasm helpers
  // ============================================================================

  private async ensureWasm(): Promise<void> {
    if (!this.wasmInitialized) {
      await init();
      this.wasmInitialized = true;
    }
  }

  /**
   * Serialize transaction rows into Arrow IPC Stream format expected by Wasm.
   *
   * Arrow schema: order_id (Utf8), item_id (Utf8)
   * Note: Wasm column name is 'item_id', not 'product_id'.
   */
  private async serializeTransactionsToArrowIPC(rows: TransactionRow[]): Promise<Uint8Array> {
    const orderIdBuilder = new arrow.Utf8Builder({ type: new arrow.Utf8() });
    const itemIdBuilder  = new arrow.Utf8Builder({ type: new arrow.Utf8() });

    for (const row of rows) {
      orderIdBuilder.append(String(row.order_id ?? ''));
      itemIdBuilder.append(String(row.product_id ?? ''));
    }

    const orderIdVec = orderIdBuilder.finish().toVector();
    const itemIdVec  = itemIdBuilder.finish().toVector();

    const fields = [
      new arrow.Field('order_id', new arrow.Utf8(), false),
      new arrow.Field('item_id',  new arrow.Utf8(), false),
    ];
    const schema = new arrow.Schema(fields);

    const children = [orderIdVec.data[0], itemIdVec.data[0]];
    const structData = new arrow.Data(
      new arrow.Struct(fields),
      0,
      rows.length,
      0,
      undefined,
      children
    );
    const recordBatch = new arrow.RecordBatch(schema, structData);
    const writer = arrow.RecordBatchStreamWriter.writeAll([recordBatch]);
    return await writer.toUint8Array();
  }

  /**
   * Parse Arrow IPC bytes returned from find_association_patterns.
   *
   * Output schema: pattern (List<Utf8>), support (Int32)
   */
  private parsePatternRows(bytes: Uint8Array): PatternRow[] {
    const table = arrow.tableFromIPC(bytes);
    const patternCol = table.getChild('pattern');
    const supportCol = table.getChild('support');

    if (!patternCol || !supportCol) {
      console.warn('[MarketBasketStrategy] Missing pattern or support column in Wasm output');
      return [];
    }

    const rowCount = table.numRows;
    const patterns: PatternRow[] = [];

    for (let i = 0; i < rowCount; i++) {
      // List<Utf8>: .get(i) returns a Vector<Utf8> slice
      const listVec = patternCol.get(i) as arrow.Vector<arrow.Utf8> | null;
      const items: string[] = [];

      if (listVec) {
        for (let j = 0; j < listVec.length; j++) {
          const val = listVec.get(j);
          if (val !== null && val !== undefined) {
            items.push(String(val));
          }
        }
      }

      patterns.push({ items, support: Number(supportCol.get(i) ?? 0) });
    }

    return patterns;
  }

  /**
   * Run FP-Growth with adaptive min_support_count adjustment.
   *
   * Best practice: start with Math.round(totalOrders * minSupportRatio).
   * > 500 patterns → double (one retry). < 10 patterns → halve (one retry).
   */
  private async runFPGrowthAdaptive(
    inputBytes: Uint8Array,
    totalOrders: number,
    minSupportRatio: number
  ): Promise<PatternRow[]> {
    let minSupportCount = Math.max(1, Math.round(totalOrders * minSupportRatio));
    let resultBytes = await find_association_patterns(inputBytes, minSupportCount);
    let patterns = this.parsePatternRows(resultBytes);

    if (patterns.length > 500) {
      minSupportCount = Math.ceil(minSupportCount * 2);
      resultBytes = await find_association_patterns(inputBytes, minSupportCount);
      patterns = this.parsePatternRows(resultBytes);
    } else if (patterns.length < 10 && minSupportCount > 1) {
      minSupportCount = Math.max(1, Math.floor(minSupportCount * 0.5));
      resultBytes = await find_association_patterns(inputBytes, minSupportCount);
      patterns = this.parsePatternRows(resultBytes);
    }

    return patterns;
  }

  /**
   * Build unified rule rows from FP-Growth pattern output.
   *
   * For 2-item [A, B]:
   *   confidence = max(support_ab / support_a, support_ab / support_b)
   *   lift = support_ab * totalOrders / (support_a * support_b)
   *
   * For 3-item [A, B, C]:
   *   confidence = support_abc / support_ab  (AB→C direction)
   *   lift = support_abc * totalOrders^2 / (support_a * support_b * support_c)
   */
  private buildRulesFromPatterns(
    patterns: PatternRow[],
    totalOrders: number,
    cfg: Required<MarketBasketConfig>
  ): RuleRow[] {
    if (totalOrders === 0) return [];

    // Build support map: sorted_key → absolute support count
    const supportMap = new Map<string, number>();
    for (const p of patterns) {
      const key = [...p.items].sort().join('|');
      supportMap.set(key, p.support);
    }

    const rules: RuleRow[] = [];

    for (const p of patterns) {
      const size = p.items.length;

      if (size === 2) {
        const [a, b] = [...p.items].sort();
        const sup_ab = p.support;
        const sup_a  = supportMap.get(a) ?? 1;
        const sup_b  = supportMap.get(b) ?? 1;

        const conf_ab  = sup_ab / sup_a;
        const conf_ba  = sup_ab / sup_b;
        const bestConf = Math.max(conf_ab, conf_ba);
        const lift     = (sup_ab * totalOrders) / (sup_a * sup_b);
        const support  = sup_ab / totalOrders;

        if (bestConf < cfg.minConfidence || lift < cfg.minLift || support < cfg.minSupport) continue;

        rules.push({
          product_a: a, product_b: b, product_c: '',
          support:    Math.round(support   * 10000) / 10000,
          confidence: Math.round(bestConf  * 10000) / 10000,
          lift:       Math.round(lift      * 10000) / 10000,
          co_count:   sup_ab,
          rule_type:  '2-item',
        });

      } else if (size === 3 && cfg.enableTriples) {
        const [a, b, c] = [...p.items].sort();
        const sup_abc = p.support;
        const sup_a   = supportMap.get(a) ?? 1;
        const sup_b   = supportMap.get(b) ?? 1;
        const sup_c   = supportMap.get(c) ?? 1;
        const sup_ab  = supportMap.get([a, b].sort().join('|')) ?? 1;

        const conf_abc = sup_abc / sup_ab;
        const lift     = (sup_abc * totalOrders * totalOrders) / (sup_a * sup_b * sup_c);
        const support  = sup_abc / totalOrders;

        if (conf_abc < cfg.minConfidence || lift < cfg.minLift || support < cfg.minSupport) continue;

        rules.push({
          product_a: a, product_b: b, product_c: c,
          support:    Math.round(support   * 10000) / 10000,
          confidence: Math.round(conf_abc  * 10000) / 10000,
          lift:       Math.round(lift      * 10000) / 10000,
          co_count:   sup_abc,
          rule_type:  '3-item',
        });
      }
    }

    // Sort by lift DESC; 2-item before 3-item on ties
    rules.sort((a, b) => {
      if (b.lift !== a.lift) return b.lift - a.lift;
      return a.rule_type === '2-item' ? -1 : 1;
    });

    return rules.slice(0, cfg.topN);
  }

  // ============================================================================
  // postProcess
  // ============================================================================

  /**
   * Dispatch to Phase-1 (SQL) or Phase-2 (Wasm FP-Growth) based on enableTriples.
   */
  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    const cfg = this._lastConfig ?? DEFAULT_MARKET_BASKET_CONFIG;

    if (cfg.enableTriples) {
      return this.postProcessWasm(queryResult.data as TransactionRow[], cfg);
    }
    return this.postProcessSQL(queryResult.data as PairRow[], cfg);
  }

  // ── Phase-1: SQL path ────────────────────────────────────────────────────

  private postProcessSQL(rows: PairRow[], cfg: Required<MarketBasketConfig>): AnalysisResult {
    if (rows.length === 0) return this.buildEmptyResult(cfg);

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
          { label: 'Lift',      value: lift,                                   unit: '×' },
          { label: 'Support',   value: Number(row.support) * 100,              unit: '%' },
          { label: 'Conf A→B',  value: Number(row.confidence_ab) * 100,        unit: '%' },
          { label: 'Co-orders', value: Number(row.co_count),                   unit: '单' },
        ],
      };
    });

    const insightsData: OperatorInsightsData = {
      summary: { totalRecordCount: rows.length, totalFilterRecordCount: rows.length },
      insights,
    };

    const tableData = rows.map((row) => ({
      product_a:      row.product_a,
      product_b:      row.product_b,
      support:        Number(row.support),
      confidence_ab:  Number(row.confidence_ab),
      confidence_ba:  Number(row.confidence_ba),
      lift:           Number(row.lift),
      co_count:       Number(row.co_count),
    }));

    const schema: { name: string; type: string }[] = [
      { name: 'product_a',     type: 'VARCHAR' },
      { name: 'product_b',     type: 'VARCHAR' },
      { name: 'support',       type: 'DOUBLE' },
      { name: 'confidence_ab', type: 'DOUBLE' },
      { name: 'confidence_ba', type: 'DOUBLE' },
      { name: 'lift',          type: 'DOUBLE' },
      { name: 'co_count',      type: 'INTEGER' },
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

    return { type: this.type, sql: '', data: tableData, schema, insightsData, displayConfig };
  }

  // ── Phase-2: Wasm path ───────────────────────────────────────────────────

  private async postProcessWasm(
    rows: TransactionRow[],
    cfg: Required<MarketBasketConfig>
  ): Promise<AnalysisResult> {
    if (rows.length === 0) return this.buildEmptyResult(cfg);

    await this.ensureWasm();

    const totalOrders = new Set(rows.map((r) => r.order_id)).size;
    if (totalOrders === 0) return this.buildEmptyResult(cfg);

    const inputBytes = await this.serializeTransactionsToArrowIPC(rows);
    const patterns   = await this.runFPGrowthAdaptive(inputBytes, totalOrders, cfg.minSupport);
    const rules      = this.buildRulesFromPatterns(patterns, totalOrders, cfg);

    if (rules.length === 0) return this.buildEmptyResult(cfg);

    const top5 = rules.slice(0, 5);
    const insights: InsightItem[] = top5.map((rule, idx) => {
      const iconKey: InsightItem['iconKey'] =
        rule.lift > 2.0 ? 'insight' : rule.lift >= 1.2 ? 'order' : 'warning';

      const title = rule.rule_type === '3-item'
        ? `${rule.product_a} + ${rule.product_b} → ${rule.product_c}`
        : `${rule.product_a} → ${rule.product_b}`;

      return {
        id: `mb-rule-${idx}`,
        cardType: 'standard',
        iconKey,
        title,
        description: rule.rule_type === '3-item'
          ? `Every 100 orders, ~${(rule.support * 100).toFixed(0)} contain all three items together.`
          : `Every 100 orders, ~${(rule.support * 100).toFixed(0)} orders co-purchased both items.`,
        sortOrder: idx,
        metrics: [
          { label: 'Lift',       value: rule.lift,              unit: '×' },
          { label: 'Support',    value: rule.support * 100,     unit: '%' },
          { label: 'Confidence', value: rule.confidence * 100,  unit: '%' },
          { label: rule.rule_type === '3-item' ? 'Co-orders (3)' : 'Co-orders',
            value: rule.co_count, unit: '单' },
        ],
      };
    });

    const insightsData: OperatorInsightsData = {
      summary: { totalRecordCount: rules.length, totalFilterRecordCount: rules.length },
      insights,
    };

    const tableData = rules.map((rule) => ({
      product_a:  rule.product_a,
      product_b:  rule.product_b,
      product_c:  rule.product_c,
      support:    rule.support,
      confidence: rule.confidence,
      lift:       rule.lift,
      co_count:   rule.co_count,
      rule_type:  rule.rule_type,
    }));

    const schema: { name: string; type: string }[] = [
      { name: 'product_a',  type: 'VARCHAR' },
      { name: 'product_b',  type: 'VARCHAR' },
      { name: 'product_c',  type: 'VARCHAR' },
      { name: 'support',    type: 'DOUBLE' },
      { name: 'confidence', type: 'DOUBLE' },
      { name: 'lift',       type: 'DOUBLE' },
      { name: 'co_count',   type: 'INTEGER' },
      { name: 'rule_type',  type: 'VARCHAR' },
    ];

    const displayConfig: import('../types').OperatorDisplayConfig = {
      defaultSort: { column: 'lift', order: 'descend' },
      columnTooltips: {
        product_a:  'Product A — first item in the association rule',
        product_b:  'Product B — second item in the rule',
        product_c:  'Product C — third item (3-item rules only; empty for 2-item rules)',
        support:    'Support — fraction of total orders containing all rule items',
        confidence: 'Confidence — for 2-item: best direction; for 3-item: AB→C confidence',
        lift:       'Lift — ratio of observed to expected co-purchase; >1 = positive association',
        co_count:   'Co-orders — absolute order count containing all rule items (sample size)',
        rule_type:  'Rule Type — 2-item (pair) or 3-item (triple) association rule',
      },
    };

    return { type: this.type, sql: '', data: tableData, schema, insightsData, displayConfig };
  }

  // ── Shared ───────────────────────────────────────────────────────────────

  private buildEmptyResult(cfg: Required<MarketBasketConfig>): AnalysisResult {
    const emptyInsight: InsightItem = {
      id: 'mb-no-rules',
      cardType: 'standard',
      iconKey: 'warning',
      title: 'No Association Rules Found',
      description: `No rules satisfy support ≥ ${(cfg.minSupport * 100).toFixed(1)}%, confidence ≥ ${(cfg.minConfidence * 100).toFixed(0)}%, lift ≥ ${cfg.minLift}. Try lowering the thresholds.`,
      sortOrder: 0,
      metrics: [{ label: 'No Rules', value: 0, unit: '' }],
    };
    return {
      type: this.type,
      sql: '',
      data: [],
      schema: [],
      insightsData: { insights: [emptyInsight] },
    };
  }
}
