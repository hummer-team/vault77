import { describe, it, expect, beforeEach } from 'bun:test';
import { FulfillmentEfficiencyStrategy, FIELD_MATCH_PATTERNS } from '../fulfillmentEfficiencyStrategy';
import { StrategyFactory } from '../../strategyFactory';
import {
  FlowNodeType,
  OperatorType,
  LogicType,
  type FlowNode,
  type FulfillmentEfficiencyConfig,
  type ConditionNodeData,
} from '../../types';

// ============================================================================
// Helpers
// ============================================================================

const createTableNode = (): FlowNode => ({
  id: 'table-1',
  type: FlowNodeType.TABLE,
  position: { x: 0, y: 0 },
  data: { tableName: 'orders' },
});

const createSelectNode = (config: FulfillmentEfficiencyConfig): FlowNode => ({
  id: 'select-1',
  type: FlowNodeType.SELECT,
  position: { x: 100, y: 0 },
  data: { tableName: 'orders', fulfillmentEfficiencyConfig: config },
});

const createConditionNode = (field: string, operator: string, value: unknown): FlowNode => ({
  id: 'cond-1',
  type: FlowNodeType.CONDITION,
  position: { x: 300, y: 0 },
  data: {
    tableName: 'orders',
    field,
    operator,
    value,
    logicType: LogicType.AND,
  } as ConditionNodeData,
});

const baseConfig: FulfillmentEfficiencyConfig = {
  tableName: 'orders',
  payTimeColumn: 'pay_time',
  shipTimeColumn: 'ship_time',
  receiveTimeColumn: 'receive_time',
  regionColumn: 'region',
  carrierColumn: 'carrier',
  payToShipThreshold: 24,
  shipToReceiveThreshold: 48,
  onTimeThreshold: 72,
};

// ============================================================================
// Tests
// ============================================================================

