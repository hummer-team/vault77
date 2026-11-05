/**
 * Phase 2 单测 — postProcess 富化 / 空结果四态 / 4+1 洞察卡 / 展示配置（计划 §Phase 2 测试矩阵）
 * 构造 { data, schema } 直接驱动 postProcess，不连 DuckDB。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { EcomZeroNegativeOrderDetectStrategy } from '../ecomZeroNegativeOrderDetectStrategy';
import {
  DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG,
  FlowNodeType,
  ZERO_NEGATIVE_RULE_KEYS,
  cloneZeroNegativeOrderDetectConfig,
  type AnalysisResult,
  type FlowNode,
  type InsightItem,
  type ZeroNegativeFieldMapping,
  type ZeroNegativeOrderDetectConfig,
} from '../../types';

const strategy = new EcomZeroNegativeOrderDetectStrategy();

const ALL_COLS: ZeroNegativeFieldMapping = {
  orderIdCol: 'order_id',
  orderTimeCol: 'paid_at',
  orderStatusCol: 'order_status',
  payAmountCol: 'pay_amount',
  productAmountCol: 'product_amount',
  discountTotalCol: 'discount_total',
  quantityCol: 'quantity',
  unitPriceCol: 'unit_price',
  couponAmountCol: 'coupon_amount',
  platformDiscountCol: 'platform_discount',
  merchantDiscountCol: 'merchant_discount',
  refundAmountCol: 'refund_amount',
  exemptionCol: 'order_type',
};

const cfg = (
  patch: Partial<ZeroNegativeOrderDetectConfig> = {},
  mappingPatch: Partial<ZeroNegativeFieldMapping> = {},
): ZeroNegativeOrderDetectConfig => {
  const c = cloneZeroNegativeOrderDetectConfig(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
  Object.assign(c, patch);
  Object.assign(c.fieldMapping, ALL_COLS, mappingPatch);
  return c;
};

const makeNodes = (config: ZeroNegativeOrderDetectConfig): FlowNode[] => [
  { id: 't1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 'ecom_orders' } } as FlowNode,
  { id: 's1', type: FlowNodeType.SELECT, position: { x: 0, y: 0 }, data: { zeroNegativeDetectConfig: config } } as FlowNode,
];

/** 走真实路径写 _lastConfig（SQL 生成是唯一配置入口） */
const useConfig = (config: ZeroNegativeOrderDetectConfig): void => {
  (
    strategy as unknown as {
      buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string;
    }
  ).buildOperatorSql(makeNodes(config), [], undefined, '');
};

const run = async (data: unknown[]): Promise<AnalysisResult> =>
  strategy.postProcess({ data, schema: [] });

const insightsOf = (res: AnalysisResult): InsightItem[] =>
  (res.insightsData?.insights ?? []) as InsightItem[];

const rowsOf = (res: AnalysisResult): Record<string, unknown>[] =>
  res.data as Record<string, unknown>[];

/** 一行原始 SQL 输出（默认：健康单） */
const rawRow = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  order_id: 'A1',
  order_time: '2024-01-01 10:00:00',
  expected_amount: 100,
  pay_amount: 100,
  discount_total: 0,
  net_pay_amount: 100,
  loss_amount: 0,
  hit_zero_pay: false,
  hit_negative_pay: false,
  hit_negative_unit_price: false,
  hit_discount_overflow: false,
  hit_negative_field: false,
  hit_amount_mismatch: false,
  hit_discount_sum_mismatch: false,
  hit_penny_order: false,
  has_null_amount: false,
  is_abnormal: false,
  ...patch,
});

/** 命中行：默认命中 R2 负实付 */
const hitRow = (patch: Record<string, unknown> = {}): Record<string, unknown> =>
  rawRow({ hit_negative_pay: true, is_abnormal: true, pay_amount: -15, loss_amount: 115, ...patch });

beforeEach(() => {
  useConfig(cfg());
});

