/**
 * Phase 0 单测 — fn_ecom_zero_negative_order_detect 契约层（计划 §Phase 0 测试矩阵）
 * 全部断言纯数据与纯函数，不依赖 SQL、不依赖 DuckDB。
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG,
  DEFAULT_ZERO_NEGATIVE_RULES,
  ZERO_NEGATIVE_DERIVED_COLS,
  ZERO_NEGATIVE_RULE_KEYS,
  ZERO_NEGATIVE_RULE_LABEL,
  ZERO_NEGATIVE_RULE_PRIORITY,
  ZERO_NEGATIVE_SOURCE_COLS,
  buildZeroNegativeFormulaPreview,
  buildZeroNegativeSqlPreviewLines,
  cloneZeroNegativeOrderDetectConfig,
  collectEnabledZeroNegativeRules,
  collectZeroNegativeBlockers,
  collectZeroNegativeRuleCoverage,
  collectZeroNegativeSkippedRules,
  compareZeroNegativeRows,
  joinZeroNegativeQuality,
  matchZeroNegativeColumns,
  parseRefundStatusValues,
  resolveZeroNegativeThresholds,
  riskLevelFromLoss,
  type ZeroNegativeFieldMapping,
  type ZeroNegativeOrderDetectConfig,
  type ZeroNegativeRuleKey,
} from '../../types';

/** 13 槽全映射的合法映射（blockers 用例的地基） */
const VALID_MAPPING: ZeroNegativeFieldMapping = {
  orderIdCol: 'order_id',
  orderTimeCol: 'order_time',
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
  exemptionCol: 'exemption',
};

