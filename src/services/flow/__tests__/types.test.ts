/**
 * Type Tests for Flow Service
 * Tests for type definitions and enums
 */

import { describe, it, expect } from 'vitest';
import {
  FlowNodeType,
  JoinType,
  OperatorType,
  LogicType,
  FieldType,
  ValidationSeverity,
  DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
  DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG,
  DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS,
  SUSPICIOUS_ORDER_RULE_KEYS,
  SUSPICIOUS_RULE_LABEL,
  SUSPICIOUS_FIELD_MATCH_PATTERNS,
  blockingValidationErrors,
  collectActivitySplitBlockers,
  cloneSuspiciousOrderDetectConfig,
  collectSuspiciousOrderBlockers,
  collectSkippedRules,
  collectEffectiveRules,
  buildScoreCalibration,
  parseRefundStatusValues,
  type SuspiciousOrderDetectConfig,
  type ValidationError,
} from '../types';

describe('Flow Enums', () => {
  describe('FlowNodeType', () => {
    it('should have correct node types', () => {
      expect(FlowNodeType.DATA_SOURCE).toBe('dataSource');
      expect(FlowNodeType.TABLE).toBe('table');
      expect(FlowNodeType.JOIN).toBe('join');
      expect(FlowNodeType.CONDITION).toBe('condition');
      expect(FlowNodeType.CONDITION_GROUP_RELATION).toBe('conditionGroupRelation');
      expect(FlowNodeType.CONDITION_GROUP_DEFINITION).toBe('conditionGroupDefinition');
      expect(FlowNodeType.SELECT).toBe('select');
      expect(FlowNodeType.SELECT_AGG).toBe('selectAgg');
      expect(FlowNodeType.END).toBe('end');
    });
  });

  describe('JoinType', () => {
    it('should have correct join types', () => {
      expect(JoinType.INNER).toBe('INNER');
      expect(JoinType.LEFT).toBe('LEFT');
      expect(JoinType.RIGHT).toBe('RIGHT');
      expect(JoinType.CROSS).toBe('CROSS');
    });
  });

  describe('OperatorType', () => {
    it('should have correct operator types', () => {
      expect(OperatorType.ASSOCIATION).toBe('association');
      expect(OperatorType.ANOMALY).toBe('anomaly');
      expect(OperatorType.CLUSTERING).toBe('clustering');
    });
  });

  describe('LogicType', () => {
    it('should have correct logic types', () => {
      expect(LogicType.AND).toBe('AND');
      expect(LogicType.OR).toBe('OR');
    });
  });

  describe('FieldType', () => {
    it('should have all field types defined', () => {
      expect(FieldType.INTEGER).toBe('INTEGER');
      expect(FieldType.VARCHAR).toBe('VARCHAR');
      expect(FieldType.TIMESTAMP).toBe('TIMESTAMP');
      expect(FieldType.BOOLEAN).toBe('BOOLEAN');
      expect(FieldType.UNKNOWN).toBe('UNKNOWN');
    });
  });

  describe('ValidationSeverity', () => {
    it('should have correct severity levels', () => {
      expect(ValidationSeverity.ERROR).toBe('error');
      expect(ValidationSeverity.WARNING).toBe('warning');
    });
  });
});

describe('blockingValidationErrors（阻断判据唯一真值）', () => {
  const err = (severity: ValidationSeverity, message: string): ValidationError => ({
    nodeId: 'n1',
    nodeType: FlowNodeType.SELECT,
    message,
    severity,
  });

  it('WARNING 不阻断执行，ERROR 阻断', () => {
    const warningsOnly = [err(ValidationSeverity.WARNING, '成本费用项均未选择')];
    expect(blockingValidationErrors(warningsOnly)).toHaveLength(0);
    const mixed = [...warningsOnly, err(ValidationSeverity.ERROR, '请指定订单实付金额列')];
    expect(blockingValidationErrors(mixed).map((e) => e.message)).toEqual(['请指定订单实付金额列']);
  });

  it('undefined / 空数组 → 无阻断', () => {
    expect(blockingValidationErrors(undefined)).toHaveLength(0);
    expect(blockingValidationErrors([])).toHaveLength(0);
  });
});

