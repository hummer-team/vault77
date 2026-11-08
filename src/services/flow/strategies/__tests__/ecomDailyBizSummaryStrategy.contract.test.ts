/**
 * Phase 0 单测 — fn_ecom_daily_biz_summary 契约层（计划 §Phase 0 测试矩阵）
 * 纯函数断言：默认配置 / 字典与正则 / 预填 / 质量短码 / 槽位同源 / 口径切换 / blockers。
 */
import { describe, it, expect } from 'vitest';
import {
  DAILY_BIZ_COLUMN_LABEL,
  DAILY_BIZ_FIELD_LABEL,
  DAILY_BIZ_FIELD_MATCH_ORDER,
  DAILY_BIZ_FIELD_MATCH_PATTERNS,
  DAILY_BIZ_RESERVED_COLS,
  DAILY_BIZ_SOURCE_COLS,
  DEFAULT_DAILY_BIZ_SUMMARY_CONFIG,
  applyDailyBizSalesCaliber,
  buildDailyBizFormulaPreview,
  cloneDailyBizSummaryConfig,
  collectDailyBizBlockers,
  dailyBizDefaultNetProfitSlots,
  dailyBizSlotHuman,
  dailyBizSlotSql,
  hasDailyBizCaliberConflict,
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

describe('Phase 0 — 默认配置', () => {
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

describe('Phase 0 — 字典完整性', () => {
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
});

describe('Phase 0 — 预填', () => {
  it('中文列名集合按正则唯一命中预填', () => {
    const mapped = matchDailyBizColumns(
      ['订单支付时间', '销售额', '订单号', '订单状态', '毛利额', '商品成本', '退款金额', '费用合计', '佣金', '运费', '服务费', '销量'],
      DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping,
    );
    expect(mapped.orderDateCol).toBe('订单支付时间');
    expect(mapped.salesCol).toBe('销售额');
    expect(mapped.orderIdCol).toBe('订单号');
    expect(mapped.quantityCol).toBe('销量');
  });

  it('英文列名集合按正则唯一命中预填', () => {
    const mapped = matchDailyBizColumns(
      ['order_date', 'net_amount', 'order_id', 'order_status', 'gross_profit', 'cost', 'refund_amount',
        'fee_total', 'commission_fee', 'shipping_fee', 'service_fee', 'quantity'],
      DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping,
    );
    expect(mapped.orderDateCol).toBe('order_date');
    expect(mapped.salesCol).toBe('net_amount');
    expect(mapped.feeTotalCol).toBe('fee_total');
    expect(mapped.serviceFeeCol).toBe('service_fee');
  });

  it('已填值不被覆盖', () => {
    const current = { ...DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping, salesCol: '自定义销售额' };
    const mapped = matchDailyBizColumns(['销售额', 'net_amount'], current);
    expect(mapped.salesCol).toBe('自定义销售额');
  });

  it('歧义列（同时命中 2 列）不写入', () => {
    const mapped = matchDailyBizColumns(['销售额', 'net_amount'], DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping);
    expect(mapped.salesCol).toBe('');
  });
});

describe('Phase 0 — 质量短码', () => {
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

describe('Phase 0 — 槽位同源（AC6）', () => {
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

describe('Phase 0 — 降级判定（Q9 / Q14 唯一真源）', () => {
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
});

describe('Phase 0 — 销售额口径切换（Q12）', () => {
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

describe('Phase 0 — blockers', () => {
  it('缺两个必填 → 2 条且次序固定', () => {
    const blockers = collectDailyBizBlockers(cloneDailyBizSummaryConfig());
    expect(blockers.map((b) => b.code)).toEqual(['no-order-date', 'no-sales-col']);
    expect(blockers[0].message).toContain('订单支付时间');
  });

  it('salesSlots 清空 → 追加 1 条', () => {
    const cfg = fullConfig();
    cfg.salesSlots = [];
    const codes = collectDailyBizBlockers(cfg).map((b) => b.code);
    expect(codes).toEqual(['no-sales-slot']);
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