describe('Phase 2 空结果四态', () => {
  it('① 规则全跳过 + 0 行 → quality「无法执行任何检测规则」，单卡空行集', async () => {
    useConfig(cfg(
      { enabledRules: ['negative_unit_price', 'discount_sum_mismatch'] },
      { unitPriceCol: '', quantityCol: '', couponAmountCol: '' },
    ));
    const res = await run([]);
    const items = insightsOf(res);
    expect(items).toHaveLength(1);
    expect(items[0].iconKey).toBe('quality');
    expect(items[0].title).toContain('无法执行');
    expect(rowsOf(res)).toHaveLength(0);
  });

  it('② 规则可执行 + 0 行 → quality「没有可判定的订单」', async () => {
    const res = await run([]);
    const items = insightsOf(res);
    expect(items).toHaveLength(1);
    expect(items[0].iconKey).toBe('quality');
    expect(items[0].title).toContain('没有可判定的订单');
    expect(rowsOf(res)).toHaveLength(0);
  });

  it('③ 有行但全 has_null_amount → quality 且正文含缺失行数', async () => {
    const res = await run([
      rawRow({ order_id: 'N1', has_null_amount: true }),
      rawRow({ order_id: 'N2', has_null_amount: true }),
    ]);
    const items = insightsOf(res);
    expect(items).toHaveLength(1);
    expect(items[0].iconKey).toBe('quality');
    expect(items[0].title).toContain('金额缺失');
    expect(items[0].description).toContain('2');
    expect(rowsOf(res)).toHaveLength(2);
  });

  it('④ 有行且零命中 → safe「未发现 0 元单 / 负金额 / 优惠溢出」', async () => {
    const res = await run([rawRow({ order_id: 'H1' }), rawRow({ order_id: 'H2' })]);
    const items = insightsOf(res);
    expect(items).toHaveLength(1);
    expect(items[0].iconKey).toBe('safe');
    expect(items[0].title).toContain('未发现');
    expect(items[0].description).toContain('2');
    expect(rowsOf(res)).toHaveLength(2);
  });
});

describe('Phase 2 主类型优先级', () => {
  it('同时命中 R1/R2/R4 → 主类型为负实付（R2 优先）', async () => {
    const res = await run([hitRow({ hit_zero_pay: true, hit_discount_overflow: true })]);
    const row = rowsOf(res)[0];
    expect(row.abnormal_type).toBe('负实付订单');
    expect(row.abnormal_types).toBe('R2,R4,R1');
  });

  it('8 标志全 true → 主类型恒为负金额字段', async () => {
    const all = Object.fromEntries(ZERO_NEGATIVE_RULE_KEYS.map((k) => [`hit_${k}`, true]));
    const res = await run([hitRow(all)]);
    expect(rowsOf(res)[0].abnormal_type).toBe('负金额字段');
  });

  it('abnormal_types 按优先级次序且长度等于命中数', async () => {
    const res = await run([hitRow({ hit_zero_pay: true, hit_penny_order: true })]);
    const types = String(rowsOf(res)[0].abnormal_types).split(',');
    expect(types).toEqual(['R2', 'R1', 'R8']);
    expect(types).toHaveLength(3);
  });
});

describe('Phase 2 风险等级', () => {
  const levelOf = async (loss: number, hits = 1): Promise<unknown> => {
    const res = await run([hitRow({ loss_amount: loss, ...(hits > 1 ? { hit_zero_pay: true, hit_penny_order: true } : {}) })]);
    return rowsOf(res)[0].risk_level;
  };

  it('500 / 100 / 10 / 9.99 → 严重 / 高 / 中 / 低', async () => {
    expect(await levelOf(500)).toBe('严重');
    expect(await levelOf(100)).toBe('高');
    expect(await levelOf(10)).toBe('中');
    expect(await levelOf(9.99)).toBe('低');
  });

  it('低档命中 3 类规则 → 升一档为「中」', async () => {
    expect(await levelOf(9.99, 3)).toBe('中');
  });

  it('严重档不越界', async () => {
    expect(await levelOf(9999, 3)).toBe('严重');
  });
});

describe('Phase 2 质量短码', () => {
  it('未映射订单号 + R7 跳过 + 该行金额缺失 → 三码齐拼接', async () => {
    useConfig(cfg(
      { enabledRules: ['negative_pay', 'discount_sum_mismatch'] },
      { orderIdCol: '', couponAmountCol: '' },
    ));
    const res = await run([
      hitRow({ order_id: null }),
      rawRow({ order_id: 'N2', has_null_amount: true }),
    ]);
    const rows = rowsOf(res);
    const nullRow = rows.find((r) => r.order_id === 'N2');
    expect(nullRow?.data_quality_flag).toBe('ROW_LEVEL+PARTIAL_RULES+NULL_AMOUNT');
    expect(nullRow?.skipped_rules).toBe('R7');
  });

  it('全列映射且无跳过 → 正常命中行取 OK / skipped_rules 为 null', async () => {
    const res = await run([hitRow()]);
    expect(rowsOf(res)[0].data_quality_flag).toBe('OK');
    expect(rowsOf(res)[0].skipped_rules).toBeNull();
  });
});

