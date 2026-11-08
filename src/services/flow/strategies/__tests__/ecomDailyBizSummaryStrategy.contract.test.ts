/**
 * Phase 0 单测 — fn_ecom_daily_biz_summary 契约层（计划 §Phase 0 测试矩阵，编号 1–9）
 * 纯函数断言：默认配置 / 字典与正则 / 预填与负例与歧义 / 质量短码 / 槽位同源 /
 * 费用可用性（六条）/ 口径切换 / blockers 分级（三场景）/ 槽位求值与 AC3 恒等。
 */
import { describe, it, expect } from 'vitest';
import {
  DAILY_BIZ_AMOUNT_GUARDED_FIELDS,
  DAILY_BIZ_COLUMN_LABEL,
  DAILY_BIZ_FIELD_LABEL,
  DAILY_BIZ_FIELD_MATCH_ORDER,
  DAILY_BIZ_FIELD_MATCH_PATTERNS,
  DAILY_BIZ_NO_FEE_COL_MESSAGE,
  DAILY_BIZ_RESERVED_COLS,
  DAILY_BIZ_SOURCE_COL_FIELD,
  DAILY_BIZ_SOURCE_COLS,
  DEFAULT_DAILY_BIZ_SUMMARY_CONFIG,
  applyDailyBizSalesCaliber,
  buildDailyBizFormulaPreview,
  cloneDailyBizSummaryConfig,
  collectDailyBizBlockers,
  dailyBizBlockingErrors,
  dailyBizDefaultNetProfitSlots,
  dailyBizFeeItemsMapped,
  dailyBizSlotHuman,
  dailyBizSlotSql,
  evalDailyBizSlot,
  hasDailyBizCaliberConflict,
  hasDailyBizFeeSource,
  isDailyBizNetProfitEdited,
  isDailyBizSlotColumnAllowed,
  joinDailyBizQuality,
  matchDailyBizColumns,
  resolveDailyBizFeeSlots,
  resolveDailyBizProfitSlots,
  resolveDailyBizQualityCodes,
  type DailyBizFieldKey,
  type DailyBizQualityCode,
} from '../ecomDailyBizSummaryStrategy';
import type { DailyBizSummaryConfig } from '../../types';

/** 全字段就绪的基线配置（用于隔离降级与阻断） */
const fullConfig = (): DailyBizSummaryConfig => {
  const cfg = cloneDailyBizSummaryConfig();
  cfg.fieldMapping = {
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
    quantityCol: '数量',
  };
  return cfg;
};

/** 金额类槽位清单（负例断言范围：任一项都不得被预填） */
const AMOUNT_SLOTS: readonly DailyBizFieldKey[] = [
  'salesCol', 'grossProfitCol', 'costCol', 'refundAmountCol',
  'feeTotalCol', 'commissionFeeCol', 'shippingFeeCol', 'serviceFeeCol',
];

describe('Phase 0 · 1 — 默认配置', () => {
  it('口径与对比默认值符合决策', () => {
    const cfg = DEFAULT_DAILY_BIZ_SUMMARY_CONFIG;
    expect(cfg.salesCaliber).toBe('gross');
    expect(cfg.feeCaliber).toBe('single_column');
    expect(cfg.compareMode).toBe('day');
    expect(cfg.excludeStatusValues.split(',')).toHaveLength(8);
  });

  it('四组槽位默认值与约定 §2 完全一致', () => {
    const cfg = DEFAULT_DAILY_BIZ_SUMMARY_CONFIG;
    expect(cfg.salesSlots).toEqual([{ operator: '+', column: 'net_amount' }]);
    expect(cfg.profitSlots).toEqual([{ operator: '+', column: 'gross_profit' }]);
    expect(cfg.netProfitSlots).toEqual([
      { operator: '+', column: 'sales' },
      { operator: '-', column: 'refund_amount' },
      { operator: '-', column: 'fee_total' },
    ]);
    expect(cfg.feeSlots).toEqual([
      { operator: '+', column: 'commission_fee' },
      { operator: '+', column: 'shipping_fee' },
      { operator: '+', column: 'service_fee' },
    ]);
  });

  it('clone 深拷贝：改副本不影响默认配置', () => {
    const copy = cloneDailyBizSummaryConfig();
    copy.salesSlots[0].column = 'quantity';
    copy.netProfitSlots.push({ operator: '+', column: 'profit' });
    (copy.fieldMapping as Record<string, string>).salesCol = 'x';
    expect(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.salesSlots[0].column).toBe('net_amount');
    expect(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.netProfitSlots).toHaveLength(3);
    expect(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping.salesCol).toBe('');
  });
});

