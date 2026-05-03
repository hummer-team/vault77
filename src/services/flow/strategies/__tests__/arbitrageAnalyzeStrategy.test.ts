/**
 * Unit tests for ArbitrageAnalyzeStrategy
 *
 * Test scenarios:
 *   A — Basic mandatory fields only: verifies all 13 CTEs are present in generated SQL
 *   B — Clearance exemption enabled: verifies 'NOT is_clearance AND' guard in margin rule SQL
 *   C — No sku_id/category_id mapped: bm emits NULL::VARCHAR for sku_id and category_id
 *   D — All rules disabled via ruleToggles: all score expressions emit 0
 *   E — Method A (same_hour_avg): hs CTE uses hour_of_day partitioning
 *   F — Custom thresholds: threshold values appear verbatim in score SQL
 *   G — Arbitrage rules disabled: arb_* scores all emit 0, arbitrage_evidence_list is empty
 *   H — postProcess: insightsData summary is correctly computed from mock result rows
 *   I — Strategy factory: ArbitrageAnalyzeStrategy is registered and retrievable
 */

import { describe, it, expect } from 'bun:test';
import { ArbitrageAnalyzeStrategy } from '../arbitrageAnalyzeStrategy';
import { StrategyFactory } from '../../strategyFactory';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type ArbitrageAnalyzeConfig,
} from '../../types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: ArbitrageAnalyzeConfig = {
  fieldMapping: {
    orderIdCol: 'order_id',
    amountCol: 'price',
    costCol: 'cost',
    couponAmountCol: 'coupon',
  },
  thresholds: {
    lowMarginRate: 0.05,
    extremeDiscountRate: 0.6,
    productDeviationRate: 0.3,
    categoryDeviationRate: 0.4,
    couponCostRatio: 0.9,
    couponDiscountRate: 0.5,
  },
  arbitrage: {
    hourlySpikeMethod: 'batch_avg',
    hourlySpikeMult: 3,
    purchaseLimit: 5,
    addressPrefixLength: 15,
    addressClusterThreshold: 5,
    deviceAccountThreshold: 3,
  },
  ruleToggles: {
    marginRules: true,
    discountRules: true,
    priceDeviationRules: true,
    couponAnomalyRules: true,
    arbitrageRules: true,
    clearanceMarginExempt: false,
  },
};

const FULL_CONFIG: ArbitrageAnalyzeConfig = {
  ...DEFAULT_CONFIG,
  autoFieldMapping: {
    skuIdCol: 'sku_id',
    categoryIdCol: 'category_id',
    orderTimeCol: 'order_time',
    userIdCol: 'user_id',
    deviceIdCol: 'device_id',
    receiverAddrCol: 'receiver_addr',
    activityIdCol: 'activity_id',
    activityTypeCol: 'activity_type',
    activityStartCol: 'activity_start',
    activityEndCol: 'activity_end',
  },
};