describe('collectActivitySplitBlockers（阻断判据三处同源）', () => {
  it('默认配置：三维度缺列 + 缺实付金额列，均带业务化中文文案', () => {
    const codes = collectActivitySplitBlockers(DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG).map((b) => b.code);
    expect(codes).toEqual(['missing-dimension-column', 'missing-dimension-column', 'missing-dimension-column', 'no-net-amount']);
    expect(collectActivitySplitBlockers(DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG)[0].message).toBe('活动维度尚未指定数据列');
  });

  it('规则 4 与两条补充规则纳入阻断判据（抽屉门禁与 isUdfConfigured 不再漏判）', () => {
    const base = {
      ...DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
      dimensions: ['activity'] as const,
    };
    const cfg = {
      ...base,
      dimensions: ['activity' as const],
      fieldMapping: { ...base.fieldMapping, activityIdCol: '活动ID', netAmountCol: '实付金额' },
    };
    expect(collectActivitySplitBlockers(cfg)).toHaveLength(0);
    expect(
      collectActivitySplitBlockers({ ...cfg, liftCaliber: 'baseline_delta' }).map((b) => b.code),
    ).toEqual(['baseline-time-missing']);
    expect(
      collectActivitySplitBlockers({ ...cfg, liftCaliber: 'product_amount' }).map((b) => b.code),
    ).toEqual(['product-amount-missing']);
    expect(
      collectActivitySplitBlockers({ ...cfg, costCaliber: 'single_column' }).map((b) => b.code),
    ).toEqual(['single-column-missing']);
    // 维度全取消时缺列规则随之为空，只剩「请至少选择一个拆分维度」（实付金额已映射）
    expect(collectActivitySplitBlockers({ ...cfg, dimensions: [] }).map((b) => b.code)).toEqual(['no-dimension']);
  });

  it('未保存配置（undefined）按默认配置判定', () => {
    expect(collectActivitySplitBlockers(undefined).map((b) => b.code)).toContain('no-net-amount');
  });
});

// ============================================================================
// fn_ecom_suspicious_order_detect（feature 15 · Phase 0）
// 口径说明：0.7 表中 `no-user-id` / `no-order-time` 是「列未映射」判据，默认配置尚未映射，
// 因此默认配置的「自洽」指**数值类默认值**全部合法（抽屉打开即自动预填主体列，不会被数值阻断）。
// 断言只针对 `code`，文案可微调。
// ============================================================================

/** 默认配置深拷贝 + 两列必填已映射（数值默认值自洽的判定基线） */
const suspCfg = (): SuspiciousOrderDetectConfig => {
  const c = cloneSuspiciousOrderDetectConfig(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG);
  c.fieldMapping.userIdCol = '用户ID';
  c.fieldMapping.orderTimeCol = '订单支付时间';
  return c;
};

/** 11 列全映射（覆盖三态判据的基线） */
const suspCfgAllMapped = (): SuspiciousOrderDetectConfig => {
  const c = suspCfg();
  c.fieldMapping.addressCol = '收货地址';
  c.fieldMapping.mobileCol = '收货手机';
  c.fieldMapping.deviceCol = '设备号';
  c.fieldMapping.amountCol = 'pay_amount';
  c.fieldMapping.originalAmountCol = 'list_price';
  c.fieldMapping.orderIdCol = '订单号';
  c.fieldMapping.orderStatusCol = '订单状态';
  c.fieldMapping.registerTimeCol = '注册时间';
  c.fieldMapping.firstOrderTimeCol = '首单时间';
  return c;
};

const suspCodes = (cfg?: SuspiciousOrderDetectConfig) => collectSuspiciousOrderBlockers(cfg).map((b) => b.code);

