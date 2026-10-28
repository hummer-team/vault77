/**
 * Phase 1 单测 — fn_ecom_activity_effect_split 策略（计划 §Phase 1 测试矩阵）
 */
import { describe, it, expect } from 'vitest';
import {
  EcomActivityEffectSplitStrategy,
  ACTIVITY_FIELD_MATCH_PATTERNS,
  DIMENSION_LABEL,
  NATURAL_ROW_LABEL,
  isEmptyExpr,
} from '../ecomActivityEffectSplitStrategy';
import {
  DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
  OperatorType,
  FlowNodeType,
  ValidationSeverity,
  cloneActivityEffectSplitConfig,
  type ActivityEffectSplitConfig,
  type FlowEdge,
  type FlowNode,
  type ValidationError,
} from '../../types';

const strategy = new EcomActivityEffectSplitStrategy();

const makeNodes = (config?: ActivityEffectSplitConfig): FlowNode[] => [
  {
    id: 't1',
    type: FlowNodeType.TABLE,
    position: { x: 0, y: 0 },
    data: { tableName: 'ecom_orders' },
  } as FlowNode,
  {
    id: 's1',
    type: FlowNodeType.SELECT,
    position: { x: 100, y: 0 },
    data: config ? { activityEffectSplitConfig: config } : {},
  } as FlowNode,
];

const build = (config: ActivityEffectSplitConfig, userWhere = ''): string =>
  strategy.buildOperatorSql(makeNodes(config), [], undefined, userWhere);

/** 基于默认配置的自定义构造器（浅覆盖 config + fieldMapping） */
const cfg = (
  patch: Partial<ActivityEffectSplitConfig>,
  mappingPatch: Partial<ActivityEffectSplitConfig['fieldMapping']> = {},
): ActivityEffectSplitConfig => {
  const c = cloneActivityEffectSplitConfig(DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG);
  Object.assign(c, patch);
  Object.assign(c.fieldMapping, mappingPatch);
  return c;
};

/** 全维度可运行配置：三维度 + 全部业务列映射（默认配置列多为空，须显式给齐） */
const fullDims = (patch: Partial<ActivityEffectSplitConfig> = {}): ActivityEffectSplitConfig =>
  cfg(
    { dimensions: ['activity', 'coupon', 'live_room'], ...patch },
    {
      activityIdCol: '活动ID',
      couponIdCol: '优惠券ID',
      liveRoomIdCol: '直播间ID',
      payTimeCol: '支付时间',
      activityStartCol: '活动开始时间',
      activityEndCol: '活动结束时间',
      orderStatusCol: '订单状态',
      netAmountCol: '实付金额',
      orderIdCol: '订单ID',
      userIdCol: '用户ID',
      quantityCol: '商品数量',
      couponStatusCol: '优惠券状态',
      couponAmountCol: '优惠金额',
    },
  );

const defaultSql = (): string => build(fullDims());

const validateOf = (nodes: FlowNode[]): ValidationError[] =>
  (strategy as unknown as {
    validateOperatorSpecific(n: FlowNode[], e: FlowEdge[]): ValidationError[];
  }).validateOperatorSpecific(nodes, []);

