import { describe, it, expect, beforeEach } from 'bun:test';
import { OrderFunnelAnalysisStrategy } from '../orderFunnelAnalysisStrategy';
import {
  FlowNodeType,
  OperatorType,
  LogicType,
  type FlowNode,
  type OrderFunnelAnalysisConfig,
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

const createSelectNode = (config: OrderFunnelAnalysisConfig): FlowNode => ({
  id: 'select-1',
  type: FlowNodeType.SELECT,
  position: { x: 100, y: 0 },
  data: { tableName: 'orders', orderFunnelAnalysisConfig: config },
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

/** Base config: order(locked) + pay + ship + receive enabled, confirm/review/repurchase disabled */
const baseConfig: OrderFunnelAnalysisConfig = {
  orderIdCol:      'order_id',
  userIdCol:       'user_id',
  orderStatusCol:  'order_status',
  excludeStatuses: 'cancelled,refunded,closed',
  steps: {
    order:      { enabled: true,  colName: 'create_time' },
    pay:        { enabled: true,  colName: 'pay_time'    },
    confirm:    { enabled: false, colName: ''            },
    ship:       { enabled: true,  colName: 'ship_time'   },
    receive:    { enabled: true,  colName: 'receive_time'},
    review:     { enabled: false, colName: ''            },
    repurchase: { enabled: false, colName: ''            },
  },
};

// ============================================================================
// Tests
// ============================================================================

describe('OrderFunnelAnalysisStrategy', () => {
  let strategy: OrderFunnelAnalysisStrategy;

  beforeEach(() => {
    strategy = new OrderFunnelAnalysisStrategy();
  });

  // ---------- metadata --------------------------------------------------------

  it('should have correct type and name', () => {
    expect(strategy.type).toBe(OperatorType.ORDER_FUNNEL_ANALYSIS);
    expect(strategy.name).toBe('订单全链路漏斗转化分析');
  });

  it('should require TABLE node', () => {
    expect(strategy.getRequiredNodes()).toContain(FlowNodeType.TABLE);
  });

  // ---------- SQL structure ---------------------------------------------------

  it('should generate CTE pipeline: src → [repurchase_users]? → counts → SELECT', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('WITH src AS');
    expect(sql).toContain('counts AS');
    expect(sql).toContain('SELECT * FROM counts');
  });

  it('should quote table name in src CTE', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('FROM "orders"');
  });

  it('full 7-step config should include all 7 COUNT fields', () => {
    const fullConfig: OrderFunnelAnalysisConfig = {
      ...baseConfig,
      steps: {
        order:      { enabled: true, colName: 'create_time'   },
        pay:        { enabled: true, colName: 'pay_time'      },
        confirm:    { enabled: true, colName: 'confirm_time'  },
        ship:       { enabled: true, colName: 'ship_time'     },
        receive:    { enabled: true, colName: 'receive_time'  },
        review:     { enabled: true, colName: 'review_time'   },
        repurchase: { enabled: true, colName: ''              },
      },
    };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(fullConfig)], []);

    expect(sql).toContain('cnt_order');
    expect(sql).toContain('cnt_pay');
    expect(sql).toContain('cnt_confirm');
    expect(sql).toContain('cnt_ship');
    expect(sql).toContain('cnt_receive');
    expect(sql).toContain('cnt_review');
    expect(sql).toContain('cnt_repurchase');
  });

  it('disabled ship/receive steps should NOT appear in SQL', () => {
    const cfg: OrderFunnelAnalysisConfig = {
      ...baseConfig,
      steps: {
        ...baseConfig.steps,
        ship:    { enabled: false, colName: '' },
        receive: { enabled: false, colName: '' },
      },
    };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    expect(sql).not.toContain('cnt_ship');
    expect(sql).not.toContain('cnt_receive');
    // enabled steps still present
    expect(sql).toContain('cnt_order');
    expect(sql).toContain('cnt_pay');
  });

  it('disabled repurchase step should NOT generate repurchase_users CTE', () => {
    const sql = strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    expect(sql).not.toContain('repurchase_users');
    expect(sql).not.toContain('cnt_repurchase');
  });

  it('enabled repurchase step should generate repurchase_users CTE with HAVING COUNT(*) >= 2', () => {
    const cfg: OrderFunnelAnalysisConfig = {
      ...baseConfig,
      steps: { ...baseConfig.steps, repurchase: { enabled: true, colName: '' } },
    };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    expect(sql).toContain('repurchase_users AS');
    expect(sql).toContain('HAVING COUNT(*) >= 2');
    expect(sql).toContain('cnt_repurchase');
  });

  // ---------- WHERE clause ----------------------------------------------------

  it('should include excludeStatuses in src CTE WHERE clause', () => {
    const sql = strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    expect(sql).toContain('NOT IN');
    expect(sql).toContain("'cancelled'");
    expect(sql).toContain("'refunded'");
    expect(sql).toContain("'closed'");
  });

  it('should use custom orderStatusCol in WHERE clause', () => {
    const cfg: OrderFunnelAnalysisConfig = { ...baseConfig, orderStatusCol: 'status_code' };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    expect(sql).toContain('"status_code"');
  });

  it('should use custom excludeStatuses values in NOT IN list', () => {
    const cfg: OrderFunnelAnalysisConfig = {
      ...baseConfig,
      excludeStatuses: 'deleted,pending_cancel',
    };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    expect(sql).toContain("'deleted'");
    expect(sql).toContain("'pending_cancel'");
    expect(sql).not.toContain("'cancelled'");
  });

  it('should inject condition node userWhere into src CTE', () => {
    const nodes = [
      createTableNode(),
      createSelectNode(baseConfig),
      createConditionNode('region', '=', 'north'),
    ];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('"orders"."region"');
    expect(sql).toContain("'north'");

    // WHERE must appear inside src CTE, before counts CTE
    const srcIdx    = sql.indexOf('src AS');
    const countsIdx = sql.indexOf('counts AS');
    const whereIdx  = sql.indexOf('WHERE');
    expect(whereIdx).toBeGreaterThan(srcIdx);
    expect(whereIdx).toBeLessThan(countsIdx);
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

  it('should return no errors for a valid base config', () => {
    const errors = strategy.validate([createTableNode(), createSelectNode(baseConfig)], []);
    expect(errors).toHaveLength(0);
  });

  it('should return error when orderIdCol is missing', () => {
    const cfg = { ...baseConfig, orderIdCol: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('订单ID'))).toBe(true);
  });

  it('should return error when create_time (order step colName) is missing', () => {
    const cfg: OrderFunnelAnalysisConfig = {
      ...baseConfig,
      steps: { ...baseConfig.steps, order: { enabled: true, colName: '' } },
    };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('下单时间') || e.message.includes('create_time'))).toBe(true);
  });

  it('should return error when repurchase is enabled but userIdCol is missing', () => {
    const cfg: OrderFunnelAnalysisConfig = {
      ...baseConfig,
      userIdCol: undefined,
      steps: { ...baseConfig.steps, repurchase: { enabled: true, colName: '' } },
    };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);
    expect(errors.some((e) => e.message.includes('用户ID'))).toBe(true);
  });

  // ---------- postProcess: empty result ----------------------------------------

  it('should return empty AnalysisResult without throwing when rows are empty', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });

    expect(result.type).toBe(OperatorType.ORDER_FUNNEL_ANALYSIS);
    expect(result.data).toHaveLength(0);
    expect(result.insightsData?.insights).toHaveLength(0);
  });

  // ---------- postProcess: conversion rate math --------------------------------

  it('should compute step-over-step conversion_rate and drop_rate correctly', async () => {
    // Pre-load config via buildSql
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    // order=1000, pay=800, ship=400, receive=200
    const row = { cnt_order: 1000, cnt_pay: 800, cnt_ship: 400, cnt_receive: 200 };
    const result = await strategy.postProcess({ data: [row], schema: [] });
    const rows = result.data as Array<{
      step: string; count: number;
      conversion_rate: number; drop_rate: number; abs_conversion_rate: number;
    }>;

    // order step: conversion_rate = 100, drop_rate = 0
    const orderRow = rows.find((r) => r.step === '下单');
    expect(orderRow?.conversion_rate).toBe(100);
    expect(orderRow?.drop_rate).toBe(0);
    expect(orderRow?.abs_conversion_rate).toBe(100);

    // pay: 800/1000 = 80%, drop = 20%
    const payRow = rows.find((r) => r.step === '支付');
    expect(payRow?.conversion_rate).toBe(80);
    expect(payRow?.drop_rate).toBe(20);
    expect(payRow?.abs_conversion_rate).toBe(80);

    // ship: 400/800 = 50%, abs = 400/1000 = 40%
    const shipRow = rows.find((r) => r.step === '发货');
    expect(shipRow?.conversion_rate).toBe(50);
    expect(shipRow?.drop_rate).toBe(50);
    expect(shipRow?.abs_conversion_rate).toBe(40);

    // receive: 200/400 = 50%, abs = 200/1000 = 20%
    const receiveRow = rows.find((r) => r.step === '签收');
    expect(receiveRow?.conversion_rate).toBe(50);
    expect(receiveRow?.drop_rate).toBe(50);
    expect(receiveRow?.abs_conversion_rate).toBe(20);
  });

  it('should handle BigInt counts from DuckDB without precision loss', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const row = { cnt_order: BigInt(1000), cnt_pay: BigInt(600), cnt_ship: BigInt(300), cnt_receive: BigInt(150) };
    const result = await strategy.postProcess({ data: [row], schema: [] });
    const rows = result.data as Array<{ step: string; count: number }>;

    expect(rows.find((r) => r.step === '下单')?.count).toBe(1000);
    expect(rows.find((r) => r.step === '支付')?.count).toBe(600);
  });

  it('should handle zero cnt_order without NaN or division errors', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const row = { cnt_order: 0, cnt_pay: 0, cnt_ship: 0, cnt_receive: 0 };
    const result = await strategy.postProcess({ data: [row], schema: [] });
    const rows = result.data as Array<{ conversion_rate: number; abs_conversion_rate: number }>;

    rows.forEach((r) => {
      expect(isNaN(r.conversion_rate)).toBe(false);
      expect(isNaN(r.abs_conversion_rate)).toBe(false);
    });
  });

  // ---------- postProcess: InsightItems ----------------------------------------

  it('should produce 4 InsightItems for a normal result', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const row = { cnt_order: 1000, cnt_pay: 800, cnt_ship: 400, cnt_receive: 200 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    expect(result.insightsData?.insights).toHaveLength(4);
  });

  it('should identify correct bottleneck step (highest drop_rate)', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    // order=1000, pay=900(drop=10%), ship=400(drop=55.6%), receive=300(drop=25%)
    // ship has highest drop_rate
    const row = { cnt_order: 1000, cnt_pay: 900, cnt_ship: 400, cnt_receive: 300 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    const bottleneck = result.insightsData!.insights.find((i) => i.id === 'funnel-bottleneck');
    expect(bottleneck?.title).toContain('发货');
  });

  it('should set iconKey "critical" when bottleneck drop_rate >= 30%', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    // pay: 500/1000 = 50% drop
    const row = { cnt_order: 1000, cnt_pay: 500, cnt_ship: 400, cnt_receive: 380 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    const bottleneck = result.insightsData!.insights.find((i) => i.id === 'funnel-bottleneck');
    expect(bottleneck?.iconKey).toBe('critical');
  });

  it('should set iconKey "warning" when bottleneck drop_rate < 30%', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    // pay: 850/1000 = 15% drop (< 30%)
    const row = { cnt_order: 1000, cnt_pay: 850, cnt_ship: 800, cnt_receive: 780 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    const bottleneck = result.insightsData!.insights.find((i) => i.id === 'funnel-bottleneck');
    expect(bottleneck?.iconKey).toBe('warning');
  });

  it('should produce "无明显瓶颈" when only order step is enabled', async () => {
    const singleStepConfig: OrderFunnelAnalysisConfig = {
      ...baseConfig,
      steps: {
        order:      { enabled: true,  colName: 'create_time' },
        pay:        { enabled: false, colName: '' },
        confirm:    { enabled: false, colName: '' },
        ship:       { enabled: false, colName: '' },
        receive:    { enabled: false, colName: '' },
        review:     { enabled: false, colName: '' },
        repurchase: { enabled: false, colName: '' },
      },
    };
    strategy.buildSql([createTableNode(), createSelectNode(singleStepConfig)], []);

    const row = { cnt_order: 500 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    const bottleneck = result.insightsData!.insights.find((i) => i.id === 'funnel-bottleneck' || i.id === 'funnel-no-bottleneck');
    expect(bottleneck?.title).toContain('无明显瓶颈');
  });

  it('should include suggestion text for bottleneck step', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    // ship has highest drop_rate
    const row = { cnt_order: 1000, cnt_pay: 950, cnt_ship: 300, cnt_receive: 280 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    const optimizeItem = result.insightsData!.insights.find((i) => i.id === 'funnel-optimize');
    // STEP_SUGGESTIONS['ship'] contains 仓储 or 24h
    expect(optimizeItem?.description).toMatch(/仓储|24h|物流/);
  });

  it('should include summary with totalOrderCount = cnt_order', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const row = { cnt_order: 2500, cnt_pay: 2000, cnt_ship: 1500, cnt_receive: 1000 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    expect(result.insightsData?.summary?.totalOrderCount).toBe(2500);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(2500);
  });

  it('should include displayConfig with defaultSort on count descend', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const row = { cnt_order: 1000, cnt_pay: 800, cnt_ship: 600, cnt_receive: 400 };
    const result = await strategy.postProcess({ data: [row], schema: [] });

    expect(result.displayConfig?.defaultSort?.column).toBe('count');
    expect(result.displayConfig?.defaultSort?.order).toBe('descend');
  });
});
