/**
 * Phase 1 单测 — fn_ecom_daily_biz_summary SQL 生成层（计划 §Phase 1 测试矩阵，编号 1–10）
 * 断言基于生成的 SQL 文本与纯函数，不连接真实 DuckDB。
 */
import { describe, it, expect } from 'vitest';
import {
  DAILY_BIZ_COMPARE_SHIFT,
  DAILY_BIZ_NO_FEE_COL_MESSAGE,
  DAILY_BIZ_PASSTHROUGH_COLS,
  EcomDailyBizSummaryStrategy,
  allowedDailyBizSlots,
  applyDailyBizSalesCaliber,
  buildDailyBizCalcCte,
  buildDailyBizSql,
  cloneDailyBizSummaryConfig,
  dailyBizOutputSchema,
  dailyBizSlotSql,
  evalDailyBizSlot,
  resolveDailyBizProfitSlots,
} from '../ecomDailyBizSummaryStrategy';
import {
  FlowNodeType,
  ValidationSeverity,
  type DailyBizSummaryConfig,
  type FlowNode,
} from '../../types';

const strategy = new EcomDailyBizSummaryStrategy();

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

const build = (config: DailyBizSummaryConfig, userWhere = ''): string =>
  buildDailyBizSql('ecom_orders', config, userWhere);

const makeNodes = (config?: DailyBizSummaryConfig): FlowNode[] => [
  { id: 't1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 'ecom_orders' } } as FlowNode,
  {
    id: 's1',
    type: FlowNodeType.SELECT,
    position: { x: 100, y: 0 },
    data: config ? { dailyBizSummaryConfig: config } : {},
  } as FlowNode,
];

/** 绕过 `protected` 直接驱动 SQL 拼装 */
const buildViaStrategy = (config: DailyBizSummaryConfig | undefined, userWhere = ''): string =>
  (
    strategy as unknown as {
      buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string;
    }
  ).buildOperatorSql(makeNodes(config), [], undefined, userWhere);

const validate = (config?: DailyBizSummaryConfig) => strategy.validate(makeNodes(config), []);

/** 截取单个 CTE 文本 */
const cte = (sql: string, name: string): string => {
  // CTE 间以 ",\n" 连接（src 为首段）；带换行前缀可避开 "sales_calc" 中的 "calc" 子串误命中
  const start = sql.indexOf(`\n${name} AS (`) >= 0
    ? sql.indexOf(`\n${name} AS (`)
    : sql.indexOf(`${name} AS (`);
  expect(start, `CTE ${name} 应存在`).toBeGreaterThanOrEqual(0);
  const body = sql.slice(start);
  // 按括号深度截到本 CTE 结束（末段 CTE 后紧跟主 SELECT，无 ")," 可依）
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '(') depth++;
    else if (body[i] === ')') {
      depth--;
      if (depth === 0) return body.slice(0, i + 1);
    }
  }
  return body;
};

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('Phase 1 · 1 — 结构与显式透传（Issue 5）', () => {
  it('5 段 CTE 齐备，表名带引号，date 以 "date" 输出，ORDER BY "date" 收尾', () => {
    const sql = build(cfg());
    for (const name of ['src', 'agg', 'sales_calc', 'calc', 'metric']) {
      expect(sql).toContain(`${name} AS (`);
    }
    expect(sql.trimEnd().endsWith('ORDER BY m."date"')).toBe(true);
    expect(sql).toContain('FROM "ecom_orders"');
    expect(sql).toContain('AS "date"');
  });

  it('userWhere 仅注入 src 层且只出现 1 次；无条件下全文不含 WHERE', () => {
    const sql = build(cfg(), 'WHERE amount > 100');
    expect(count(sql, 'WHERE')).toBe(1);
    expect(cte(sql, 'src')).toContain('WHERE (amount > 100)');
    expect(cte(sql, 'src')).toContain('AND (');
    expect(build(cfg({ excludeStatusValues: '' }, { orderStatusCol: '' }))).not.toContain('WHERE');
  });

  it('三层 SELECT 列表显式透传 date / order_cnt / 8 别名，且无 a.* / s.* / c.*', () => {
    const sql = build(cfg());
    const layers: Array<[string, string]> = [['a', 'sales_calc'], ['s', 'calc'], ['c', 'metric']];
    for (const [alias, name] of layers) {
      const body = cte(sql, name);
      expect(body, `${name} 应含 date`).toContain(`${alias}."date"`);
      expect(body, `${name} 应含 order_cnt`).toContain(`${alias}.order_cnt`);
      for (const col of DAILY_BIZ_PASSTHROUGH_COLS) {
        expect(body, `${name} 应含 ${col}`).toContain(`${alias}."${col}"`);
      }
      expect(body, `${name} 不应再整表透传`).not.toContain(`${alias}.*`);
    }
    expect(cte(sql, 'calc')).toContain('s."sales"');
    const metric = cte(sql, 'metric');
    expect(metric).toContain('c."sales"');
    expect(metric).toContain('c."profit"');
    expect(metric).toContain('c."fee_total"');
    expect(metric).toContain(' AS net_profit');
  });

  it('quantity 映射时三层均含，未映射时三层均不含', () => {
    const withQty = build(cfg());
    for (const name of ['sales_calc', 'calc', 'metric']) expect(cte(withQty, name)).toContain('"quantity"');
    const noQty = build(cfg({}, { quantityCol: '' }));
    for (const name of ['sales_calc', 'calc', 'metric']) expect(cte(noQty, name)).not.toContain('quantity');
  });
});