describe('SQL 结构', () => {
  it('默认 3 维度：1 个 WITH、分支数 = 维度数+1、无分号、ORDER BY 定型', () => {
    const sql = defaultSql();
    expect(sql.match(/\bWITH\b/gi)).toHaveLength(1);
    expect(sql).not.toContain(';');
    expect(sql.split('\n  UNION ALL\n  ')).toHaveLength(4);
    expect(sql).toContain('ORDER BY dimension_type ASC, lift_amount DESC NULLS LAST');
    for (const d of ['activity', 'coupon', 'live_room', 'natural']) {
      expect(sql).toContain(`FROM d_${d}`);
    }
  });

  it('userWhere 注入 src CTE 并以括号 AND 拼接排除条件，不污染最外层', () => {
    const sql = build(fullDims(), 'WHERE pay_amount > 0');
    const src = sql.slice(sql.indexOf('src AS ('), sql.indexOf('agg_activity'));
    expect(src).toContain('WHERE (pay_amount > 0)');
    expect(src).toContain('\n    AND COALESCE(UPPER(TRIM(CAST("订单状态" AS VARCHAR))), \'\')');
    expect(sql.slice(sql.lastIndexOf('SELECT * FROM ('))).not.toContain('pay_amount > 0');
  });

  it('无 userWhere 仅有排除条件时 WHERE 直接以 COALESCE 开头（无悬空 AND）', () => {
    expect(defaultSql()).toContain(`FROM "ecom_orders"\n  WHERE COALESCE(UPPER(`);
  });

  it('dimension_label 不参与 GROUP BY；分组只用位置引用', () => {
    const sql = defaultSql();
    for (const group of sql.match(/GROUP BY [^\n]*/g) ?? []) {
      expect(group).not.toContain('dimension_label');
    }
    expect(sql).toContain('GROUP BY 1, 2');
  });

  it('d_* 模板 14 列同序', () => {
    const order = [
      'dimension_type', 'dimension_label', 'order_count', 'quantity', 'gmv', 'lift_amount',
      'subsidy_cost', 'net_lift', 'roi', 'cost_rate', 'coupon_redemption_rate',
      'coupon_order_ratio', 'avg_order_value', 'profit_effective_flag',
    ];
    const dBlock = defaultSql().slice(
      defaultSql().indexOf('d_activity AS ('),
      defaultSql().indexOf('d_coupon AS ('),
    );
    let cursor = 0;
    for (const col of order) {
      const idx = dBlock.indexOf(` AS ${col}`, cursor);
      expect(idx).toBeGreaterThan(-1);
      cursor = idx;
    }
  });

  it('excludedStatuses：trim、大写、单引号转义、空项跳过', () => {
    const escaped = build(fullDims({ excludedStatuses: "REFUNDED,已退款'单引号, closed ,," }));
    expect(escaped).toContain(`NOT IN ('REFUNDED','已退款''单引号','CLOSED')`);
  });

  it('未保存配置 / 维度列全缺 → 降级空查询 1 = 0，不抛错', () => {
    const sql = strategy.buildOperatorSql(makeNodes(), [], undefined, '');
    expect(sql).toBe('SELECT NULL AS dimension_type WHERE 1 = 0');
    const noCols = build(cfg({ dimensions: ['activity'] }));
    expect(noSqlIsDegrade(noCols)).toBe(true);
  });
});

const noSqlIsDegrade = (sql: string): boolean => sql.includes('WHERE 1 = 0') && !sql.includes('WITH');

describe('isEmptyExpr 判定矩阵（决策 #12）', () => {
  it("IN ('', '0') 文本分支与 TRY_CAST 数值分支共存，表达式不含分号", () => {
    const expr = isEmptyExpr('活动ID');
    expect(expr).toContain(`COALESCE(TRIM(CAST("活动ID" AS VARCHAR)), '') IN ('', '0')`);
    expect(expr).toContain(`OR COALESCE(TRY_CAST(TRIM(CAST("活动ID" AS VARCHAR)) AS DOUBLE), 1) = 0`);
    expect(expr).not.toContain(';');
  });

  it('agg CTE 用 NOT (…) 包裹三个已映射标识列', () => {
    const sql = defaultSql();
    for (const col of ['活动ID', '优惠券ID', '直播间ID']) {
      expect(sql).toContain(`WHERE NOT (COALESCE(TRIM(CAST("${col}" AS VARCHAR)), '') IN ('', '0')`);
    }
  });
});

/** 取 agg_natural 的 WHERE 子句（CTE 体内 WHERE 到 CTE 结束） */
const naturalWhere = (sql: string): string =>
  sql.slice(sql.indexOf('agg_natural AS ('), sql.indexOf('d_natural AS ('))
    .split('  WHERE ')[1]
    .split('\n)')[0]
    .trim();

/** 决策 #12 空判定语义模型：NULL / 空串 / 纯空白 / '0' / 数值 0 视为「空」（与 isEmptyExpr 同义） */
const isEmptyValue = (v: unknown): boolean => {
  const text = String(v ?? '').trim();
  if (text === '') return true;
  const n = Number(text);
  return Number.isFinite(n) && n === 0;
};

