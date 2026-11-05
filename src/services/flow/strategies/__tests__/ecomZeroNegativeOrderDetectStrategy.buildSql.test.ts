/**
 * Phase 1 单测 — fn_ecom_zero_negative_order_detect SQL 生成层（计划 §Phase 1 测试矩阵）
 * 全部断言基于生成的 SQL 文本与纯函数，不连接真实 DuckDB。
 */
import { describe, it, expect } from 'vitest';
import {
  EcomZeroNegativeOrderDetectStrategy,
  DEGRADE_SQL,
  ZERO_NEGATIVE_FLAG_COL,
  buildCalcCte,
  computeZeroNegativeGates,
} from '../ecomZeroNegativeOrderDetectStrategy';
import {
  DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG,
  FlowNodeType,
  ValidationSeverity,
  ZERO_NEGATIVE_RULE_KEYS,
  cloneZeroNegativeOrderDetectConfig,
  type FlowNode,
  type ZeroNegativeFieldMapping,
  type ZeroNegativeOrderDetectConfig,
} from '../../types';

const strategy = new EcomZeroNegativeOrderDetectStrategy();

const makeNodes = (config?: ZeroNegativeOrderDetectConfig): FlowNode[] => [
  { id: 't1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 'ecom_orders' } } as FlowNode,
  {
    id: 's1',
    type: FlowNodeType.SELECT,
    position: { x: 100, y: 0 },
    data: config ? { zeroNegativeDetectConfig: config } : {},
  } as FlowNode,
];

/** 绕过 `protected` 直接驱动 SQL 拼装 */
const build = (config: ZeroNegativeOrderDetectConfig | undefined, userWhere = ''): string =>
  (
    strategy as unknown as {
      buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string;
    }
  ).buildOperatorSql(makeNodes(config), [], undefined, userWhere);

/** 只保留表节点（无 SELECT → 降级 / validate 空集） */
const tableOnlyNodes = (): FlowNode[] => [makeNodes()[0]];

const lastConfig = (): unknown =>
  (strategy as unknown as { _lastConfig: unknown })._lastConfig;

/** 默认配置 + 全列映射，再浅覆盖 */
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

/** 取某段 CTE 的文本切片（按段名到下一段名） */
const cteSlice = (sql: string, name: string): string => {
  const start = sql.indexOf(`${name} AS (`);
  if (start < 0) return '';
  const next = sql.indexOf(' AS (', start + name.length + 6);
  return next < 0 ? sql.slice(start) : sql.slice(start, next);
};

const countOf = (sql: string, needle: string): number => sql.split(needle).length - 1;

describe('Phase 1 降级路径', () => {
  it('无 TABLE 节点返回 DEGRADE_SQL', () => {
    const nodes = [makeNodes(cfg())[1]];
    const sql = (
      strategy as unknown as {
        buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string;
      }
    ).buildOperatorSql(nodes, [], undefined, '');
    expect(sql).toBe(DEGRADE_SQL);
  });

  it('无配置返回 DEGRADE_SQL 且 _lastConfig 归 null', () => {
    expect(build(cfg())).not.toBe(DEGRADE_SQL);
    expect(lastConfig()).not.toBeNull();
    expect(build(undefined)).toBe(DEGRADE_SQL);
    expect(lastConfig()).toBeNull();
  });

  it('含 blocker（缺商品金额列）返回 DEGRADE_SQL', () => {
    expect(build(cfg({}, { productAmountCol: '' }))).toBe(DEGRADE_SQL);
  });

  it('降级 SQL 不含 WITH 与分号', () => {
    expect(DEGRADE_SQL).not.toContain('WITH');
    expect(DEGRADE_SQL).not.toContain(';');
  });
});

describe('Phase 1 CTE 结构', () => {
  const sql = build(cfg());

  it('恰好 1 个 WITH 且零分号', () => {
    expect(countOf(sql, 'WITH ')).toBe(1);
    expect(sql).not.toContain(';');
  });

  it('7 段 CTE 齐全且次序正确', () => {
    const names = ['src_all', 'src_filtered', 'keyed', 'agg', 'base_calc', 'calc', 'judged'];
    const positions = names.map((n) => sql.indexOf(`${n} AS (`));
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('src_all 是第一个 CTE，judged 之后接最终 SELECT', () => {
    expect(sql.indexOf('src_all AS (')).toBeLessThan(sql.indexOf('src_filtered AS ('));
    expect(sql).toContain('FROM judged');
    expect(sql.indexOf('judged AS (')).toBeLessThan(sql.indexOf('FROM judged'));
  });
});

describe('Phase 1 userWhere 注入点唯一性', () => {
  it('注入到 src_all 的 FROM 之后、src_filtered 之前', () => {
    const sql = build(cfg(), 'WHERE "x" = 1');
    const from = sql.indexOf('FROM "ecom_orders"');
    const whereIdx = sql.indexOf('WHERE ("x" = 1)');
    expect(from).toBeGreaterThan(-1);
    expect(whereIdx).toBeGreaterThan(from);
    expect(whereIdx).toBeLessThan(sql.indexOf('src_filtered AS ('));
  });

  it('userWhere 片段在全 SQL 中只出现 1 次', () => {
    expect(countOf(build(cfg(), 'WHERE "x" = 1'), '"x" = 1')).toBe(1);
  });

  it('src_all 段内 WHERE 恰 1 次（其余条件不重复注入）', () => {
    expect(countOf(cteSlice(build(cfg(), 'WHERE "x" = 1'), 'src_all'), 'WHERE')).toBe(1);
  });

  it("userWhere 为空时 src_all 无 WHERE", () => {
    expect(countOf(cteSlice(build(cfg(), ''), 'src_all'), 'WHERE')).toBe(0);
  });
});

describe('Phase 1 列投影与标识符转义', () => {
  it('全列映射时逐列 CAST 出现', () => {
    const sql = build(cfg());
    for (const col of ['pay_amount', 'product_amount', 'discount_total', 'quantity', 'unit_price',
      'coupon_amount', 'platform_discount', 'merchant_discount', 'refund_amount']) {
      expect(sql).toContain(`CAST("${col}" AS DOUBLE) AS ${col}`);
    }
    expect(sql).toContain('CAST("order_id" AS VARCHAR) AS order_id');
    expect(sql).toContain('CAST("order_type" AS VARCHAR) AS exemption_value');
  });

  it('未映射可选列输出 CAST(NULL AS DOUBLE)', () => {
    const sql = build(cfg({}, { refundAmountCol: '', quantityCol: '' }));
    expect(sql).toContain('CAST(NULL AS DOUBLE) AS refund_amount');
    expect(sql).toContain('CAST(NULL AS DOUBLE) AS quantity');
  });

  it('中文列名被双引号包裹', () => {
    const sql = build(cfg({}, { payAmountCol: '实付金额', productAmountCol: '商品金额' }));
    expect(sql).toContain('CAST("实付金额" AS DOUBLE) AS pay_amount');
    expect(sql).toContain('CAST("商品金额" AS DOUBLE) AS product_amount');
  });

  it('列名中的双引号被转义为 ""（注入防护）', () => {
    const sql = build(cfg({}, { payAmountCol: 'pay"amount' }));
    expect(sql).toContain('"pay""amount"');
  });

  it('表名同样走转义', () => {
    const nodes = [
      { id: 't1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 'e"vil' } } as FlowNode,
      { id: 's1', type: FlowNodeType.SELECT, position: { x: 0, y: 0 }, data: { zeroNegativeDetectConfig: cfg() } } as FlowNode,
    ];
    const sql = (
      strategy as unknown as {
        buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string;
      }
    ).buildOperatorSql(nodes, [], undefined, '');
    expect(sql).toContain('FROM "e""vil"');
  });
});

describe('Phase 1 观察窗口', () => {
  it('observationDays 为 0 时不裁剪', () => {
    expect(build(cfg())).not.toContain('MAX(order_time_ms)');
  });

  it('observationDays 为 30 时按毫秒回溯', () => {
    expect(build(cfg({ windows: { observationDays: 30 } }))).toContain('- 2592000000');
  });

  it('orderTimeCol 未映射时即便 observationDays > 0 也不裁剪', () => {
    const sql = build(cfg({ windows: { observationDays: 30 } }, { orderTimeCol: '' }));
    expect(sql).not.toContain('MAX(order_time_ms)');
  });
});

describe('Phase 1 状态剔除', () => {
  it('默认配置出现 NOT IN 且含中文与英文值', () => {
    const sql = build(cfg());
    expect(sql).toContain('UPPER(TRIM(order_status)) NOT IN (');
    expect(sql).toContain("'已取消'");
    expect(sql).toContain("'CANCELLED'");
  });

  it('必含 order_status IS NULL OR（防 NULL 静默丢行回归）', () => {
    expect(build(cfg())).toContain('(order_status IS NULL OR UPPER(TRIM(order_status)) NOT IN (');
  });

  it('excludeStatusValues 为空串时不拼接', () => {
    expect(build(cfg({ excludeStatusValues: '' }))).not.toContain('NOT IN (');
  });

  it('orderStatusCol 未映射时不拼接', () => {
    expect(build(cfg({}, { orderStatusCol: '' }))).not.toContain('NOT IN (');
  });
});

describe('Phase 1 误报豁免', () => {
  it('豁免列与值齐备时按 IS NULL OR NOT IN 拼装', () => {
    const sql = build(cfg({ exemptionValues: '赠品,试用' }));
    expect(sql).toContain(
      "(exemption_value IS NULL OR UPPER(TRIM(exemption_value)) NOT IN ('赠品', '试用'))",
    );
  });

  it('exemptionValues 为空串时不拼接剔除条件', () => {
    expect(build(cfg())).not.toContain('exemption_value IS NULL OR');
  });
});

describe('Phase 1 NULL 金额门禁', () => {
  const sql = build(cfg());

  it('标记只取实付与商品金额两列', () => {
    expect(sql).toContain('(pay_amount IS NULL OR product_amount IS NULL) AS has_null_amount');
  });

  it('discount_total 不参与该标记', () => {
    const marker = sql.slice(sql.indexOf('AS has_null_amount') - 80, sql.indexOf('AS has_null_amount'));
    expect(marker).not.toContain('discount_total');
  });

  it('agg 段对整单做 BOOL_OR 汇总', () => {
    expect(cteSlice(sql, 'agg')).toContain('BOOL_OR(has_null_amount) AS has_null_amount');
  });

  it('生效规则判据统一追加 AND NOT has_null_amount', () => {
    expect(countOf(sql, 'AND NOT has_null_amount')).toBe(6);
  });
});

describe('Phase 1 订单键与聚合规则表', () => {
  const sql = build(cfg());

  it('order_id 为空时合成 ROW# 键', () => {
    expect(sql).toContain("'ROW#' || CAST(ROW_NUMBER() OVER () AS VARCHAR)");
  });

  it('GROUP BY order_key 恰 1 次', () => {
    expect(countOf(sql, 'GROUP BY order_key')).toBe(1);
  });

  it('聚合口径逐条落地', () => {
    expect(countOf(sql, 'MAX(pay_amount)')).toBe(1);
    expect(countOf(sql, 'SUM(product_amount)')).toBe(1);
    expect(countOf(sql, 'SUM(COALESCE(discount_total, 0))')).toBe(1);
    expect(countOf(sql, 'MIN(unit_price)')).toBe(1);
    expect(countOf(sql, 'MAX(refund_amount)')).toBe(1);
    expect(countOf(sql, 'SUM(quantity)')).toBe(1);
    expect(countOf(sql, 'MIN(order_time)')).toBe(1);
  });

  it('不输出 order_key', () => {
    expect(cteSlice(sql, 'agg')).not.toContain('AS order_key');
  });
});

describe('Phase 1 净实付与应付金额', () => {
  it('refundAmountCol 已映射时净实付抵减退款', () => {
    const sql = build(cfg());
    expect(sql).toContain('COALESCE(pay_amount, 0) - COALESCE(refund_amount, 0) AS net_pay_amount');
  });

  it('refundAmountCol 未映射时净实付无退款项', () => {
    const sql = build(cfg({}, { refundAmountCol: '' }));
    expect(sql).toContain('COALESCE(pay_amount, 0) AS net_pay_amount');
    expect(cteSlice(sql, 'base_calc')).not.toContain('refund_amount');
  });

  it('应付金额按默认槽位串联', () => {
    expect(build(cfg())).toContain(
      '(COALESCE(product_amount, 0) - COALESCE(discount_total, 0)) AS expected_amount',
    );
  });

  it('应付组拒绝引用派生列（不得自引用）', () => {
    const sql = build(cfg({
      formula: {
        expectedSlots: [{ operator: '+', column: 'expected_amount' }, { operator: '+', column: 'product_amount' }],
        lossSlots: [{ operator: '+', column: 'expected_amount' }],
      },
    }));
    const base = cteSlice(sql, 'base_calc');
    expect(base).toContain('(COALESCE(product_amount, 0)) AS expected_amount');
    expect(base).not.toContain('COALESCE(expected_amount');
  });
});

describe('Phase 1 损失公式三段式', () => {
  it('默认配置出现两次 GREATEST(0,', () => {
    expect(countOf(build(cfg()), 'GREATEST(0,')).toBe(2);
  });

  it('includeOverflowLoss 关闭后只剩主项且无超额项', () => {
    const sql = build(cfg({ includeOverflowLoss: false }));
    expect(countOf(sql, 'GREATEST(0,')).toBe(1);
    expect(sql).not.toContain('-expected_amount');
  });

  it('损失槽位改序后操作符序列跟随槽位', () => {
    const sql = build(cfg({
      formula: {
        expectedSlots: [{ operator: '+', column: 'product_amount' }, { operator: '-', column: 'discount_total' }],
        lossSlots: [
          { operator: '+', column: 'expected_amount' },
          { operator: '-', column: 'net_pay_amount' },
          { operator: '+', column: 'refund_amount' },
        ],
      },
    }));
    expect(sql).toContain(
      'GREATEST(0, (COALESCE(expected_amount, 0) - COALESCE(net_pay_amount, 0) + COALESCE(refund_amount, 0)))',
    );
  });
});

describe('Phase 1 规则门禁 gates', () => {
  it('8 个命中标志列恒齐', () => {
    const sql = build(cfg({ enabledRules: ['zero_pay'] }));
    for (const key of ZERO_NEGATIVE_RULE_KEYS) {
      expect(sql).toContain(`AS ${ZERO_NEGATIVE_FLAG_COL[key]}`);
    }
  });

  it('默认配置 6 条生效、增强 2 条固定 FALSE', () => {
    const sql = build(cfg());
    expect(sql).toContain(`FALSE AS ${ZERO_NEGATIVE_FLAG_COL.penny_order}`);
    expect(sql).toContain(`FALSE AS ${ZERO_NEGATIVE_FLAG_COL.discount_sum_mismatch}`);
  });

  it('关闭 penny_order 后其专属阈值字面量消失', () => {
    const withR8 = build(cfg({ enabledRules: [...ZERO_NEGATIVE_RULE_KEYS], thresholds: {
      toleranceYuan: 0.01, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.05,
    } }));
    expect(withR8).toContain(`pay_amount <= 0.05`);
    const withoutR8 = build(cfg({ enabledRules: ['zero_pay'], thresholds: {
      toleranceYuan: 0.01, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.05,
    } }));
    expect(withoutR8).not.toContain('0.05');
  });

  it('R7 缺分项列时固定 FALSE（自动跳过）', () => {
    const sql = build(cfg({ enabledRules: [...ZERO_NEGATIVE_RULE_KEYS] }, { merchantDiscountCol: '' }));
    expect(sql).toContain(`FALSE AS ${ZERO_NEGATIVE_FLAG_COL.discount_sum_mismatch}`);
  });

  it('computeZeroNegativeGates 与覆盖度同源', () => {
    const gates = computeZeroNegativeGates(cfg({ enabledRules: ['zero_pay', 'penny_order'] }));
    expect(gates.zero_pay).toBe(true);
    expect(gates.penny_order).toBe(true);
    expect(gates.negative_pay).toBe(false);
  });
});

describe('Phase 1 阈值内联', () => {
  it('toleranceYuan 以数字字面量出现在 R1/R4/R6/R7', () => {
    const sql = build(cfg({ enabledRules: [...ZERO_NEGATIVE_RULE_KEYS] }));
    expect(sql).toContain('ABS(pay_amount) <= 0.01 AND product_amount > 0');
    expect(sql).toContain('discount_total > product_amount + 0.01');
    expect(sql).toContain('ABS(pay_amount - expected_amount) > 0.01');
    expect(sql).toContain('ABS(coupon_amount + platform_discount + merchant_discount - discount_total) > 0.01');
  });

  it('NaN 阈值在拼接层回落默认值且不产生 NaN 表达式', () => {
    const nanCfg = cfg({ thresholds: { toleranceYuan: NaN, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.01 } });
    // 拼接层：数值经 resolveZeroNegativeThresholds 归一后内联，永不出现 NaN
    const calc = buildCalcCte(nanCfg, computeZeroNegativeGates(nanCfg));
    expect(calc).not.toContain('NaN');
    expect(calc).toContain('ABS(pay_amount) <= 0.01');
    // 策略层：非法阈值是阻断项，整体降级且不吐 NaN
    expect(build(nanCfg)).toBe(DEGRADE_SQL);
  });

  it('阈值不被引号包裹', () => {
    expect(build(cfg())).not.toContain("'0.01'");
  });
});

describe('Phase 1 R3 双口径', () => {
  it('单价列已映射时用 unit_price < 0', () => {
    expect(build(cfg())).toContain(`(unit_price < 0) AND NOT has_null_amount AS ${ZERO_NEGATIVE_FLAG_COL.negative_unit_price}`);
  });

  it('单价列未映射时退回商品金额除数量', () => {
    const sql = build(cfg({}, { unitPriceCol: '' }));
    expect(sql).toContain('quantity > 0 AND product_amount / NULLIF(quantity, 0) < 0');
  });

  it('单价与数量皆空时 R3 固定 FALSE', () => {
    const sql = build(cfg({}, { unitPriceCol: '', quantityCol: '' }));
    expect(sql).toContain(`FALSE AS ${ZERO_NEGATIVE_FLAG_COL.negative_unit_price}`);
  });
});

describe('Phase 1 is_abnormal 与最终投影', () => {
  const sql = build(cfg());

  it('judged 段由 8 个标志相或得到', () => {
    const judged = cteSlice(sql, 'judged');
    for (const key of ZERO_NEGATIVE_RULE_KEYS) expect(judged).toContain(ZERO_NEGATIVE_FLAG_COL[key]);
    expect(countOf(judged, ' OR ')).toBe(7);
  });

  it('is_abnormal 不依赖 IS TRUE 或字符串比较', () => {
    const judged = cteSlice(sql, 'judged');
    expect(judged).not.toContain('IS TRUE');
    expect(judged).not.toContain("'");
  });

  it('最终 SELECT 列序固定', () => {
    const select = sql.slice(sql.indexOf('FROM judged') - 400);
    const expected = [
      'order_id', 'order_time', 'expected_amount', 'pay_amount', 'discount_total', 'net_pay_amount', 'loss_amount',
      ...ZERO_NEGATIVE_RULE_KEYS.map((k) => ZERO_NEGATIVE_FLAG_COL[k]),
      'has_null_amount', 'is_abnormal',
    ];
    const body = select.slice(select.indexOf('SELECT'), select.indexOf('FROM judged'));
    const cols = body.replace(/^SELECT\s+/, '').split(',').map((c) => c.trim()).filter(Boolean);
    expect(cols).toEqual(expected);
  });

  it('最终投影不含中文文案', () => {
    const body = sql.slice(sql.lastIndexOf('SELECT'), sql.indexOf('FROM judged'));
    expect(/[\u4e00-\u9fa5]/.test(body)).toBe(false);
  });
});

describe('Phase 1 validateOperatorSpecific', () => {
  const validate = (nodes: FlowNode[]) =>
    (
      strategy as unknown as {
        validateOperatorSpecific: (n: FlowNode[], e: never[]) => Array<{ severity: string; message: string }>;
      }
    ).validateOperatorSpecific(nodes, []);

  it('合法配置无告警', () => {
    expect(validate(makeNodes(cfg()))).toEqual([]);
  });

  it('缺必填列报 1 条 ERROR', () => {
    const errors = validate(makeNodes(cfg({}, { payAmountCol: '' })));
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe(ValidationSeverity.ERROR);
  });

  it('R7 缺列报 WARNING 且文案含规则中文名', () => {
    const errors = validate(makeNodes(cfg({ enabledRules: ['discount_sum_mismatch'] }, { couponAmountCol: '' })));
    const warnings = errors.filter((e) => e.severity === ValidationSeverity.WARNING);
    expect(warnings.some((w) => w.message.includes('优惠分项不符'))).toBe(true);
  });

  it('skipped > 0 时额外 1 条汇总 WARNING', () => {
    const errors = validate(makeNodes(cfg({ enabledRules: ['discount_sum_mismatch'] }, { couponAmountCol: '' })));
    expect(errors.some((e) => e.message.startsWith('本次 8 项规则中生效'))).toBe(true);
  });

  it('无 SELECT 节点返回空数组', () => {
    expect(validate(tableOnlyNodes())).toEqual([]);
  });
});