describe('FulfillmentEfficiencyStrategy', () => {
  let strategy: FulfillmentEfficiencyStrategy;

  beforeEach(() => {
    strategy = new FulfillmentEfficiencyStrategy();
  });

  // ---------- metadata --------------------------------------------------------

  it('should have correct type and name', () => {
    expect(strategy.type).toBe(OperatorType.FULFILLMENT_EFFICIENCY);
    expect(strategy.name).toBe('履约时效分析');
  });

  it('should require TABLE node', () => {
    expect(strategy.getRequiredNodes()).toContain(FlowNodeType.TABLE);
  });

  // ---------- SQL structure ---------------------------------------------------

  it('should generate CTE pipeline: order_metrics → aggregated → SELECT', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('WITH order_metrics AS');
    expect(sql).toContain('aggregated AS');
    expect(sql).toContain('SELECT * FROM aggregated');
    expect(sql).toContain('ORDER BY order_count DESC');
  });

  it('should quote table and column names with double quotes', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('FROM "orders"');
    expect(sql).toContain('"pay_time"');
    expect(sql).toContain('"ship_time"');
    expect(sql).toContain('"receive_time"');
    expect(sql).toContain('"region"');
    expect(sql).toContain('"carrier"');
  });

  it('should call diff_hours and is_le_hours UDFs with correct columns', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('diff_hours("pay_time", "ship_time")');
    expect(sql).toContain('diff_hours("ship_time", "receive_time")');
    expect(sql).toContain('diff_hours("pay_time", "receive_time")');
    expect(sql).toContain('is_le_hours("pay_time", "ship_time", 24)');
    expect(sql).toContain('is_le_hours("ship_time", "receive_time", 48)');
    expect(sql).toContain('is_le_hours("pay_time", "receive_time", 72)');
  });

  it('should inject custom thresholds into is_le_hours calls', () => {
    const cfg: FulfillmentEfficiencyConfig = {
      ...baseConfig,
      payToShipThreshold: 12,
      shipToReceiveThreshold: 36,
      onTimeThreshold: 48,
    };
    const nodes = [createTableNode(), createSelectNode(cfg)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('is_le_hours("pay_time", "ship_time", 12)');
    expect(sql).toContain('is_le_hours("ship_time", "receive_time", 36)');
    expect(sql).toContain('is_le_hours("pay_time", "receive_time", 48)');
  });

  it('should GROUP BY region and carrier in aggregated CTE', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('GROUP BY region, carrier');
  });

  // ---------- userWhere injection ---------------------------------------------

  it('should inject condition node userWhere into order_metrics CTE', () => {
    const nodes = [
      createTableNode(),
      createSelectNode(baseConfig),
      createConditionNode('status', '=', 'completed'),
    ];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('"orders"."status"');
    expect(sql).toContain("'completed'");

    // WHERE must appear inside order_metrics CTE
    const metricsIdx = sql.indexOf('order_metrics AS');
    const aggregatedIdx = sql.indexOf('aggregated AS');
    const whereIdx = sql.indexOf('WHERE');
    expect(whereIdx).toBeGreaterThan(metricsIdx);
    expect(whereIdx).toBeLessThan(aggregatedIdx);
  });

  it('should NOT include WHERE when no conditions are defined', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    // No WHERE in order_metrics CTE
    const metricsCte = sql.substring(
      sql.indexOf('order_metrics AS'),
      sql.indexOf('aggregated AS'),
    );
    expect(metricsCte).not.toContain('WHERE');
  });

  // ---------- edge cases (SQL) ------------------------------------------------

  it('should return fallback SQL when table node is missing', () => {
    const sql = strategy.buildSql([createSelectNode(baseConfig)], []);
    expect(sql).toContain('WHERE false');
  });

  it('should return fallback SQL when select config is missing', () => {
    const sql = strategy.buildSql([createTableNode()], []);
    expect(sql).toContain('WHERE false');
  });

  // ---------- validation ------------------------------------------------------

  it('should return no errors for a valid config', () => {
    const errors = strategy.validate([createTableNode(), createSelectNode(baseConfig)], []);
    expect(errors).toHaveLength(0);
  });

  it('should return error when payTimeColumn is missing', () => {
    const cfg = { ...baseConfig, payTimeColumn: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('支付时间列'))).toBe(true);
  });

  it('should return error when shipTimeColumn is missing', () => {
    const cfg = { ...baseConfig, shipTimeColumn: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('发货时间列'))).toBe(true);
  });

  it('should return error when receiveTimeColumn is missing', () => {
    const cfg = { ...baseConfig, receiveTimeColumn: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('签收时间列'))).toBe(true);
  });

  it('should return error when regionColumn is missing', () => {
    const cfg = { ...baseConfig, regionColumn: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('地区列'))).toBe(true);
  });

  it('should return error when carrierColumn is missing', () => {
    const cfg = { ...baseConfig, carrierColumn: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('物流商列'))).toBe(true);
  });

  it('should return multiple errors when multiple fields are missing', () => {
    const cfg = { ...baseConfig, payTimeColumn: '', carrierColumn: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  // ---------- postProcess: empty result ----------------------------------------

  it('should return warning InsightItem when rows are empty', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });

    expect(result.type).toBe(OperatorType.FULFILLMENT_EFFICIENCY);
    expect(result.data).toHaveLength(0);
    expect(result.insightsData?.insights).toHaveLength(1);
    expect(result.insightsData?.insights[0]?.iconKey).toBe('warning');
  });

  // ---------- postProcess: normal result ---------------------------------------

  it('should produce 3 InsightItems for normal result', async () => {
    const rows = [
      {
        region: '华东',
        carrier: '顺丰',
        order_count: 500,
        avg_pay_to_ship_hours: 8.5,
        avg_ship_to_receive_hours: 24.3,
        avg_total_hours: 32.8,
        pay_to_ship_on_time_rate: 0.92,
        ship_to_receive_on_time_rate: 0.85,
        overall_on_time_rate: 0.88,
      },
      {
        region: '华南',
        carrier: '中通',
        order_count: 300,
        avg_pay_to_ship_hours: 12.1,
        avg_ship_to_receive_hours: 36.5,
        avg_total_hours: 48.6,
        pay_to_ship_on_time_rate: 0.78,
        ship_to_receive_on_time_rate: 0.65,
        overall_on_time_rate: 0.62,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    expect(result.insightsData?.insights).toHaveLength(3);
    expect(result.insightsData?.insights[0]?.id).toBe('fulfillment-summary');
    expect(result.insightsData?.insights[1]?.id).toBe('fulfillment-best');
    expect(result.insightsData?.insights[2]?.id).toBe('fulfillment-worst');
  });

  it('should compute correct global on-time rate as weighted average', async () => {
    const rows = [
      {
        region: 'A', carrier: 'X', order_count: 100,
        avg_pay_to_ship_hours: 10, avg_ship_to_receive_hours: 30, avg_total_hours: 40,
        pay_to_ship_on_time_rate: 0.9, ship_to_receive_on_time_rate: 0.8, overall_on_time_rate: 0.8,
      },
      {
        region: 'B', carrier: 'Y', order_count: 100,
        avg_pay_to_ship_hours: 15, avg_ship_to_receive_hours: 40, avg_total_hours: 55,
        pay_to_ship_on_time_rate: 0.6, ship_to_receive_on_time_rate: 0.5, overall_on_time_rate: 0.4,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    // Weighted: (100*0.8 + 100*0.4) / 200 = 0.6
    const summaryItem = result.insightsData!.insights[0];
    const onTimeMetric = summaryItem.metrics?.find((m) => m.label === '整体达标率');
    expect(onTimeMetric?.value).toBeCloseTo(0.6, 2);
  });

  it('should identify best and worst performers correctly', async () => {
    const rows = [
      {
        region: '华东', carrier: '顺丰', order_count: 500,
        avg_pay_to_ship_hours: 8, avg_ship_to_receive_hours: 20, avg_total_hours: 28,
        pay_to_ship_on_time_rate: 0.95, ship_to_receive_on_time_rate: 0.90, overall_on_time_rate: 0.92,
      },
      {
        region: '西北', carrier: '韵达', order_count: 100,
        avg_pay_to_ship_hours: 20, avg_ship_to_receive_hours: 60, avg_total_hours: 80,
        pay_to_ship_on_time_rate: 0.50, ship_to_receive_on_time_rate: 0.30, overall_on_time_rate: 0.25,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    const bestItem = result.insightsData!.insights.find((i) => i.id === 'fulfillment-best');
    expect(bestItem?.title).toContain('华东');
    expect(bestItem?.title).toContain('顺丰');
    expect(bestItem?.iconKey).toBe('safe');

    const worstItem = result.insightsData!.insights.find((i) => i.id === 'fulfillment-worst');
    expect(worstItem?.title).toContain('西北');
    expect(worstItem?.title).toContain('韵达');
    expect(worstItem?.iconKey).toBe('critical');
  });

  it('should handle BigInt order_count without precision loss', async () => {
    const rows = [
      {
        region: '华东', carrier: '顺丰', order_count: BigInt(1000),
        avg_pay_to_ship_hours: 10, avg_ship_to_receive_hours: 30, avg_total_hours: 40,
        pay_to_ship_on_time_rate: 0.85, ship_to_receive_on_time_rate: 0.75, overall_on_time_rate: 0.80,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<{ order_count: number }>;
    expect(data[0].order_count).toBe(1000);
  });

  it('should include summary with totalOrderCount', async () => {
    const rows = [
      {
        region: 'A', carrier: 'X', order_count: 200,
        avg_pay_to_ship_hours: 10, avg_ship_to_receive_hours: 30, avg_total_hours: 40,
        pay_to_ship_on_time_rate: 0.9, ship_to_receive_on_time_rate: 0.8, overall_on_time_rate: 0.85,
      },
      {
        region: 'B', carrier: 'Y', order_count: 300,
        avg_pay_to_ship_hours: 12, avg_ship_to_receive_hours: 35, avg_total_hours: 47,
        pay_to_ship_on_time_rate: 0.8, ship_to_receive_on_time_rate: 0.7, overall_on_time_rate: 0.75,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.insightsData?.summary?.totalOrderCount).toBe(500);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(500);
  });

  it('should include displayConfig with defaultSort on order_count descend', async () => {
    const rows = [
      {
        region: 'A', carrier: 'X', order_count: 100,
        avg_pay_to_ship_hours: 10, avg_ship_to_receive_hours: 30, avg_total_hours: 40,
        pay_to_ship_on_time_rate: 0.9, ship_to_receive_on_time_rate: 0.8, overall_on_time_rate: 0.85,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.displayConfig?.defaultSort?.column).toBe('order_count');
    expect(result.displayConfig?.defaultSort?.order).toBe('descend');
  });

  it('should include columnFormatters for rate columns', async () => {
    const rows = [
      {
        region: 'A', carrier: 'X', order_count: 100,
        avg_pay_to_ship_hours: 10, avg_ship_to_receive_hours: 30, avg_total_hours: 40,
        pay_to_ship_on_time_rate: 0.9, ship_to_receive_on_time_rate: 0.8, overall_on_time_rate: 0.85,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.displayConfig?.columnFormatters?.pay_to_ship_on_time_rate).toBeDefined();
    expect(result.displayConfig?.columnFormatters?.ship_to_receive_on_time_rate).toBeDefined();
    expect(result.displayConfig?.columnFormatters?.overall_on_time_rate).toBeDefined();
  });

  // ---------- StrategyFactory -------------------------------------------------

  it('should be retrievable from StrategyFactory', () => {
    const instance = StrategyFactory.getStrategy(OperatorType.FULFILLMENT_EFFICIENCY);
    expect(instance).toBeInstanceOf(FulfillmentEfficiencyStrategy);
  });

  // ---------- FIELD_MATCH_PATTERNS --------------------------------------------

  it('should export FIELD_MATCH_PATTERNS for Drawer auto-match', () => {
    expect(FIELD_MATCH_PATTERNS.payTimeColumn).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.shipTimeColumn).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.receiveTimeColumn).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.regionColumn).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.carrierColumn).toBeDefined();
  });

  it('should match common English column names', () => {
    expect(FIELD_MATCH_PATTERNS.payTimeColumn.test('pay_time')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.shipTimeColumn.test('ship_time')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.receiveTimeColumn.test('receive_time')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.regionColumn.test('region')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.carrierColumn.test('carrier')).toBe(true);
  });

  it('should match common Chinese column names', () => {
    expect(FIELD_MATCH_PATTERNS.payTimeColumn.test('支付时间')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.shipTimeColumn.test('发货时间')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.receiveTimeColumn.test('签收时间')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.regionColumn.test('地区')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.carrierColumn.test('物流商')).toBe(true);
  });
});
