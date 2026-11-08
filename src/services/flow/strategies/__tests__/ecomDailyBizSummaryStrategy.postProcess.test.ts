/**
 * Phase 2 单测 — fn_ecom_daily_biz_summary 结果加工层（计划 §Phase 2 测试矩阵）
 * 必须先 buildSql 再 postProcess，否则 _lastConfig 为 null。
 */
import { describe, it, expect } from 'vitest';
import {
  EcomDailyBizSummaryStrategy,
  cloneDailyBizSummaryConfig,
  dailyBizSlotHuman,
} from '../ecomDailyBizSummaryStrategy';
import {
  FlowNodeType,
  type DailyBizSummaryConfig,
  type FlowNode,
} from '../../types';

const makeStrategy = (): EcomDailyBizSummaryStrategy => new EcomDailyBizSummaryStrategy();

const cfg = (
  patch: Partial<DailyBizSummaryConfig> = {},
  mappingPatch: Partial<DailyBizSummaryConfig['fieldMapping']> = {},
): DailyBizSummaryConfig => {
  const base = cloneDailyBizSummaryConfig();
  base.fieldMapping = {
    orderDateCol: '订单支付时间',
    salesCol: '销售额',
    orderIdCol: '订单号',
    orderStatusCol: '订单状态',
    grossProfitCol: '毛利额',
    costCol: '商品成本',
    refundAmountCol: '退款金额',
    feeTotalCol: '费用合计',
    commissionFeeCol: '佣金',
    shippingFeeCol: '运费',
    serviceFeeCol: '服务费',
    quantityCol: '销量',
    ...mappingPatch,
  };
  return { ...base, ...patch };
};

const nodes = (config: DailyBizSummaryConfig): FlowNode[] => [
  { id: 't1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 'ecom_orders' } } as FlowNode,
  { id: 's1', type: FlowNodeType.SELECT, position: { x: 100, y: 0 }, data: { dailyBizSummaryConfig: config } } as FlowNode,
];

/** 先跑 buildSql 让 _lastConfig 落地，再加工结果 */
const run = async (config: DailyBizSummaryConfig, rows: Record<string, unknown>[]) => {
  const strategy = makeStrategy();
  strategy.buildSql(nodes(config), []);
  return strategy.postProcess({ data: rows });
};

const row = (patch: Record<string, unknown> = {}) => ({
  date: '2024-01-01',
  order_cnt: 2,
  sales: 300,
  profit: 90,
  refund_amount: 10,
  refund_rate: 0.0333,
  fee_total: 15,
  net_profit: 275,
  net_profit_rate: 0.9167,
  avg_order_value: 150,
  data_quality_flag: 'OK',
  ...patch,
});

const TWO_DAYS = [
  row(),
  row({ date: '2024-01-02', order_cnt: 3, sales: 450, profit: 120, refund_amount: 0, fee_total: 20, net_profit: 430, net_profit_rate: 0.9556 }),
];

const TECHNICAL_WORDS = ['COALESCE', 'NULLIF', 'SUM(', 'JSON', 'SQL'];

describe('Phase 2 — 空结果', () => {
  it('返回 1 张 warning 卡、空数据与配置一致的 schema', async () => {
    const result = await run(cfg(), []);
    expect(result.insightsData?.insights).toHaveLength(1);
    expect(result.insightsData?.insights[0].iconKey).toBe('warning');
    expect(result.insightsData?.insights[0].title).toContain('没有可汇总');
    expect(result.data).toEqual([]);
    expect(result.schema).toHaveLength(15);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(0);
  });
});

describe('Phase 2 — 洞察卡结构', () => {
  it('质量码 OK → 4 张卡，sortOrder 递增、id 唯一、文案业务化', async () => {
    const result = await run(cfg(), TWO_DAYS);
    const cards = result.insightsData!.insights;
    expect(cards).toHaveLength(4);
    expect(cards.map((c) => c.sortOrder)).toEqual([1, 2, 3, 4]);
    expect(new Set(cards.map((c) => c.id)).size).toBe(4);
    expect(cards.every((c) => c.id.startsWith('daily-biz-'))).toBe(true);
    expect(cards.every((c) => c.cardType === 'standard')).toBe(true);
    for (const card of cards) {
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.description?.length ?? 0).toBeGreaterThan(0);
      for (const word of TECHNICAL_WORDS) {
        expect(card.title).not.toContain(word);
        expect(card.description).not.toContain(word);
      }
    }
  });

  it('有降级码 → 追加数据质量卡（5 张）', async () => {
    const result = await run(cfg({}, { orderIdCol: '', refundAmountCol: '' }), TWO_DAYS);
    const cards = result.insightsData!.insights;
    expect(cards).toHaveLength(5);
    const quality = cards.find((c) => c.id === 'daily-biz-quality');
    expect(quality?.iconKey).toBe('quality');
    expect(quality?.description).toContain('订单数按数据行计数');
    expect(quality?.description).toContain('退款金额');
  });

  it('质量码 OK → 无质量卡', async () => {
    const cards = (await run(cfg(), TWO_DAYS)).insightsData!.insights;
    expect(cards.some((c) => c.id === 'daily-biz-quality')).toBe(false);
  });
});