describe('Phase 0 · 2 — 字典完整性', () => {
  it('匹配次序覆盖 fieldMapping 全部 12 键且无重复', () => {
    const keys = Object.keys(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping);
    expect(keys).toHaveLength(12);
    expect([...DAILY_BIZ_FIELD_MATCH_ORDER].sort()).toEqual([...keys].sort());
    expect(new Set(DAILY_BIZ_FIELD_MATCH_ORDER).size).toBe(12);
  });

  it('标签字典键齐全', () => {
    const fieldKeys = Object.keys(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping);
    expect(Object.keys(DAILY_BIZ_FIELD_LABEL).sort()).toEqual([...fieldKeys].sort());
    for (const col of DAILY_BIZ_SOURCE_COLS) expect(DAILY_BIZ_COLUMN_LABEL[col]).toBeTruthy();
    for (const col of DAILY_BIZ_RESERVED_COLS) expect(DAILY_BIZ_COLUMN_LABEL[col]).toBeTruthy();
  });

  const SAMPLES: Record<DailyBizFieldKey, [string, string]> = {
    orderDateCol: ['订单支付时间', 'order_date'],
    salesCol: ['销售额', 'net_amount'],
    orderIdCol: ['订单号', 'order_id'],
    orderStatusCol: ['订单状态', 'status'],
    grossProfitCol: ['毛利额', 'gross_profit'],
    costCol: ['商品成本', 'cost'],
    refundAmountCol: ['退款金额', 'refund_amount'],
    feeTotalCol: ['费用合计', 'fee_total'],
    commissionFeeCol: ['佣金', 'commission'],
    shippingFeeCol: ['运费', 'shipping_fee'],
    serviceFeeCol: ['服务费', 'service_fee'],
    quantityCol: ['销量', 'quantity'],
  };

  it('12 条正则各 ≥2 样例（中文 + 英文）命中，无关列名不命中', () => {
    for (const key of DAILY_BIZ_FIELD_MATCH_ORDER) {
      const [zh, en] = SAMPLES[key];
      expect(DAILY_BIZ_FIELD_MATCH_PATTERNS[key].test(zh), `${key} 应命中 ${zh}`).toBe(true);
      expect(DAILY_BIZ_FIELD_MATCH_PATTERNS[key].test(en), `${key} 应命中 ${en}`).toBe(true);
    }
    for (const noise of ['remark', '备注']) {
      for (const key of DAILY_BIZ_FIELD_MATCH_ORDER) {
        expect(DAILY_BIZ_FIELD_MATCH_PATTERNS[key].test(noise), `${key} 不应命中 ${noise}`).toBe(false);
      }
    }
  });

  it('金额类字段的正则 source 必含金额词根（词典层约束，非候选列层）', () => {
    expect(DAILY_BIZ_AMOUNT_GUARDED_FIELDS).toHaveLength(8);
    for (const field of DAILY_BIZ_AMOUNT_GUARDED_FIELDS) {
      expect(DAILY_BIZ_FIELD_MATCH_ORDER).toContain(field);
      expect(DAILY_BIZ_FIELD_MATCH_PATTERNS[field].source).toMatch(/(金额|额|费|价|利|amount|amt|fee|cost)/i);
    }
  });
});