/** 把 natural WHERE 还原为行过滤器，用它对样例订单做结果型判定 */
const naturalMatcher = (where: string): ((row: Record<string, unknown>) => boolean) => {
  const cols = where.split('\n    AND ').map((cond) => {
    const m = /CAST\("([^"]+)" AS VARCHAR\)/.exec(cond);
    if (!m) throw new Error(`无法解析 natural 条件: ${cond}`);
    return m[1];
  });
  return (row) => cols.every((col) => isEmptyValue(row[col]));
};

describe('natural 分支（决策 #4）', () => {
  it('勾 coupon 未勾 activity：仍生成 natural 行，条件为已映射标识列的 isEmptyExpr（正极性）', () => {
    const sql = build(cfg({ dimensions: ['coupon'] }, { couponIdCol: '优惠券ID', activityIdCol: '活动ID' }));
    expect(sql).toContain("'natural' AS dimension_type");
    expect(sql).toContain(`'${NATURAL_ROW_LABEL}' AS dimension_label`);
    const where = naturalWhere(sql);
    // 极性：自然成交 = 三标识「全空」，故为正条件（出现 NOT 即把语义反转成「带标识订单」）
    expect(where).not.toContain('NOT (');
    const conds = where.split('\n    AND ');
    expect(conds).toHaveLength(2);
    for (const cond of conds) expect(cond.startsWith('(COALESCE(TRIM(CAST(')).toBe(true);
    expect(sql).toContain('FROM d_natural');
  });

  it('结果型：三标识全空才进 natural，带标识 / 部分标识订单不进 natural', () => {
    const sql = build(cfg({ dimensions: ['coupon'] }, { couponIdCol: '优惠券ID', activityIdCol: '活动ID' }));
    const isNatural = naturalMatcher(naturalWhere(sql));
    // 带标识订单 → 不进 natural（修前该断言失败：NOT 包裹会把它们计入 natural）
    expect(isNatural({ 活动ID: 'A1', 优惠券ID: 'C1' })).toBe(false);
    // 仅部分标识为空 → 不进 natural
    expect(isNatural({ 活动ID: 'A1', 优惠券ID: '' })).toBe(false);
    expect(isNatural({ 活动ID: null, 优惠券ID: 'C1' })).toBe(false);
    // 三标识全空（含 NULL / 空白 / 数值 0）→ 进 natural
    expect(isNatural({ 活动ID: null, 优惠券ID: '' })).toBe(true);
    expect(isNatural({ 活动ID: '  ', 优惠券ID: 0 })).toBe(true);
  });

  it('agg_natural 无 GROUP BY：空输入下仍返回 1 行（决策 #4「恒 1 行」）', () => {
    const nat = defaultSql().slice(defaultSql().indexOf('agg_natural AS ('), defaultSql().indexOf('d_natural AS ('));
    expect(nat).not.toContain('GROUP BY');
    expect(nat).toContain('COUNT(');
  });

  it('d_natural 恒不 JOIN base_*：单口径 + guard FALSE', () => {
    const sql = build(fullDims({ liftCaliber: 'baseline_delta' }));
    const dNat = sql.slice(sql.indexOf('d_natural AS ('));
    expect(dNat).toContain('FROM agg_natural a');
    expect(dNat).not.toContain('base_');
    expect(dNat).toContain('CASE WHEN FALSE THEN CAST(NULL AS DOUBLE) ELSE ROUND(a._act_lift, 2) END AS lift_amount');
    expect(dNat).toContain('ROUND(a._act_lift - a.subsidy_cost, 2) END AS net_lift');
  });

  it('三标识全未映射：natural WHERE 为 1 = 1', () => {
    const sql = build(cfg({ dimensions: ['activity_type'] }, { activityTypeCol: '活动类型' }));
    const nat = sql.slice(sql.indexOf('agg_natural AS ('));
    expect(nat).toContain('WHERE 1 = 1');
    expect(nat).not.toContain('NOT (');
  });
});