function makeNodes(config: ArbitrageAnalyzeConfig, tableName = 'test_orders'): FlowNode[] {
  return [
    {
      id: 'table-1',
      type: FlowNodeType.TABLE,
      position: { x: 0, y: 0 },
      data: { tableName },
    },
    {
      id: 'select-1',
      type: FlowNodeType.SELECT,
      position: { x: 100, y: 0 },
      data: {
        tableName,
        arbitrageAnalyzeConfig: config,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArbitrageAnalyzeStrategy', () => {
  const strategy = new ArbitrageAnalyzeStrategy();

  // ── Test A: CTE structure ─────────────────────────────────────────────────

  it('A — should generate SQL containing all required CTEs', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);

    const expectedCtes = ['dq', 'bm', 'skp', 'cbp', 'cad', 'hs', 'hoc', 'uds', 'acl', 'dcl', 'en', 'sc', 'totals'];
    for (const cte of expectedCtes) {
      expect(sql).toContain(`${cte} AS (`);
    }
    expect(sql).toContain('WITH');
    expect(sql).toContain('risk_score');
    expect(sql).toContain('risk_level');
    expect(sql).toContain('risk_type');
    expect(sql).toContain('arbitrage_evidence');
  });

  it('A — should embed the table name correctly in the dq CTE', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG, 'orders_2024'), []);
    expect(sql).toContain('"orders_2024"');
  });

  it('A — should embed mandatory column names in the dq CTE', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    expect(sql).toContain('"price"');   // amountCol
    expect(sql).toContain('"cost"');    // costCol
    expect(sql).toContain('"coupon"');  // couponAmountCol
    expect(sql).toContain('"order_id"'); // orderIdCol
  });

  // ── Test B: Clearance exemption ───────────────────────────────────────────

  it('B — clearanceMarginExempt=false should NOT add is_clearance guard', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    // Without exemption, no guard needed
    expect(sql).not.toContain('NOT is_clearance AND gross_margin');
  });

  it('B — clearanceMarginExempt=true should add NOT is_clearance guard in margin rules', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      ruleToggles: { ...DEFAULT_CONFIG.ruleToggles, clearanceMarginExempt: true },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('NOT is_clearance AND');
  });

  // ── Test C: Optional fields as NULL ───────────────────────────────────────

  it('C — no autoFieldMapping should emit NULL::VARCHAR for optional columns', () => {
    const config: ArbitrageAnalyzeConfig = { ...DEFAULT_CONFIG, autoFieldMapping: undefined };
    const sql = strategy.buildSql(makeNodes(config), []);
    // sku_id, category_id, order_time_ms, etc. should be NULL literals
    expect(sql).toContain('NULL::VARCHAR AS sku_id');
    expect(sql).toContain('NULL::VARCHAR AS category_id');
    expect(sql).toContain('NULL::BIGINT AS order_time_ms');
    expect(sql).toContain('NULL::VARCHAR AS user_id');
  });

  it('C — full autoFieldMapping should use actual column names', () => {
    const sql = strategy.buildSql(makeNodes(FULL_CONFIG), []);
    expect(sql).toContain('CAST("sku_id" AS VARCHAR) AS sku_id');
    expect(sql).toContain('CAST("category_id" AS VARCHAR) AS category_id');
    expect(sql).toContain('ts_to_epoch_ms("order_time") AS order_time_ms');
  });

  // ── Test D: Rule toggles disable scoring ──────────────────────────────────

  it('D — all marginRules=false should emit 0 for margin_score', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      ruleToggles: { ...DEFAULT_CONFIG.ruleToggles, marginRules: false },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('0) AS margin_score');
    expect(sql).not.toContain('gross_margin < 0 THEN 30');
  });

  it('D — discountRules=false should emit 0 for discount_score', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      ruleToggles: { ...DEFAULT_CONFIG.ruleToggles, discountRules: false },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('0) AS discount_score');
  });

  it('D — priceDeviationRules=false should emit 0 for deviation_score', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      ruleToggles: { ...DEFAULT_CONFIG.ruleToggles, priceDeviationRules: false },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('0) AS deviation_score');
  });

  it('D — couponAnomalyRules=false should emit 0 for coupon_score', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      ruleToggles: { ...DEFAULT_CONFIG.ruleToggles, couponAnomalyRules: false },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('0) AS coupon_score');
  });

  // ── Test E: Hourly spike method selection ─────────────────────────────────

  it('E — batch_avg method should use COUNT / COUNT(DISTINCT ...) in hs CTE', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    // batch_avg formula: COUNT(*) / NULLIF(COUNT(DISTINCT hour_bucket), 0)
    expect(sql).toContain('COUNT(DISTINCT CAST(order_time_ms /');
    expect(sql).not.toContain('hour_of_day');
  });

  it('E — same_hour_avg method should use hour_of_day partitioning in hs CTE', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      arbitrage: { ...DEFAULT_CONFIG.arbitrage, hourlySpikeMethod: 'same_hour_avg' },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('hour_of_day');
    expect(sql).toContain('% 24');
  });

  it('E — same_hour_avg join should include hour_of_day match condition', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      arbitrage: { ...DEFAULT_CONFIG.arbitrage, hourlySpikeMethod: 'same_hour_avg' },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('hs.hour_of_day = CAST(bm.order_time_ms /');
  });

  // ── Test F: Custom thresholds ─────────────────────────────────────────────

  it('F — custom threshold values should appear verbatim in generated SQL', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        lowMarginRate: 0.08,
        extremeDiscountRate: 0.55,
        productDeviationRate: 0.25,
        couponCostRatio: 0.85,
      },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('0.08');        // lowMarginRate
    expect(sql).toContain('0.55');        // extremeDiscountRate
    expect(sql).toContain('0.25');        // productDeviationRate
    expect(sql).toContain('0.85');        // couponCostRatio
  });

  it('F — custom arbitrage parameters should appear in generated SQL', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      arbitrage: {
        ...DEFAULT_CONFIG.arbitrage,
        hourlySpikeMult: 5,
        purchaseLimit: 10,
        addressPrefixLength: 20,
        addressClusterThreshold: 8,
        deviceAccountThreshold: 4,
      },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    expect(sql).toContain('* 5');     // hourlySpikeMult
    expect(sql).toContain('> 10');    // purchaseLimit
    expect(sql).toContain(', 20)');   // addressPrefixLength (in LEFT())
    expect(sql).toContain('> 8');     // addressClusterThreshold
    expect(sql).toContain('> 4');     // deviceAccountThreshold
  });

  // ── Test G: Arbitrage rules disabled ──────────────────────────────────────

  it('G — arbitrageRules=false should emit 0 for all arb_* scores', () => {
    const config: ArbitrageAnalyzeConfig = {
      ...DEFAULT_CONFIG,
      ruleToggles: { ...DEFAULT_CONFIG.ruleToggles, arbitrageRules: false },
    };
    const sql = strategy.buildSql(makeNodes(config), []);
    // When disabled, each arb_* is '0'
    expect(sql).toContain('(0) AS arb_time_score');
    expect(sql).toContain('(0) AS arb_user_score');
    expect(sql).toContain('(0) AS arb_addr_score');
    expect(sql).toContain('(0) AS arb_dev_score');
  });

  // ── Test H: postProcess insightsData ─────────────────────────────────────
  // Mock data: 4 rows — 1 low, 1 medium, 1 high, 1 critical(dirty)
  // Expected counts: totalOrders=4, riskOrders=3 (score>0), highRisk=2 (高+严重),
  //                  dirtyOrders=1, criticalCount=1, mediumAndAbove=3 (中+高+严重)

  it('H — postProcess should return correct insight summary', async () => {
    const mockData = [
      { risk_score: 0,  risk_level: '低',  data_quality_flag: 'normal' },
      { risk_score: 45, risk_level: '中',  data_quality_flag: 'normal' },
      { risk_score: 75, risk_level: '高',  data_quality_flag: 'normal' },
      { risk_score: 90, risk_level: '严重', data_quality_flag: 'dirty' },
    ];
    const result = await strategy.postProcess({ data: mockData, schema: [] });

    expect(result.type).toBe(OperatorType.ARBITRAGE_ANALYZE);
    expect(result.data).toHaveLength(4);

    // Structured insightsData replaces deprecated insights[]
    expect(result.insightsData).toBeDefined();
    const id = result.insightsData!;

    // Summary fields
    expect(id.summary?.totalRecordCount).toBe(4);       // total orders
    expect(id.summary?.totalFilterRecordCount).toBe(3); // risk orders (score > 0)
    expect(id.summary?.riskRecordCount).toBe(3);        // 中+高+严重
    expect(id.summary?.criticalRecordCount).toBe(1);    // 严重 only

    // Three insight cards: risk-overview, critical-orders, data-quality
    expect(id.insights).toHaveLength(3);
    expect(id.insights[0].id).toBe('risk-overview');
    expect(id.insights[1].id).toBe('critical-orders');
    expect(id.insights[2].id).toBe('data-quality');

    // risk-overview metrics: riskOrders=3, highRisk=2
    const riskMetrics = id.insights[0].metrics ?? [];
    expect(riskMetrics[0].value).toBe(3);  // risk orders
    expect(riskMetrics[2].value).toBe(2);  // high + severe

    // critical-orders: criticalCount=1
    const critMetrics = id.insights[1].metrics ?? [];
    expect(critMetrics[0].value).toBe(1);
  });

  it('H — postProcess with empty data should not throw', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });
    expect(result.type).toBe(OperatorType.ARBITRAGE_ANALYZE);
    expect(result.data).toHaveLength(0);

    const id = result.insightsData!;
    expect(id).toBeDefined();
    expect(id.summary?.totalRecordCount).toBe(0);
    // No dirty orders → only 2 insight cards (no data-quality card)
    expect(id.insights).toHaveLength(2);
  });

  // ── Test I: Strategy factory registration ─────────────────────────────────

  it('I — ArbitrageAnalyzeStrategy should be registered in StrategyFactory', () => {
    expect(StrategyFactory.hasStrategy(OperatorType.ARBITRAGE_ANALYZE)).toBe(true);
    const s = StrategyFactory.getStrategy(OperatorType.ARBITRAGE_ANALYZE);
    expect(s.type).toBe(OperatorType.ARBITRAGE_ANALYZE);
    expect(s.name).toBe('价格套利分析');
  });

  // ── Structural sanity checks ──────────────────────────────────────────────

  it('should return SELECT * when config is missing', () => {
    const nodes: FlowNode[] = [
      {
        id: 'table-1',
        type: FlowNodeType.TABLE,
        position: { x: 0, y: 0 },
        data: { tableName: 'orders' },
      },
    ];
    const sql = strategy.buildSql(nodes, []);
    expect(sql).toContain('SELECT *');
  });

  it('should contain LEAST(..., 100) for risk_score capping in totals CTE', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    expect(sql).toContain('LEAST(');
    expect(sql).toContain('100');
  });

  it('should emit risk_level CASE expression in final SELECT', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    expect(sql).toContain("WHEN risk_score >= 80 THEN '严重'");
    expect(sql).toContain("WHEN risk_score >= 60 THEN '高'");
    expect(sql).toContain("WHEN risk_score >= 40 THEN '中'");
  });

  it('should have independent basic_risk_score and arbitrage_score in totals CTE', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    expect(sql).toContain('margin_score + discount_score + deviation_score + coupon_score');
    expect(sql).toContain('arb_time_score + arb_user_score + arb_user_disc_score + arb_addr_score + arb_dev_score');
  });

  it('should emit 30-day time window constant for skp CTE lookback', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    // 30 days = 2_592_000_000 ms
    expect(sql).toContain('2592000000');
  });

  it('should emit 7-day time window constant for cbp CTE lookback', () => {
    const sql = strategy.buildSql(makeNodes(DEFAULT_CONFIG), []);
    // 7 days = 604_800_000 ms
    expect(sql).toContain('604800000');
  });
});