describe('Phase 0 · 3 — 预填与负例（Issue 4）', () => {
  it('中文列名集合按正则唯一命中预填', () => {
    const { mapping } = matchDailyBizColumns(
      ['订单支付时间', '销售额', '订单号', '订单状态', '毛利额', '商品成本', '退款金额', '费用合计', '佣金', '运费', '服务费', '销量'],
      DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping,
    );
    expect(mapping.orderDateCol).toBe('订单支付时间');
    expect(mapping.salesCol).toBe('销售额');
    expect(mapping.orderIdCol).toBe('订单号');
    expect(mapping.quantityCol).toBe('销量');
  });

  it('英文列名集合按正则唯一命中预填', () => {
    const { mapping } = matchDailyBizColumns(
      ['order_date', 'net_amount', 'order_id', 'order_status', 'gross_profit', 'cost', 'refund_amount',
        'fee_total', 'commission_fee', 'shipping_fee', 'service_fee', 'quantity'],
      DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping,
    );
    expect(mapping.orderDateCol).toBe('order_date');
    expect(mapping.salesCol).toBe('net_amount');
    expect(mapping.feeTotalCol).toBe('fee_total');
    expect(mapping.serviceFeeCol).toBe('service_fee');
  });

  it('已填值不被覆盖', () => {
    const current = { ...DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping, salesCol: '自定义销售额' };
    const { mapping } = matchDailyBizColumns(['销售额', 'net_amount'], current);
    expect(mapping.salesCol).toBe('自定义销售额');
  });

  it('4 条负例（退款状态 / 退款原因 / 毛利率 / 成本占比）不写入任何金额类槽位', () => {
    const { mapping } = matchDailyBizColumns(
      ['退款状态', '退款原因', '毛利率', '成本占比'],
      DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping,
    );
    for (const slot of AMOUNT_SLOTS) expect(mapping[slot] ?? '', `${slot} 不应被预填`).toBe('');
  });

  it('歧义（≥2 候选）不猜：refundAmountCol 保持为空并回报候选清单', () => {
    const result = matchDailyBizColumns(
      ['退款金额', '退款金额合计'],
      DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping,
    );
    expect(result.mapping.refundAmountCol).toBe('');
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0].field).toBe('refundAmountCol');
    expect(result.ambiguous[0].candidates).toEqual(['退款金额', '退款金额合计']);
  });

  it('歧义列（同时命中 2 列）不写入', () => {
    const { mapping } = matchDailyBizColumns(['销售额', 'net_amount'], DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping);
    expect(mapping.salesCol).toBe('');
  });
});

describe('Phase 0 · 4 — 质量短码', () => {
  it('4 码全缺 → 固定次序拼接', () => {
    const codes = resolveDailyBizQualityCodes(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG);
    expect(joinDailyBizQuality(codes)).toBe('ROW_LEVEL+NO_STATUS_FILTER+NO_PROFIT_COL+NULL_AMOUNT');
  });

  it('逐项消除后次序与拼接不变；全齐 → OK', () => {
    const cfg = fullConfig();
    expect(joinDailyBizQuality(resolveDailyBizQualityCodes(cfg))).toBe('OK');

    cfg.fieldMapping.orderIdCol = '';
    expect(joinDailyBizQuality(resolveDailyBizQualityCodes(cfg))).toBe('ROW_LEVEL');

    cfg.fieldMapping.refundAmountCol = '';
    expect(joinDailyBizQuality(resolveDailyBizQualityCodes(cfg))).toBe('ROW_LEVEL+NULL_AMOUNT');

    cfg.excludeStatusValues = '';
    expect(joinDailyBizQuality(resolveDailyBizQualityCodes(cfg))).toBe('ROW_LEVEL+NO_STATUS_FILTER+NULL_AMOUNT');
  });

  it('乱序输入仍按固定次序输出', () => {
    const shuffled: DailyBizQualityCode[] = ['NULL_AMOUNT', 'NO_PROFIT_COL', 'ROW_LEVEL'];
    expect(joinDailyBizQuality(shuffled)).toBe('ROW_LEVEL+NO_PROFIT_COL+NULL_AMOUNT');
  });
});