describe('collectSuspiciousOrderBlockers（阻断判据三处同源）', () => {
  it('默认值自洽：数值类默认值全部合法，不会「打开即阻断」', () => {
    expect(suspCodes(suspCfg())).toEqual([]);
  });

  it('未保存配置（undefined）按默认配置判定，仅剩两列必填未映射', () => {
    expect(suspCodes(undefined)).toEqual(['no-user-id', 'no-order-time']);
  });

  it('userIdCol / orderTimeCol 为空', () => {
    const c = suspCfg();
    c.fieldMapping.userIdCol = '';
    expect(suspCodes(c)).toContain('no-user-id');
    const d = suspCfg();
    d.fieldMapping.orderTimeCol = '';
    expect(suspCodes(d)).toContain('no-order-time');
    const e = suspCfg();
    e.fieldMapping.orderTimeCol = '   ';
    expect(suspCodes(e)).toContain('no-order-time');
  });

  it('窗口 / 观察区间 / 地址前缀 / 突发单数非法', () => {
    const mk = (patch: (c: SuspiciousOrderDetectConfig) => void) => {
      const c = suspCfg();
      patch(c);
      return suspCodes(c);
    };
    expect(mk((c) => { c.windows.burstWindowMinutes = 0; })).toContain('burst-window-invalid');
    expect(mk((c) => { c.thresholds.burstOrderCount = 1; })).toContain('burst-count-invalid');
    expect(mk((c) => { c.thresholds.burstOrderCount = 2; })).not.toContain('burst-count-invalid');
    expect(mk((c) => { c.windows.clusterWindowMinutes = -5; })).toContain('cluster-window-invalid');
    expect(mk((c) => { c.thresholds.addressPrefixLength = 0; })).toContain('address-prefix-invalid');
    expect(mk((c) => { c.thresholds.addressPrefixLength = 41; })).toContain('address-prefix-invalid');
    expect(mk((c) => { c.windows.observationDays = -1; })).toContain('observation-days-invalid');
    expect(mk((c) => { c.windows.observationDays = 0; })).toEqual([]); // 0 = 全部数据，合法
  });

  it('阈值区间非法（计数 / 比例 / 百分率 / 倍数）', () => {
    const mk = (patch: (c: SuspiciousOrderDetectConfig) => void) => {
      const c = suspCfg();
      patch(c);
      return suspCodes(c);
    };
    expect(mk((c) => { c.thresholds.priceAnomalyMaxRatio = 0; })).toContain('threshold-non-positive');
    expect(mk((c) => { c.thresholds.priceAnomalyMaxRatio = 1.5; })).toContain('threshold-non-positive');
    expect(mk((c) => { c.thresholds.refundRatePercent = 0; })).toContain('threshold-non-positive');
    expect(mk((c) => { c.thresholds.newAccountMaxAgeDays = 0; })).toContain('threshold-non-positive');
    expect(mk((c) => { c.thresholds.newAccountMaxAgeDays = -1; })).toContain('threshold-non-positive');
    expect(mk((c) => { c.thresholds.amountDeviationMultiple = 0; })).toContain('threshold-non-positive');
    expect(mk((c) => { c.thresholds.addrClusterUsers = 0; })).toContain('threshold-non-positive');
  });

  it('权重越界 / 合计为 0 / 分档顺序 / topN 区间', () => {
    const mk = (patch: (c: SuspiciousOrderDetectConfig) => void) => {
      const c = suspCfg();
      patch(c);
      return suspCodes(c);
    };
    expect(mk((c) => { c.weights.burstOrders = -1; })).toContain('weight-out-of-range');
    expect(mk((c) => { c.weights.burstOrders = 101; })).toContain('weight-out-of-range');
    expect(mk((c) => { SUSPICIOUS_ORDER_RULE_KEYS.forEach((k) => { c.weights[k] = 0; }); })).toContain('weight-total-invalid');
    expect(mk((c) => { c.tiers = { severeScore: 60, highScore: 60, midScore: 40 }; })).toContain('tier-order-invalid');
    expect(mk((c) => { c.tiers = { severeScore: 101, highScore: 60, midScore: 40 }; })).toContain('tier-order-invalid');
    expect(mk((c) => { c.topN = 0; })).toContain('top-n-invalid');
    expect(mk((c) => { c.topN = 11; })).toContain('top-n-invalid');
  });

  it('多项同时非法时逐条上报（不短路）', () => {
    const c = suspCfg();
    c.fieldMapping.userIdCol = '';
    c.windows.burstWindowMinutes = 0;
    c.topN = 99;
    expect(suspCodes(c)).toEqual(['no-user-id', 'burst-window-invalid', 'top-n-invalid']);
  });
});

