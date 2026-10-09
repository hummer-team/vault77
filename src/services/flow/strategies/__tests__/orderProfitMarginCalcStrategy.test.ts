import { describe, it, expect, beforeEach } from 'vitest';
import { OrderProfitMarginCalcStrategy, FIELD_MATCH_PATTERNS, DEFAULT_PROFIT_MARGIN_CONFIG } from '../orderProfitMarginCalcStrategy';
import { StrategyFactory } from '../../strategyFactory';
import {
  FlowNodeType,
  OperatorType,
  LogicType,
  type FlowNode,
  type ProfitMarginCalcConfig,
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

const createSelectNode = (config: ProfitMarginCalcConfig): FlowNode => ({
  id: 'select-1',
  type: FlowNodeType.SELECT,
  position: { x: 100, y: 0 },
  data: { profitMarginCalcConfig: config },
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

const baseConfig: ProfitMarginCalcConfig = {
  fieldMapping: {
    netAmountCol: 'net_amount',
    costCol: 'cost',
    shippingFeeCol: 'shipping_fee',
    platformFeeCol: 'platform_fee',
    serviceFeeCol: 'service_fee',
  },
  formulaSlots: {
    slot1: { operator: '+', column: 'net_amount' },
    slot2: { operator: '-', column: 'cost' },
    slot3: { operator: '-', column: 'shipping_fee' },
    slot4: { operator: '-', column: 'platform_fee' },
    slot5: { operator: '-', column: 'service_fee' },
  },
  warningThresholdPct: 5,
};

// ============================================================================
// Tests
// ============================================================================

describe('OrderProfitMarginCalcStrategy', () => {
  let strategy: OrderProfitMarginCalcStrategy;

  beforeEach(() => {
    strategy = new OrderProfitMarginCalcStrategy();
  });

  // ---------- metadata --------------------------------------------------------

  it('should have correct type and name', () => {
    expect(strategy.type).toBe(OperatorType.PROFIT_MARGIN_CALC);
    expect(strategy.name).toBe('订单毛利/净利率自动计算');
  });

  it('should require TABLE node', () => {
    expect(strategy.getRequiredNodes()).toContain(FlowNodeType.TABLE);
  });

  // ---------- SQL structure ---------------------------------------------------

  it('should generate CTE pipeline: src → base_calc → classified → SELECT', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('WITH src AS');
    expect(sql).toContain('base_calc AS');
    expect(sql).toContain('classified AS');
    expect(sql).toContain('SELECT * FROM classified');
  });

  it('should quote table and column names with double quotes', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('FROM "orders"');
    expect(sql).toContain('"net_amount"');
    expect(sql).toContain('"cost"');
    expect(sql).toContain('"shipping_fee"');
    expect(sql).toContain('"platform_fee"');
    expect(sql).toContain('"service_fee"');
  });

  it('should include gross_profit_raw, gross_margin_raw, is_negative_margin, and risk_level columns', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('gross_profit_raw');
    expect(sql).toContain('gross_margin_raw');
    expect(sql).toContain('is_negative_margin');
    expect(sql).toContain('risk_level');
  });

  it('should have risk_level CASE with net_amount <= 0 first branch', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('net_amount <= 0');
    expect(sql).toContain("'高风险'");
    expect(sql).toContain("'预警'");
    expect(sql).toContain("'健康'");
  });

  it('should use formula slot operators in gross_profit calculation', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    // Default: net - cost - shipping - platform - service
    expect(sql).toContain('COALESCE("net_amount", 0) - COALESCE("cost", 0) - COALESCE("shipping_fee", 0) - COALESCE("platform_fee", 0) - COALESCE("service_fee", 0)');
  });

  it('should respect custom formula slot operators', () => {
    const cfg: ProfitMarginCalcConfig = {
      ...baseConfig,
      formulaSlots: {
        slot1: { operator: '+', column: 'net_amount' },
        slot2: { operator: '+', column: 'cost' },
        slot3: { operator: '-', column: 'shipping_fee' },
        slot4: { operator: '-', column: 'platform_fee' },
        slot5: { operator: '-', column: 'service_fee' },
      },
    };
    const nodes = [createTableNode(), createSelectNode(cfg)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('COALESCE("net_amount", 0) + COALESCE("cost", 0) - COALESCE("shipping_fee", 0)');
  });

  it('should omit optional columns when not configured', () => {
    const cfg: ProfitMarginCalcConfig = {
      ...baseConfig,
      fieldMapping: {
        netAmountCol: 'net_amount',
        costCol: 'cost',
      },
    };
    const nodes = [createTableNode(), createSelectNode(cfg)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).not.toContain('shipping_fee');
    expect(sql).not.toContain('platform_fee');
    expect(sql).not.toContain('service_fee');
  });

  it('should include optional columns when configured', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('"shipping_fee" AS shipping_fee');
    expect(sql).toContain('"platform_fee" AS platform_fee');
    expect(sql).toContain('"service_fee" AS service_fee');
  });

  it('should include gross_margin calculation with zero-division protection', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('COALESCE("net_amount", 0) <= 0 THEN 0.0');
    expect(sql).toContain('/ COALESCE("net_amount", 0)');
  });

  // ---------- userWhere injection ---------------------------------------------

  it('should inject condition node userWhere into src CTE', () => {
    const nodes = [
      createTableNode(),
      createSelectNode(baseConfig),
      createConditionNode('region', '=', '华东'),
    ];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('"orders"."region"');
    expect(sql).toContain("'华东'");

    // WHERE must appear inside src CTE
    const srcIdx = sql.indexOf('src AS');
    const baseCalcIdx = sql.indexOf('base_calc AS');
    const whereIdx = sql.indexOf('WHERE');
    expect(whereIdx).toBeGreaterThan(srcIdx);
    expect(whereIdx).toBeLessThan(baseCalcIdx);
  });

  it('should NOT include WHERE when no conditions are defined', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    const srcCte = sql.substring(sql.indexOf('src AS'), sql.indexOf('base_calc AS'));
    expect(srcCte).not.toContain('WHERE');
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

  // ---------- threshold literals ----------------------------------------------

  it('should convert warningThresholdPct=5 to 0.05 in SQL', () => {
    const cfg: ProfitMarginCalcConfig = {
      ...baseConfig,
      warningThresholdPct: 5,
    };
    const nodes = [createTableNode(), createSelectNode(cfg)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('0.05');
  });

  it('should convert warningThresholdPct=10 to 0.1 in SQL', () => {
    const cfg: ProfitMarginCalcConfig = {
      ...baseConfig,
      warningThresholdPct: 10,
    };
    const nodes = [createTableNode(), createSelectNode(cfg)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('0.1');
  });

  it('should fallback to 0.05 when warningThresholdPct is invalid', () => {
    const cfg1: ProfitMarginCalcConfig = {
      ...baseConfig,
      warningThresholdPct: NaN,
    };
    const sql1 = strategy.buildSql([createTableNode(), createSelectNode(cfg1)], []);
    expect(sql1).toContain('0.05');

    const cfg2: ProfitMarginCalcConfig = {
      ...baseConfig,
      warningThresholdPct: undefined as unknown as number,
    };
    const sql2 = strategy.buildSql([createTableNode(), createSelectNode(cfg2)], []);
    expect(sql2).toContain('0.05');
  });

  // ---------- validation ------------------------------------------------------

  it('should return no errors for a valid config', () => {
    const errors = strategy.validate([createTableNode(), createSelectNode(baseConfig)], []);
    expect(errors).toHaveLength(0);
  });

  it('should return error when netAmountCol is missing', () => {
    const cfg = { ...baseConfig, fieldMapping: { ...baseConfig.fieldMapping, netAmountCol: '' } };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('订单净额列'))).toBe(true);
  });

  it('should return error when costCol is missing', () => {
    const cfg = { ...baseConfig, fieldMapping: { ...baseConfig.fieldMapping, costCol: '' } };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('商品成本列'))).toBe(true);
  });

  it('should return 2 errors when both required fields are missing', () => {
    const cfg: ProfitMarginCalcConfig = {
      ...baseConfig,
      fieldMapping: {
        netAmountCol: '',
        costCol: '',
      },
    };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors).toHaveLength(2);
  });

  // ---------- postProcess: empty result ----------------------------------------

  it('should return warning InsightItem when rows are empty', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });

    expect(result.type).toBe(OperatorType.PROFIT_MARGIN_CALC);
    expect(result.data).toHaveLength(0);
    expect(result.insightsData?.insights).toHaveLength(1);
    expect(result.insightsData?.insights[0]?.iconKey).toBe('warning');
    expect(result.insightsData?.insights[0]?.id).toBe('profit-margin-empty');
  });

  // ---------- postProcess: normal result ---------------------------------------

  it('should produce 3 InsightItems for normal result', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 60,
        shipping_fee: 10,
        platform_fee: 5,
        service_fee: 2,
        gross_profit_raw: 23,
        gross_margin_raw: 0.23,
        is_negative_margin: false,
        risk_level: '健康',
      },
      {
        net_amount: 50,
        cost: 40,
        shipping_fee: 5,
        platform_fee: 3,
        service_fee: 1,
        gross_profit_raw: 1,
        gross_margin_raw: 0.02,
        is_negative_margin: false,
        risk_level: '预警',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    expect(result.insightsData?.insights).toHaveLength(3);
    expect(result.insightsData?.insights[0]?.id).toBe('profit-margin-summary');
    expect(result.insightsData?.insights[1]?.id).toBe('negative-margin-alert');
    expect(result.insightsData?.insights[2]?.id).toBe('low-margin-warning');
  });

  it('should enrich rows with gross_profit_rounded (2 decimals) and gross_margin_percent (x.xx%)', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    expect(data[0].gross_profit).toBe(40);
    expect(data[0].gross_margin).toBe(0.4);
    expect(data[0].gross_profit_rounded).toBe(40);
    expect(data[0].gross_margin_percent).toBe('40.00%');
  });

  it('should handle negative gross profit correctly', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 120,
        gross_profit_raw: -20,
        gross_margin_raw: -0.2,
        is_negative_margin: true,
        risk_level: '高风险',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    expect(data[0].gross_profit).toBe(-20);
    expect(data[0].gross_margin).toBe(-0.2);
    expect(data[0].gross_profit_rounded).toBe(-20);
    expect(data[0].gross_margin_percent).toBe('-20.00%');
    expect(data[0].is_negative_margin).toBe(true);
    expect(data[0].risk_level).toBe('高风险');
  });

  it('should compute correct summary metrics', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
      {
        net_amount: 200,
        cost: 100,
        gross_profit_raw: 100,
        gross_margin_raw: 0.5,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    const summaryItem = result.insightsData!.insights[0];
    const totalProfitMetric = summaryItem.metrics?.find((m) => m.label === '总毛利额');
    const avgMarginMetric = summaryItem.metrics?.find((m) => m.label === '平均毛利率');
    const orderCountMetric = summaryItem.metrics?.find((m) => m.label === '订单数');

    expect(totalProfitMetric?.value).toBe(140);
    expect(avgMarginMetric?.value).toBe(0.45);
    expect(orderCountMetric?.value).toBe(2);
  });

  it('should compute correct negative margin count', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 120,
        gross_profit_raw: -20,
        gross_margin_raw: -0.2,
        is_negative_margin: true,
        risk_level: '高风险',
      },
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    const negativeItem = result.insightsData!.insights.find((i) => i.id === 'negative-margin-alert');
    const countMetric = negativeItem?.metrics?.find((m) => m.label === '负毛利订单数');
    const rateMetric = negativeItem?.metrics?.find((m) => m.label === '负毛利占比');

    expect(countMetric?.value).toBe(1);
    expect(rateMetric?.value).toBe(0.5);
  });

  it('should compute correct warning count', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 90,
        gross_profit_raw: 10,
        gross_margin_raw: 0.1,
        is_negative_margin: false,
        risk_level: '预警',
      },
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    const warningItem = result.insightsData!.insights.find((i) => i.id === 'low-margin-warning');
    const countMetric = warningItem?.metrics?.find((m) => m.label === '预警订单数');

    expect(countMetric?.value).toBe(1);
  });

  it('should ensure high-risk rows are not counted in warning count (mutual exclusion)', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 120,
        gross_profit_raw: -20,
        gross_margin_raw: -0.2,
        is_negative_margin: true,
        risk_level: '高风险',
      },
      {
        net_amount: 100,
        cost: 90,
        gross_profit_raw: 10,
        gross_margin_raw: 0.1,
        is_negative_margin: false,
        risk_level: '预警',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    const warningItem = result.insightsData!.insights.find((i) => i.id === 'low-margin-warning');
    const countMetric = warningItem?.metrics?.find((m) => m.label === '预警订单数');

    // Only the '预警' row should be counted, not the '高风险' row
    expect(countMetric?.value).toBe(1);
  });

  it('should handle BigInt values without precision loss', async () => {
    const rows = [
      {
        net_amount: BigInt(1000),
        cost: BigInt(600),
        gross_profit_raw: BigInt(400),
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;
    expect(data[0].gross_profit).toBe(400);
  });

  it('should include summary with totalOrderCount', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
      {
        net_amount: 200,
        cost: 100,
        gross_profit_raw: 100,
        gross_margin_raw: 0.5,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.insightsData?.summary?.totalOrderCount).toBe(2);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(2);
  });

  it('should include displayConfig with defaultSort on gross_profit descend', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.displayConfig?.defaultSort?.column).toBe('gross_profit');
    expect(result.displayConfig?.defaultSort?.order).toBe('descend');
  });

  it('should include columnTooltips for key columns', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.displayConfig?.columnTooltips?.net_amount).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.cost).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.gross_profit).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.gross_margin).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.gross_profit_raw).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.gross_margin_raw).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.is_negative_margin).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.risk_level).toBeDefined();
  });

  it('should include columnFormatters for gross_profit and gross_margin', async () => {
    const rows = [
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const fmt = result.displayConfig?.columnFormatters;

    expect(fmt?.gross_profit).toBeDefined();
    expect((fmt?.gross_profit as { type: string })?.type).toBe('currency_signed');
    expect((fmt?.gross_profit as { unit: string })?.unit).toBe('元');

    expect(fmt?.gross_margin).toBeDefined();
    expect((fmt?.gross_margin as { type: string })?.type).toBe('ratio_to_fold');

    expect(fmt?.risk_level).toBeDefined();
    expect((fmt?.risk_level as { type: string })?.type).toBe('risk_badge');
  });

  // ---------- postProcess: schema enrichment ----------------------------------

  it('should return enriched schema with 4 JS-computed columns in postProcess', async () => {
    const duckdbSchema = [
      { name: 'net_amount', type: 'DOUBLE' },
      { name: 'cost', type: 'DOUBLE' },
      { name: 'shipping_fee', type: 'DOUBLE' },
      { name: 'platform_fee', type: 'DOUBLE' },
      { name: 'service_fee', type: 'DOUBLE' },
      { name: 'gross_profit_raw', type: 'DOUBLE' },
      { name: 'gross_margin_raw', type: 'DOUBLE' },
      { name: 'is_negative_margin', type: 'BOOLEAN' },
      { name: 'risk_level', type: 'VARCHAR' },
    ];

    const rows = [
      {
        net_amount: 100,
        cost: 60,
        gross_profit_raw: 40,
        gross_margin_raw: 0.4,
        is_negative_margin: false,
        risk_level: '健康',
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: duckdbSchema });
    const schema = result.schema as Array<{ name: string; type: string }>;

    // DuckDB columns preserved
    expect(schema.some((s) => s.name === 'net_amount')).toBe(true);
    expect(schema.some((s) => s.name === 'gross_profit_raw')).toBe(true);

    // 4 JS-computed columns appended
    const jsColumns = ['gross_profit', 'gross_margin', 'gross_profit_rounded', 'gross_margin_percent'];
    for (const col of jsColumns) {
      expect(schema.some((s) => s.name === col)).toBe(true);
    }

    // Total = 9 DuckDB + 4 JS = 13
    expect(schema).toHaveLength(13);
  });

  it('should return enriched schema with JS-computed columns in _buildEmptyResult', async () => {
    const duckdbSchema = [
      { name: 'net_amount', type: 'DOUBLE' },
      { name: 'cost', type: 'DOUBLE' },
    ];

    const result = await strategy.postProcess({ data: [], schema: duckdbSchema });
    const schema = result.schema as Array<{ name: string; type: string }>;

    // DuckDB columns preserved
    expect(schema.some((s) => s.name === 'net_amount')).toBe(true);
    expect(schema.some((s) => s.name === 'cost')).toBe(true);

    // 4 JS-computed columns present
    const jsColumns = ['gross_profit', 'gross_margin', 'gross_profit_rounded', 'gross_margin_percent'];
    for (const col of jsColumns) {
      expect(schema.some((s) => s.name === col)).toBe(true);
    }

    // Total = 2 DuckDB + 4 JS = 6
    expect(schema).toHaveLength(6);
  });

  // ---------- StrategyFactory -------------------------------------------------

  it('should be retrievable from StrategyFactory', () => {
    const instance = StrategyFactory.getStrategy(OperatorType.PROFIT_MARGIN_CALC);
    expect(instance).toBeInstanceOf(OrderProfitMarginCalcStrategy);
  });

  // ---------- FIELD_MATCH_PATTERNS --------------------------------------------

  it('should export FIELD_MATCH_PATTERNS for Drawer auto-match', () => {
    expect(FIELD_MATCH_PATTERNS.netAmountCol).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.costCol).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.shippingFeeCol).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.platformFeeCol).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.serviceFeeCol).toBeDefined();
  });

  it('should match common English column names', () => {
    expect(FIELD_MATCH_PATTERNS.netAmountCol.test('net_amount')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.costCol.test('cost')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.shippingFeeCol.test('shipping_fee')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.platformFeeCol.test('platform_fee')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.serviceFeeCol.test('service_fee')).toBe(true);
  });

  it('should match common Chinese column names', () => {
    expect(FIELD_MATCH_PATTERNS.netAmountCol.test('净额')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.costCol.test('成本')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.shippingFeeCol.test('运费')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.platformFeeCol.test('佣金')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.serviceFeeCol.test('服务费')).toBe(true);
  });

  // ---------- DEFAULT_PROFIT_MARGIN_CONFIG ------------------------------------

  it('should export DEFAULT_PROFIT_MARGIN_CONFIG with correct structure', () => {
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.fieldMapping.netAmountCol).toBe('');
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.fieldMapping.costCol).toBe('');
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.formulaSlots.slot1.operator).toBe('+');
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.formulaSlots.slot2.operator).toBe('-');
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.formulaSlots.slot3.operator).toBe('-');
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.formulaSlots.slot4.operator).toBe('-');
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.formulaSlots.slot5.operator).toBe('-');
    expect(DEFAULT_PROFIT_MARGIN_CONFIG.warningThresholdPct).toBe(5);
  });
});