describe('Phase 1 · 2 — 状态剔除（Issue 1）', () => {
  it('NULL 行放行：状态剔除表达式含 IS NULL OR', () => {
    expect(cte(build(cfg()), 'src')).toContain('IS NULL OR');
  });

  it('状态剔除与 userWhere 以 AND 连接', () => {
    const src = cte(build(cfg(), 'WHERE amount > 100'), 'src');
    expect(src).toContain('UPPER(TRIM(');
    expect(src).toContain('NOT IN (');
    expect(src).toContain("'已取消'");
  });

  it('剔除值为空串 → 不生成 NOT IN 且短码含 NO_STATUS_FILTER', () => {
    const sql = build(cfg({ excludeStatusValues: '' }));
    expect(sql).not.toContain('NOT IN');
    expect(sql).toContain('NO_STATUS_FILTER');
  });

  it('状态列未映射 → 不生成 NOT IN', () => {
    expect(build(cfg({}, { orderStatusCol: '' }))).not.toContain('NOT IN');
  });
});

describe('Phase 1 · 3 — 退款不双扣（AC3 三项）', () => {
  it('计数只对 net_profit 表达式：gross 1 次 / net 0 次，并断言结构 AS net_profit', () => {
    const grossExpr = dailyBizSlotSql(allowedDailyBizSlots('netProfitSlots', cfg().netProfitSlots));
    const netExpr = dailyBizSlotSql(
      allowedDailyBizSlots('netProfitSlots', applyDailyBizSalesCaliber(cfg(), 'net').netProfitSlots),
    );
    expect(count(grossExpr, 'refund_amount')).toBe(1);
    expect(count(netExpr, 'refund_amount')).toBe(0);
    expect(cte(build(cfg()), 'metric')).toContain(`${grossExpr} AS net_profit`);
  });

  it('两分支净利槽位差集恰为「减退款金额」', () => {
    const gross = cfg().netProfitSlots;
    const net = applyDailyBizSalesCaliber(cfg(), 'net').netProfitSlots;
    const missing = gross.filter((s) => !net.some((n) => n.operator === s.operator && n.column === s.column));
    expect(missing).toEqual([{ operator: '-', column: 'refund_amount' }]);
  });

  it('数值恒等式：net − gross === refundAmount（容差 0）', () => {
    const x = { sales: 1000, refund_amount: 120, fee_total: 80 };
    const netValue = evalDailyBizSlot(
      allowedDailyBizSlots('netProfitSlots', applyDailyBizSalesCaliber(cfg(), 'net').netProfitSlots),
      x,
    );
    const grossValue = evalDailyBizSlot(allowedDailyBizSlots('netProfitSlots', cfg().netProfitSlots), x);
    expect(netValue).toBe(920);
    expect(grossValue).toBe(800);
    expect(netValue === null || grossValue === null ? null : netValue - grossValue).toBe(120);
  });
});