describe('Phase 0 · 5 — 槽位同源（AC6）', () => {
  it('空槽位同时为空', () => {
    const empty = [{ operator: '+' as const, column: '' }];
    expect(dailyBizSlotSql(empty)).toBe('NULL::DOUBLE');
    expect(dailyBizSlotHuman(empty)).toBe('?');
  });

  it('非空槽位同时非空，运算符与前缀符号正确', () => {
    const slots = [
      { operator: '-' as const, column: 'refund_amount' },
      { operator: '+' as const, column: 'fee_total_src' },
    ];
    expect(dailyBizSlotSql(slots)).toBe('-COALESCE("refund_amount", 0) + COALESCE("fee_total_src", 0)');
    expect(dailyBizSlotHuman(slots)).toBe('-退款金额 + 费用合计');
  });

  it('源集合含 fee_total_src 且不含裸 fee_total；保留名可翻成人话', () => {
    expect(DAILY_BIZ_SOURCE_COLS).toContain('fee_total_src');
    expect(DAILY_BIZ_SOURCE_COLS).not.toContain('fee_total');
    expect(dailyBizSlotHuman([{ operator: '+', column: 'fee_total' }])).toBe('费用合计');
    expect(isDailyBizSlotColumnAllowed('salesSlots', 'fee_total')).toBe(false);
    expect(isDailyBizSlotColumnAllowed('netProfitSlots', 'fee_total')).toBe(true);
    expect(isDailyBizSlotColumnAllowed('profitSlots', 'profit')).toBe(false);
  });
});

describe('Phase 0 · 6 — 降级判定与费用可用性（Q9 / Q14 / Issue 3）', () => {
  it('毛利三态：有毛利列 / 仅成本列 / 两路都缺', () => {
    const withGross = fullConfig();
    expect(resolveDailyBizProfitSlots(withGross)).toEqual([{ operator: '+', column: 'gross_profit' }]);

    const costOnly = fullConfig();
    costOnly.fieldMapping.grossProfitCol = '';
    expect(resolveDailyBizProfitSlots(costOnly)).toEqual([
      { operator: '+', column: 'sales' },
      { operator: '-', column: 'cost_amount' },
    ]);

    const none = fullConfig();
    none.fieldMapping.grossProfitCol = '';
    none.fieldMapping.costCol = '';
    expect(resolveDailyBizProfitSlots(none)).toHaveLength(0);
  });

  it('费用两态：分项有效取分项，否则回落合计列', () => {
    const cfg = fullConfig();
    cfg.feeCaliber = 'slot_sum';
    expect(resolveDailyBizFeeSlots(cfg)).toHaveLength(3);

    cfg.feeSlots = [];
    expect(resolveDailyBizFeeSlots(cfg)).toHaveLength(0);

    cfg.feeCaliber = 'single_column';
    expect(resolveDailyBizFeeSlots(fullConfig())).toHaveLength(0);
  });

  it('hasDailyBizFeeSource 六条（严格按约定 §3.2 表）', () => {
    // ① single_column + 合计列已映射 → true
    const a = cloneDailyBizSummaryConfig();
    a.fieldMapping = { ...a.fieldMapping, feeTotalCol: '费用合计' };
    a.feeCaliber = 'single_column';
    expect(hasDailyBizFeeSource(a)).toBe(true);

    // ② single_column + 合计列未映射 → false
    expect(hasDailyBizFeeSource(cloneDailyBizSummaryConfig())).toBe(false);

    // ③ slot_sum + 分项引用的列已映射 → true（映射表生效判据）
    expect(DAILY_BIZ_SOURCE_COL_FIELD.commission_fee).toBe('commissionFeeCol');
    const c = cloneDailyBizSummaryConfig();
    c.feeCaliber = 'slot_sum';
    c.feeSlots = [{ operator: '+', column: 'commission_fee' }];
    c.fieldMapping = { ...c.fieldMapping, commissionFeeCol: '佣金' };
    expect(hasDailyBizFeeSource(c)).toBe(true);

    // ④ slot_sum + 分项为空 + 合计列已映射 → true（既有兜底保留）
    const d = cloneDailyBizSummaryConfig();
    d.feeCaliber = 'slot_sum';
    d.feeSlots = [];
    d.fieldMapping = { ...d.fieldMapping, feeTotalCol: '费用合计' };
    expect(hasDailyBizFeeSource(d)).toBe(true);

    // ⑤ slot_sum + 分项为空 + 合计列未映射 → false
    const e = cloneDailyBizSummaryConfig();
    e.feeCaliber = 'slot_sum';
    e.feeSlots = [];
    e.fieldMapping = { ...e.fieldMapping, feeTotalCol: '' };
    expect(hasDailyBizFeeSource(e)).toBe(false);

    // ⑥ 判定看「映射」不看槽位数组长度
    const f = cloneDailyBizSummaryConfig();
    f.feeCaliber = 'slot_sum';
    f.feeSlots = [{ operator: '+', column: 'commission_fee' }];
    f.fieldMapping = { ...f.fieldMapping, commissionFeeCol: '', feeTotalCol: '费用合计' };
    expect(hasDailyBizFeeSource(f)).toBe(true);
    expect(dailyBizFeeItemsMapped(f)).toBe(false);
  });

  it('DAILY_BIZ_SOURCE_COL_FIELD 覆盖 12 个别名且值为合法字段键', () => {
    expect(Object.keys(DAILY_BIZ_SOURCE_COL_FIELD)).toHaveLength(12);
    expect(Object.keys(DAILY_BIZ_SOURCE_COL_FIELD).sort()).toEqual([...DAILY_BIZ_SOURCE_COLS].sort());
    const fieldKeys = Object.keys(DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping);
    for (const value of Object.values(DAILY_BIZ_SOURCE_COL_FIELD)) expect(fieldKeys).toContain(value);
  });
});