describe('cloneSuspiciousOrderDetectConfig / DEFAULT 常量', () => {
  it('克隆体与入参、嵌套引用均不共享；修改克隆体不污染 DEFAULT 单例', () => {
    const src = DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG;
    const c = cloneSuspiciousOrderDetectConfig(src);
    expect(c).not.toBe(src);
    expect(c.fieldMapping).not.toBe(src.fieldMapping);
    expect(c.thresholds).not.toBe(src.thresholds);
    expect(c.weights).not.toBe(src.weights);
    expect(c.ruleToggles).not.toBe(src.ruleToggles);
    c.fieldMapping.userIdCol = 'X';
    c.thresholds.burstOrderCount = 999;
    c.weights.burstOrders = 1;
    expect(src.fieldMapping.userIdCol).toBe('');
    expect(src.thresholds.burstOrderCount).toBe(10);
    expect(DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS.burstOrders).toBe(20);
  });

  it('DEFAULT 权重合计 100；核心 5 项开、增强 3 项关', () => {
    expect(SUSPICIOUS_ORDER_RULE_KEYS.reduce((s, k) => s + DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS[k], 0)).toBe(100);
    expect(Object.keys(SUSPICIOUS_RULE_LABEL)).toHaveLength(8);
    const t = DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.ruleToggles;
    expect([t.burstOrders, t.addressCluster, t.mobileCluster, t.deviceCluster, t.newAccounts]).toEqual([true, true, true, true, true]);
    expect([t.priceAnomaly, t.amountDeviation, t.refundAnomaly]).toEqual([false, false, false]);
    expect(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.windows)
      .toEqual({ burstWindowMinutes: 60, clusterWindowMinutes: 120, observationDays: 0 });
    expect(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.thresholds.addressPrefixLength).toBe(15);
  });

  it('refundStatusValues 中英双语默认值不可退化为纯英文', () => {
    const v = DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.refundStatusValues;
    expect(v).toContain('REFUNDED');
    expect(v).toContain('已退款');
  });
});

describe('SUSPICIOUS_FIELD_MATCH_PATTERNS（列名自动预填字典）', () => {
  const keys = Object.keys(SUSPICIOUS_FIELD_MATCH_PATTERNS).sort();

  it('键集合 === fieldMapping 键集合（11 项）', () => {
    expect(keys).toHaveLength(11);
    expect(keys).toEqual([
      'addressCol', 'amountCol', 'deviceCol', 'firstOrderTimeCol', 'mobileCol',
      'orderIdCol', 'orderStatusCol', 'orderTimeCol', 'originalAmountCol',
      'registerTimeCol', 'userIdCol',
    ]);
  });

  it('中英列名命中对应键', () => {
    const hit = (col: string) => keys.filter((k) => SUSPICIOUS_FIELD_MATCH_PATTERNS[k as keyof typeof SUSPICIOUS_FIELD_MATCH_PATTERNS].test(col));
    expect(hit('用户ID')).toContain('userIdCol');
    expect(hit('buyer_id')).toContain('userIdCol');
    expect(hit('订单支付时间')).toContain('orderTimeCol');
    expect(hit('create_time')).toContain('orderTimeCol');
    expect(hit('收货地址')).toContain('addressCol');
    expect(hit('收货手机')).toContain('mobileCol');
    expect(hit('设备号')).toContain('deviceCol');
    expect(hit('原价')).toContain('originalAmountCol');
    expect(hit('订单号')).toContain('orderIdCol');
    expect(hit('order_status')).toContain('orderStatusCol');
    expect(hit('注册时间')).toContain('registerTimeCol');
    expect(hit('首单时间')).toContain('firstOrderTimeCol');
  });

  it('实付列不命中原价列（唯一命中口径）', () => {
    expect(SUSPICIOUS_FIELD_MATCH_PATTERNS.amountCol.test('pay_amount')).toBe(true);
    expect(SUSPICIOUS_FIELD_MATCH_PATTERNS.originalAmountCol.test('pay_amount')).toBe(false);
    expect(SUSPICIOUS_FIELD_MATCH_PATTERNS.orderTimeCol.test('pay_amount')).toBe(false);
  });

  it('pay_time 与 payment_time 同时命中下单时间列（多候选场景可复现）', () => {
    expect(SUSPICIOUS_FIELD_MATCH_PATTERNS.orderTimeCol.test('pay_time')).toBe(true);
    expect(SUSPICIOUS_FIELD_MATCH_PATTERNS.orderTimeCol.test('payment_time')).toBe(true);
  });
});