describe('Phase 1 · 4 — 费用口径与 NULL 传播（Issue 3 / Q14，§3.2 表逐行）', () => {
  it('(a) single_column + 费用列已映射 → calc 取合计源列', () => {
    expect(cte(build(cfg()), 'calc')).toContain('COALESCE("fee_total_src", 0) AS fee_total');
  });

  it('(b) single_column + 费用列未映射 → fee_total 与 net_profit 均为 NULL，全文无兜底折算', () => {
    const sql = build(cfg({}, { feeTotalCol: '' }));
    expect(cte(sql, 'calc')).toContain('CAST(NULL AS DOUBLE) AS fee_total');
    expect(cte(sql, 'metric')).toContain('CAST(NULL AS DOUBLE) AS net_profit');
    expect(sql).not.toContain('COALESCE("fee_total_src", 0)');
  });

  it('(c) slot_sum + 分项有映射列 → 三项分项之和', () => {
    const calc = cte(build(cfg({ feeCaliber: 'slot_sum' })), 'calc');
    expect(calc).toContain('commission_fee');
    expect(calc).toContain('shipping_fee');
    expect(calc).toContain('service_fee');
  });

  it('(d) slot_sum + 分项无任何已映射列 ∧ 合计列已映射 → 保留既有合计列兜底', () => {
    const calc = buildDailyBizCalcCte(cfg({ feeCaliber: 'slot_sum', feeSlots: [] }));
    expect(calc).toContain('COALESCE("fee_total_src", 0)');
    expect(calc).not.toContain('COALESCE("commission_fee"');
  });

  it('(e) slot_sum + 非空槽位但无映射 → 走兜底（回锁「不信槽位长度」）', () => {
    const calc = buildDailyBizCalcCte(
      cfg(
        { feeCaliber: 'slot_sum', feeSlots: [{ operator: '+', column: 'commission_fee' }] },
        { commissionFeeCol: '', feeTotalCol: '费用合计' },
      ),
    );
    expect(calc).toContain('COALESCE("fee_total_src", 0)');
    expect(calc).not.toContain('COALESCE("commission_fee"');
  });

  it('(f) 净利槽位直接引用 fee_total_src 时同样置 NULL（双别名覆盖）', () => {
    const sql = build(cfg(
      { netProfitSlots: [{ operator: '+', column: 'sales' }, { operator: '-', column: 'fee_total_src' }] },
      { feeTotalCol: '' },
    ));
    expect(cte(sql, 'metric')).toContain('CAST(NULL AS DOUBLE) AS net_profit');
  });

  it('(g) 部分映射：已映射分项参与求和，未映射分项在 agg 层为 NULL 并按 0 计', () => {
    const sql = build(cfg(
      { feeCaliber: 'slot_sum' },
      { commissionFeeCol: '佣金', shippingFeeCol: '', serviceFeeCol: '', feeTotalCol: '费用合计' },
    ));
    const calc = cte(sql, 'calc');
    expect(calc).toContain('COALESCE("commission_fee"');
    expect(calc).not.toContain('COALESCE("fee_total_src", 0)');
    const agg = cte(sql, 'agg');
    expect(agg).toContain('CAST(NULL AS DOUBLE) AS "shipping_fee"');
    expect(agg).toContain('CAST(NULL AS DOUBLE) AS "service_fee"');
  });

  it('(h) slot_sum + 分项无映射 ∧ 合计列未映射 → fee_total 与 net_profit 均为 NULL', () => {
    const sql = build(cfg(
      { feeCaliber: 'slot_sum', feeSlots: [] },
      { feeTotalCol: '' },
    ));
    expect(cte(sql, 'calc')).toContain('CAST(NULL AS DOUBLE) AS fee_total');
    expect(cte(sql, 'metric')).toContain('CAST(NULL AS DOUBLE) AS net_profit');
    expect(sql).not.toContain('COALESCE("fee_total_src", 0)');
  });
});

describe('Phase 1 · 5 — 订单数与退款率', () => {
  it('有订单号 → COUNT(DISTINCT；无 → COUNT(*) 且短码含 ROW_LEVEL', () => {
    expect(build(cfg())).toContain('COUNT(DISTINCT src."order_id") AS order_cnt');
    const noOrderId = build(cfg({}, { orderIdCol: '' }));
    expect(noOrderId).toContain('COUNT(*) AS order_cnt');
    expect(noOrderId).toContain('ROW_LEVEL');
  });

  it('refund_rate 与 sales 同分母保护，无退款列输出 NULL 并标注 NULL_AMOUNT', () => {
    const sql = build(cfg());
    expect(sql).toContain('ROUND(m.refund_amount / NULLIF(m.sales, 0), 4) AS refund_rate');
    const noRefund = build(cfg({}, { refundAmountCol: '' }));
    expect(cte(noRefund, 'agg')).toContain('CAST(NULL AS DOUBLE) AS "refund_amount"');
    expect(noRefund).toContain('NULL_AMOUNT');
  });
});