describe('Phase 2 文案非空转', () => {
  it('命中行 reasons 含规则短码与数字、suggestion 非空', async () => {
    const row = rowsOf(await run([hitRow()]))[0];
    expect(String(row.abnormal_reasons)).toContain('R2');
    expect(String(row.abnormal_reasons)).toMatch(/\d/);
    expect(String(row.suggestion).length).toBeGreaterThan(0);
  });

  it('无命中行 reasons 与 suggestion 皆为 null', async () => {
    const row = rowsOf(await run([rawRow()]))[0];
    expect(row.abnormal_reasons).toBeNull();
    expect(row.suggestion).toBeNull();
    expect(row.abnormal_type).toBeNull();
    expect(row.abnormal_types).toBeNull();
  });
});

describe('Phase 2 差额文案口径（与损失金额解耦）', () => {
  const mismatchRow = (pay: number, expected: number, loss: number): Record<string, unknown> =>
    hitRow({
      hit_negative_pay: false,
      hit_amount_mismatch: true,
      pay_amount: pay,
      expected_amount: expected,
      loss_amount: loss,
    });

  it('多收（pay 120 / expected 100）：差额 20.00，损失仍为 0', async () => {
    const row = rowsOf(await run([mismatchRow(120, 100, 0)]))[0];
    expect(String(row.abnormal_reasons)).toContain('差额 20.00 元');
    expect(String(row.abnormal_reasons)).toContain('多收');
    expect(row.loss_amount).toBe(0);
  });

  it('少收（pay 80 / expected 100）：差额同为 20.00，损失为 20', async () => {
    const row = rowsOf(await run([mismatchRow(80, 100, 20)]))[0];
    expect(String(row.abnormal_reasons)).toContain('差额 20.00 元');
    expect(String(row.abnormal_reasons)).toContain('少收');
    expect(row.loss_amount).toBe(20);
  });

  it('penny_order 同样取方向无关差额，不再用损失金额冒充差额', async () => {
    const row = rowsOf(await run([hitRow({
      hit_negative_pay: false,
      hit_penny_order: true,
      pay_amount: 0.01,
      expected_amount: 50,
      loss_amount: 10,
    })]))[0];
    expect(String(row.abnormal_reasons)).toContain('差额 49.99 元');
    expect(String(row.abnormal_reasons)).toContain('少收');
    expect(String(row.abnormal_reasons)).not.toContain('差额 10.00 元');
  });
});

describe('Phase 2 金额归一', () => {
  it('loss_amount 10.005 → 10.01（十进制四舍五入）', async () => {
    expect(rowsOf(await run([hitRow({ loss_amount: 10.005 })]))[0].loss_amount).toBe(10.01);
  });

  it('null 金额保持 null，不转 0', async () => {
    const row = rowsOf(await run([rawRow({ pay_amount: null, net_pay_amount: null, loss_amount: null })]))[0];
    expect(row.pay_amount).toBeNull();
    expect(row.net_pay_amount).toBeNull();
    expect(row.loss_amount).toBeNull();
  });
});

describe('Phase 2 内部列剥离', () => {
  const row = async (): Promise<Record<string, unknown>> => rowsOf(await run([hitRow()]))[0];

  it('输出行无 hit_ 前缀与 has_null_amount', async () => {
    const r = await row();
    expect(Object.keys(r).some((k) => k.startsWith('hit_'))).toBe(false);
    expect(Object.keys(r)).not.toContain('has_null_amount');
  });

  it('保留 is_abnormal 与 net_pay_amount', async () => {
    const r = await row();
    expect(r.is_abnormal).toBe(true);
    expect(r.net_pay_amount).toBe(100);
  });

  it('schema 名称集合与行键集合一致（15 列）', async () => {
    const res = await run([hitRow()]);
    const schemaNames = (res.schema as Array<{ name: string }>).map((s) => s.name);
    expect(schemaNames).toHaveLength(15);
    expect(new Set(schemaNames)).toEqual(new Set(Object.keys(rowsOf(res)[0])));
  });
});

