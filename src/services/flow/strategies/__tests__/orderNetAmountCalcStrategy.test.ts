import { describe, it, expect, beforeEach } from 'bun:test';
import { OrderNetAmountCalcStrategy, FIELD_MATCH_PATTERNS } from '../orderNetAmountCalcStrategy';
import { StrategyFactory } from '../../strategyFactory';
import {
  FlowNodeType,
  OperatorType,
  LogicType,
  type FlowNode,
  type NetAmountCalcConfig,
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

const createSelectNode = (config: NetAmountCalcConfig): FlowNode => ({
  id: 'select-1',
  type: FlowNodeType.SELECT,
  position: { x: 100, y: 0 },
  data: { netAmountCalcConfig: config },
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

const baseConfig: NetAmountCalcConfig = {
  fieldMapping: {
    payAmountCol: 'pay_amount',
    refundAmountCol: 'refund_amount',
    rejectionAmountCol: 'rejection_amount',
    orderStatusCol: 'order_status',
    orderIdCol: 'order_id',
    userIdCol: 'user_id',
  },
  formulaSlots: {
    slot1: { operator: '+', column: 'pay_amount' },
    slot2: { operator: '-', column: 'refund_amount' },
    slot3: { operator: '-', column: 'rejection_amount' },
  },
  excludedStatuses: 'CANCELLED',
};

// ============================================================================
// Tests
// ============================================================================

describe('OrderNetAmountCalcStrategy', () => {
  let strategy: OrderNetAmountCalcStrategy;

  beforeEach(() => {
    strategy = new OrderNetAmountCalcStrategy();
  });

  // ---------- metadata --------------------------------------------------------

  it('should have correct type and name', () => {
    expect(strategy.type).toBe(OperatorType.NET_AMOUNT_CALC);
    expect(strategy.name).toBe('订单净额计算（退款后实收）');
  });

  it('should require TABLE node', () => {
    expect(strategy.getRequiredNodes()).toContain(FlowNodeType.TABLE);
  });

  // ---------- SQL structure ---------------------------------------------------

  it('should generate CTE pipeline: src → base_calc → SELECT', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('WITH src AS');
    expect(sql).toContain('base_calc AS');
    expect(sql).toContain('SELECT * FROM base_calc');
  });

  it('should quote table and column names with double quotes', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('FROM "orders"');
    expect(sql).toContain('"pay_amount"');
    expect(sql).toContain('"refund_amount"');
    expect(sql).toContain('"rejection_amount"');
    expect(sql).toContain('"order_status"');
  });

  it('should inject excludedStatuses into CASE WHEN IN clause', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain("'CANCELLED'");
    expect(sql).toContain('UPPER("order_status") IN');
  });

  it('should use formula slot operators in net_amount calculation', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    // Default: pay - refund - rejection
    expect(sql).toContain('COALESCE("pay_amount", 0) - COALESCE("refund_amount", 0) - COALESCE("rejection_amount", 0)');
  });

  it('should respect custom formula slot operators', () => {
    const cfg: NetAmountCalcConfig = {
      ...baseConfig,
      formulaSlots: {
        slot1: { operator: '+', column: 'pay_amount' },
        slot2: { operator: '+', column: 'refund_amount' },
        slot3: { operator: '-', column: 'rejection_amount' },
      },
    };
    const nodes = [createTableNode(), createSelectNode(cfg)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('COALESCE("pay_amount", 0) + COALESCE("refund_amount", 0) - COALESCE("rejection_amount", 0)');
  });

  it('should include optional columns when configured', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('"order_id" AS order_id');
    expect(sql).toContain('"user_id" AS user_id');
  });

  it('should omit optional columns when not configured', () => {
    const cfg: NetAmountCalcConfig = {
      ...baseConfig,
      fieldMapping: {
        payAmountCol: 'pay_amount',
        refundAmountCol: 'refund_amount',
        rejectionAmountCol: 'rejection_amount',
        orderStatusCol: 'order_status',
      },
    };
    const nodes = [createTableNode(), createSelectNode(cfg)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).not.toContain('order_id');
    expect(sql).not.toContain('user_id');
  });

  it('should include refund_rate calculation with zero-division protection', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('COALESCE("pay_amount", 0) <= 0 THEN 0.0');
    expect(sql).toContain('COALESCE("refund_amount", 0) / "pay_amount"');
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

  // ---------- validation ------------------------------------------------------

  it('should return no errors for a valid config', () => {
    const errors = strategy.validate([createTableNode(), createSelectNode(baseConfig)], []);
    expect(errors).toHaveLength(0);
  });

  it('should return error when payAmountCol is missing', () => {
    const cfg = { ...baseConfig, fieldMapping: { ...baseConfig.fieldMapping, payAmountCol: '' } };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('实付金额列'))).toBe(true);
  });

  it('should return error when refundAmountCol is missing', () => {
    const cfg = { ...baseConfig, fieldMapping: { ...baseConfig.fieldMapping, refundAmountCol: '' } };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('退款金额列'))).toBe(true);
  });

  it('should return error when rejectionAmountCol is missing', () => {
    const cfg = { ...baseConfig, fieldMapping: { ...baseConfig.fieldMapping, rejectionAmountCol: '' } };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('拒签金额列'))).toBe(true);
  });

  it('should return error when orderStatusCol is missing', () => {
    const cfg = { ...baseConfig, fieldMapping: { ...baseConfig.fieldMapping, orderStatusCol: '' } };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('订单状态列'))).toBe(true);
  });

  it('should return 4 errors when all required fields are missing', () => {
    const cfg: NetAmountCalcConfig = {
      ...baseConfig,
      fieldMapping: {
        payAmountCol: '',
        refundAmountCol: '',
        rejectionAmountCol: '',
        orderStatusCol: '',
      },
    };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors).toHaveLength(4);
  });

  // ---------- postProcess: empty result ----------------------------------------

  it('should return warning InsightItem when rows are empty', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });

    expect(result.type).toBe(OperatorType.NET_AMOUNT_CALC);
    expect(result.data).toHaveLength(0);
    expect(result.insightsData?.insights).toHaveLength(1);
    expect(result.insightsData?.insights[0]?.iconKey).toBe('warning');
    expect(result.insightsData?.insights[0]?.id).toBe('net-amount-empty');
  });

  // ---------- postProcess: normal result ---------------------------------------

  it('should produce 3 InsightItems for normal result', async () => {
    const rows = [
      {
        order_id: 'ORD001',
        user_id: 'U001',
        pay_amount: 100,
        refund_amount: 20,
        rejection_amount: 0,
        order_status: 'PAID',
        net_amount_raw: 80,
        refund_rate_raw: 0.2,
        is_valid: true,
      },
      {
        order_id: 'ORD002',
        user_id: 'U002',
        pay_amount: 200,
        refund_amount: 150,
        rejection_amount: 10,
        order_status: 'DELIVERED',
        net_amount_raw: 40,
        refund_rate_raw: 0.75,
        is_valid: true,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    expect(result.insightsData?.insights).toHaveLength(3);
    expect(result.insightsData?.insights[0]?.id).toBe('net-amount-summary');
    expect(result.insightsData?.insights[1]?.id).toBe('refund-risk-distribution');
    expect(result.insightsData?.insights[2]?.id).toBe('abnormal-order-alert');
  });

  it('should enrich rows with 5 derived fields', async () => {
    const rows = [
      {
        order_id: 'ORD001',
        pay_amount: 100,
        refund_amount: 30,
        rejection_amount: 0,
        order_status: 'PAID',
        net_amount_raw: 70,
        refund_rate_raw: 0.3,
        is_valid: true,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    expect(data[0].net_amount).toBe(70);
    expect(data[0].net_amount_rounded).toBe(70);
    expect(data[0].refund_rate).toBe(0.3);
    expect(data[0].refund_rate_percent).toBe('30.00%');
    expect(data[0].refund_risk_tag).toBe('medium');
    expect(data[0].is_valid).toBe(true);
    expect(data[0].is_valid_label).toBe('有效');
    expect(data[0].is_abnormal).toBe(false);
    expect(data[0].order_status_cn).toBe('已支付');
  });

  it('should tag refund_risk_tag correctly: high > 0.5, medium > 0.2, low <= 0.2', async () => {
    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.6, is_valid: true },
      { order_status: 'PAID', net_amount_raw: 80, refund_rate_raw: 0.3, is_valid: true },
      { order_status: 'PAID', net_amount_raw: 90, refund_rate_raw: 0.1, is_valid: true },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    expect(data[0].refund_risk_tag).toBe('high');
    expect(data[0].refund_risk_label).toBe('高');
    expect(data[1].refund_risk_tag).toBe('medium');
    expect(data[1].refund_risk_label).toBe('中');
    expect(data[2].refund_risk_tag).toBe('low');
    expect(data[2].refund_risk_label).toBe('低');
  });

  it('should mark CANCELLED status as is_valid=false and net_amount=0', async () => {
    const rows = [
      {
        order_id: 'ORD003',
        order_status: 'CANCELLED',
        net_amount_raw: 0,
        refund_rate_raw: 0,
        is_valid: false,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    expect(data[0].is_valid).toBe(false);
    expect(data[0].is_valid_label).toBe('无效');
    expect(data[0].net_amount).toBe(0);
    expect(data[0].order_status_cn).toBe('已取消');
  });

  it('should mark is_abnormal=true when !is_valid AND net_amount < 0', async () => {
    const rows = [
      {
        order_status: 'CANCELLED',
        net_amount_raw: -50,
        refund_rate_raw: 0,
        is_valid: false,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    expect(data[0].is_abnormal).toBe(true);
  });

  it('should NOT mark is_abnormal when is_valid=true even if net_amount < 0', async () => {
    const rows = [
      {
        order_status: 'PAID',
        net_amount_raw: -10,
        refund_rate_raw: 1.1,
        is_valid: true,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    expect(data[0].is_abnormal).toBe(false);
  });

  it('should compute correct summary metrics', async () => {
    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.1, is_valid: true },
      { order_status: 'PAID', net_amount_raw: 200, refund_rate_raw: 0.2, is_valid: true },
      { order_status: 'CANCELLED', net_amount_raw: 0, refund_rate_raw: 0, is_valid: false },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    const summaryItem = result.insightsData!.insights[0];
    const validCountMetric = summaryItem.metrics?.find((m) => m.label === '有效订单数');
    const totalNetMetric = summaryItem.metrics?.find((m) => m.label === '总净额');
    const avgNetMetric = summaryItem.metrics?.find((m) => m.label === '平均净额');

    expect(validCountMetric?.value).toBe(2);
    expect(totalNetMetric?.value).toBe(300);
    expect(avgNetMetric?.value).toBe(150);
  });

  it('should compute correct risk distribution', async () => {
    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.6, is_valid: true },
      { order_status: 'PAID', net_amount_raw: 80, refund_rate_raw: 0.3, is_valid: true },
      { order_status: 'PAID', net_amount_raw: 90, refund_rate_raw: 0.1, is_valid: true },
      { order_status: 'PAID', net_amount_raw: 70, refund_rate_raw: 0.15, is_valid: true },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });

    const riskItem = result.insightsData!.insights.find((i) => i.id === 'refund-risk-distribution');
    const highMetric = riskItem?.metrics?.find((m) => m.label === '高风险');
    const mediumMetric = riskItem?.metrics?.find((m) => m.label === '中风险');
    const lowMetric = riskItem?.metrics?.find((m) => m.label === '低风险');

    expect(highMetric?.value).toBe(1);
    expect(mediumMetric?.value).toBe(1);
    expect(lowMetric?.value).toBe(2);
  });

  it('should handle BigInt values without precision loss', async () => {
    const rows = [
      {
        order_status: 'PAID',
        net_amount_raw: BigInt(1000),
        refund_rate_raw: 0.1,
        is_valid: true,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;
    expect(data[0].net_amount).toBe(1000);
  });

  it('should include summary with totalOrderCount', async () => {
    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.1, is_valid: true },
      { order_status: 'PAID', net_amount_raw: 200, refund_rate_raw: 0.2, is_valid: true },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.insightsData?.summary?.totalOrderCount).toBe(2);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(2);
  });

  it('should include displayConfig with defaultSort on net_amount descend', async () => {
    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.1, is_valid: true },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.displayConfig?.defaultSort?.column).toBe('net_amount');
    expect(result.displayConfig?.defaultSort?.order).toBe('descend');
  });

  it('should include columnTooltips for key columns', async () => {
    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.1, is_valid: true },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.displayConfig?.columnTooltips?.net_amount).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.refund_rate).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.is_valid).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.is_valid_label).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.net_amount_raw).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.refund_rate_raw).toBeDefined();
    expect(result.displayConfig?.columnTooltips?.refund_risk_label).toBeDefined();
  });

  it('should include columnFormatters for net_amount_raw and refund_rate_raw', async () => {
    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.1, is_valid: true },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const fmt = result.displayConfig?.columnFormatters;

    expect(fmt?.net_amount_raw).toBeDefined();
    expect((fmt?.net_amount_raw as { type: string })?.type).toBe('currency_signed');

    expect(fmt?.refund_rate_raw).toBeDefined();
    expect((fmt?.refund_rate_raw as { type: string })?.type).toBe('percent_signed');

    expect(fmt?.refund_risk_label).toBeDefined();
    expect((fmt?.refund_risk_label as { type: string })?.type).toBe('risk_badge');
  });

  // ---------- postProcess: schema enrichment ----------------------------------

  it('should return enriched schema with all 9 JS-computed columns in postProcess', async () => {
    const duckdbSchema = [
      { name: 'order_id', type: 'VARCHAR' },
      { name: 'pay_amount', type: 'DOUBLE' },
      { name: 'refund_amount', type: 'DOUBLE' },
      { name: 'rejection_amount', type: 'DOUBLE' },
      { name: 'order_status', type: 'VARCHAR' },
      { name: 'net_amount_raw', type: 'DOUBLE' },
      { name: 'refund_rate_raw', type: 'DOUBLE' },
      { name: 'is_valid', type: 'BOOLEAN' },
    ];

    const rows = [
      { order_status: 'PAID', net_amount_raw: 100, refund_rate_raw: 0.1, is_valid: true },
    ];

    const result = await strategy.postProcess({ data: rows, schema: duckdbSchema });
    const schema = result.schema as Array<{ name: string; type: string }>;

    // DuckDB columns preserved
    expect(schema.some((s) => s.name === 'pay_amount')).toBe(true);
    expect(schema.some((s) => s.name === 'net_amount_raw')).toBe(true);

    // 9 JS-computed columns appended
    const jsColumns = [
      'net_amount', 'net_amount_rounded', 'refund_rate', 'refund_rate_percent',
      'refund_risk_tag', 'refund_risk_label', 'is_valid_label', 'is_abnormal', 'order_status_cn',
    ];
    for (const col of jsColumns) {
      expect(schema.some((s) => s.name === col)).toBe(true);
    }

    // Total = 8 DuckDB + 9 JS = 17
    expect(schema).toHaveLength(17);
  });

  it('should return enriched schema with JS-computed columns in _buildEmptyResult', async () => {
    const duckdbSchema = [
      { name: 'order_id', type: 'VARCHAR' },
      { name: 'pay_amount', type: 'DOUBLE' },
    ];

    const result = await strategy.postProcess({ data: [], schema: duckdbSchema });
    const schema = result.schema as Array<{ name: string; type: string }>;

    // DuckDB columns preserved
    expect(schema.some((s) => s.name === 'order_id')).toBe(true);
    expect(schema.some((s) => s.name === 'pay_amount')).toBe(true);

    // 9 JS-computed columns present
    const jsColumns = [
      'net_amount', 'net_amount_rounded', 'refund_rate', 'refund_rate_percent',
      'refund_risk_tag', 'refund_risk_label', 'is_valid_label', 'is_abnormal', 'order_status_cn',
    ];
    for (const col of jsColumns) {
      expect(schema.some((s) => s.name === col)).toBe(true);
    }

    // Total = 2 DuckDB + 9 JS = 11
    expect(schema).toHaveLength(11);
  });

  // ---------- postProcess: raw SQL field preservation -------------------------

  it('should preserve raw SQL fields in enrichedRows', async () => {
    const rows = [
      {
        order_id: 'ORD001',
        pay_amount: 100,
        refund_amount: 30,
        rejection_amount: 10,
        order_status: 'PAID',
        net_amount_raw: 60,
        refund_rate_raw: 0.3,
        is_valid: true,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    // Raw SQL fields preserved
    expect(data[0].pay_amount).toBe(100);
    expect(data[0].refund_amount).toBe(30);
    expect(data[0].rejection_amount).toBe(10);
    expect(data[0].order_status).toBe('PAID');
    expect(data[0].net_amount_raw).toBe(60);
    expect(data[0].refund_rate_raw).toBe(0.3);

    // Derived fields still correct
    expect(data[0].net_amount).toBe(60);
    expect(data[0].net_amount_rounded).toBe(60);
    expect(data[0].refund_rate).toBe(0.3);
    expect(data[0].is_valid).toBe(true);
  });

  it('should override is_valid from spread with postProcess recomputed value', async () => {
    const rows = [
      {
        order_status: 'PAID',
        net_amount_raw: 100,
        refund_rate_raw: 0,
        is_valid: false,
      },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const data = result.data as Array<Record<string, unknown>>;

    // postProcess: isValid = row.is_valid !== false → false !== false → false
    // The explicit is_valid assignment overrides the ...row spread value
    expect(data[0].is_valid).toBe(false);
  });

  // ---------- StrategyFactory -------------------------------------------------

  it('should be retrievable from StrategyFactory', () => {
    const instance = StrategyFactory.getStrategy(OperatorType.NET_AMOUNT_CALC);
    expect(instance).toBeInstanceOf(OrderNetAmountCalcStrategy);
  });

  // ---------- FIELD_MATCH_PATTERNS --------------------------------------------

  it('should export FIELD_MATCH_PATTERNS for Drawer auto-match', () => {
    expect(FIELD_MATCH_PATTERNS.payAmountCol).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.refundAmountCol).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.rejectionAmountCol).toBeDefined();
    expect(FIELD_MATCH_PATTERNS.orderStatusCol).toBeDefined();
  });

  it('should match common English column names', () => {
    expect(FIELD_MATCH_PATTERNS.payAmountCol.test('pay_amount')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.refundAmountCol.test('refund_amount')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.rejectionAmountCol.test('rejection_amount')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.orderStatusCol.test('order_status')).toBe(true);
  });

  it('should match common Chinese column names', () => {
    expect(FIELD_MATCH_PATTERNS.payAmountCol.test('实付金额')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.refundAmountCol.test('退款金额')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.rejectionAmountCol.test('拒签金额')).toBe(true);
    expect(FIELD_MATCH_PATTERNS.orderStatusCol.test('订单状态')).toBe(true);
  });
});
