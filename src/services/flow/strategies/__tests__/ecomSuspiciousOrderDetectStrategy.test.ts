/**
 * Phase 1 单测 — fn_ecom_suspicious_order_detect 策略（计划 §Phase 1 测试矩阵）
 * 全部断言基于生成的 SQL 文本与纯函数，不依赖真实 DuckDB。
 */
import { describe, it, expect } from 'vitest';
import {
  EcomSuspiciousOrderDetectStrategy,
  DEGRADE_SQL,
  isAmountDeviation,
  buildRiskEvidence,
  buildSuggestion,
} from '../ecomSuspiciousOrderDetectStrategy';
import {
  DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG,
  FlowNodeType,
  ValidationSeverity,
  buildScoreCalibration,
  cloneSuspiciousOrderDetectConfig,
  collectEffectiveRules,
  collectSuspiciousOrderBlockers,
  type FlowNode,
  type SuspiciousOrderDetectConfig,
  type SuspiciousOrderDetectFieldMapping,
} from '../../types';

const strategy = new EcomSuspiciousOrderDetectStrategy();

const makeNodes = (config?: SuspiciousOrderDetectConfig): FlowNode[] => [
  { id: 't1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 'ecom_orders' } } as FlowNode,
  {
    id: 's1',
    type: FlowNodeType.SELECT,
    position: { x: 100, y: 0 },
    data: config ? { suspiciousOrderDetectConfig: config } : {},
  } as FlowNode,
];

/** 计划 §Phase 1 边界：绕过 `protected` 直接驱动 SQL 拼装 */
const build = (config: SuspiciousOrderDetectConfig | undefined, userWhere = ''): string =>
  (
    strategy as unknown as {
      buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string;
    }
  ).buildOperatorSql(makeNodes(config), [], undefined, userWhere);

/** 基于默认配置的构造器：浅覆盖顶层 + 浅覆盖 fieldMapping */
const cfg = (
  patch: Partial<SuspiciousOrderDetectConfig> = {},
  mappingPatch: Partial<SuspiciousOrderDetectFieldMapping> = {},
): SuspiciousOrderDetectConfig => {
  const c = cloneSuspiciousOrderDetectConfig(DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG);
  Object.assign(c, patch);
  Object.assign(c.fieldMapping, mappingPatch);
  return c;
};

/** 全部 11 列映射（快照与规则判据用例的基准夹具） */
const ALL_COLS: SuspiciousOrderDetectFieldMapping = {
  userIdCol: 'buyer_id',
  orderTimeCol: 'create_time',
  orderIdCol: 'order_id',
  amountCol: 'pay_amount',
  originalAmountCol: 'original_price',
  addressCol: 'receiver_address',
  mobileCol: 'receiver_mobile',
  deviceCol: 'utdid',
  orderStatusCol: 'trade_status',
  registerTimeCol: 'user_reg_time',
  firstOrderTimeCol: 'first_order_time',
};

const full = (patch: Partial<SuspiciousOrderDetectConfig> = {}): SuspiciousOrderDetectConfig => cfg(patch, ALL_COLS);

/** 去掉某些列映射（模拟数据缺列降级） */
const withoutCols = (cols: (keyof SuspiciousOrderDetectFieldMapping)[]): SuspiciousOrderDetectFieldMapping => {
  const m = { ...ALL_COLS };
  for (const c of cols) m[c] = '';
  return m;
};

const D = DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG;
const withWindows = (patch: Partial<SuspiciousOrderDetectConfig['windows']>) =>
  full({ windows: { ...D.windows, ...patch } });
const withThresholds = (patch: Partial<SuspiciousOrderDetectConfig['thresholds']>) =>
  full({ thresholds: { ...D.thresholds, ...patch } });
const withToggles = (patch: Partial<SuspiciousOrderDetectConfig['ruleToggles']>) =>
  full({ ruleToggles: { ...D.ruleToggles, ...patch } });

/** CTE 数量：0.8 冻结清单以 `<name> AS (` 计 */
const cteCount = (sql: string): number => (sql.match(/AS \(/g) ?? []).length;

describe('SQL 骨架与分桶', () => {
  it('以 WITH 开头，包含 0.8 全部核心 CTE', () => {
    const sql = build(full());
    expect(sql.startsWith('WITH')).toBe(true);
    for (const name of ['src_all', 'src', 'ref', 'usr', 'burst', 'addr_clu', 'addr_user', 'ord', 'abn', 'feat', 'sc']) {
      expect(sql).toContain(`${name} AS (`);
    }
  });

  it('CTE 数量：全列映射 + 核心 5 项开启 = 15；不映射 addressCol = 13', () => {
    expect(cteCount(build(full()))).toBe(15);
    expect(cteCount(build(cfg({}, withoutCols(['addressCol']))))).toBe(13);
  });

  // 表达式靠字符串拼接，丢实参（如 NULLIF 少一个参数）在 JS 层不会报错，此处做结构配平兜底
  it('生成的 SQL 括号与单引号配平，且地址键 NULLIF 保留空串归 NULL 的第二实参', () => {
    for (const sql of [build(full()), build(cfg({}, withoutCols(['addressCol']))), build(withToggles({ newAccounts: false }))]) {
      expect(sql.split('(').length).toBe(sql.split(')').length);
      expect(sql.split("'").length % 2).toBe(1);
    }
    expect(build(full())).toContain("'\\s', '', 'g')), '')");
    // 回归：ord 的 joins 链必须以 FROM 起头（曾漏写关键字，JS 层无感、DuckDB 才报错）
    expect(build(full())).toMatch(/AS is_abnormal\n {2}FROM src\n/);
  });

  // 回归：8 项全关时 is_abnormal 的 OR 列表为空，曾生成 `CASE WHEN  THEN`（JS 字符串断言全过、DuckDB 解析失败）
  it('任意开关/缺列组合都不产生空 CASE 条件', () => {
    const OFF_ALL: SuspiciousOrderDetectConfig['ruleToggles'] = {
      burstOrders: false,
      addressCluster: false,
      mobileCluster: false,
      deviceCluster: false,
      newAccounts: false,
      priceAnomaly: false,
      amountDeviation: false,
      refundAnomaly: false,
    };
    const variants = [
      full(),
      withToggles({ newAccounts: false }),
      full({ ruleToggles: OFF_ALL }),
      // 唯一启用规则因缺列被跳过 → OR 列表退化为 FALSE 而非空
      cfg({ ruleToggles: { ...OFF_ALL, priceAnomaly: true } }, withoutCols(['originalAmountCol'])),
      cfg({}, withoutCols(['addressCol'])),
    ];
    for (const c of variants) {
      const sql = build(c);
      expect(sql.split('(').length).toBe(sql.split(')').length);
      expect(sql.split("'").length % 2).toBe(1);
      expect(sql).not.toMatch(/WHEN\s+THEN/);
      expect(sql).not.toMatch(/\b(AND|OR)\s+THEN\b/);
      expect(sql).not.toMatch(/CASE WHEN\s+(AND|OR)\b/);
    }
    expect(build(full({ ruleToggles: OFF_ALL }))).toContain('CASE WHEN FALSE THEN TRUE ELSE FALSE END AS is_abnormal');
  });

  it('毫秒整除分桶随窗口参数联动（D13）', () => {
    const sql = build(full());
    expect(sql).toContain('/ 3600000');
    expect(sql).toContain('/ 7200000');
    expect(build(withWindows({ burstWindowMinutes: 30 }))).toContain('/ 1800000');
    expect(build(withWindows({ burstWindowMinutes: 45 }))).toContain('/ 2700000');
  });

  it('observationDays = 0 表示全量（不加时间过滤）；> 0 时按毫秒回看', () => {
    expect(build(full())).not.toContain('MAX(order_time_ms) FROM src_all) -');
    const sql = build(withWindows({ observationDays: 7 }));
    expect(sql).toContain('(SELECT MAX(order_time_ms) FROM src_all) - 604800000');
  });

  it('归一化键：地址前缀、手机号纯数字清洗、全角转半角', () => {
    const sql = build(full());
    expect(sql).toContain('LEFT(');
    expect(sql).toContain(', 15)');
    expect(build(withThresholds({ addressPrefixLength: 20 }))).toContain(', 20)');
    expect(sql).toContain('[^0-9]');
    expect(sql).toContain('translate(');
  });

  it('生成的 SQL 不含任何分号（duckDBUdfService 按 ; 切分语句）', () => {
    expect(build(full()).includes(';')).toBe(false);
    expect(build(cfg()).includes(';')).toBe(false);
  });
});

describe('规则开关与静态降级', () => {
  it('关闭规则不进入任何计分片段', () => {
    expect(build(withToggles({ burstOrders: false }))).not.toContain('max_window_orders >=');
    expect(build(withToggles({ priceAnomaly: false }))).not.toContain('price_anomaly_orders >=');
  });

  it('缺 addressCol → 聚集 CTE 整对省略，skipped_rules 标注且 data_quality_flag = degraded', () => {
    const sql = build(cfg({}, withoutCols(['addressCol'])));
    // 0.6 要求 `addr_cluster_users` 列恒存在，故只断言 CTE 定义本身消失
    expect(sql).not.toContain('addr_clu AS (');
    expect(sql).not.toContain('addr_user AS (');
    expect(sql).not.toContain('ac."key_users"');
    expect(sql).toContain('同地址多账号');
    expect(sql).toContain("'degraded'");
  });

  it('缺金额 + 原价列且开启改价异常 → skipped_rules 含改价异常', () => {
    const sql = build(
      cfg({ ruleToggles: { ...D.ruleToggles, priceAnomaly: true } }, withoutCols(['amountCol', 'originalAmountCol'])),
    );
    expect(sql).toContain('改价异常');
  });

  it('R5 三级年龄链：注册时间 → 首次下单时间 → 本批首单估算', () => {
    expect(build(full())).toContain('注册时间');
    expect(build(cfg({}, withoutCols(['registerTimeCol'])))).toContain('首次下单时间');
    expect(build(cfg({}, withoutCols(['registerTimeCol', 'firstOrderTimeCol'])))).toContain('本批首单估算');
  });

  it('userWhere 注入 src_all 且只出现一次；空串时 src_all 无 WHERE', () => {
    const sql = build(full(), `"order_status" <> 'X'`);
    expect(sql.split(`"order_status" <> 'X'`).length - 1).toBe(1);
    expect(sql).toContain(`WHERE ("order_status" <> 'X')`);
    const noWhere = build(full(), '');
    expect(noWhere.slice(0, noWhere.indexOf('\nsrc AS ('))).not.toContain('WHERE');
  });

  it('传入带 WHERE 前缀的条件时不重复 WHERE', () => {
    const sql = build(full(), 'WHERE amount > 0');
    expect(sql).toContain('WHERE (amount > 0)');
    expect(sql).not.toContain('WHERE WHERE');
  });

  it('无 table 节点 / 无配置 → DEGRADE_SQL（不含 WITH）', () => {
    const noTable = (
      strategy as unknown as { buildOperatorSql: (n: FlowNode[], e: never[], p: undefined, w: string) => string }
    ).buildOperatorSql([makeNodes(full())[1]], [], undefined, '');
    expect(noTable).toBe(DEGRADE_SQL);
    expect(noTable).not.toContain('WITH');
    expect(build(undefined)).toBe(DEGRADE_SQL);
  });

  it('buildOperatorSql 不残留上一个节点的配置（_lastConfig）', () => {
    build(full({ topN: 9 }));
    expect(build(undefined)).toBe(DEGRADE_SQL);
    expect((strategy as unknown as { _lastConfig: unknown })._lastConfig).toBeNull();
  });
});

describe('八条规则判据方向（金标准）', () => {
  it('R1 密集下单：闭区间 >= 阈值，桶内订单去重计数，按 (user_id, bkt_burst) 分组', () => {
    const sql = build(full());
    expect(sql).toContain('>= 10');
    expect(sql).toContain('COUNT(DISTINCT "order_id") AS bkt_orders');
    expect(sql).toContain('GROUP BY user_id, bkt_burst');
  });

  it('R2/R3/R4 聚集：同窗口主体去重数 >= 阈值，阈值可配', () => {
    const sql = build(full());
    expect(sql).toContain('COUNT(DISTINCT "user_id")');
    expect(sql).toContain('ac."key_users" >= 3');
    expect(build(withThresholds({ addrClusterUsers: 5 }))).toContain('ac."key_users" >= 5');
  });

  it('R5 批量小号：年龄上界 <=、订单数下界 >=、负年龄夹取且基准缺失保持 NULL', () => {
    const sql = build(full());
    expect(sql).toContain('<= 7');
    expect(sql).toContain('usr.order_count >= 3');
    expect(sql).toContain('GREATEST(0');
    expect(sql).toContain('CASE WHEN usr.register_ms IS NULL THEN NULL ELSE');
  });

  it('R6 改价异常：比较倍数乘在原价一侧（amount <= original_amount * ratio）', () => {
    const sql = build(full());
    expect(sql).toContain('"original_amount" > 0');
    expect(sql).toContain('"amount" <= "original_amount" * 0.3');
    expect(sql).not.toContain('"amount" * 0.3 >=');
  });

  it('R7 金额突变：留一均值基线不含自身，倍数可配，先置 amount_count >= 2', () => {
    const sql = build(full());
    expect(sql).toContain('usr.amount_count >= 2');
    expect(sql).toContain('(usr.amount_sum - "amount")');
    expect(sql).toContain('* 3');
    expect(build(withThresholds({ amountDeviationMultiple: 4 }))).toContain('* 4');
  });

  it('R7 分母口径：COUNT("amount") 与 SUM 同口径，禁止回退成订单数', () => {
    const sql = build(full());
    expect(sql).toContain('COUNT("amount") AS amount_count');
    expect(sql).toContain('NULLIF(usr.amount_count - 1');
    expect(sql).not.toContain('order_count - 1');
  });

  it('R8 退款异常：状态值中英双语可配，空值集合退化为恒不命中', () => {
    const sql = build(full());
    expect(sql).toContain('已退款');
    expect(sql).toContain('REFUNDED');
    const custom = build(cfg({ refundStatusValues: '已退款,已取消' }, ALL_COLS));
    expect(custom).toContain("'已退款'");
    expect(custom).toContain("'已取消'");
    expect(custom).not.toContain('RETURNED');
    expect(build(cfg({ refundStatusValues: '' }, ALL_COLS))).not.toContain('UPPER(TRIM(');
  });

  it('R8 单引号转义不破坏 SQL（值集合按 UPPER 口径落库）', () => {
    expect(build(cfg({ refundStatusValues: "it's,已退款" }, ALL_COLS))).toContain("'IT''S'");
  });

  it('D14 去重口径：异常订单数按 order_id 去重，且不用 LEAST( 夹取订单数相加', () => {
    const sql = build(full());
    expect(sql).toContain('COUNT(DISTINCT "order_id") FILTER (WHERE is_abnormal)');
    // must-fix #2：禁止用 LEAST( 做异常订单数相加夹取；risk_score 的 100 上限走 CASE WHEN
    expect(sql).not.toMatch(/LEAST\([^)]*order_count_abnormal/i);
    expect(sql).toContain('CASE WHEN ');
    const noOrderId = build(cfg({}, withoutCols(['orderIdCol'])));
    expect(noOrderId).toContain('COUNT(*) FILTER (WHERE is_abnormal)');
    expect(noOrderId).not.toContain('COUNT(DISTINCT "order_id")');
  });

  // must-fix #2：100 分上限必须存在（评审要求保留，只是不得用 LEAST 实现）
  it('risk_score 保留 100 分上限（CASE WHEN 实现，非 LEAST）', () => {
    const sql = build(full());
    expect(sql).toMatch(/CASE WHEN [^>]+> 100 THEN 100 ELSE /);
    expect(sql).not.toContain('LEAST(');
  });

  // must-fix #1：burst 是 (user_id, bkt) 粒度。ord 侧按 (user_id, bkt) 双键关联订单行（一单一行，
  // 不扇出）；feat 侧必须先按 user_id 聚合再接入，否则破坏「一行一主体」。
  it('burst 粒度不扇出：ord 双键关联、feat 经 user_id 聚合子查询接入', () => {
    const sql = build(full());
    const feat = sql.slice(sql.indexOf('feat AS ('));
    expect(feat).toContain('SELECT user_id, MAX(bkt_orders) AS max_window_orders FROM burst GROUP BY user_id');
    expect(feat).not.toContain('LEFT JOIN burst');
    // ord 侧必须同时限定桶号，否则一用户跨多桶会把订单行重复计入
    expect(sql).toMatch(/LEFT JOIN burst ON burst\.user_id = src\.user_id AND burst\.bkt_burst = src\.bkt_burst/);
  });

  it('未启用规则的计数列输出 NULL 而非 0', () => {
    expect(build(full())).toContain('NULL::BIGINT AS refund_count');
    expect(build(withToggles({ refundAnomaly: true }))).not.toContain('NULL::BIGINT AS refund_count');
  });
});

describe('评分校准（纯函数）', () => {
  it('默认权重 → 命中 N 项最高分与档位映射', () => {
    const cal = buildScoreCalibration(D.weights, D.tiers);
    expect(cal[0]).toEqual({ hitCount: 1, maxScore: 20, level: '低' });
    expect(cal[1]).toEqual({ hitCount: 2, maxScore: 40, level: '中' });
    expect(cal[2]).toEqual({ hitCount: 3, maxScore: 55, level: '中' });
    expect(cal[3]).toEqual({ hitCount: 4, maxScore: 70, level: '高' });
    expect(cal[4]).toEqual({ hitCount: 5, maxScore: 80, level: '严重' });
    expect(cal[7]).toEqual({ hitCount: 8, maxScore: 100, level: '严重' });
  });

  it('单项权重 100 → 命中 1 项即严重', () => {
    const cal = buildScoreCalibration(
      { ...D.weights, burstOrders: 100, addressCluster: 0, mobileCluster: 0, deviceCluster: 0, newAccounts: 0, priceAnomaly: 0, amountDeviation: 0, refundAnomaly: 0 },
      D.tiers,
    );
    expect(cal[0]).toEqual({ hitCount: 1, maxScore: 100, level: '严重' });
  });
});

describe('R7 判据 JS 镜像（0.4 可命中性四例）', () => {
  it('[100,100,100,100,400] → 仅 400 命中', () => {
    expect([100, 100, 100, 100, 400].map((a) => isAmountDeviation(a, 800, 5, 3))).toEqual([false, false, false, false, true]);
  });

  it('[100,400] → 仅 400 命中', () => {
    expect(isAmountDeviation(100, 500, 2, 3)).toBe(false);
    expect(isAmountDeviation(400, 500, 2, 3)).toBe(true);
  });

  it('[100,100,100] → 全部不命中', () => {
    expect([100, 100, 100].map((a) => isAmountDeviation(a, 300, 3, 3))).toEqual([false, false, false]);
  });

  it('仅 1 笔非空金额 → 全部不命中（分母是 COUNT(amount) 而非行数）', () => {
    expect(isAmountDeviation(100, 100, 1, 3)).toBe(false);
    expect(isAmountDeviation(null, null, 5, 3)).toBe(false);
  });
});

describe('SQL 快照', () => {
  it('默认配置（核心 5 项开启 + 全列映射）', () => {
    expect(build(full())).toMatchSnapshot();
  });

  it('8 项全开（映射全部 11 列）', () => {
    expect(build(cfg({ ruleToggles: { burstOrders: true, addressCluster: true, mobileCluster: true, deviceCluster: true, newAccounts: true, priceAnomaly: true, amountDeviation: true, refundAnomaly: true } }, ALL_COLS))).toMatchSnapshot();
  });

  it('核心 5 项全关且 priceAnomaly 开启', () => {
    expect(build(cfg({ ruleToggles: { burstOrders: false, addressCluster: false, mobileCluster: false, deviceCluster: false, newAccounts: false, priceAnomaly: true, amountDeviation: false, refundAnomaly: false } }, ALL_COLS))).toMatchSnapshot();
  });

  // 回归（review 问题 1）：NULL user_id 不得聚成「幽灵主体」——usr CTE 必须先过滤再分组
  it('usr CTE 过滤 NULL user_id（幽灵主体回归）', () => {
    const sql = build(full());
    const usrSeg = sql.slice(sql.indexOf('usr AS ('), sql.indexOf(',\nburst AS (') > -1 ? sql.indexOf(',\nburst AS (') : sql.length);
    expect(usrSeg).toContain('FROM src\n  WHERE user_id IS NOT NULL\n  GROUP BY user_id');
  });
});



// ============================================================================
// Phase 2 — validate：0.7 阻断（ERROR）与缺列降级提示（WARNING）
// ============================================================================

const validateOf = (config?: SuspiciousOrderDetectConfig) => strategy.validate(makeNodes(config), []);
const errsOf = (c?: SuspiciousOrderDetectConfig) => validateOf(c).filter((e) => e.severity === ValidationSeverity.ERROR);
const warnsOf = (c?: SuspiciousOrderDetectConfig) => validateOf(c).filter((e) => e.severity === ValidationSeverity.WARNING);

describe('validate（Phase 2）', () => {
  it('未指定用户ID列 → ERROR，文案含「用户ID列」', () => {
    const errs = errsOf(cfg({}, withoutCols(['userIdCol'])));
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => e.message.includes('用户ID列'))).toBe(true);
  });

  it('改价异常已开启但缺原价列 → 仅 WARNING，blockers 仍为空', () => {
    const c = cfg({ ruleToggles: { ...D.ruleToggles, priceAnomaly: true } }, withoutCols(['originalAmountCol']));
    expect(collectSuspiciousOrderBlockers(c)).toHaveLength(0);
    expect(errsOf(c)).toHaveLength(0);
    expect(warnsOf(c).some((w) => w.message.includes('改价异常'))).toBe(true);
  });

  it('addressPrefixLength=8 → WARNING、无 ERROR', () => {
    const c = full({ thresholds: { ...D.thresholds, addressPrefixLength: 8 } });
    expect(errsOf(c)).toHaveLength(0);
    expect(warnsOf(c).some((w) => w.message.includes('地址前缀过短'))).toBe(true);
  });

  it('默认配置 + 11 列全映射 → 零 ERROR 零 WARNING（用户主动关闭增强规则不提示）', () => {
    expect(errsOf(full())).toHaveLength(0);
    expect(warnsOf(full())).toHaveLength(0);
  });

  it('覆盖摘要 WARNING：仅在缺依赖列时出现，且用 effective 口径', () => {
    const missing3 = cfg({}, withoutCols(['addressCol', 'mobileCol', 'deviceCol']));
    const summary = warnsOf(missing3).filter((w) => w.message.includes('生效'))
      .map((w) => w.message).join('|');
    expect(summary).toContain('生效 2 项');
    expect(summary).toContain('跳过 3 项');

    expect(warnsOf(full()).some((w) => w.message.includes('生效'))).toBe(false);

    const priceMissing = cfg({ ruleToggles: { ...D.ruleToggles, priceAnomaly: true } }, withoutCols(['originalAmountCol']));
    const priceSummary = warnsOf(priceMissing).filter((w) => w.message.includes('生效'))
      .map((w) => w.message).join('|');
    expect(priceSummary).toContain('跳过 1 项');
    expect(priceSummary).not.toContain('8/8');
  });
});