describe('buildScoreCalibration / parseRefundStatusValues（打分与规则口径）', () => {
  it('默认权重：1/2/3/4/5/8 项 → [20 低, 40 中, 55 中, 70 高, 80 严重, …, 100 严重]', () => {
    const cal = buildScoreCalibration(DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS, DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.tiers);
    expect(cal.map((r) => r.maxScore)).toEqual([20, 40, 55, 70, 80, 90, 95, 100]);
    expect(cal.map((r) => r.level)).toEqual(['低', '中', '中', '高', '严重', '严重', '严重', '严重']);
    expect(cal.map((r) => r.hitCount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('自定义权重 {burstOrders:100, 其余 0} → 命中 1 项即严重', () => {
    const w = { ...DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS };
    w.burstOrders = 100;
    SUSPICIOUS_ORDER_RULE_KEYS.forEach((k) => { if (k !== 'burstOrders') w[k] = 0; });
    const cal = buildScoreCalibration(w, DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.tiers);
    expect(cal[0]).toEqual({ hitCount: 1, maxScore: 100, level: '严重' });
  });

  it('合计超过 100 时与 SQL 同口径夹取 100', () => {
    const w = { ...DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS };
    SUSPICIOUS_ORDER_RULE_KEYS.forEach((k) => { w[k] = 50; });
    expect(buildScoreCalibration(w, DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG.tiers).at(-1)!.maxScore).toBe(100);
  });

  it('退款状态值：去空白、过滤空项、大写', () => {
    expect(parseRefundStatusValues(' Refunded , 已退款 ,, ')).toEqual(['REFUNDED', '已退款']);
    expect(parseRefundStatusValues(' , ,')).toEqual([]);
  });
});

describe('collectSkippedRules / collectEffectiveRules（生效规则唯一判据）', () => {
  it('依赖列缺失 → 跳过；主动关闭 → 不算跳过', () => {
    const c = suspCfg();
    c.ruleToggles.priceAnomaly = true;
    expect(collectSkippedRules(c)).toContain('priceAnomaly');
    c.ruleToggles.priceAnomaly = false;
    expect(collectSkippedRules(c)).not.toContain('priceAnomaly');
    // R5 三级链兜底，永不跳过
    const d = suspCfg();
    d.ruleToggles.newAccounts = true;
    expect(collectSkippedRules(d)).not.toContain('newAccounts');
  });

  it('R8 额外要求退款状态值非空', () => {
    const c = suspCfgAllMapped();
    c.ruleToggles.refundAnomaly = true;
    c.refundStatusValues = ' , , ';
    expect(collectSkippedRules(c)).toContain('refundAnomaly');
    c.refundStatusValues = '已退款';
    expect(collectSkippedRules(c)).not.toContain('refundAnomaly');
  });

  it('默认配置 + 11 列全映射 → closed 三项、skipped 空、effective 5 项', () => {
    const cov = collectEffectiveRules(suspCfgAllMapped());
    expect(cov.total).toBe(8);
    expect(cov.closed).toEqual(['priceAnomaly', 'amountDeviation', 'refundAnomaly']);
    expect(cov.skipped).toEqual([]);
    expect(cov.effective).toHaveLength(5);
    expect(cov.effective).toContain('burstOrders');
    expect(cov.effective).toContain('newAccounts');
  });

  it('8 项全开 + 全映射 → effective 8 项；缺地址/手机/设备 → skipped 3 项、effective 2 项', () => {
    const all = suspCfgAllMapped();
    SUSPICIOUS_ORDER_RULE_KEYS.forEach((k) => { all.ruleToggles[k] = true; });
    const covAll = collectEffectiveRules(all);
    expect(covAll.effective).toHaveLength(8);
    expect(covAll.closed).toEqual([]);
    expect(covAll.skipped).toEqual([]);

    const degraded = suspCfg(); // 核心 5 项开，地址/手机/设备未映射
    const covDeg = collectEffectiveRules(degraded);
    expect(covDeg.skipped).toEqual(['addressCluster', 'mobileCluster', 'deviceCluster']);
    expect(covDeg.effective).toHaveLength(2);
    expect(covDeg.closed).toHaveLength(3);
  });

  it('不变量：closed + skipped + effective === 8 且 skipped 与 collectSkippedRules 逐项相等', () => {
    const variants: SuspiciousOrderDetectConfig[] = [];
    variants.push(suspCfg());
    const all = suspCfgAllMapped();
    SUSPICIOUS_ORDER_RULE_KEYS.forEach((k) => { all.ruleToggles[k] = true; });
    variants.push(all);
    const off = suspCfgAllMapped();
    (['burstOrders', 'addressCluster', 'mobileCluster', 'deviceCluster', 'newAccounts'] as const)
      .forEach((k) => { off.ruleToggles[k] = false; });
    variants.push(off);

    for (const cfg of variants) {
      const cov = collectEffectiveRules(cfg);
      expect(cov.closed.length + cov.skipped.length + cov.effective.length).toBe(8);
      expect(cov.skipped).toEqual(collectSkippedRules(cfg));
      // 「生效 8/8」只能在全开全映射时出现
      if (cov.effective.length === 8) expect(cov.closed.length + cov.skipped.length).toBe(0);
    }
  });
});