describe('维度与标签聚合', () => {
  it('activity_type 维度：dim_key + GROUP BY 1, 2 + natural 恒生成', () => {
    const sql = build(cfg({ dimensions: ['activity_type'] }, { activityTypeCol: '活动类型' }));
    expect(sql).toContain('agg_activity_type AS (');
    expect(sql).toContain('CAST("活动类型" AS VARCHAR) AS dim_key');
    expect(sql).toContain("'natural' AS dimension_type");
  });

  it('活动名未映射（空白视同未映射）：dimension_label 回退 MAX(CAST(标识列))', () => {
    const sql = build(cfg({ dimensions: ['activity'] }, { activityIdCol: '活动ID', activityNameCol: '  ' }));
    expect(sql).not.toContain('NULLIF(TRIM(');
    expect(sql).toContain('MAX(CAST("活动ID" AS VARCHAR)) AS dimension_label');
  });

  it('活动名已映射：COALESCE(MAX(NULLIF(名)), MAX(CAST(ID))) 且不参与 GROUP BY', () => {
    const sql = build(cfg({ dimensions: ['activity'] }, { activityIdCol: '活动ID', activityNameCol: '活动名称' }));
    const agg = sql.slice(sql.indexOf('agg_activity AS ('), sql.indexOf('d_activity AS ('));
    expect(agg).toContain(`COALESCE(MAX(NULLIF(TRIM(CAST("活动名称" AS VARCHAR)), '')), MAX(CAST("活动ID" AS VARCHAR))) AS dimension_label`);
    for (const g of agg.match(/GROUP BY [^\n]*/g) ?? []) expect(g).not.toContain('dimension_label');
  });
});

describe('lift 口径（决策 #5 / #6 / #8）', () => {
  it('baseline_delta：win/base 两腿齐备、d_<dim> LEFT JOIN base 双条件', () => {
    const sql = build(fullDims({ liftCaliber: 'baseline_delta' }));
    expect(sql).toContain('win_activity AS (');
    expect(sql).toContain('base_activity AS (');
    expect(sql).toContain(`date_diff('day', w.win_start, CAST(s."支付时间" AS DATE))`);
    expect(sql).toContain(`BETWEEN -GREATEST(date_diff('day', w.win_start, w.win_end) + 1, 1) AND -1`);
    expect(sql).toContain('ON a.dim_key = b.dim_key');
    expect(sql).toContain('ROUND((a._act_lift - b.base_net) - a.subsidy_cost, 2) END AS net_lift');
  });

  it('基线口径：活动腿按该维度值的活动窗口截断（两腿同口径，决策 #6）', () => {
    const sql = build(fullDims({ liftCaliber: 'baseline_delta' }));
    const agg = sql.slice(sql.indexOf('agg_activity AS ('), sql.indexOf('d_activity AS ('));
    expect(agg).toContain('AND EXISTS (');
    expect(agg).toContain('FROM win_activity w');
    expect(agg).toContain('CAST(src."支付时间" AS DATE) BETWEEN w.win_start AND w.win_end');
    expect(agg).toContain('GROUP BY 1, 2');
    // 非基线口径不引入窗口约束（src 区间即统计区间）
    expect(defaultSql()).not.toContain('EXISTS (');
  });

  it('gmv 恒为实付合计，不受 lift 口径影响', () => {
    const sql = build(fullDims({ liftCaliber: 'baseline_delta' }));
    const gmvLine = sql.split('\n').find((l) => l.includes(' AS gmv,'))!;
    expect(gmvLine).toContain('ROUND(SUM(COALESCE(CAST("实付金额" AS DOUBLE), 0)), 2) AS gmv');
    expect(gmvLine).not.toContain('_act_lift');
    expect(gmvLine).not.toContain('base_net');
  });

  it('custom_slots：槽位求和进 _act_lift，空列槽位被过滤', () => {
    const sql = build(
      cfg(
        { dimensions: ['activity'], liftCaliber: 'custom_slots' },
        { activityIdCol: '活动ID', netAmountCol: '实付金额' },
      ),
    );
    // 默认 liftSlots 列为空 → L = CAST(NULL AS DOUBLE)
    expect(sql).toContain('ROUND(SUM(CAST(NULL AS DOUBLE)), 2) AS _act_lift');
    const withSlots = build(
      cfg(
        {
          dimensions: ['activity'],
          liftCaliber: 'custom_slots',
          liftSlots: [
            { operator: '+', column: '商品金额' },
            { operator: '-', column: '退款金额' },
            { operator: '+', column: '  ' },
          ],
        },
        { activityIdCol: '活动ID', netAmountCol: '实付金额' },
      ),
    );
    expect(withSlots).toContain(
      'ROUND(SUM(+ COALESCE(CAST("商品金额" AS DOUBLE), 0) - COALESCE(CAST("退款金额" AS DOUBLE), 0)), 2) AS _act_lift',
    );
  });

  it('product_amount：_act_lift 用商品金额列', () => {
    const sql = build(cfg(
      { dimensions: ['activity'], liftCaliber: 'product_amount' },
      { activityIdCol: '活动ID', netAmountCol: '实付金额', productAmountCol: '商品金额' },
    ));
    expect(sql).toContain('ROUND(SUM(COALESCE(CAST("商品金额" AS DOUBLE), 0)), 2) AS _act_lift');
  });
});