// ============================================================================
// Phase 2 — postProcess：两列注入 / 等级排序 / 4 张洞察卡片
// ============================================================================

/** 0.6 的 20 列输出行夹具（列名与 SQL 逐字对齐） */
const rowOf = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  user_id: 'U1', order_count: 11, order_count_abnormal: 11, risk_score: 70, risk_level: '高',
  risk_type: ['密集下单', '同地址多账号'], max_window_orders: 11, addr_cluster_users: 3,
  mobile_cluster_users: 3, device_cluster_accounts: 3, account_age_days: null, age_basis: '注册时间',
  refund_count: 0, refund_rate: null, price_anomaly_orders: 0, amount_deviation_orders: 0,
  order_ids: '[A0] 等 11 笔', skipped_rules: '', data_quality_flag: 'ok', ...patch,
});

/** postProcess 的配置唯一来源是 buildOperatorSql 记录的 _lastConfig，测试须按真实顺序驱动 */
const runPost = async (config: SuspiciousOrderDetectConfig | undefined, data: unknown[], schema: unknown[] = []) => {
  build(config);
  return strategy.postProcess({ data, schema });
};

const card = (r: Awaited<ReturnType<typeof runPost>>, id: string) =>
  (r.insightsData?.insights ?? []).find((i) => i.id === id);