describe('Phase 1 · 6 — 派生列口径', () => {
  it('净利率与客单价各自的分母保护', () => {
    const sql = build(cfg());
    expect(sql).toContain('ROUND(m.net_profit / NULLIF(m.sales, 0), 4) AS net_profit_rate');
    expect(sql).toContain('ROUND(m.sales / NULLIF(m.order_cnt, 0), 2) AS avg_order_value');
  });

  it('销量列按映射与否整列进出', () => {
    const withQty = build(cfg());
    expect(withQty).toContain('ROUND(m.quantity, 2) AS quantity');
    const noQty = build(cfg({}, { quantityCol: '' }));
    expect(noQty).not.toContain('quantity');
  });
});

describe('Phase 1 · 7 — 对比列（Q3 / Q15 + 缺日断言）', () => {
  it('四档各自生成对应 INTERVAL 位移', () => {
    expect(build(cfg({ compareMode: 'day' }))).toContain("INTERVAL '1 DAY'");
    expect(build(cfg({ compareMode: 'week' }))).toContain("INTERVAL '7 DAYS'");
    expect(build(cfg({ compareMode: 'month' }))).toContain("INTERVAL '1 MONTH'");
    expect(build(cfg({ compareMode: 'year' }))).toContain("INTERVAL '1 YEAR'");
    expect(Object.keys(DAILY_BIZ_COMPARE_SHIFT)).toEqual(['day', 'week', 'month', 'year']);
  });

  it('4 档共用同一 LEFT JOIN 模板，仅常量不同', () => {
    const joins = (['day', 'week', 'month', 'year'] as const).map((mode) => {
      const sql = build(cfg({ compareMode: mode }));
      const idx = sql.indexOf('LEFT JOIN metric p ON p."date" = m."date" - INTERVAL');
      expect(idx).toBeGreaterThanOrEqual(0);
      return sql.slice(idx).split('\n')[0];
    });
    const normalized = joins.map((j) => j.replace(/'[^']*'/, '<shift>'));
    expect(new Set(normalized).size).toBe(1);
  });

  it('compareMode=none 时无 LEFT JOIN 与三个 *_cmp', () => {
    const sql = build(cfg({ compareMode: 'none' }));
    expect(sql).not.toContain('LEFT JOIN');
    expect(sql).not.toContain('sales_cmp');
    expect(sql).not.toContain('profit_cmp');
    expect(sql).not.toContain('net_profit_cmp');
  });

  it('缺日不折 0：对比表达式只用 NULLIF，全文无 COALESCE(p. / ISNULL(p.', () => {
    const sql = build(cfg());
    expect(sql).toContain('ROUND((m.sales - p.sales) * 1.0 / NULLIF(p.sales, 0), 4) AS sales_cmp');
    expect(sql).not.toContain('COALESCE(p.');
    expect(sql).not.toContain('ISNULL(p.');
    expect(sql).not.toContain('generate_series');
  });
});

describe('Phase 1 · 8 — 毛利构建期降级（Q9）与 validate 分级（Issue 3）', () => {
  it('无毛利列有成本列 → 毛利走「销售额 − 商品成本」表达式（透传使整层文本必含 gross_profit）', () => {
    const config = cfg({}, { grossProfitCol: '' });
    const calc = cte(build(config), 'calc');
    expect(calc).toContain('COALESCE("sales", 0) - COALESCE("cost_amount", 0) AS profit');
    expect(dailyBizSlotSql(resolveDailyBizProfitSlots(config))).not.toContain('gross_profit');
  });

  it('两路都缺 → profit 为 CAST(NULL AS DOUBLE) 且短码含 NO_PROFIT_COL', () => {
    const sql = build(cfg({}, { grossProfitCol: '', costCol: '' }));
    expect(cte(sql, 'calc')).toContain('CAST(NULL AS DOUBLE) AS profit');
    expect(sql).toContain('NO_PROFIT_COL');
  });

  it('缺两个必填列 → 2 条 ERROR，nodeId 正确', () => {
    const errors = validate(cloneDailyBizSummaryConfig()).filter(
      (e) => e.severity === ValidationSeverity.ERROR,
    );
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.nodeId === 's1')).toBe(true);
  });

  it('全齐 → 0 条 ERROR', () => {
    expect(validate(cfg()).filter((e) => e.severity === ValidationSeverity.ERROR)).toHaveLength(0);
  });

  it('缺毛利列 → WARNING 含 NO_PROFIT_COL 且无 ERROR', () => {
    const errors = validate(cfg({}, { grossProfitCol: '' }));
    expect(errors.some((e) => e.severity === ValidationSeverity.WARNING && e.message.includes('NO_PROFIT_COL'))).toBe(true);
    expect(errors.filter((e) => e.severity === ValidationSeverity.ERROR)).toHaveLength(0);
  });

  it('费用列未映射 → 恰 1 条 WARNING（等于 DAILY_BIZ_NO_FEE_COL_MESSAGE）且 ERROR = 0', () => {
    const errors = validate(cfg({}, { feeTotalCol: '' }));
    expect(
      errors.filter((e) => e.severity === ValidationSeverity.WARNING && e.message === DAILY_BIZ_NO_FEE_COL_MESSAGE),
    ).toHaveLength(1);
    expect(errors.filter((e) => e.severity === ValidationSeverity.ERROR)).toHaveLength(0);
  });

  it('降级不阻断：任意降级组合下 ERROR 恒为 0', () => {
    const combos: Array<Partial<DailyBizSummaryConfig['fieldMapping']>> = [
      { orderIdCol: '' },
      { orderStatusCol: '' },
      { grossProfitCol: '' },
      { costCol: '' },
      { refundAmountCol: '' },
      { feeTotalCol: '', commissionFeeCol: '', shippingFeeCol: '', serviceFeeCol: '' },
      { orderIdCol: '', orderStatusCol: '', grossProfitCol: '', costCol: '', refundAmountCol: '' },
    ];
    for (const mappingPatch of combos) {
      const errors = validate(cfg({}, mappingPatch));
      expect(errors.filter((e) => e.severity === ValidationSeverity.ERROR), JSON.stringify(mappingPatch)).toHaveLength(0);
    }
  });

  it('无 SELECT 节点时算子级校验返回空数组', () => {
    const opValidate = (
      strategy as unknown as {
        validateOperatorSpecific: (n: FlowNode[], e: never[]) => Array<{ severity: ValidationSeverity }>;
      }
    ).validateOperatorSpecific.bind(strategy);
    expect(opValidate([makeNodes()[0]], [])).toEqual([]);
  });
});