describe('Phase 2 排序', () => {
  it('等级升序 → 同级损失降序 → order_id 升序（null 归一空串）且两次一致', async () => {
    const rows = [
      hitRow({ order_id: 'B', loss_amount: 9.99 }),
      hitRow({ order_id: 'C', loss_amount: 500 }),
      hitRow({ order_id: 'A', loss_amount: 100 }),
      hitRow({ order_id: null, loss_amount: 9.99 }),
      hitRow({ order_id: 'A0', loss_amount: 100 }),
    ];
    const first = rowsOf(await run(rows)).map((r) => r.order_id);
    expect(first).toEqual(['C', 'A', 'A0', null, 'B']);
    const second = rowsOf(await run(rows)).map((r) => r.order_id);
    expect(second).toEqual(first);
  });
});

describe('Phase 2 洞察卡自洽', () => {
  const mixed = (): Record<string, unknown>[] => [
    hitRow({ order_id: 'X1', loss_amount: 500, hit_zero_pay: true }),
    hitRow({ order_id: 'X2', loss_amount: 100, hit_negative_pay: true, hit_zero_pay: false }),
    hitRow({ order_id: 'X3', loss_amount: 10, hit_negative_field: true, hit_negative_pay: false }),
    rawRow({ order_id: 'X4' }),
  ];

  it('无质量问题产出 4 张卡；sortOrder 严格递增', async () => {
    const items = insightsOf(await run(mixed()));
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.sortOrder)).toEqual([1, 2, 3, 4]);
    expect(items.map((i) => i.id)).toEqual(['loss-overview', 'type-composition', 'risk-distribution', 'top-loss-orders']);
  });

  it('有质量问题追加第 5 张 data-quality 卡', async () => {
    useConfig(cfg({}, { orderIdCol: '' }));
    const items = insightsOf(await run(mixed()));
    expect(items).toHaveLength(5);
    expect(items[4].id).toBe('data-quality');
    expect(items[4].iconKey).toBe('quality');
  });

  it('命中率 = 命中数 / 总行数', async () => {
    const items = insightsOf(await run(mixed()));
    const rate = items[0].metrics?.find((m) => m.label === '命中率');
    expect(rate?.value).toBeCloseTo(3 / 4, 10);
    expect(rate?.unit).toBe('%');
  });

  it('type-composition 各组金额之和 == 总损失（1e-6）', async () => {
    const res = await run(mixed());
    const items = insightsOf(res);
    const totalLoss = rowsOf(res).reduce((a, r) => a + Number(r.loss_amount ?? 0), 0);
    const groups = (items[1].metadata?.groups ?? []) as Array<{ loss: number }>;
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.reduce((a, g) => a + g.loss, 0)).toBeCloseTo(totalLoss, 6);
  });

  it('top-loss-orders 条目数 == min(topN, 命中数)', async () => {
    useConfig(cfg({ topN: 1 }));
    expect(((insightsOf(await run(mixed()))[3].metadata?.entries ?? []) as unknown[]).length).toBe(1);

    useConfig(cfg({ topN: 10 }));
    expect(((insightsOf(await run(mixed()))[3].metadata?.entries ?? []) as unknown[]).length).toBe(3);
  });
});

describe('Phase 2 displayConfig', () => {
  it('tabs 第二页按 is_abnormal === true 过滤', async () => {
    const tabs = (await run([hitRow()])).displayConfig?.tabs ?? [];
    expect(tabs[0].label).toBe('全量订单');
    expect(tabs[1].filterField).toBe('is_abnormal');
    expect(tabs[1].filterValue).toBe(true);
  });

  it('risk_level 用 risk_badge 格式化器', async () => {
    const fmt = (await run([hitRow()])).displayConfig?.columnFormatters ?? {};
    expect(fmt.risk_level?.type).toBe('risk_badge');
  });

  it('tooltips 覆盖 loss_amount 与 data_quality_flag', async () => {
    const tips = (await run([hitRow()])).displayConfig?.columnTooltips ?? {};
    expect(Object.keys(tips)).toEqual(expect.arrayContaining(['loss_amount', 'data_quality_flag']));
  });

  it('不设 defaultSort（行序唯一真值在 compareZeroNegativeRows）', async () => {
    expect((await run([hitRow()])).displayConfig?.defaultSort).toBeUndefined();
  });
});