describe('成本口径与零除保护', () => {
  it('slot_sum：subsidy_cost 判据是覆盖计数（presence=0 → NULL），非槽位是否为空', () => {
    const sql = defaultSql();
    expect(sql).toContain(
      `CASE WHEN SUM(CASE WHEN ("coupon_amount" IS NOT NULL OR "discount_amount" IS NOT NULL OR "platform_subsidy" IS NOT NULL OR "ad_cost" IS NOT NULL) THEN 1 ELSE 0 END) = 0 THEN CAST(NULL AS DOUBLE)`,
    );
    expect(sql).not.toMatch(/slotCount|COUNT\(1\)/);
  });

  it('single_column：presence 计数与求和同列', () => {
    const sql = build(cfg(
      { dimensions: ['activity'], costCaliber: 'single_column', costSingleColumn: '总成本' },
      { activityIdCol: '活动ID' },
    ));
    expect(sql).toContain('CASE WHEN SUM(CASE WHEN "总成本" IS NOT NULL THEN 1 ELSE 0 END) = 0');
    expect(sql).toContain('ELSE ROUND(SUM(COALESCE(CAST("总成本" AS DOUBLE), 0)), 2) END AS subsidy_cost');
  });

  it('orderIdCol 决定计数形态：有则 COUNT(DISTINCT)，无则 COUNT(*)/COUNT(CASE)', () => {
    const withId = defaultSql();
    expect(withId).toContain('COUNT(DISTINCT "订单ID") AS order_count');
    expect(withId).toContain('COUNT(DISTINCT CASE WHEN');
    expect(withId).not.toContain('COUNT(*)');
    const noId = build(cfg({ dimensions: ['activity'] }, { activityIdCol: '活动ID', orderIdCol: '', couponAmountCol: '优惠金额' }));
    expect(noId).toContain('COUNT(*) AS order_count');
    expect(noId).toContain('COUNT(CASE WHEN');
  });

  it('零除保护：核销率/券占比/客单价分母 NULLIF；roi/cost_rate 用守卫判空', () => {
    const sql = defaultSql();
    expect(sql).toContain('/ NULLIF(COUNT(DISTINCT CASE WHEN UPPER(TRIM(CAST("优惠券状态" AS VARCHAR)))');
    expect(sql).toContain('/ NULLIF(COUNT(DISTINCT "订单ID"), 0), 4) AS coupon_order_ratio');
    const rateLine = sql.split('\n').find((l) => l.includes(' AS cost_rate'))!;
    expect(rateLine).toContain('a.subsidy_cost <= 0 OR a._act_lift <= 0 THEN CAST(NULL AS DOUBLE)');
    expect(rateLine).toContain('ROUND(a.subsidy_cost / a._act_lift, 4)');
  });

  it('核销率：分子 USED/已使用，分母仅 UNUSED+USED；缺状态列则 NULL', () => {
    const sql = defaultSql();
    expect(sql).toContain(`IN ('USED','已使用') THEN "优惠券ID" || '|' || COALESCE(CAST("用户ID" AS VARCHAR), '') END`);
    expect(sql).toContain(`IN ('UNUSED','未使用','USED','已使用')`);
    const noStatus = build(cfg({ dimensions: ['activity'] }, { activityIdCol: '活动ID', couponStatusCol: '' }));
    expect(noStatus).toContain('CAST(NULL AS DOUBLE) AS coupon_redemption_rate');
  });

  it('券覆盖占比判定只看优惠金额列（与成本口径无关）', () => {
    const sql = build(cfg(
      { dimensions: ['activity'], costCaliber: 'single_column', costSingleColumn: '总成本' },
      { activityIdCol: '活动ID', couponAmountCol: '优惠金额', orderIdCol: '订单ID' },
    ));
    expect(sql).toContain(`COUNT(DISTINCT CASE WHEN COALESCE(CAST("优惠金额" AS DOUBLE), 0) > 0 THEN "订单ID" END)`);
    expect(sql).not.toContain('总成本" AS DOUBLE), 0) > 0');
  });

  it('profit_effective_flag：1% 容差重复完整差值表达式（不引用别名）', () => {
    expect(defaultSql()).toContain(`WHEN (a._act_lift - a.subsidy_cost) > a.subsidy_cost * 0.01 THEN '盈利'`);
    expect(defaultSql()).toContain(`WHEN (a._act_lift - a.subsidy_cost) < -a.subsidy_cost * 0.01 THEN '亏损'`);
    const baseline = build(fullDims({ liftCaliber: 'baseline_delta' }));
    expect(baseline).toContain(`WHEN ((a._act_lift - b.base_net) - a.subsidy_cost) > a.subsidy_cost * 0.01 THEN '盈利'`);
    expect(baseline).toContain('CASE WHEN b.base_net IS NULL OR a.subsidy_cost IS NULL THEN CAST(NULL AS VARCHAR)');
  });
});