describe('Phase 1 · 9 — 策略降级与 _lastConfig', () => {
  it('缺表或无配置 → 降级 SQL', () => {
    expect(buildViaStrategy(undefined)).toBe('SELECT 1 WHERE false');
    expect(
      (strategy as unknown as { buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string })
        .buildOperatorSql([], [], undefined, ''),
    ).toBe('SELECT 1 WHERE false');
  });

  it('含阻断项 → 降级 SQL；配置齐备 → 真实 SQL', () => {
    expect(buildViaStrategy(cloneDailyBizSummaryConfig())).toBe('SELECT 1 WHERE false');
    expect(buildViaStrategy(cfg())).toContain('WITH src AS (');
  });

  it('仅有 no-fee-col（warning）时不降级', () => {
    expect(buildViaStrategy(cfg({}, { feeTotalCol: '' }))).toContain('WITH src AS (');
  });

  it('buildOperatorSql 记录 _lastConfig 供 postProcess 复用', () => {
    buildViaStrategy(cfg({ compareMode: 'none' }));
    const last = (strategy as unknown as { _lastConfig: DailyBizSummaryConfig | null })._lastConfig;
    expect(last?.compareMode).toBe('none');
    expect(last?.fieldMapping.salesCol).toBe('销售额');
  });
});

describe('Phase 1 · 10 — schema 不受影响', () => {
  it('默认 15 列 / none 12 列 / 无销量再减 1', () => {
    expect(dailyBizOutputSchema(cfg())).toHaveLength(15);
    expect(dailyBizOutputSchema(cfg({ compareMode: 'none' }))).toHaveLength(12);
    expect(dailyBizOutputSchema(cfg({ compareMode: 'none' }, { quantityCol: '' }))).toHaveLength(11);
  });

  it('列名与 SQL 别名逐一对应', () => {
    const sql = build(cfg());
    for (const col of dailyBizOutputSchema(cfg())) expect(sql).toContain(col.name);
  });
});