describe('Phase 2 — 趋势卡', () => {
  it('两日数据 → 描述含首末日与变化百分比', async () => {
    const cards = (await run(cfg(), TWO_DAYS)).insightsData!.insights;
    const trend = cards[0];
    expect(trend.title).toBe('经营趋势');
    expect(trend.description).toContain('首日');
    expect(trend.description).toContain('末日');
    expect(trend.description).toContain('%');
    expect(trend.metrics?.map((m) => m.label)).toEqual(['统计天数', '累计销售额', '累计净利']);
    expect(trend.metrics?.[1].value).toBe(750);
    expect(trend.metrics?.[2].value).toBe(705);
  });

  it('单日数据 → 走「仅一日数据」分支', async () => {
    const cards = (await run(cfg(), [row()])).insightsData!.insights;
    expect(cards[0].description).toContain('仅一日数据');
  });

  it('基数为 0 → 不出现 Infinity/NaN', async () => {
    const zeroBase = [row({ sales: 0, net_profit: 0 }), row({ date: '2024-01-02', sales: 100, net_profit: 50 })];
    const cards = (await run(cfg(), zeroBase)).insightsData!.insights;
    expect(cards[0].description).not.toContain('Infinity');
    expect(cards[0].description).not.toContain('NaN');
    for (const card of cards) {
      for (const metric of card.metrics ?? []) {
        expect(Number.isFinite(metric.value)).toBe(true);
      }
    }
  });
});

