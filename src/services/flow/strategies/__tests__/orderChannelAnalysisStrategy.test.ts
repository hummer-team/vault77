import { describe, it, expect, beforeEach } from 'bun:test';
import { OrderChannelAnalysisStrategy } from '../orderChannelAnalysisStrategy';
import {
  FlowNodeType,
  OperatorType,
  LogicType,
  type FlowNode,
  type OrderChannelAnalysisConfig,
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

const createSelectNode = (config: OrderChannelAnalysisConfig): FlowNode => ({
  id: 'select-1',
  type: FlowNodeType.SELECT,
  position: { x: 100, y: 0 },
  data: { tableName: 'orders', orderChannelAnalysisConfig: config },
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

const baseConfig: OrderChannelAnalysisConfig = {
  dimension:      'channel',
  dimensionCol:   'channel_name',
  orderIdCol:     'order_id',
  netAmountCol:   'net_amount',
  grossProfitCol: 'gross_profit',
  refundRateMode: 'count',
};

// ============================================================================
// Tests
// ============================================================================

describe('OrderChannelAnalysisStrategy', () => {
  let strategy: OrderChannelAnalysisStrategy;

  beforeEach(() => {
    strategy = new OrderChannelAnalysisStrategy();
  });

  // ---------- metadata --------------------------------------------------------

  it('should have correct type and name', () => {
    expect(strategy.type).toBe(OperatorType.ORDER_CHANNEL_ANALYSIS);
    expect(strategy.name).toBe('渠道归因分析');
  });

  it('should require TABLE node', () => {
    expect(strategy.getRequiredNodes()).toContain(FlowNodeType.TABLE);
  });

  // ---------- SQL structure ---------------------------------------------------

  it('should generate CTE pipeline: src → agg → final SELECT', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('WITH src AS');
    expect(sql).toContain('agg AS');
    expect(sql).toContain('SELECT * FROM agg');
    expect(sql).toContain('ORDER BY roi DESC');
  });

  it('should quote table name in src CTE', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('FROM "orders"');
  });

  it('should include all required metrics in agg CTE', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('order_count');
    expect(sql).toContain('total_amount');
    expect(sql).toContain('total_profit');
    expect(sql).toContain('avg_order_value');
    expect(sql).toContain('roi');
    expect(sql).toContain('refund_rate');
  });

  it('should GROUP BY dimensionCol with double-quoted identifier', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('"channel_name"');
    expect(sql).toContain('GROUP BY "channel_name"');
  });

  it('should use NULLIF guards for division expressions', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('NULLIF(');
  });

  // ---------- refund rate modes -----------------------------------------------

  it('should use count-based refund rate expression when mode = count with isRefundCol', () => {
    const cfg: OrderChannelAnalysisConfig = {
      ...baseConfig,
      refundRateMode: 'count',
      isRefundCol: 'is_refund',
    };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    expect(sql).toContain('"is_refund"');
    expect(sql).toContain('CASE WHEN');
    expect(sql).toContain('= 1 THEN 1 ELSE 0 END');
  });

  it('should use amount-based refund rate expression when mode = amount', () => {
    const cfg: OrderChannelAnalysisConfig = {
      ...baseConfig,
      refundRateMode: 'amount',
      refundAmountCol: 'refund_amount',
    };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    expect(sql).toContain('"refund_amount"');
    // amount mode: SUM(refund_amount) / NULLIF(SUM(net_amount), 0)
    expect(sql).not.toContain('CASE WHEN');
  });

  it('should return CAST(0 AS DOUBLE) when no refund col is configured', () => {
    const cfg: OrderChannelAnalysisConfig = { ...baseConfig, refundRateMode: 'count' };
    const sql = strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    expect(sql).toContain('CAST(0 AS DOUBLE)');
  });

  // ---------- userWhere injection (condition node connectivity) ---------------

  it('should inject condition node filter into src CTE WHERE clause', () => {
    const nodes = [
      createTableNode(),
      createSelectNode(baseConfig),
      createConditionNode('status', '=', 'completed'),
    ];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('WHERE');
    expect(sql).toContain('"orders"."status"');
    expect(sql).toContain("'completed'");

    // WHERE must appear inside src CTE (before agg CTE)
    const srcIdx  = sql.indexOf('src AS');
    const aggIdx  = sql.indexOf('agg AS');
    const whereIdx = sql.indexOf('WHERE');
    expect(whereIdx).toBeGreaterThan(srcIdx);
    expect(whereIdx).toBeLessThan(aggIdx);
  });

  it('should NOT add WHERE clause when no condition nodes', () => {
    const nodes = [createTableNode(), createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).not.toContain('WHERE');
  });

  // ---------- edge cases ------------------------------------------------------

  it('should return fallback SQL when table node is missing', () => {
    const nodes = [createSelectNode(baseConfig)];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('WHERE false');
  });

  it('should return fallback SQL when select config is missing', () => {
    const nodes = [createTableNode()];
    const sql   = strategy.buildSql(nodes, []);

    expect(sql).toContain('WHERE false');
  });

  // ---------- validation ------------------------------------------------------

  it('should return no errors for a valid config', () => {
    const nodes  = [createTableNode(), createSelectNode(baseConfig)];
    const errors = strategy.validate(nodes, []);

    expect(errors).toHaveLength(0);
  });

  it('should return error when dimensionCol is missing', () => {
    const cfg = { ...baseConfig, dimensionCol: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);

    expect(errors.some((e) => e.message.includes('dimensionCol'))).toBe(true);
  });

  it('should return error when orderIdCol is missing', () => {
    const cfg = { ...baseConfig, orderIdCol: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);

    expect(errors.some((e) => e.message.includes('orderIdCol'))).toBe(true);
  });

  it('should return error when netAmountCol is missing', () => {
    const cfg = { ...baseConfig, netAmountCol: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);

    expect(errors.some((e) => e.message.includes('netAmountCol'))).toBe(true);
  });

  it('should return error when grossProfitCol is missing', () => {
    const cfg = { ...baseConfig, grossProfitCol: '' };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);

    expect(errors.some((e) => e.message.includes('grossProfitCol'))).toBe(true);
  });

  it('should return error when refundRateMode=amount but refundAmountCol is missing', () => {
    const cfg: OrderChannelAnalysisConfig = {
      ...baseConfig,
      refundRateMode: 'amount',
      // refundAmountCol intentionally missing
    };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);

    expect(errors.some((e) => e.message.includes('refundAmountCol'))).toBe(true);
  });

  it('should return no errors when refundRateMode=amount and refundAmountCol is provided', () => {
    const cfg: OrderChannelAnalysisConfig = {
      ...baseConfig,
      refundRateMode: 'amount',
      refundAmountCol: 'refund_amount',
    };
    const errors = strategy.validate([createTableNode(), createSelectNode(cfg)], []);

    expect(errors).toHaveLength(0);
  });

  // ---------- postProcess -----------------------------------------------------

  it('should return empty AnalysisResult when rows are empty', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });

    expect(result.type).toBe(OperatorType.ORDER_CHANNEL_ANALYSIS);
    expect(result.data).toHaveLength(0);
    expect(result.insightsData?.insights).toHaveLength(0);
  });

  it('should produce 4 insight items for >= 4 channels', async () => {
    // Pre-load strategy with config via buildSql (sets _lastConfig)
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const rows = [
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500, roi: 0.30, refund_rate: 0.05 },
      { dimension_label: '搜索', order_count: 800,  total_amount: 400000, total_profit: 100000, avg_order_value: 500, roi: 0.25, refund_rate: 0.08 },
      { dimension_label: '推荐', order_count: 600,  total_amount: 300000, total_profit: 60000,  avg_order_value: 500, roi: 0.20, refund_rate: 0.10 },
      { dimension_label: '广告', order_count: 200,  total_amount: 80000,  total_profit: 5000,   avg_order_value: 400, roi: 0.06, refund_rate: 0.20 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });

    expect(result.insightsData?.insights.length).toBe(4);
  });

  it('should set TOP3 insight cards with iconKey "order"', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const rows = [
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500, roi: 0.30, refund_rate: 0.05 },
      { dimension_label: '搜索', order_count: 800,  total_amount: 400000, total_profit: 100000, avg_order_value: 500, roi: 0.25, refund_rate: 0.08 },
      { dimension_label: '推荐', order_count: 600,  total_amount: 300000, total_profit: 60000,  avg_order_value: 500, roi: 0.20, refund_rate: 0.10 },
      { dimension_label: '广告', order_count: 200,  total_amount: 80000,  total_profit: 5000,   avg_order_value: 400, roi: 0.06, refund_rate: 0.20 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });
    const insights = result.insightsData!.insights;

    const orderCards = insights.filter((i) => i.iconKey === 'order');
    expect(orderCards.length).toBe(3);
  });

  it('should set low-ROI insight card with iconKey "warning"', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const rows = [
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500, roi: 0.30, refund_rate: 0.05 },
      { dimension_label: '搜索', order_count: 800,  total_amount: 400000, total_profit: 100000, avg_order_value: 500, roi: 0.25, refund_rate: 0.08 },
      { dimension_label: '推荐', order_count: 600,  total_amount: 300000, total_profit: 60000,  avg_order_value: 500, roi: 0.20, refund_rate: 0.10 },
      { dimension_label: '广告', order_count: 200,  total_amount: 80000,  total_profit: 5000,   avg_order_value: 400, roi: 0.06, refund_rate: 0.20 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });
    const insights = result.insightsData!.insights;

    const warningCard = insights.find((i) => i.iconKey === 'warning');
    expect(warningCard).toBeDefined();
    expect(warningCard?.title).toContain('广告'); // lowest ROI
    // Metrics must include 订单量 in the same order as Top-N cards
    const metricLabels = warningCard?.metrics?.map((m) => m.label);
    expect(metricLabels).toEqual(['订单量', '销售额', 'ROI', '退款率']);
    expect(warningCard?.metrics?.find((m) => m.label === '订单量')?.value).toBe(200);
  });

  it('should sort TOP3 by total_amount DESC (not row order)', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    // Rows not in sorted order — 推荐 has highest amount
    const rows = [
      { dimension_label: '搜索', order_count: 800,  total_amount: 400000, total_profit: 100000, avg_order_value: 500, roi: 0.25, refund_rate: 0.08 },
      { dimension_label: '广告', order_count: 200,  total_amount: 80000,  total_profit: 5000,   avg_order_value: 400, roi: 0.06, refund_rate: 0.20 },
      { dimension_label: '推荐', order_count: 600,  total_amount: 600000, total_profit: 60000,  avg_order_value: 1000, roi: 0.10, refund_rate: 0.10 },
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500,  roi: 0.30, refund_rate: 0.05 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });
    const insights = result.insightsData!.insights;
    const top1 = insights.find((i) => i.id === 'channel-top-1');

    expect(top1?.title).toContain('推荐'); // highest total_amount=600000
  });

  it('should produce only 1 insight for a single-channel dataset', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const rows = [
      { dimension_label: '直播', order_count: 500, total_amount: 100000, total_profit: 30000, avg_order_value: 200, roi: 0.30, refund_rate: 0.02 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });

    // Only 1 row → TOP3 clamped to 1; low-ROI skipped (rows.length <= 1)
    expect(result.insightsData?.insights.length).toBe(1);
  });

  it('should include displayConfig with defaultSort on total_amount descend', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const rows = [
      { dimension_label: 'X', order_count: 1, total_amount: 1000, total_profit: 200, avg_order_value: 1000, roi: 0.20, refund_rate: 0 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });

    expect(result.displayConfig?.defaultSort?.column).toBe('total_amount');
    expect(result.displayConfig?.defaultSort?.order).toBe('descend');
  });

  it('should include summary with totalRecordCount', async () => {
    strategy.buildSql([createTableNode(), createSelectNode(baseConfig)], []);

    const rows = [
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500, roi: 0.30, refund_rate: 0.05 },
      { dimension_label: '搜索', order_count: 800,  total_amount: 400000, total_profit: 100000, avg_order_value: 500, roi: 0.25, refund_rate: 0.08 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });

    expect(result.insightsData?.summary?.totalRecordCount).toBe(2);
  });

  // ---------- topN ------------------------------------------------------------

  it('should produce topN+1 insights when topN=5 and rows >= 6', async () => {
    const cfg: OrderChannelAnalysisConfig = { ...baseConfig, topN: 5 };
    strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    const rows = Array.from({ length: 6 }, (_, i) => ({
      dimension_label: `ch${i}`,
      order_count: 1000 - i * 100,
      total_amount: 500000 - i * 50000,
      total_profit: 100000 - i * 10000,
      avg_order_value: 500,
      roi: 0.20 - i * 0.01,
      refund_rate: 0.05,
    }));
    const result = await strategy.postProcess({ data: rows, schema: [] });

    const orderCards = result.insightsData!.insights.filter((i) => i.iconKey === 'order');
    expect(orderCards.length).toBe(5);
    expect(result.insightsData!.insights.length).toBe(6); // 5 order + 1 warning
  });

  it('should produce topN=1 order card + 1 warning for 2-channel dataset', async () => {
    const cfg: OrderChannelAnalysisConfig = { ...baseConfig, topN: 1 };
    strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    const rows = [
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500, roi: 0.30, refund_rate: 0.05 },
      { dimension_label: '广告', order_count: 200,  total_amount: 80000,  total_profit: 5000,   avg_order_value: 400, roi: 0.06, refund_rate: 0.20 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });

    const orderCards = result.insightsData!.insights.filter((i) => i.iconKey === 'order');
    const warnCards  = result.insightsData!.insights.filter((i) => i.iconKey === 'warning');
    expect(orderCards.length).toBe(1);
    expect(warnCards.length).toBe(1);
  });

  // ---------- roiThreshold ----------------------------------------------------

  it('should include roiThreshold in suggestion when top1 roi exceeds threshold', async () => {
    const cfg: OrderChannelAnalysisConfig = { ...baseConfig, roiThreshold: 0.2 };
    strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    const rows = [
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500, roi: 0.35, refund_rate: 0.05 },
      { dimension_label: '广告', order_count: 200,  total_amount: 80000,  total_profit: 5000,   avg_order_value: 400, roi: 0.06, refund_rate: 0.20 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });
    const top1 = result.insightsData!.insights.find((i) => i.id === 'channel-top-1');

    // roi=0.35 > threshold=0.2 → "加大投入" suggestion and threshold mentioned
    expect(top1?.suggestion).toContain('加大投入');
    expect(top1?.suggestion).toContain('20%'); // threshold 20%
  });

  it('should warn about roi below threshold when top1 roi is below threshold', async () => {
    const cfg: OrderChannelAnalysisConfig = { ...baseConfig, roiThreshold: 0.5 };
    strategy.buildSql([createTableNode(), createSelectNode(cfg)], []);

    const rows = [
      { dimension_label: '直播', order_count: 1000, total_amount: 500000, total_profit: 150000, avg_order_value: 500, roi: 0.30, refund_rate: 0.05 },
      { dimension_label: '广告', order_count: 200,  total_amount: 80000,  total_profit: 5000,   avg_order_value: 400, roi: 0.06, refund_rate: 0.20 },
    ];
    const result = await strategy.postProcess({ data: rows, schema: [] });
    const top1 = result.insightsData!.insights.find((i) => i.id === 'channel-top-1');

    // roi=0.30 < threshold=0.5 → "仍有提升空间" suggestion
    expect(top1?.suggestion).toContain('仍有提升空间');
    expect(top1?.suggestion).toContain('50%'); // threshold 50%
  });
});