describe('Phase 0 · 7 — 销售额口径切换（Q12）', () => {
  it('未编辑时切到净额 → 重建为 [销售额, −费用合计]', () => {
    const cfg = fullConfig();
    expect(isDailyBizNetProfitEdited(cfg)).toBe(false);
    const next = applyDailyBizSalesCaliber(cfg, 'net');
    expect(next.salesCaliber).toBe('net');
    expect(next.netProfitSlots).toEqual([
      { operator: '+', column: 'sales' },
      { operator: '-', column: 'fee_total' },
    ]);
    expect(hasDailyBizCaliberConflict(next)).toBe(false);
  });

  it('已编辑后切换不覆盖，且冲突可见', () => {
    const cfg = fullConfig();
    cfg.netProfitSlots = [
      { operator: '+', column: 'sales' },
      { operator: '-', column: 'refund_amount' },
      { operator: '-', column: 'fee_total' },
      { operator: '-', column: 'service_fee' },
    ];
    expect(isDailyBizNetProfitEdited(cfg)).toBe(true);
    const next = applyDailyBizSalesCaliber(cfg, 'net');
    expect(next.netProfitSlots).toHaveLength(4);
    expect(hasDailyBizCaliberConflict(next)).toBe(true);
  });

  it('默认净利槽位随口径取值', () => {
    expect(dailyBizDefaultNetProfitSlots('net')).toHaveLength(2);
    expect(dailyBizDefaultNetProfitSlots('gross')).toHaveLength(3);
  });
});

describe('Phase 0 · 8 — blockers 与分级（Issue 3，三场景独立）', () => {
  it('场景 A：缺必填 → 2 条 error + 1 条 no-fee-col warning（末位）', () => {
    const cfg = cloneDailyBizSummaryConfig();
    const blockers = collectDailyBizBlockers(cfg);
    expect(blockers.filter((b) => b.severity === 'error').map((b) => b.code)).toEqual(['no-order-date', 'no-sales-col']);
    expect(dailyBizBlockingErrors(cfg)).toHaveLength(2);
    expect(blockers.map((b) => b.code)).toEqual(['no-order-date', 'no-sales-col', 'no-fee-col']);
    expect(blockers[2].severity).toBe('warning');
    expect(blockers[2].message).toBe(DAILY_BIZ_NO_FEE_COL_MESSAGE);
    expect(blockers[0].message).toContain('订单支付时间');
  });

  it('场景 B：必填齐备但费用列不可用 → 仅 1 条 warning，门禁 ERROR = 0', () => {
    const cfg = cloneDailyBizSummaryConfig();
    cfg.fieldMapping = { ...cfg.fieldMapping, orderDateCol: '订单支付时间', salesCol: '销售额' };
    cfg.feeCaliber = 'single_column';
    cfg.fieldMapping.feeTotalCol = '';
    const blockers = collectDailyBizBlockers(cfg);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].code).toBe('no-fee-col');
    expect(blockers[0].severity).toBe('warning');
    expect(dailyBizBlockingErrors(cfg)).toHaveLength(0);
  });

  it('场景 C：分项口径无任何已映射列 → no-fee-slot(error) + no-fee-col 末位', () => {
    const cfg = cloneDailyBizSummaryConfig();
    cfg.fieldMapping = { ...cfg.fieldMapping, orderDateCol: '订单支付时间', salesCol: '销售额', feeTotalCol: '' };
    cfg.feeCaliber = 'slot_sum';
    cfg.feeSlots = [];
    const codes = collectDailyBizBlockers(cfg).map((b) => b.code);
    expect(codes).toContain('no-fee-slot');
    expect(codes[codes.length - 1]).toBe('no-fee-col');
    expect(dailyBizBlockingErrors(cfg)).toHaveLength(1);
  });

  it('salesSlots 清空 → 追加 1 条 error', () => {
    const cfg = fullConfig();
    cfg.salesSlots = [];
    expect(collectDailyBizBlockers(cfg).map((b) => b.code)).toEqual(['no-sales-slot']);
  });

  it('费用分项口径下清空分项 → 追加 no-fee-slot；合计口径不追加', () => {
    const cfg = fullConfig();
    cfg.feeCaliber = 'slot_sum';
    cfg.feeSlots = [];
    expect(collectDailyBizBlockers(cfg).map((b) => b.code)).toEqual(['no-fee-slot']);

    cfg.feeCaliber = 'single_column';
    expect(collectDailyBizBlockers(cfg)).toHaveLength(0);
  });

  it('降级不阻断：缺毛利/退款/状态/订单号列时无 blocker', () => {
    const cfg = fullConfig();
    cfg.fieldMapping.grossProfitCol = '';
    cfg.fieldMapping.costCol = '';
    cfg.fieldMapping.refundAmountCol = '';
    cfg.fieldMapping.orderIdCol = '';
    cfg.fieldMapping.orderStatusCol = '';
    expect(collectDailyBizBlockers(cfg)).toHaveLength(0);
  });
});