describe('Phase 2 — 退款 / 订单 / 盈利卡口径', () => {
  it('退款率与 SQL 同口径（Σ退款 ÷ Σ销售额）', async () => {
    const cards = (await run(cfg(), TWO_DAYS)).insightsData!.insights;
    const refund = cards.find((c) => c.iconKey === 'price')!;
    const rate = refund.metrics?.find((m) => m.label === '退款率')!.value;
    expect(rate).toBeCloseTo(10 / 750, 4);
  });

  it('未映射退款列 → 明确说明不可计算', async () => {
    const cards = (await run(cfg({}, { refundAmountCol: '' }), TWO_DAYS)).insightsData!.insights;
    const refund = cards.find((c) => c.iconKey === 'price')!;
    expect(refund.description).toContain('未映射退款金额列');
  });

  it('客单价 = Σ销售额 ÷ Σ订单数，ROW_LEVEL 时追加计数说明', async () => {
    const cards = (await run(cfg({}, { orderIdCol: '' }), TWO_DAYS)).insightsData!.insights;
    const order = cards.find((c) => c.iconKey === 'order')!;
    expect(order.metrics?.find((m) => m.label === '客单价')!.value).toBeCloseTo(750 / 5, 2);
    expect(order.description).toContain('订单数按数据行计数');
  });

  it('区间净利率按销售额加权', async () => {
    const cards = (await run(cfg(), TWO_DAYS)).insightsData!.insights;
    const profit = cards.find((c) => c.title === '盈利质量')!;
    expect(profit.metrics?.find((m) => m.label === '区间净利率')!.value).toBeCloseTo(705 / 750, 4);
    expect(profit.suggestion?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('Phase 2 — 数值健壮性', () => {
  it('字符串数字 / BigInt / null / 缺列混入不抛错，summary 计数正确', async () => {
    const messy = [
      row({ sales: '123.45', net_profit: '100.5', order_cnt: BigInt(2) }),
      { date: '2024-01-02' },
      row({ date: '2024-01-03', sales: null, net_profit: null, refund_amount: null }),
    ];
    const result = await run(cfg(), messy);
    expect(result.data).toHaveLength(3);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(3);
    expect(result.insightsData?.summary?.totalFilterRecordCount).toBe(1);
    for (const card of result.insightsData!.insights) {
      for (const metric of card.metrics ?? []) expect(Number.isFinite(metric.value)).toBe(true);
    }
  });
});

describe('Phase 2 — displayConfig', () => {
  it('默认按日期升序，净利用带符号金额格式', async () => {
    const display = (await run(cfg(), TWO_DAYS)).displayConfig!;
    expect(display.defaultSort).toEqual({ column: 'date', order: 'ascend' });
    expect(display.columnFormatters?.net_profit).toEqual({ type: 'currency_signed', unit: '元', precision: 2 });
  });

  it('关闭对比时不含 *_cmp 格式化与 tooltip', async () => {
    const display = (await run(cfg({ compareMode: 'none' }), TWO_DAYS)).displayConfig!;
    const keys = Object.keys(display.columnFormatters ?? {});
    expect(keys.some((k) => k.endsWith('_cmp'))).toBe(false);
    expect(Object.keys(display.columnTooltips ?? {}).some((k) => k.endsWith('_cmp'))).toBe(false);
  });

  it('tooltip 文案与槽位人话同源（AC6 第二处断言）', async () => {
    const config = cfg();
    const display = (await run(config, TWO_DAYS)).displayConfig!;
    expect(display.columnTooltips?.sales).toContain(dailyBizSlotHuman(config.salesSlots));
    expect(display.columnTooltips?.net_profit).toContain(dailyBizSlotHuman(config.netProfitSlots));
    expect(display.columnTooltips?.net_profit).toContain('未扣退款（毛额）');
    expect(display.columnTooltips?.net_profit_rate).toContain('净利 ÷ 销售额');
    expect(display.columnTooltips?.avg_order_value).toContain('销售额 ÷ 订单数');
    expect(display.columnTooltips?.data_quality_flag).toContain('OK');
  });

  it('毛利降级时 tooltip 说明降级来源', async () => {
    const config = cfg({}, { grossProfitCol: '' });
    const display = (await run(config, TWO_DAYS)).displayConfig!;
    expect(display.columnTooltips?.profit).toContain('商品成本');
    expect(display.columnTooltips?.profit).toContain('降级');
  });
});

describe('Phase 2 — schema', () => {
  it('默认 15 列；关闭对比 12 列；无销量再减 1', async () => {
    expect((await run(cfg(), TWO_DAYS)).schema).toHaveLength(15);
    expect((await run(cfg({ compareMode: 'none' }), TWO_DAYS)).schema).toHaveLength(12);
    expect((await run(cfg({ compareMode: 'none' }, { quantityCol: '' }), TWO_DAYS)).schema).toHaveLength(11);
  });

  it('列名与 SQL 别名逐一对应', async () => {
    const strategy = makeStrategy();
    const sql = strategy.buildSql(nodes(cfg()), []);
    const result = await strategy.postProcess({ data: TWO_DAYS });
    const names = (result.schema as Array<{ name: string }>).map((c) => c.name);
    for (const name of names) expect(sql).toContain(name);
    expect(names).toEqual([
      'date', 'order_cnt', 'sales', 'profit', 'refund_amount', 'refund_rate', 'fee_total',
      'net_profit', 'net_profit_rate', 'avg_order_value', 'quantity',
      'sales_cmp', 'profit_cmp', 'net_profit_cmp', 'data_quality_flag',
    ]);
  });
});