describe('validateOperatorSpecific（决策 #21）', () => {
  it('全缺配置默认：维度列与实付金额列错误，无「请至少选择一个拆分维度」', () => {
    const msgs = validateOf(makeNodes()).filter((e) => e.severity === ValidationSeverity.ERROR).map((e) => e.message);
    expect(msgs).toContain('活动维度尚未指定数据列');
    expect(msgs).toContain('优惠券维度尚未指定数据列');
    expect(msgs).toContain('直播间维度尚未指定数据列');
    expect(msgs).toContain('请指定订单实付金额列');
    expect(msgs).not.toContain('请至少选择一个拆分维度（活动 / 优惠券 / 直播间 / 活动类型）');
  });

  it('空 dimensions / 基线时间缺列 / topN 越界 / 口径专属列缺失 → 对应错误', () => {
    expect(validateOf(makeNodes(cfg({ dimensions: [] })))
      .some((e) => e.message.startsWith('请至少选择一个拆分维度'))).toBe(true);
    expect(validateOf(makeNodes(cfg(
      { dimensions: ['activity'], liftCaliber: 'baseline_delta' },
      { activityIdCol: '活动ID', netAmountCol: '实付金额', payTimeCol: '支付时间' },
    ))).some((e) => e.message === '基线对比需要订单支付时间与活动起止时间')).toBe(true);
    expect(validateOf(makeNodes(cfg({ dimensions: ['activity'], topN: 0 }, { activityIdCol: '活动ID', netAmountCol: '实付金额' })))
      .some((e) => e.message === '洞察数量需在 1–10 之间')).toBe(true);
    expect(validateOf(makeNodes(cfg({ dimensions: ['activity'], liftCaliber: 'product_amount' }, { activityIdCol: '活动ID', netAmountCol: '实付金额' })))
      .some((e) => e.message === '商品实付金额口径需要指定商品金额列')).toBe(true);
    expect(validateOf(makeNodes(cfg({ dimensions: ['activity'], costCaliber: 'single_column' }, { activityIdCol: '活动ID', netAmountCol: '实付金额' })))
      .some((e) => e.message === '单列成本口径需要指定成本列')).toBe(true);
  });

  it('费用槽全空：两条 warning，不阻断（无 error）', () => {
    const errs = validateOf(makeNodes(cfg(
      { dimensions: ['activity'], liftCaliber: 'custom_slots', costSlots: [], liftSlots: [] },
      { activityIdCol: '活动ID', netAmountCol: '实付金额' },
    )));
    expect(errs.filter((e) => e.severity === ValidationSeverity.ERROR)).toHaveLength(0);
    expect(errs.filter((e) => e.severity === ValidationSeverity.WARNING).map((e) => e.message)).toEqual([
      '成本费用项均未选择，投产比与成本率将置空',
      '拉动金额费用项均未选择，拉动金额与下游指标将置空',
    ]);
  });
});