describe('Phase 0 · 9 — 槽位求值（AC3 数值侧）', () => {
  const X = { sales: 1000, refund_amount: 120, fee_total: 80 };

  it('gross 分支求值为 800', () => {
    const gross = [
      { operator: '+' as const, column: 'sales' },
      { operator: '-' as const, column: 'refund_amount' },
      { operator: '-' as const, column: 'fee_total' },
    ];
    expect(evalDailyBizSlot(gross, X)).toBe(800);
  });

  it('net − gross === refundAmount（容差 0，符号方向固定）', () => {
    const gross = dailyBizDefaultNetProfitSlots('gross');
    const net = dailyBizDefaultNetProfitSlots('net');
    const netValue = evalDailyBizSlot(net, X);
    const grossValue = evalDailyBizSlot(gross, X);
    expect(netValue).toBe(920);
    expect(netValue === null || grossValue === null ? null : netValue - grossValue).toBe(120);
  });

  it('空槽位 → null；缺键按 0 计；越界列按 0 计', () => {
    expect(evalDailyBizSlot([], X)).toBeNull();
    expect(evalDailyBizSlot([{ operator: '+', column: '' }], X)).toBeNull();
    expect(evalDailyBizSlot([{ operator: '+', column: 'sales' }, { operator: '-', column: 'gross_profit' }], X)).toBe(1000);
    expect(evalDailyBizSlot([{ operator: '+', column: 'sales' }, { operator: '-', column: 'fee_total' }], { sales: 100 })).toBe(100);
  });
});

describe('Phase 0 — 公式预览', () => {
  it('预览与人话同源，含四行 SQL 明细', () => {
    const preview = buildDailyBizFormulaPreview(fullConfig());
    expect(preview.salesHuman).toBe('销售额（实收）');
    expect(preview.profitHuman).toBe('毛利额');
    expect(preview.netProfitHuman).toBe('销售额 - 退款金额 - 费用合计');
    expect(preview.feeHuman).toBe('费用合计');
    expect(preview.salesSql).toContain('net_amount');
    expect(preview.sqlLines).toHaveLength(4);
  });

  it('毛利降级时预览与降级结果一致', () => {
    const cfg = fullConfig();
    cfg.fieldMapping.grossProfitCol = '';
    const preview = buildDailyBizFormulaPreview(cfg);
    expect(preview.profitHuman).toBe(dailyBizSlotHuman(resolveDailyBizProfitSlots(cfg)));
    expect(preview.profitHuman).toBe('销售额 - 商品成本');
  });
});
