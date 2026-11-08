/**
 * Phase 1 单测 — fn_ecom_daily_biz_summary SQL 生成层（计划 §Phase 1 测试矩阵）
 * 断言基于生成的 SQL 文本与纯函数，不连接真实 DuckDB。
 */
import { describe, it, expect } from 'vitest';
import {
  DAILY_BIZ_COMPARE_SHIFT,
  EcomDailyBizSummaryStrategy,
  applyDailyBizSalesCaliber,
  buildDailyBizCalcCte,
  buildDailyBizSql,
  cloneDailyBizSummaryConfig,
  dailyBizOutputSchema,
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

describe('Phase 1 — 结构', () => {
  it('5 段 CTE 齐备，表名带引号，date 以 "date" 输出，ORDER BY "date" 收尾', () => {
    const sql = build(cfg());
    for (const name of ['src', 'agg', 'sales_calc', 'calc', 'metric']) {
      expect(sql).toContain(`${name} AS (`);
    }
    expect(sql.trimEnd().endsWith('ORDER BY m."date"')).toBe(true);
    expect(sql).toContain('FROM "ecom_orders"');
    expect(sql).toContain('AS "date"');
  });

  it('dailyBizOutputSchema 默认 15 列', () => {
    expect(dailyBizOutputSchema(cfg())).toHaveLength(15);
  });
});

describe('Phase 1 — userWhere 唯一注入', () => {
  it('有条件时 WHERE 仅出现在 src 层且只出现 1 次', () => {
    const sql = build(cfg(), 'WHERE amount > 100');
    expect(count(sql, 'WHERE')).toBe(1);
    expect(cte(sql, 'src')).toContain('WHERE (amount > 100)');
  });

  it('无条件且无状态剔除时全文不含 WHERE', () => {
    const sql = build(cfg({ excludeStatusValues: '' }, { orderStatusCol: '' }));
    expect(sql).not.toContain('WHERE');
  });

  it('状态剔除与 userWhere 以 AND 连接', () => {
    const sql = build(cfg(), 'WHERE amount > 100');
    expect(cte(sql, 'src')).toContain('AND (');
    expect(cte(sql, 'src')).toContain('UPPER(TRIM(');
    expect(cte(sql, 'src')).toContain('NOT IN (');
    expect(cte(sql, 'src')).toContain("'已取消'");
  });
});

describe('Phase 1 — 退款不双扣（AC3）', () => {
  it('gross 分支 metric 层 refund_amount 出现 1 次，net 分支 0 次', () => {
    const gross = build(cfg());
    const net = build(applyDailyBizSalesCaliber(cfg(), 'net'));
    expect(count(cte(gross, 'metric'), 'refund_amount')).toBe(1);
    expect(count(cte(net, 'metric'), 'refund_amount')).toBe(0);
  });

  it('两分支净利槽位差集恰为「减退款金额」', () => {
    const gross = cfg().netProfitSlots;
    const net = applyDailyBizSalesCaliber(cfg(), 'net').netProfitSlots;
    const missing = gross.filter((s) => !net.some((n) => n.operator === s.operator && n.column === s.column));
    expect(missing).toEqual([{ operator: '-', column: 'refund_amount' }]);
  });
});

describe('Phase 1 — 订单数与退款率', () => {
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

describe('Phase 1 — 派生列口径', () => {
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

describe('Phase 1 — 毛利构建期降级（Q9）', () => {
  it('无毛利列有成本列 → 销售额减商品成本', () => {
    const sql = build(cfg({}, { grossProfitCol: '' }));
    const calc = cte(sql, 'calc');
    expect(calc).toContain('"sales"');
    expect(calc).toContain('"cost_amount"');
    expect(calc).not.toContain('gross_profit');
  });

  it('两路都缺 → profit 为 CAST(NULL AS DOUBLE) 且短码含 NO_PROFIT_COL', () => {
    const sql = build(cfg({}, { grossProfitCol: '', costCol: '' }));
    expect(cte(sql, 'calc')).toContain('CAST(NULL AS DOUBLE) AS profit');
    expect(sql).toContain('NO_PROFIT_COL');
  });
});

describe('Phase 1 — 对比列（Q3/Q10/Q15）', () => {
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
});

describe('Phase 1 — 费用口径（Q14）', () => {
  it('single_column 取费用合计源列', () => {
    const calc = cte(build(cfg()), 'calc');
    expect(calc).toContain('COALESCE("fee_total_src", 0) AS fee_total');
  });

  it('slot_sum 取三个分项之和', () => {
    const calc = cte(build(cfg({ feeCaliber: 'slot_sum' })), 'calc');
    expect(calc).toContain('commission_fee');
    expect(calc).toContain('shipping_fee');
    expect(calc).toContain('service_fee');
  });

  it('slot_sum 且分项全空 → 派生回落合计源列，同时因 no-fee-slot 被阻断', () => {
    // 契约 §2/P0-⑥：分项口径下分项全空属 blocker（ERROR），SQL 仍兜底同源合计列
    const config = cfg({ feeCaliber: 'slot_sum', feeSlots: [] });
    expect(buildDailyBizCalcCte(config)).toContain('COALESCE("fee_total_src", 0)');
    const errors = validate(config).filter((e) => e.severity === ValidationSeverity.ERROR);
    expect(errors.some((e) => e.message.includes('费用'))).toBe(true);
  });
});

describe('Phase 1 — validate', () => {
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

describe('Phase 1 — 策略降级与 _lastConfig', () => {
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

  it('buildOperatorSql 记录 _lastConfig 供 postProcess 复用', () => {
    buildViaStrategy(cfg({ compareMode: 'none' }));
    const last = (strategy as unknown as { _lastConfig: DailyBizSummaryConfig | null })._lastConfig;
    expect(last?.compareMode).toBe('none');
    expect(last?.fieldMapping.salesCol).toBe('销售额');
  });
});