/** 合法配置：默认配置 + 必填列已映射 */
function validCfg(patch: Partial<ZeroNegativeOrderDetectConfig> = {}): ZeroNegativeOrderDetectConfig {
  const base = cloneZeroNegativeOrderDetectConfig(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
  return { ...base, fieldMapping: { ...VALID_MAPPING }, ...patch };
}

const emptyMapping: ZeroNegativeFieldMapping = {
  orderIdCol: '', orderTimeCol: '', orderStatusCol: '',
  payAmountCol: '', productAmountCol: '', discountTotalCol: '',
  quantityCol: '', unitPriceCol: '',
  couponAmountCol: '', platformDiscountCol: '', merchantDiscountCol: '',
  refundAmountCol: '', exemptionCol: '',
};

const blockerCodes = (cfg: ZeroNegativeOrderDetectConfig): string[] =>
  collectZeroNegativeBlockers(cfg).map((b) => b.code);

describe('Phase 0 契约 — 默认配置快照', () => {
  it('核心 6 条默认开启，增强 2 条不在生效集', () => {
    const enabled = collectEnabledZeroNegativeRules(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    expect(enabled).toEqual([
      'zero_pay', 'negative_pay', 'negative_unit_price',
      'discount_overflow', 'negative_field', 'amount_mismatch',
    ]);
    expect(enabled).not.toContain('discount_sum_mismatch');
    expect(enabled).not.toContain('penny_order');
  });

  it('阈值 / 档位 / 窗口 / 开关 / topN 默认值固定', () => {
    const cfg = DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG;
    expect(cfg.thresholds).toEqual({ toleranceYuan: 0.01, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.01 });
    expect(cfg.tiers).toEqual({ criticalYuan: 500, highYuan: 100, mediumYuan: 10, ruleCountUpgrade: 3 });
    expect(cfg.windows.observationDays).toBe(0);
    expect(cfg.includeOverflowLoss).toBe(true);
    expect(cfg.topN).toBe(5);
    expect(cfg.exemptionValues).toBe('');
  });

  it('默认剔除状态解析为 10 项且中英并存', () => {
    const values = parseRefundStatusValues(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG.excludeStatusValues);
    expect(values).toHaveLength(10);
    expect(values).toContain('已取消');
    expect(values).toContain('CANCELLED');
  });

  it('默认槽位引用的列全部落在「源列 ∪ 派生列」白名单内，且应付组只用源列', () => {
    const allowed = new Set<string>([...ZERO_NEGATIVE_SOURCE_COLS, ...ZERO_NEGATIVE_DERIVED_COLS]);
    const sourceOnly = new Set<string>(ZERO_NEGATIVE_SOURCE_COLS);
    const { expectedSlots, lossSlots } = DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG.formula;
    for (const slot of [...expectedSlots, ...lossSlots]) expect(allowed.has(slot.column)).toBe(true);
    for (const slot of expectedSlots) expect(sourceOnly.has(slot.column)).toBe(true);
    expect(lossSlots.map((s) => s.column)).toEqual(['expected_amount', 'net_pay_amount']);
  });

  it('默认事件表字段齐全：8 条规则均有中文名与短码', () => {
    expect(ZERO_NEGATIVE_RULE_KEYS).toHaveLength(8);
    for (const key of ZERO_NEGATIVE_RULE_KEYS) {
      expect(ZERO_NEGATIVE_RULE_LABEL[key]).toBeTruthy();
      expect(ZERO_NEGATIVE_RULE_PRIORITY).toContain(key);
    }
    expect(new Set(ZERO_NEGATIVE_RULE_PRIORITY).size).toBe(8);
  });
});

describe('Phase 0 契约 — enabledRules 三态', () => {
  it('undefined 回落六核心', () => {
    const cfg = validCfg({ enabledRules: undefined });
    expect(collectEnabledZeroNegativeRules(cfg)).toEqual(DEFAULT_ZERO_NEGATIVE_RULES);
  });

  it('空数组阻断（no-enabled-rule）', () => {
    expect(blockerCodes(validCfg({ enabledRules: [] }))).toEqual(['no-enabled-rule']);
  });

  it('单条启用时生效集恰为该条', () => {
    expect(collectEnabledZeroNegativeRules(validCfg({ enabledRules: ['penny_order'] }))).toEqual(['penny_order']);
  });

  it('未知键被过滤且不抛错', () => {
    const cfg = validCfg({ enabledRules: ['not_a_rule' as ZeroNegativeRuleKey, 'zero_pay'] });
    expect(collectEnabledZeroNegativeRules(cfg)).toEqual(['zero_pay']);
  });
});

describe('Phase 0 契约 — blockers 边界', () => {
  it('三个必填列各自缺失各报 1 条对应 code', () => {
    expect(blockerCodes(validCfg({ fieldMapping: { ...VALID_MAPPING, payAmountCol: '' } })))
      .toEqual(['no-pay-amount']);
    expect(blockerCodes(validCfg({ fieldMapping: { ...VALID_MAPPING, productAmountCol: '' } })))
      .toEqual(['no-product-amount']);
    expect(blockerCodes(validCfg({ fieldMapping: { ...VALID_MAPPING, discountTotalCol: '' } })))
      .toEqual(['no-discount-total']);
  });

  it('缺 payAmountCol 时不叠加 no-loss-slot 级联噪声', () => {
    const codes = blockerCodes(validCfg({ fieldMapping: { ...VALID_MAPPING, payAmountCol: '' } }));
    expect(codes).not.toContain('no-loss-slot');
    expect(codes).not.toContain('no-expected-slot');
  });

  it('阈值非有限或负数报 invalid-threshold', () => {
    expect(blockerCodes(validCfg({ thresholds: { toleranceYuan: -1, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.01 } })))
      .toContain('invalid-threshold');
    expect(blockerCodes(validCfg({ thresholds: { toleranceYuan: NaN, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.01 } })))
      .toContain('invalid-threshold');
  });

  it('档位逆序或 ruleCountUpgrade < 1 报 invalid-risk-tiers', () => {
    expect(blockerCodes(validCfg({ tiers: { criticalYuan: 10, highYuan: 100, mediumYuan: 500, ruleCountUpgrade: 3 } })))
      .toContain('invalid-risk-tiers');
    expect(blockerCodes(validCfg({ tiers: { criticalYuan: 500, highYuan: 100, mediumYuan: 10, ruleCountUpgrade: 0 } })))
      .toContain('invalid-risk-tiers');
  });

  it('observationDays 负数与 topN 越界各有专属 code', () => {
    expect(blockerCodes(validCfg({ windows: { observationDays: -1 } }))).toContain('invalid-observation-days');
    expect(blockerCodes(validCfg({ topN: 0 }))).toContain('invalid-top-n');
    expect(blockerCodes(validCfg({ topN: 11 }))).toContain('invalid-top-n');
  });

  it('清空槽位首项报 no-expected-slot / no-loss-slot', () => {
    expect(blockerCodes(validCfg({ formula: { expectedSlots: [], lossSlots: validCfg().formula.lossSlots } })))
      .toEqual(['no-expected-slot']);
    expect(blockerCodes(validCfg({ formula: { expectedSlots: validCfg().formula.expectedSlots, lossSlots: [] } })))
      .toEqual(['no-loss-slot']);
  });

  it('完全合法配置无阻断', () => {
    expect(collectZeroNegativeBlockers(validCfg())).toHaveLength(0);
  });

  it('缺配置兜底为默认配置的判定（不抛错）', () => {
    expect(collectZeroNegativeBlockers(undefined).length).toBeGreaterThan(0);
  });
});

describe('Phase 0 契约 — skippedRules 边界', () => {
  it('R7 三分项缺一列即跳过', () => {
    const cfg = validCfg({
      enabledRules: ['discount_sum_mismatch'],
      fieldMapping: { ...VALID_MAPPING, merchantDiscountCol: '' },
    });
    expect(collectZeroNegativeSkippedRules(cfg)).toEqual(['discount_sum_mismatch']);
  });

  it('R7 三列齐备不跳过', () => {
    expect(collectZeroNegativeSkippedRules(validCfg({ enabledRules: ['discount_sum_mismatch'] }))).toEqual([]);
  });

  it('R3 仅映射数量列即可判定（不跳过）', () => {
    const cfg = validCfg({
      enabledRules: ['negative_unit_price'],
      fieldMapping: { ...VALID_MAPPING, unitPriceCol: '' },
    });
    expect(collectZeroNegativeSkippedRules(cfg)).toEqual([]);
  });

  it('R3 单价与数量两列皆空才跳过', () => {
    const cfg = validCfg({
      enabledRules: ['negative_unit_price'],
      fieldMapping: { ...VALID_MAPPING, unitPriceCol: '', quantityCol: '' },
    });
    expect(collectZeroNegativeSkippedRules(cfg)).toEqual(['negative_unit_price']);
  });

  it('R3 两列齐备不跳过', () => {
    expect(collectZeroNegativeSkippedRules(validCfg({ enabledRules: ['negative_unit_price'] }))).toEqual([]);
  });

  it('必填列齐备时 R1/R2/R4/R5/R6 永不进 skipped', () => {
    const cfg = validCfg({
      enabledRules: ['zero_pay', 'negative_pay', 'discount_overflow', 'negative_field', 'amount_mismatch'],
    });
    expect(collectZeroNegativeSkippedRules(cfg)).toEqual([]);
  });

  it('未启用的规则即使缺列也不进 skipped', () => {
    const cfg = validCfg({
      enabledRules: ['zero_pay'],
      fieldMapping: { ...VALID_MAPPING, couponAmountCol: '', platformDiscountCol: '', merchantDiscountCol: '' },
    });
    expect(collectZeroNegativeSkippedRules(cfg)).toEqual([]);
  });
});

describe('Phase 0 契约 — 覆盖三态', () => {
  it('closed / skipped / effective 互斥且并集为全集', () => {
    const cfg = validCfg({
      enabledRules: ['zero_pay', 'negative_pay', 'discount_sum_mismatch'],
      fieldMapping: { ...VALID_MAPPING, couponAmountCol: '' },
    });
    const coverage = collectZeroNegativeRuleCoverage(cfg);
    expect(coverage.total).toBe(8);
    expect(coverage.skipped).toEqual(['discount_sum_mismatch']);
    expect(coverage.effective).toEqual(['zero_pay', 'negative_pay']);
    expect(coverage.closed).toHaveLength(5);
    const union = new Set([...coverage.closed, ...coverage.skipped, ...coverage.effective]);
    expect(union.size).toBe(8);
    for (const key of coverage.closed) expect(coverage.effective).not.toContain(key);
  });

  it('用户主动关闭的规则不计入生效集', () => {
    const coverage = collectZeroNegativeRuleCoverage(validCfg({ enabledRules: ['zero_pay'] }));
    expect(coverage.effective).toEqual(['zero_pay']);
    expect(coverage.closed).not.toContain('zero_pay');
    expect(coverage.closed).toContain('penny_order');
  });
});

describe('Phase 0 契约 — 主类型优先级（根因优先）', () => {
  const primary = (hits: ZeroNegativeRuleKey[]): ZeroNegativeRuleKey | undefined =>
    ZERO_NEGATIVE_RULE_PRIORITY.find((key) => hits.indexOf(key) >= 0);

  it('八标志全命中时主类型为 negative_field', () => {
    expect(primary([...ZERO_NEGATIVE_RULE_KEYS])).toBe('negative_field');
  });

  it('R7 + R8 命中时主类型为 penny_order', () => {
    expect(primary(['discount_sum_mismatch', 'penny_order'])).toBe('penny_order');
  });

  it('R1 + R6 命中时主类型为 zero_pay', () => {
    expect(primary(['zero_pay', 'amount_mismatch'])).toBe('zero_pay');
  });

  it('R2 优先于 R1/R4', () => {
    expect(primary(['zero_pay', 'negative_pay', 'discount_overflow'])).toBe('negative_pay');
  });
});

describe('Phase 0 契约 — 质量短码拼接', () => {
  it('空集为 OK', () => {
    expect(joinZeroNegativeQuality([])).toBe('OK');
    expect(joinZeroNegativeQuality([null, undefined])).toBe('OK');
  });

  it('按固定次序归一拼接', () => {
    expect(joinZeroNegativeQuality(['PARTIAL_RULES', 'ROW_LEVEL'])).toBe('ROW_LEVEL+PARTIAL_RULES');
  });

  it('三码齐全', () => {
    expect(joinZeroNegativeQuality(['ROW_LEVEL', 'PARTIAL_RULES', 'NULL_AMOUNT']))
      .toBe('ROW_LEVEL+PARTIAL_RULES+NULL_AMOUNT');
  });

  it('重复码去重', () => {
    expect(joinZeroNegativeQuality(['ROW_LEVEL', 'ROW_LEVEL'])).toBe('ROW_LEVEL');
  });
});

describe('Phase 0 契约 — 正则表驱动预填', () => {
  it('中文列名命中 13 个槽位', () => {
    const columns = [
      '订单号', '支付时间', '订单状态', '实付金额', '商品金额', '优惠合计', '数量', '单价',
      '优惠券金额', '平台补贴', '商家优惠', '退款金额', '订单类型',
    ];
    const matched = matchZeroNegativeColumns(columns, { ...emptyMapping });
    expect(matched).toEqual({
      orderIdCol: '订单号',
      orderTimeCol: '支付时间',
      orderStatusCol: '订单状态',
      payAmountCol: '实付金额',
      productAmountCol: '商品金额',
      discountTotalCol: '优惠合计',
      quantityCol: '数量',
      unitPriceCol: '单价',
      couponAmountCol: '优惠券金额',
      platformDiscountCol: '平台补贴',
      merchantDiscountCol: '商家优惠',
      refundAmountCol: '退款金额',
      exemptionCol: '订单类型',
    });
  });

  it('英文列名命中 13 个槽位', () => {
    const columns = [
      'order_id', 'paid_at', 'order_status', 'pay_amount', 'product_amount', 'discount_total',
      'quantity', 'unit_price', 'coupon_amount', 'platform_discount', 'merchant_discount',
      'refund_amount', 'order_type',
    ];
    const matched = matchZeroNegativeColumns(columns, { ...emptyMapping });
    expect(matched).toEqual({
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
    });
  });

  it('更精确的优惠券列先被消费，不被优惠合计抢占', () => {
    const matched = matchZeroNegativeColumns(['coupon_discount_amount'], { ...emptyMapping });
    expect(matched.couponAmountCol).toBe('coupon_discount_amount');
    expect(matched.discountTotalCol).toBe('');
  });

  it('同一槽出现两个候选时不预填（唯一命中才写）', () => {
    const matched = matchZeroNegativeColumns(['优惠合计', '优惠总额'], { ...emptyMapping });
    expect(matched.discountTotalCol).toBe('');
  });

  it('槽位已有值时不被覆盖', () => {
    const matched = matchZeroNegativeColumns(['实付金额', '商品金额'], {
      ...emptyMapping,
      payAmountCol: '自定义列',
    });
    expect(matched.payAmountCol).toBe('自定义列');
    expect(matched.productAmountCol).toBe('商品金额');
  });
});

describe('Phase 0 契约 — riskLevelFromLoss 双因子分档', () => {
  const tiers = DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG.tiers;

  it('金额档边界', () => {
    expect(riskLevelFromLoss(499.99, 1, tiers).level).toBe('高');
    expect(riskLevelFromLoss(500, 1, tiers).level).toBe('严重');
    expect(riskLevelFromLoss(100, 1, tiers).level).toBe('高');
    expect(riskLevelFromLoss(10, 1, tiers).level).toBe('中');
    expect(riskLevelFromLoss(9.99, 1, tiers).level).toBe('低');
  });

  it('低档命中 3 类升一档为中', () => {
    expect(riskLevelFromLoss(9.99, 3, tiers)).toEqual({ level: '中', order: 2 });
  });

  it('严重档不越界（封顶）', () => {
    expect(riskLevelFromLoss(1000, 8, tiers)).toEqual({ level: '严重', order: 0 });
  });

  it('命中类数不足不升级', () => {
    expect(riskLevelFromLoss(9.99, 2, tiers).level).toBe('低');
  });
});

describe('Phase 0 契约 — compareZeroNegativeRows 行序', () => {
  it('严重排在低之前', () => {
    const severe = { risk_level: '严重', loss_amount: 1, order_id: 'A' };
    const low = { risk_level: '低', loss_amount: 9999, order_id: 'B' };
    expect(compareZeroNegativeRows(severe, low)).toBeLessThan(0);
  });

  it('同等级按损失金额降序', () => {
    const rows = [
      { risk_level: '高', loss_amount: 100, order_id: 'A' },
      { risk_level: '高', loss_amount: 300, order_id: 'B' },
      { risk_level: '高', loss_amount: 200, order_id: 'C' },
    ];
    expect([...rows].sort(compareZeroNegativeRows).map((r) => r.order_id)).toEqual(['B', 'C', 'A']);
  });

  it('完全并列时按 order_id 升序且 null 结果稳定', () => {
    const rows = [
      { risk_level: '低', loss_amount: 1, order_id: 'B' },
      { risk_level: '低', loss_amount: 1, order_id: null },
      { risk_level: '低', loss_amount: 1, order_id: 'A' },
    ];
    const first = [...rows].sort(compareZeroNegativeRows).map((r) => String(r.order_id ?? ''));
    const second = [...rows].sort(compareZeroNegativeRows).map((r) => String(r.order_id ?? ''));
    expect(first).toEqual(['', 'A', 'B']);
    expect(second).toEqual(first);
  });
});

describe('Phase 0 契约 — 公式预览纯函数', () => {
  it('默认配置人话含业务列中文名', () => {
    const preview = buildZeroNegativeFormulaPreview(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    expect(preview.expectedHuman).toContain('商品金额');
    expect(preview.expectedHuman).toContain('优惠合计');
    expect(preview.lossHuman).toContain('应付金额');
    expect(preview.lossHuman).toContain('净实付金额');
  });

  it('SQL 行复用槽位拼装规则', () => {
    const preview = buildZeroNegativeFormulaPreview(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    expect(preview.expectedSql).toContain('COALESCE');
    expect(preview.expectedSql).toBe('COALESCE(product_amount, 0) - COALESCE(discount_total, 0)');
    expect(preview.lossSql).toBe('COALESCE(expected_amount, 0) - COALESCE(net_pay_amount, 0)');
  });

  it('SQL 预览折叠行与真实执行 SQL 同源（不含 COALESCE(COALESCE(）', () => {
    const preview = buildZeroNegativeFormulaPreview(DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG);
    const text = preview.sqlLines.join('\n');
    expect(preview.sqlLines).toHaveLength(2);
    expect(text).not.toContain('COALESCE(COALESCE(');
    expect(text).toContain('GREATEST(0,');
    expect(preview.sqlLines[0]).toBe('(COALESCE(product_amount, 0) - COALESCE(discount_total, 0)) AS expected_amount');
    expect(preview.sqlLines[1]).toContain('GREATEST(0, (COALESCE(expected_amount, 0) - COALESCE(net_pay_amount, 0)))');
  });

  it('SQL 预览行随 includeOverflowLoss 开关带上超额优惠项', () => {
    const off = buildZeroNegativeFormulaPreview(validCfg({ includeOverflowLoss: false }));
    expect(off.sqlLines[1].endsWith('+ 0 AS loss_amount')).toBe(true);
    const on = buildZeroNegativeFormulaPreview(validCfg({ includeOverflowLoss: true }));
    expect(on.sqlLines[1]).toContain('GREATEST(0, -expected_amount) AS loss_amount');
  });

  it('SQL 预览行纯函数与引用处纹理一致', () => {
    expect(buildZeroNegativeSqlPreviewLines('A - B', 'E - N', true)).toEqual([
      '(A - B) AS expected_amount',
      'GREATEST(0, (E - N)) + GREATEST(0, -expected_amount) AS loss_amount',
    ]);
  });

  it('未配置列回落 ? 而非 undefined', () => {
    const cfg = validCfg({ formula: { expectedSlots: [{ operator: '+', column: '' }], lossSlots: [] } });
    const preview = buildZeroNegativeFormulaPreview(cfg);
    expect(preview.expectedHuman).toBe('?');
    expect(preview.lossHuman).toBe('?');
    expect(preview.expectedHuman).not.toContain('undefined');
  });

  it('槽位改序后预览操作符序列跟随槽位', () => {
    const cfg = validCfg({
      formula: {
        expectedSlots: [
          { operator: '+', column: 'product_amount' },
          { operator: '-', column: 'discount_total' },
          { operator: '+', column: 'refund_amount' },
        ],
        lossSlots: validCfg().formula.lossSlots,
      },
    });
    expect(buildZeroNegativeFormulaPreview(cfg).expectedSql)
      .toBe('COALESCE(product_amount, 0) - COALESCE(discount_total, 0) + COALESCE(refund_amount, 0)');
  });
});

describe('Phase 0 契约 — 阈值归一与克隆隔离', () => {
  it('resolveZeroNegativeThresholds 对 NaN/负数回落默认值', () => {
    const resolved = resolveZeroNegativeThresholds(validCfg({
      thresholds: { toleranceYuan: NaN, mismatchMinYuan: -1, pennyOrderMaxYuan: 0.5 },
    }));
    expect(resolved).toEqual({ toleranceYuan: 0.01, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.5 });
    expect(Number.isNaN(resolveZeroNegativeThresholds(undefined).toleranceYuan)).toBe(false);
  });

  it('克隆后修改槽位与档位不影响原配置', () => {
    const origin = validCfg();
    const clone = cloneZeroNegativeOrderDetectConfig(origin);
    clone.formula.expectedSlots[0].column = 'mutated';
    clone.tiers.criticalYuan = 1;
    clone.fieldMapping.payAmountCol = 'mutated';
    expect(origin.formula.expectedSlots[0].column).toBe('product_amount');
    expect(origin.tiers.criticalYuan).toBe(500);
    expect(origin.fieldMapping.payAmountCol).toBe('pay_amount');
  });

  it('克隆后修改 enabledRules 数组不影响原配置', () => {
    const origin = validCfg();
    const clone = cloneZeroNegativeOrderDetectConfig(origin);
    clone.enabledRules?.push('penny_order');
    expect(origin.enabledRules).not.toContain('penny_order');
  });
});