describe('postProcess（Phase 2）', () => {
  it('空结果 → 1 张 warning 卡 + displayConfig 照常返回', async () => {
    const r = await runPost(full(), []);
    expect(r.data).toEqual([]);
    expect(r.insightsData?.insights).toHaveLength(1);
    expect(r.insightsData?.insights[0].iconKey).toBe('warning');
    expect(r.displayConfig).toBeDefined();
  });

  it('正常 3 行 → 每行注入 risk_evidence 与 suggestion，卡片固定 4 张', async () => {
    const r = await runPost(full(), [rowOf(), rowOf({ user_id: 'U2', risk_level: '中', risk_score: 40 })]);
    expect(r.insightsData?.insights).toHaveLength(4);
    for (const row of r.data) {
      expect(typeof row.risk_evidence).toBe('string');
      expect(typeof row.suggestion).toBe('string');
    }
    for (const c of r.insightsData?.insights ?? []) {
      expect(c.description).toBeTruthy();
      expect(c.cardType).toBe('standard');
    }
  });

  it('排序唯一真值：严重 → 中 → 低（同级按分数降序）', async () => {
    const r = await runPost(full(), [
      rowOf({ user_id: 'U1', risk_level: '低', risk_score: 20 }),
      rowOf({ user_id: 'U2', risk_level: '严重', risk_score: 85 }),
      rowOf({ user_id: 'U3', risk_level: '中', risk_score: 40 }),
      rowOf({ user_id: 'U4', risk_level: '中', risk_score: 55 }),
    ]);
    expect(r.data.map((x) => x.user_id)).toEqual(['U2', 'U4', 'U3', 'U1']);
  });

  it('证据文案由命中规则拼装：密集下单 + 同地址', async () => {
    const r = await runPost(full(), [rowOf()]);
    const evidence = String(r.data[0].risk_evidence);
    expect(evidence).toContain('小时内最多下单 11 笔');
    expect(evidence).toContain('同一收货地址关联 3 个账号');
    // 未命中规则（改价/金额/退款）不得出现在证据里
    expect(evidence).not.toContain('折');
    expect(evidence).not.toContain('退款');
  });

  it('schema 追加两列，已存在则不重复追加', async () => {
    const base = [{ name: 'user_id', type: 'VARCHAR' }];
    const added = await runPost(full(), [rowOf()], base);
    expect((added.schema ?? []).map((s) => (s as { name?: string }).name))
      .toEqual(['user_id', 'risk_evidence', 'suggestion']);

    const preset = await runPost(full(), [rowOf()],
      [...base, { name: 'risk_evidence', type: 'VARCHAR' }, { name: 'suggestion', type: 'VARCHAR' }]);
    expect((preset.schema ?? []).filter((s) => (s as { name?: string }).name === 'suggestion')).toHaveLength(1);
  });

  it('卡片 1「生效规则」与 collectEffectiveRules 同源：默认 5、全开 8、缺聚集三列 2', async () => {
    const allOn = { ...D.ruleToggles, priceAnomaly: true, amountDeviation: true, refundAnomaly: true };
    const missingCluster = cfg({}, withoutCols(['addressCol', 'mobileCol', 'deviceCol']));
    const cases: Array<[SuspiciousOrderDetectConfig, number]> = [
      [full(), 5],
      [full({ ruleToggles: allOn }), 8],
      [missingCluster, 2],
    ];
    for (const [c, expected] of cases) {
      expect(collectEffectiveRules(c).effective.length).toBe(expected);
      const m = (card(await runPost(c, [rowOf()]), 'risk-overview')?.metrics ?? [])
        .find((x) => x.label === '生效规则');
      expect(m?.value).toBe(expected);
    }
  });

  it('卡片 2：topN 截断 + 「等 N 个」收尾；无严重主体时保留卡片并改文案', async () => {
    const severe = [
      rowOf({ user_id: 'U1', risk_level: '严重', risk_score: 90 }),
      rowOf({ user_id: 'U2', risk_level: '严重', risk_score: 85 }),
      rowOf({ user_id: 'U3', risk_level: '严重', risk_score: 80 }),
    ];
    const desc = String(card(await runPost(full({ topN: 2 }), severe), 'critical-subjects')?.description);
    expect(desc).toContain('U1');
    expect(desc).toContain('U2');
    expect(desc).not.toContain('U3');
    expect(desc).toContain('等 3 个');

    const none = String(card(await runPost(full(), [rowOf({ risk_level: '中', risk_score: 40 })]), 'critical-subjects')?.description);
    expect(none).toBe('本次未发现严重风险主体');
  });

  it('卡片 3：三维度聚集分段；均未命中时给「未发现多账号聚集」', async () => {
    const gang = rowOf({ risk_type: ['密集下单', '同地址多账号', '同手机多账号', '同设备多账号'] });
    const desc = String(card(await runPost(full(), [gang, gang]), 'cluster-gangs')?.description);
    expect(desc).toContain('同地址 2 个主体（关联账号合计 6）');
    expect(desc).toContain('同手机 2 个主体（关联账号合计 6）');
    expect(desc).toContain('同设备 2 个主体（关联账号合计 6）');

    // 分段只跟随 risk_type 命中的规则：仅有聚集数值列但未命中 → 不出现聚集分段
    const partial = String(card(await runPost(full(), [rowOf()]), 'cluster-gangs')?.description);
    expect(partial).toContain('同地址');
    expect(partial).not.toContain('同手机');

    const clean = String(card(await runPost(full(), [rowOf({ risk_type: ['密集下单'] })]), 'cluster-gangs')?.description);
    expect(clean).toBe('未发现多账号聚集');
  });

  it('卡片 4 三态文案：已关闭 / 缺列跳过 / 全部纳入（互不串台）', async () => {
    const defaultDesc = String(card(await runPost(full(), [rowOf()]), 'rule-coverage')?.description);
    expect(defaultDesc).toContain('已关闭 3 项');
    expect(defaultDesc).toContain('生效 5/8 项');
    expect(defaultDesc).not.toContain('8 项规则全部纳入');

    const allOn = { ...D.ruleToggles, priceAnomaly: true, amountDeviation: true, refundAnomaly: true };
    const allOnDesc = String(card(await runPost(full({ ruleToggles: allOn }), [rowOf()]), 'rule-coverage')?.description);
    expect(allOnDesc).toContain('8 项规则全部纳入本次检测');
    expect(allOnDesc).not.toContain('已关闭');

    const priceMissing = cfg({ ruleToggles: { ...D.ruleToggles, priceAnomaly: true } }, withoutCols(['originalAmountCol']));
    const skipDesc = String(card(await runPost(priceMissing, [rowOf()]), 'rule-coverage')?.description);
    expect(skipDesc).toContain('跳过 1 项');
    expect(skipDesc).toContain('改价异常');
  });

  it('行计数口径 tooltip 跟随 orderIdCol 配置（不写死）', async () => {
    const cols = ['order_count', 'max_window_orders', 'order_count_abnormal'];
    const withIds = (await runPost(full(), [rowOf()])).displayConfig?.columnTooltips ?? {};
    const withoutIds = (await runPost(cfg({}, withoutCols(['orderIdCol'])), [rowOf()])).displayConfig?.columnTooltips ?? {};
    for (const c of cols) {
      expect(withoutIds[c] ?? '').toContain('按数据行计数');
      expect(withIds[c] ?? '').not.toContain('按数据行计数');
    }
  });

  it('幽灵配置：未 buildSql 直接 postProcess 不抛错且不串上一个节点配置', async () => {
    const fresh = new EcomSuspiciousOrderDetectStrategy();
    const empty = await fresh.postProcess({ data: [], schema: [] });
    expect(empty.insightsData?.insights).toHaveLength(1);
    expect(empty.displayConfig).toBeDefined();

    // A 节点（8 项全开 + 自定义 1 折）→ 无配置节点（DEGRADE_SQL）→ 文案必须退回默认口径
    const customA = full({
      ruleToggles: { ...D.ruleToggles, priceAnomaly: true, amountDeviation: true, refundAnomaly: true },
      thresholds: { ...D.thresholds, priceAnomalyMaxRatio: 0.1 },
    });
    expect(build(customA)).toContain('* 0.1');
    expect(build(undefined)).toBe(DEGRADE_SQL);
    const r = await strategy.postProcess({ data: [rowOf({ risk_type: ['改价异常'], price_anomaly_orders: 2 })], schema: [] });
    expect(String(r.data[0].risk_evidence)).toContain('不足原价的 3 折');
    expect(String(r.data[0].risk_evidence)).not.toContain('1 折');
    expect(String(card(r, 'rule-coverage')?.description)).not.toContain('8 项规则全部纳入');
  });
});