// ---------------------------------------------------------------------------
// postProcess
// ---------------------------------------------------------------------------

const row = (partial: Partial<Record<string, unknown>>): Record<string, unknown> => ({
  dimension_type: 'activity',
  dimension_label: 'A1',
  order_count: 10n,
  quantity: 20,
  gmv: 5000,
  lift_amount: 3000,
  subsidy_cost: 1000,
  net_lift: 2000,
  roi: 3,
  cost_rate: 0.3333,
  coupon_redemption_rate: 0.5,
  coupon_order_ratio: 0.25,
  avg_order_value: 500,
  profit_effective_flag: '盈利',
  ...partial,
});

describe('postProcess 洞察卡（决策 #14）', () => {
  it('正常行：恰好 4 张卡、sortOrder 1–4、数值均为 number', async () => {
    build(fullDims());
    const res = await strategy.postProcess({
      data: [
        row({ dimension_label: 'A1', lift_amount: 3000, roi: 3 }),
        row({ dimension_type: 'coupon', dimension_label: 'C1', lift_amount: 500, subsidy_cost: 800, net_lift: -300, roi: 0.625, profit_effective_flag: '亏损' }),
        row({ dimension_type: 'natural', dimension_label: NATURAL_ROW_LABEL, lift_amount: 9999, net_lift: 9999, roi: 9 }),
      ],
      schema: [],
    });
    const insights = res.insightsData!.insights!;
    expect(insights).toHaveLength(4);
    expect(insights.map((i) => i.sortOrder)).toEqual([1, 2, 3, 4]);
    expect(insights[0].title).toBe('活动效果 TOP2');
    expect(insights[0].description).toContain('活动「A1」：盈利');
    expect(insights[0].description).not.toContain('自然成交');
    expect(insights[1].description).toContain('优惠券「C1」：亏损');
    // natural 行不进入 1–3 卡
    expect(insights[2].description).not.toContain('自然成交');
    for (const m of insights[0].metrics ?? []) {
      expect(typeof m.value).toBe('number');
    }
    expect(insights[0].metrics?.map((m) => m.label)).toEqual(['拉动金额', '补贴成本', '投产比（倍）']);
    expect(insights[3].description).toContain('跨维度行不可加总');
    expect(insights[3].description).toContain('拉动金额口径：活动期订单实付金额');
  });

  it('topN=1 截断；ROI 卡取成本>0 的最大 roi 行', async () => {
    build(fullDims({ topN: 1 }));
    const res = await strategy.postProcess({
      data: [
        row({ dimension_label: 'A1', lift_amount: 3000, roi: 2 }),
        row({ dimension_label: 'A2', lift_amount: 2000, subsidy_cost: 100, net_lift: 1900, roi: 20 }),
      ],
      schema: [],
    });
    const insights = res.insightsData!.insights!;
    expect(insights[0].title).toBe('活动效果 TOP1');
    expect(insights[0].description).toContain('A1');
    expect(insights[2].description).toContain('A2');
  });

  it('成本列全部为空：口径卡含成本缺失句且 ROI 指标不出现', async () => {
    build(fullDims());
    const res = await strategy.postProcess({
      data: [row({ subsidy_cost: null, net_lift: null, roi: null, cost_rate: null, profit_effective_flag: null })],
      schema: [],
    });
    const insights = res.insightsData!.insights!;
    expect(insights[3].description).toContain('成本列缺失或所选成本列在本区间内全部为空，投产比与成本率不可用');
    expect(insights[0].metrics?.some((m) => m.label === '投产比（倍）')).toBe(false);
    expect(insights[2].description).toContain('投产比不可用');
  });

  it('三标识未映射 / 缺券状态 / 缺优惠金额：口径卡条件句齐备', async () => {
    const c = cfg({ dimensions: ['activity_type'] }, { activityTypeCol: '活动类型', netAmountCol: '实付金额' });
    build(c);
    const res = await strategy.postProcess({ data: [row({})], schema: [] });
    const desc = res.insightsData!.insights![3].description;
    expect(desc).toContain('自然成交行等于全部订单合计');
    expect(desc).toContain('缺少优惠券状态字段，核销率不可用');
    expect(desc).toContain('未指定优惠金额列，券覆盖占比不可用');
  });

  it('空结果：1 张 warning 卡（sortOrder 1）+ displayConfig 与正常路径同源', async () => {
    build(fullDims());
    const empty = await strategy.postProcess({ data: [], schema: [{ name: 'dimension_type' }] });
    expect(empty.data).toHaveLength(0);
    expect(empty.schema).toHaveLength(1);
    const cards = empty.insightsData!.insights!;
    expect(cards).toHaveLength(1);
    expect(cards[0].iconKey).toBe('warning');
    expect(cards[0].sortOrder).toBe(1);
    const normal = await strategy.postProcess({ data: [row({})], schema: [] });
    expect(Object.keys(empty.displayConfig!.columnTooltips!)).toEqual(
      Object.keys(normal.displayConfig!.columnTooltips!),
    );
    expect(empty.displayConfig!.columnFormatters).toEqual(normal.displayConfig!.columnFormatters);
  });

  it('displayConfig：14 列 tooltip、8 列 formatter、无 defaultSort、比率/金额格式化器类型正确', async () => {
    build(fullDims());
    const res = await strategy.postProcess({ data: [row({})], schema: [] });
    const dc = res.displayConfig!;
    expect(Object.keys(dc.columnTooltips!)).toHaveLength(14);
    expect(dc.columnTooltips!.gmv).toContain('活动期订单实付金额合计');
    expect(dc.columnTooltips!.avg_order_value).toContain('活动期客单价');
    expect(dc.columnTooltips!.coupon_redemption_rate).toContain('过期 / 退款 / 禁用不计入分母');
    expect(dc.columnTooltips!.coupon_order_ratio).toContain('有优惠金额的订单数');
    expect(dc.defaultSort).toBeUndefined();
    expect(dc.columnFormatters!.cost_rate).toMatchObject({ type: 'percent_signed' });
    expect(dc.columnFormatters!.net_lift).toMatchObject({ type: 'currency_signed', unit: '元' });
    expect(Object.keys(dc.columnFormatters!)).toHaveLength(8);
  });

  it('baseline_delta 口径卡含全部基线说明句', async () => {
    build(fullDims({ liftCaliber: 'baseline_delta' }));
    const res = await strategy.postProcess({ data: [row({ lift_amount: null })], schema: [] });
    const desc = res.insightsData!.insights![3].description;
    for (const s of [
      '只与同一活动 / 券 / 直播 / 活动类型在活动前等长窗口内的实付金额对比',
      '最早活动开始至最晚活动结束',
      '前窗无同标识订单时',
      '自然行为活动期净额，不参与基线扣减',
      '维度与标识越多执行越慢',
    ]) expect(desc).toContain(s);
  });
});

describe('模块常量', () => {
  it('ACTIVITY_FIELD_MATCH_PATTERNS 共 22 项且值均为 RegExp', () => {
    const entries = Object.entries(ACTIVITY_FIELD_MATCH_PATTERNS);
    expect(entries).toHaveLength(22);
    for (const [, re] of entries) expect(re instanceof RegExp).toBe(true);
  });

  it('DIMENSION_LABEL 覆盖 4 维度 + natural', () => {
    expect(Object.keys(DIMENSION_LABEL)).toEqual(['activity', 'coupon', 'live_room', 'activity_type', 'natural']);
    expect(NATURAL_ROW_LABEL).toBe('自然成交（无活动/无券/无直播）');
  });

  it('strategy type/name', () => {
    expect(strategy.type).toBe(OperatorType.ACTIVITY_EFFECT_SPLIT);
    expect(strategy.name).toBe('活动效果拆分');
  });
});