describe('证据与建议纯函数', () => {
  it('0.3 折算为 3 折（不出现浮点尾噪 3.0）', () => {
    expect(buildRiskEvidence(rowOf({ risk_type: ['改价异常'], price_anomaly_orders: 2 }), full()))
      .toBe('2 笔订单实付不足原价的 3 折');
  });

  it('金额突变与退款异常文案取配置倍数与行内占比', () => {
    const c = full({ thresholds: { ...D.thresholds, amountDeviationMultiple: 4 } });
    expect(buildRiskEvidence(rowOf({ risk_type: ['金额突变'], amount_deviation_orders: 3 }), c))
      .toBe('3 笔订单金额超过其余订单平均金额 4 倍');
    expect(buildRiskEvidence(rowOf({ risk_type: ['退款异常'], refund_count: 2, refund_rate: 66.7 }), full()))
      .toBe('退款/取消 2 笔，占比 66.7%');
  });

  it('批量小号带年龄基准；数值列为 NULL 时跳过分段而非兜底 0', () => {
    expect(buildRiskEvidence(rowOf({ risk_type: ['批量小号'], account_age_days: 0, age_basis: '本表最早下单时间' }), full()))
      .toBe('账号年龄约 0 天（基准：本表最早下单时间）');
    expect(buildRiskEvidence(rowOf({ risk_type: ['批量小号'], account_age_days: null }), full())).toBe('');
    expect(buildRiskEvidence(rowOf({ risk_type: ['未知规则'] }), full())).toBe('');
  });

  it('BIGINT 计数列可正常渲染', () => {
    expect(buildRiskEvidence(rowOf({ risk_type: ['密集下单'], max_window_orders: BigInt(11) }), full()))
      .toBe('1 小时内最多下单 11 笔');
  });

  it('suggestion 按等级映射，未知等级退回持续观察', () => {
    expect(buildSuggestion('严重')).toBe('立即拦截并人工复核');
    expect(buildSuggestion('高')).toBe('人工复核后决定处置');
    expect(buildSuggestion('中')).toBe('加入限购/观察名单');
    expect(buildSuggestion('低')).toBe('持续观察');
    expect(buildSuggestion(null)).toBe('持续观察');
  });
});
