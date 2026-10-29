/**
 * fn_ecom_suspicious_order_detect — 电商异常订单识别（恶意下单 / 刷单 / 黄牛，feature 15）
 *
 * SQL 管道（0.8，全开时 15 个 CTE、恰好 1 个 WITH、零分号）：
 *   WITH src_all  归一化投影 + 毫秒分桶（userWhere 只注入这一层）
 *     → src       observationDays > 0 时按最新订单时间回溯过滤
 *     → ref       基准时刻 MAX(order_time_ms)
 *     → usr       主体级聚合（order_count / amount_sum / amount_count / first_ts / *_ms / order_ids）
 *     → burst     (user_id, bkt_burst) 订单计数
 *     → addr|mobile|device 的 _clu / _user 两两成对（仅规则开启且列已映射时生成）
 *     → ord       订单级 8 个命中标记 + is_abnormal（去重口径 D14）
 *     → abn       主体级异常订单去重计数
 *     → feat      与 sc 同源的用户级异常订单去重计数 + 全部配置快照 + 证据文案
 *     → sc        每主体一行：8 条规则分值 + 命中标签（标签与分值同源）
 *   SELECT 只做分档、`list_filter` 拼 risk_type、skipped_rules / data_quality_flag 常量
 *   WHERE 风险分 > 0，ORDER BY risk_score DESC, user_id
 *
 * 分桶统一走 `ts_to_epoch_ms` 后的毫秒整除（D13）；`observationDays = 0` 表示全量。
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG,
  SUSPICIOUS_ORDER_RULE_KEYS,
  SUSPICIOUS_RULE_LABEL,
  cloneSuspiciousOrderDetectConfig,
  collectSuspiciousOrderBlockers,
  collectSkippedRules,
  collectEffectiveRules,
  hasColumnValue,
  parseRefundStatusValues,
  type AnalysisResult,
  type FlowEdge,
  type FlowNode,
  type InsightItem,
  type InsightMetric,
  type OperatorDisplayConfig,
  type OperatorInsightsData,
  type SelectNodeData,
  type SuspiciousOrderDetectConfig,
  type SuspiciousOrderRuleKey,
  type ValidationError,
} from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// 常量
// ============================================================================

const MS_MINUTE = 60_000;
const MS_DAY = 86_400_000;

/** `order_ids` 最多列出的订单号个数（超出追加「等 N 笔」，禁止静默截断） */
const ORDER_ID_LIST_LIMIT = 10;

/** 空输入 / 缺表 / 缺配置时的降级查询：语法合法、恒 0 行、不含 WITH 与分号 */
export const DEGRADE_SQL = 'SELECT NULL::VARCHAR AS user_id, NULL::INTEGER AS risk_score WHERE 1 = 0';

/** 全角 → 半角字符集（U+3000 + ０-９ + Ａ-Ｚ + ａ-ｚ，两侧等长，DuckDB `translate` 硬要求） */
const charSeq = (start: number, n: number): string =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(start + i)).join('');
const FULL_WIDTH_CHARS = ` ${charSeq(0xff10, 10)}${charSeq(0xff21, 26)}${charSeq(0xff41, 26)}`;
const HALF_WIDTH_CHARS = ` ${charSeq(0x30, 10)}${charSeq(0x41, 26)}${charSeq(0x61, 26)}`;

/** 规则键 → SQL 列名后缀（sc 的 `w_*` 分值列与 `t_*` 标签列共用） */
const RULE_COL_SUFFIX: Record<SuspiciousOrderRuleKey, string> = {
  burstOrders: 'burst',
  addressCluster: 'addr',
  mobileCluster: 'mobile',
  deviceCluster: 'device',
  newAccounts: 'newacc',
  priceAnomaly: 'price',
  amountDeviation: 'amount',
  refundAnomaly: 'refund',
};

/** 聚集类规则 → 归一化键列 + 0.6 输出列名 + 阈值字段 */
interface ClusterSpec {
  keyCol: 'addr_key' | 'mobile_key' | 'device_key';
  ctePrefix: 'addr' | 'mobile' | 'device';
  outCol: 'addr_cluster_users' | 'mobile_cluster_users' | 'device_cluster_accounts';
  threshold: 'addrClusterUsers' | 'mobileClusterUsers' | 'deviceClusterUsers';
  rule: SuspiciousOrderRuleKey;
}
const CLUSTER_SPECS: ClusterSpec[] = [
  { keyCol: 'addr_key', ctePrefix: 'addr', outCol: 'addr_cluster_users', threshold: 'addrClusterUsers', rule: 'addressCluster' },
  { keyCol: 'mobile_key', ctePrefix: 'mobile', outCol: 'mobile_cluster_users', threshold: 'mobileClusterUsers', rule: 'mobileCluster' },
  { keyCol: 'device_key', ctePrefix: 'device', outCol: 'device_cluster_accounts', threshold: 'deviceClusterUsers', rule: 'deviceCluster' },
];

/** 规则开关 ∧ 依赖列齐备 = 该规则是否真正参与 SQL 生成（0.7 静态降级的唯一判据） */
export type SuspiciousRuleGates = Record<SuspiciousOrderRuleKey, boolean>;

export function computeRuleGates(cfg: SuspiciousOrderDetectConfig): SuspiciousRuleGates {
  const skipped = new Set<string>(collectSkippedRules(cfg));
  const gates = {} as SuspiciousRuleGates;
  for (const key of SUSPICIOUS_ORDER_RULE_KEYS) {
    gates[key] = cfg.ruleToggles[key] === true && !skipped.has(key);
  }
  return gates;
}

// ============================================================================
// 表达式构造（纯函数，供单测直接断言口径）
// ============================================================================

const has = hasColumnValue;

/** 单引号转义（唯一允许的字面量拼装入口，防止列名/状态值破坏语法） */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** 时间列 → BIGINT 毫秒（`ts_to_epoch_ms` 自动识别 TIMESTAMP / DATE / epoch / 字符串） */
export function tsMs(col: string): string {
  return `ts_to_epoch_ms("${col}")`;
}

/** 可选时间列：未映射 → `NULL::BIGINT` */
export function tsMsOpt(col?: string): string {
  return has(col) ? tsMs(col as string) : 'NULL::BIGINT';
}

export function numExpr(col?: string): string {
  return has(col) ? `CAST("${col}" AS DOUBLE)` : 'NULL::DOUBLE';
}

export function strExpr(col?: string): string {
  return has(col) ? `CAST("${col}" AS VARCHAR)` : 'NULL::VARCHAR';
}

/** 毫秒整除分桶：同一窗口内的订单落入同一桶（D13） */
export function bucketExpr(col: string, minutes: number): string {
  return `CAST(${tsMs(col)} / ${minutes * MS_MINUTE} AS BIGINT)`;
}

/** 全角转半角（D12 地址/手机号/设备号归一化第一步） */
export function halfWidthExpr(e: string): string {
  return `translate(${e}, ${lit(FULL_WIDTH_CHARS)}, ${lit(HALF_WIDTH_CHARS)})`;
}

/** 地址归一化键：半角化 → 去所有空白 → TRIM → 空串归 NULL → 取前 n 个字符 */
export function addrKeyExpr(col: string | undefined, n: number): string {
  if (!has(col)) return 'NULL::VARCHAR';
  return `LEFT(NULLIF(TRIM(regexp_replace(${halfWidthExpr(strExpr(col))}, '\\s', '', 'g')), ''), ${n})`;
}

/** 手机号归一化键：半角化 → 只留数字 → 不足 7 位视为无效（NULL） */
export function mobileKeyExpr(col?: string): string {
  if (!has(col)) return 'NULL::VARCHAR';
  const digits = `regexp_replace(${halfWidthExpr(strExpr(col))}, '[^0-9]', '', 'g')`;
  return `CASE WHEN length(${digits}) >= 7 THEN ${digits} ELSE NULL END`;
}

/** 设备号归一化键：半角化 + TRIM，空串归 NULL */
export function deviceKeyExpr(col?: string): string {
  if (!has(col)) return 'NULL::VARCHAR';
  return `NULLIF(TRIM(${halfWidthExpr(strExpr(col))}), '')`;
}

/**
 * R8 退款/取消判定：`UPPER(TRIM(状态)) IN (<已配置值>)`。
 * 状态列未映射或值集合为空 → 恒 `FALSE`（0.4 R8：空值集合是合法配置，判据退化为不命中）。
 * `ref` 允许传入已归一化的投影列（`ord` 复用 src_all 的 `order_status`）。
 */
export function refundStatusExpr(cfg: SuspiciousOrderDetectConfig, ref?: string): string {
  const statusRef = ref ?? strExpr(cfg.fieldMapping.orderStatusCol);
  const values = parseRefundStatusValues(cfg.refundStatusValues);
  if (!has(cfg.fieldMapping.orderStatusCol) || values.length === 0) return 'FALSE';
  return `UPPER(TRIM(${statusRef})) IN (${values.map(lit).join(',')})`;
}

/**
 * R7 金额突变判据的 JS 镜像 —— **仅用于单测断言命中方向**，权威口径是 SQL 快照。
 * 留一均值：基线 = (SUM(amount) − 自身) / (COUNT(amount) − 1)，分母是**非空金额行数**而非订单数；
 * `amount_count < 2` 时不可能命中（否则会把金额空值误报成突变）。
 */
export function isAmountDeviation(
  amount: number | null,
  amountSum: number | null,
  amountCount: number,
  multiple: number,
): boolean {
  if (!Number.isFinite(amountCount) || amountCount < 2) return false;
  if (amount === null || amountSum === null) return false;
  const baseline = (amountSum - amount) / (amountCount - 1);
  return Number.isFinite(baseline) && amount >= baseline * multiple;
}

// ============================================================================
// CTE 构造（顺序即依赖顺序：src_all → src → ref → usr → burst → *_clu/_user → ord → abn → feat → sc）
// ============================================================================

/** 订单去重计数：`order_id` 已映射用 `COUNT(DISTINCT ...)`，否则宽表一行即一订单退化为 `COUNT(*)` */
function orderCountExpr(cfg: SuspiciousOrderDetectConfig): string {
  return has(cfg.fieldMapping.orderIdCol) ? 'COUNT(DISTINCT "order_id")' : 'COUNT(*)';
}

/** 条件计数（D14 去重口径唯一形态）：`COUNT(DISTINCT "order_id") FILTER (WHERE <flag>)` */
function filteredOrderCount(cfg: SuspiciousOrderDetectConfig, flag: string): string {
  return has(cfg.fieldMapping.orderIdCol)
    ? `COUNT(DISTINCT "order_id") FILTER (WHERE ${flag})`
    : `COUNT(*) FILTER (WHERE ${flag})`;
}

/** task 4：归一化投影 + 毫秒分桶；`userWhere` 只在此层注入（条件数组先收集后 join） */
export function buildSrcAllCte(tableName: string, cfg: SuspiciousOrderDetectConfig, userWhere: string): string {
  const m = cfg.fieldMapping;
  const w = cfg.windows;
  const proj = [
    `CAST("${m.userIdCol}" AS VARCHAR) AS user_id`,
    `${tsMs(m.orderTimeCol)} AS order_time_ms`,
    `${bucketExpr(m.orderTimeCol, w.burstWindowMinutes)} AS bkt_burst`,
    `${bucketExpr(m.orderTimeCol, w.clusterWindowMinutes)} AS bkt_cluster`,
    `${addrKeyExpr(m.addressCol, cfg.thresholds.addressPrefixLength)} AS addr_key`,
    `${mobileKeyExpr(m.mobileCol)} AS mobile_key`,
    `${deviceKeyExpr(m.deviceCol)} AS device_key`,
    `${numExpr(m.amountCol)} AS amount`,
    `${numExpr(m.originalAmountCol)} AS original_amount`,
    `${strExpr(m.orderStatusCol)} AS order_status`,
    `${strExpr(m.orderIdCol)} AS order_id`,
    `${tsMsOpt(m.registerTimeCol)} AS register_ms`,
    `${tsMsOpt(m.firstOrderTimeCol)} AS first_order_ms`,
  ].join(',\n    ');

  const conds: string[] = [];
  const uw = (userWhere ?? '').replace(/^WHERE\s+/i, '').trim();
  if (uw) conds.push(`(${uw})`);

  return `src_all AS (\n  SELECT\n    ${proj}\n  FROM "${tableName}"${
    conds.length ? `\n  WHERE ${conds.join('\n    AND ')}` : ''
  }\n)`;
}

/** task 5：`observationDays = 0` 表示全量（不加任何时间过滤） */
export function buildSrcCte(cfg: SuspiciousOrderDetectConfig): string {
  const days = cfg.windows.observationDays;
  if (!(days > 0)) return 'src AS (\n  SELECT * FROM src_all\n)';
  return `src AS (\n  SELECT * FROM src_all\n  WHERE order_time_ms IS NOT NULL\n    AND order_time_ms >= (SELECT MAX(order_time_ms) FROM src_all) - ${days * MS_DAY}\n)`;
}

export function buildRefCte(): string {
  return 'ref AS (\n  SELECT MAX(order_time_ms) AS ref_ts FROM src\n)';
}

/**
 * task 6：主体级聚合。`amount_sum` / `amount_count` 成对输出且**同为「金额非空行」口径**
 * （R7 留一均值的分子分母），不输出 `amount_avg`。
 */
export function buildUsrCte(cfg: SuspiciousOrderDetectConfig): string {
  const cols = [
    'user_id',
    `${orderCountExpr(cfg)} AS order_count`,
    `SUM("amount") AS amount_sum`,
    has(cfg.fieldMapping.amountCol) ? 'COUNT("amount") AS amount_count' : 'NULL::BIGINT AS amount_count',
    'MIN(order_time_ms) AS first_ts',
    'MIN(register_ms) AS register_ms',
    'MIN(first_order_ms) AS first_order_ms',
    `${buildOrderIdsExpr(cfg)} AS order_ids`,
  ].join(',\n    ');
  return `usr AS (\n  SELECT\n    ${cols}\n  FROM src\n  GROUP BY user_id\n)`;
}

/** 0.6 列 17：先去 NULL 再去重，前 10 个 + 「等 N 笔」，禁止静默截断 */
function buildOrderIdsExpr(cfg: SuspiciousOrderDetectConfig): string {
  if (!has(cfg.fieldMapping.orderIdCol)) return 'NULL::VARCHAR';
  const total = 'COUNT(DISTINCT "order_id")';
  const head = `CAST(list_slice(list(DISTINCT "order_id") FILTER (WHERE "order_id" IS NOT NULL), 1, ${ORDER_ID_LIST_LIMIT}) AS VARCHAR)`;
  return `${head} || CASE WHEN ${total} > ${ORDER_ID_LIST_LIMIT} THEN ' 等 ' || CAST(${total} AS VARCHAR) || ' 笔' ELSE '' END`;
}

/** task 7：`(user_id, bkt_burst)` 订单计数；主体最大值由 feat 的 burst 派生表给出 */
export function buildBurstCte(cfg: SuspiciousOrderDetectConfig): string {
  return `burst AS (\n  SELECT\n    user_id,\n    bkt_burst,\n    ${orderCountExpr(cfg)} AS bkt_orders\n  FROM src\n  GROUP BY user_id, bkt_burst\n)`;
}

/**
 * task 7：聚集类规则的一一对偶。
 * `*_clu` = (key, bkt, COUNT(DISTINCT user_id) AS key_users)（NULL 键先剔除，否则空地址自成一簇）；
 * `*_user` = 该用户全部窗口里的最大同簇主体数（一用户一行，供 feat 直接 LEFT JOIN）。
 */
export function buildClusterCtes(spec: ClusterSpec): string[] {
  const clu = `${spec.ctePrefix}_clu AS (\n  SELECT\n    "${spec.keyCol}" AS "key",\n    bkt_cluster AS "bkt",\n    COUNT(DISTINCT "user_id") AS "key_users"\n  FROM src\n  WHERE "${spec.keyCol}" IS NOT NULL\n  GROUP BY "${spec.keyCol}", bkt_cluster\n)`;
  const user = `${spec.ctePrefix}_user AS (\n  SELECT\n    src.user_id,\n    MAX(c."key_users") AS ${spec.outCol}\n  FROM src\n  JOIN ${spec.ctePrefix}_clu c ON c."key" = src."${spec.keyCol}" AND c."bkt" = src.bkt_cluster\n  GROUP BY src.user_id\n)`;
  return [clu, user];
}

/** 0.5 R5 三级年龄链：注册时间 → 首次下单时间 → 本批首单估算（D6 永不因缺列跳过） */
function ageBasis(cfg: SuspiciousOrderDetectConfig): { col: string; label: string } {
  const m = cfg.fieldMapping;
  if (has(m.registerTimeCol)) return { col: 'register_ms', label: '注册时间' };
  if (has(m.firstOrderTimeCol)) return { col: 'first_order_ms', label: '首次下单时间' };
  return { col: 'first_ts', label: '本批首单估算' };
}

/**
 * 账号年龄（天，1 位小数）。`ord` 与 `feat` 复用同一表达式（两处都 JOIN 了 usr / ref）。
 * 基准缺失 → NULL；`GREATEST(0, ...)` 夹掉未来时间的负年龄。
 */
export function accountAgeExpr(cfg: SuspiciousOrderDetectConfig): string {
  const { col } = ageBasis(cfg);
  return `CASE WHEN usr.${col} IS NULL THEN NULL ELSE ROUND(GREATEST(0, ref.ref_ts - usr.${col}) / ${MS_DAY}.0, 1) END`;
}

/** 订单级 8 个命中标记的判据（0.8 `ord`）。CTE 不存在的规则（R1–R4 关闭/缺列）恒 `FALSE` 且不引用 */
function ordFlagConds(cfg: SuspiciousOrderDetectConfig, gates: SuspiciousRuleGates): Record<SuspiciousOrderRuleKey, string> {
  const t = cfg.thresholds;
  const age = accountAgeExpr(cfg);
  return {
    burstOrders: gates.burstOrders ? 'burst.bkt_orders >= ' + t.burstOrderCount : 'FALSE',
    addressCluster: gates.addressCluster ? 'ac."key_users" >= ' + t.addrClusterUsers : 'FALSE',
    mobileCluster: gates.mobileCluster ? 'mc."key_users" >= ' + t.mobileClusterUsers : 'FALSE',
    deviceCluster: gates.deviceCluster ? 'dc."key_users" >= ' + t.deviceClusterUsers : 'FALSE',
    newAccounts: `${age} <= ${t.newAccountMaxAgeDays} AND usr.order_count >= ${t.newAccountMinOrders}`,
    priceAnomaly:
      has(cfg.fieldMapping.amountCol) && has(cfg.fieldMapping.originalAmountCol)
        ? `"amount" <= "original_amount" * ${t.priceAnomalyMaxRatio} AND "original_amount" > 0`
        : 'FALSE',
    amountDeviation: has(cfg.fieldMapping.amountCol)
      ? `usr.amount_count >= 2 AND "amount" >= (usr.amount_sum - "amount") / NULLIF(usr.amount_count - 1, 0) * ${t.amountDeviationMultiple}`
      : 'FALSE',
    refundAnomaly: refundStatusExpr(cfg, '"order_status"'),
  };
}

/**
 * task 8：订单级标记宽表。一源行一订单，输出 8 个标记 + `is_abnormal`。
 * `is_abnormal` = **已启用**规则判据的 OR（R5–R8 的判据只依赖 usr / ref / src 投影，
 * 恒可计算；关闭时不入 OR、不计入 abn 计数、不进 sc 打分）。
 */
export function buildOrdCte(cfg: SuspiciousOrderDetectConfig, gates: SuspiciousRuleGates): string {
  const cond = ordFlagConds(cfg, gates);
  const flagCols = SUSPICIOUS_ORDER_RULE_KEYS.map((key) => {
    const flag = FLAG_COL[key];
    return `CASE WHEN ${cond[key]} THEN TRUE ELSE FALSE END AS ${flag}`;
  });
  // 全部规则关闭 → OR 列表为空，必须退化为常量 FALSE（否则生成 `CASE WHEN  THEN` 非法 SQL）
  const abnormalConds = SUSPICIOUS_ORDER_RULE_KEYS.flatMap((k) => (gates[k] ? [cond[k]] : []));
  const abnormal = abnormalConds.length > 0 ? abnormalConds.join('\n      OR ') : 'FALSE';

  const joins = ['src'];
  if (gates.burstOrders) joins.push('LEFT JOIN burst ON burst.user_id = src.user_id AND burst.bkt_burst = src.bkt_burst');
  if (gates.addressCluster) joins.push('LEFT JOIN addr_clu ac ON ac."key" = src.addr_key AND ac."bkt" = src.bkt_cluster');
  if (gates.mobileCluster) joins.push('LEFT JOIN mobile_clu mc ON mc."key" = src.mobile_key AND mc."bkt" = src.bkt_cluster');
  if (gates.deviceCluster) joins.push('LEFT JOIN device_clu dc ON dc."key" = src.device_key AND dc."bkt" = src.bkt_cluster');
  joins.push('JOIN usr ON usr.user_id = src.user_id');
  joins.push('CROSS JOIN ref');

  return `ord AS (\n  SELECT\n    src.user_id,\n    "order_id",\n    ${flagCols.join(
      ',\n    ',
    )},\n    CASE WHEN ${abnormal} THEN TRUE ELSE FALSE END AS is_abnormal\n  FROM ${joins.join('\n  ')}\n)`;
}

const FLAG_COL: Record<SuspiciousOrderRuleKey, string> = {
  burstOrders: 'is_burst',
  addressCluster: 'is_addr',
  mobileCluster: 'is_mobile',
  deviceCluster: 'is_device',
  newAccounts: 'is_new_account',
  priceAnomaly: 'is_price',
  amountDeviation: 'is_amount',
  refundAnomaly: 'is_refund',
};

/**
 * task 9：主体级异常订单计数。未启用规则的计数列静态输出 `NULL` 字面量
 * （等价于计划里 `CASE WHEN <规则启用> THEN <count> ELSE NULL END`，判据在构建期即已知，不落进 SQL）。
 */
export function buildAbnCte(cfg: SuspiciousOrderDetectConfig, gates: SuspiciousRuleGates): string {
  const count = (key: keyof typeof COUNT_COL, flag: string) =>
    gates[key] ? `${filteredOrderCount(cfg, flag)} AS ${COUNT_COL[key]}` : `NULL::BIGINT AS ${COUNT_COL[key]}`;

  const cols = [
    'user_id',
    `${filteredOrderCount(cfg, 'is_abnormal')} AS order_count_abnormal`,
    count('refundAnomaly', 'is_refund'),
    count('priceAnomaly', 'is_price'),
    count('amountDeviation', 'is_amount'),
  ].join(',\n    ');
  return `abn AS (\n  SELECT\n    ${cols}\n  FROM ord\n  GROUP BY user_id\n)`;
}

const COUNT_COL: Record<Extract<SuspiciousOrderRuleKey, 'refundAnomaly' | 'priceAnomaly' | 'amountDeviation'>, string> = {
  refundAnomaly: 'refund_count',
  priceAnomaly: 'price_anomaly_orders',
  amountDeviation: 'amount_deviation_orders',
};

// ============================================================================
// feat / sc / 最终 SELECT
// ============================================================================

/**
 * task 10：主体级特征宽表（一行一主体，D2）。
 * 0.6 表 1–19 列里除 `risk_score` / `risk_level` / `risk_type`（由 sc 与最终 SELECT 产出）之外的原始数值。
 * `burst` 是 (user_id, bkt_burst) 粒度，直接 JOIN 会让主体行按窗口膨胀，故取「burst 的按主体 MAX」派生表
 * ——`feat` 仍然 JOIN `burst`，只是先在派生表里收敛到一行一主体（0.6 列 7 的口径不变）。
 */
export function buildFeatCte(cfg: SuspiciousOrderDetectConfig, gates: SuspiciousRuleGates): string {
  const skippedLiteral = lit(collectSkippedRules(cfg).map((k) => SUSPICIOUS_RULE_LABEL[k]).join('；'));

  const cols: string[] = [
    'usr.user_id',
    'usr.order_count',
    'abn.order_count_abnormal',
    gates.burstOrders ? 'bw.max_window_orders' : 'NULL::BIGINT AS max_window_orders',
  ];

  for (const spec of CLUSTER_SPECS) {
    const alias = spec.ctePrefix[0];
    cols.push(gates[spec.rule] ? `${alias}.${spec.outCol}` : `NULL::BIGINT AS ${spec.outCol}`);
  }

  cols.push(
    gates.newAccounts ? `${accountAgeExpr(cfg)} AS account_age_days` : 'NULL::DOUBLE AS account_age_days',
    `${lit(gates.newAccounts ? ageBasis(cfg).label : '未启用')} AS age_basis`,
    'abn.refund_count',
    gates.refundAnomaly
      ? `ROUND(abn.refund_count * 100.0 / NULLIF(usr.order_count, 0), 1) AS refund_rate`
      : 'NULL::DOUBLE AS refund_rate',
    'abn.price_anomaly_orders',
    'abn.amount_deviation_orders',
    'usr.order_ids',
    `${skippedLiteral} AS skipped_rules`,
    `CASE WHEN ${skippedLiteral} = '' THEN 'ok' ELSE 'degraded' END AS data_quality_flag`,
  );

  const joins = ['FROM usr', 'CROSS JOIN ref'];
  if (gates.burstOrders) {
    joins.push(
      'LEFT JOIN (\n    SELECT user_id, MAX(bkt_orders) AS max_window_orders FROM burst GROUP BY user_id\n  ) bw ON bw.user_id = usr.user_id',
    );
  }
  for (const spec of CLUSTER_SPECS) {
    if (gates[spec.rule]) joins.push(`LEFT JOIN ${spec.ctePrefix}_user ${spec.ctePrefix[0]} ON ${spec.ctePrefix[0]}.user_id = usr.user_id`);
  }
  joins.push('LEFT JOIN abn ON abn.user_id = usr.user_id');

  return `feat AS (\n  SELECT\n    ${cols.join(',\n    ')}\n  ${joins.join('\n  ')}\n)`;
}

/** 主体级规则命中判据（sc / 最终 SELECT 用，引用 feat 输出列） */
function subjectHitExpr(key: SuspiciousOrderRuleKey, cfg: SuspiciousOrderDetectConfig): string {
  const t = cfg.thresholds;
  switch (key) {
    case 'burstOrders': return `max_window_orders >= ${t.burstOrderCount}`;
    case 'addressCluster': return `addr_cluster_users >= ${t.addrClusterUsers}`;
    case 'mobileCluster': return `mobile_cluster_users >= ${t.mobileClusterUsers}`;
    case 'deviceCluster': return `device_cluster_accounts >= ${t.deviceClusterUsers}`;
    case 'newAccounts': return `account_age_days <= ${t.newAccountMaxAgeDays} AND order_count >= ${t.newAccountMinOrders}`;
    case 'priceAnomaly': return `price_anomaly_orders >= ${t.priceAnomalyMinOrders}`;
    case 'amountDeviation': return `amount_deviation_orders >= ${t.amountDeviationMinOrders}`;
    case 'refundAnomaly': return `refund_count >= ${t.refundMinOrders} AND refund_rate >= ${t.refundRatePercent}`;
  }
}

/**
 * task 11：8 条规则分值与标签。分值/标签两条 CASE 共用同一个 `hit` 字符串（同源，禁止两份判据）。
 * 未生效规则（关闭或缺列）整条不输出，因此其指标列不会出现在任何计分片段里。
 */
export function buildScoreCte(cfg: SuspiciousOrderDetectConfig, gates: SuspiciousRuleGates): string {
  const parts = SUSPICIOUS_ORDER_RULE_KEYS.filter((k) => gates[k]).flatMap((key) => {
    const hit = subjectHitExpr(key, cfg);
    const suffix = RULE_COL_SUFFIX[key];
    return [
      `CASE WHEN ${hit} THEN ${cfg.weights[key]} ELSE 0 END AS w_${suffix}`,
      `CASE WHEN ${hit} THEN ${lit(SUSPICIOUS_RULE_LABEL[key])} ELSE NULL END AS t_${suffix}`,
    ];
  });
  return `sc AS (\n  SELECT f.*${parts.length ? ',\n    ' + parts.join(',\n    ') : ''}\n  FROM feat f\n)`;
}

/** 生效规则的分值列名 / 标签列名（最终 SELECT 与 `risk_type` 共用） */
export function scoreColumns(gates: SuspiciousRuleGates): { weights: string[]; labels: string[] } {
  const keys = SUSPICIOUS_ORDER_RULE_KEYS.filter((k) => gates[k]);
  return {
    weights: keys.map((k) => `w_${RULE_COL_SUFFIX[k]}`),
    labels: keys.map((k) => `t_${RULE_COL_SUFFIX[k]}`),
  };
}

/**
 * 最终 SELECT：`risk_score` 夹取 100 用 `CASE`（D14 禁止 `LEAST` 参与去重计数口径，全 SQL 不出现 `LEAST(`）；
 * `risk_level` 分档与 `WHERE` 过滤都基于同一份分值表达式。
 */
export function buildFinalSelect(cfg: SuspiciousOrderDetectConfig, gates: SuspiciousRuleGates): string {
  const { weights, labels } = scoreColumns(gates);
  const sum = weights.length > 0 ? weights.join(' + ') : '0';
  const { severeScore, highScore, midScore } = cfg.tiers;
  const riskType = labels.length > 0 ? `list_filter([${labels.join(', ')}], x -> x IS NOT NULL)` : 'CAST([] AS VARCHAR[])';

  return [
    'SELECT',
    '  user_id,',
    '  order_count,',
    '  order_count_abnormal,',
    `  CASE WHEN ${sum} > 100 THEN 100 ELSE ${sum} END AS risk_score,`,
    `  CASE WHEN ${sum} >= ${severeScore} THEN '严重'`,
    `       WHEN ${sum} >= ${highScore} THEN '高'`,
    `       WHEN ${sum} >= ${midScore} THEN '中'`,
    `       ELSE '低' END AS risk_level,`,
    `  ${riskType} AS risk_type,`,
    '  max_window_orders,',
    '  addr_cluster_users,',
    '  mobile_cluster_users,',
    '  device_cluster_accounts,',
    '  account_age_days,',
    '  age_basis,',
    '  refund_count,',
    '  refund_rate,',
    '  price_anomaly_orders,',
    '  amount_deviation_orders,',
    '  order_ids,',
    '  skipped_rules,',
    '  data_quality_flag',
    'FROM sc',
    `WHERE ${sum} > 0`,
    'ORDER BY risk_score DESC, user_id',
  ].join('\n');
}

// ============================================================================
// postProcess 纯函数（Phase 2）：证据文案 / 处置建议 / 等级排序
// ============================================================================

/** SQL 输出行视图（0.6 的 20 列 + postProcess 注入 risk_evidence / suggestion） */
export type SuspiciousOrderRow = Record<string, unknown> & {
  user_id?: unknown;
  risk_score?: unknown;
  risk_level?: unknown;
  risk_type?: unknown;
  order_count_abnormal?: unknown;
};

function safeNum(v: unknown): number {
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 空值即空：null/undefined/非有限 → null（证据文案据此跳过分段） */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 等级排序唯一真值：严重 0 / 高 1 / 中 2 / 低 3 */
const LEVEL_RANK: Record<string, number> = { 严重: 0, 高: 1, 中: 2, 低: 3 };

const LEVEL_SUGGESTION: Record<string, string> = {
  严重: '立即拦截并人工复核',
  高: '人工复核后决定处置',
  中: '加入限购/观察名单',
  低: '持续观察',
};

/** 标签 → 规则键反查（标签唯一真值是 SUSPICIOUS_RULE_LABEL，禁止另写一份中文） */
const RULE_BY_LABEL: Record<string, SuspiciousOrderRuleKey> = {};
for (const key of SUSPICIOUS_ORDER_RULE_KEYS) RULE_BY_LABEL[SUSPICIOUS_RULE_LABEL[key]] = key;

/** `risk_type` 在 duckdb-wasm 下是 VARCHAR[]，降级/历史数据可能是文本形态 */
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter((x) => x.length > 0);
  if (typeof v === 'string' && v.length > 0) {
    return v.replace(/^[\s[]+|[\s\]]+$/g, '').split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter((s) => s.length > 0);
  }
  return [];
}

/** 展示数值：整数不带小数位，小数保留 1 位（0.3*10 的浮点尾噪在此收敛） */
function fmtNum(n: number): string {
  // 先收敛浮点尾噪（0.3 * 10 === 3.0000000000000004），避免出现「3.0 折」这类文案
  return String(Math.round(n * 100) / 100);
}

/** 各规则的证据文案：依赖列为空则跳过分段，不兜底为 0 */
const EVIDENCE_TEXT: Record<SuspiciousOrderRuleKey, (row: SuspiciousOrderRow, cfg: SuspiciousOrderDetectConfig) => string> = {
  burstOrders: (r, c) => {
    const v = toNum(r.max_window_orders);
    return v === null ? '' : `${fmtNum(c.windows.burstWindowMinutes / 60)} 小时内最多下单 ${fmtNum(v)} 笔`;
  },
  addressCluster: (r) => {
    const v = toNum(r.addr_cluster_users);
    return v === null ? '' : `同一收货地址关联 ${fmtNum(v)} 个账号`;
  },
  mobileCluster: (r) => {
    const v = toNum(r.mobile_cluster_users);
    return v === null ? '' : `同一手机号关联 ${fmtNum(v)} 个账号`;
  },
  deviceCluster: (r) => {
    const v = toNum(r.device_cluster_accounts);
    return v === null ? '' : `同一设备关联 ${fmtNum(v)} 个账号`;
  },
  newAccounts: (r) => {
    const v = toNum(r.account_age_days);
    return v === null ? '' : `账号年龄约 ${fmtNum(v)} 天（基准：${String(r.age_basis ?? '未知')}）`;
  },
  priceAnomaly: (r, c) => {
    const v = toNum(r.price_anomaly_orders);
    return v === null ? '' : `${fmtNum(v)} 笔订单实付不足原价的 ${fmtNum(c.thresholds.priceAnomalyMaxRatio * 10)} 折`;
  },
  amountDeviation: (r, c) => {
    const v = toNum(r.amount_deviation_orders);
    return v === null ? '' : `${fmtNum(v)} 笔订单金额超过其余订单平均金额 ${fmtNum(c.thresholds.amountDeviationMultiple)} 倍`;
  },
  refundAnomaly: (r) => {
    const v = toNum(r.refund_count);
    const rate = toNum(r.refund_rate);
    return v === null || rate === null ? '' : `退款/取消 ${fmtNum(v)} 笔，占比 ${fmtNum(rate)}%`;
  },
};

/** 由 risk_type 命中的规则拼装业务文案（`；` 连接） */
export function buildRiskEvidence(row: SuspiciousOrderRow, cfg: SuspiciousOrderDetectConfig): string {
  const parts: string[] = [];
  for (const label of asStringArray(row.risk_type)) {
    const key = RULE_BY_LABEL[label];
    if (!key) continue;
    const text = EVIDENCE_TEXT[key](row, cfg);
    if (text) parts.push(text);
  }
  return parts.join('；');
}

/** 等级 → 处置建议；未知等级按「持续观察」，保证列不为空 */
export function buildSuggestion(level: unknown): string {
  return LEVEL_SUGGESTION[String(level)] ?? '持续观察';
}

/** 等级升序（严重→低）→ 同等级风险分降序 → user_id 兜底，保证结果稳定 */
export function compareRiskRows(a: SuspiciousOrderRow, b: SuspiciousOrderRow): number {
  const la = LEVEL_RANK[String(a.risk_level)] ?? 4;
  const lb = LEVEL_RANK[String(b.risk_level)] ?? 4;
  if (la !== lb) return la - lb;
  const d = safeNum(b.risk_score) - safeNum(a.risk_score);
  if (d !== 0) return d;
  return String(a.user_id ?? '') < String(b.user_id ?? '') ? -1 : 1;
}

// ============================================================================
// 策略
// ============================================================================

export class EcomSuspiciousOrderDetectStrategy extends BaseStrategy {
  readonly type = OperatorType.SUSPICIOUS_ORDER_DETECT;
  readonly name = 'EcomSuspiciousOrderDetectStrategy';

  /** buildOperatorSql 记录、postProcess 唯一配置来源（strategy-rules §三：禁止 postProcess 重读节点） */
  private _lastConfig: SuspiciousOrderDetectConfig | null = null;

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string,
  ): string {
    const tableName =
      (nodes.find((n) => n.type === FlowNodeType.TABLE)?.data as { tableName?: string } | undefined)?.tableName ?? '';
    const cfg = (nodes.find((n) => n.type === FlowNodeType.SELECT)?.data as SelectNodeData | undefined)
      ?.suspiciousOrderDetectConfig;

    // 先赋值再判降级：单例策略不得把上一个节点的配置残留给无配置节点
    this._lastConfig = cfg ? cloneSuspiciousOrderDetectConfig(cfg) : null;

    // 0.7：窗口/阈值/权重/分档非法时不出 SQL（校验器已拦截，此处兜底，避免生成 NaN 表达式）
    const blockers = collectSuspiciousOrderBlockers(cfg);
    if (!tableName || !cfg || blockers.length > 0) {
      logger.warn(
        `[${this.name}.buildOperatorSql] 降级空查询: table=${tableName || '<空>'}, config=${cfg ? 'ok' : '<缺失>'}, ` +
        `blockers=${blockers.map((b) => b.code).join('/') || '<无>'}`,
      );
      return DEGRADE_SQL;
    }

    const gates = computeRuleGates(cfg);
    const ctes: string[] = [
      buildSrcAllCte(tableName, cfg, userWhere),
      buildSrcCte(cfg),
      buildRefCte(),
      buildUsrCte(cfg),
    ];
    if (gates.burstOrders) ctes.push(buildBurstCte(cfg));
    for (const spec of CLUSTER_SPECS) {
      if (gates[spec.rule]) ctes.push(...buildClusterCtes(spec));
    }
    ctes.push(buildOrdCte(cfg, gates), buildAbnCte(cfg, gates), buildFeatCte(cfg, gates), buildScoreCte(cfg, gates));

    const sql = `WITH ${ctes.join(',\n')}\n${buildFinalSelect(cfg, gates)}`;
    logger.info(
      `[${this.name}.buildOperatorSql] table=${tableName}, ctes=${ctes.length}, ` +
      `effective=${SUSPICIOUS_ORDER_RULE_KEYS.filter((k) => gates[k]).length}/8`,
    );
    return sql;
  }

  /** 0.7 阻断判据 → ERROR；缺列降级与前缀过短 → WARNING（判据与 SQL 生成同源，禁止另写一份） */
  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[],
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    if (!selectNode) return [];
    const cfg = (selectNode.data as SelectNodeData | undefined)?.suspiciousOrderDetectConfig
      ?? DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG;

    const errors: ValidationError[] = [];
    const push = (message: string, severity: ValidationSeverity = ValidationSeverity.ERROR) =>
      errors.push({ nodeId: selectNode.id, nodeType: FlowNodeType.SELECT, severity, message });

    for (const blocker of collectSuspiciousOrderBlockers(cfg)) push(blocker.message);

    if (cfg.thresholds.addressPrefixLength < 10) {
      push('地址前缀过短会把不同住户合并，可能误判同址多账号', ValidationSeverity.WARNING);
    }

    // 已开启但缺依赖列：直接复用 Phase 0 的 collectSkippedRules
    for (const key of collectSkippedRules(cfg)) {
      push(`『${SUSPICIOUS_RULE_LABEL[key]}』已开启但缺少依赖列，本次不参与计算`, ValidationSeverity.WARNING);
    }

    // D6 覆盖摘要：仅 skipped>0 时提示；用户主动关闭不算跳过（默认配置即 5/8）
    const coverage = collectEffectiveRules(cfg);
    if (coverage.skipped.length > 0) {
      push(
        `本次 8 项规则中生效 ${coverage.effective.length} 项（缺少依赖列跳过 ${coverage.skipped.length} 项：` +
        `${coverage.skipped.map((k) => SUSPICIOUS_RULE_LABEL[k]).join('、')}）`,
        ValidationSeverity.WARNING,
      );
    }
    return errors;
  }

  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const cfg = this._lastConfig ?? DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG;
    const queryResult = (data ?? {}) as { data?: unknown; schema?: unknown[] };
    const rows = (Array.isArray(queryResult.data) ? queryResult.data : []) as SuspiciousOrderRow[];
    const coverage = collectEffectiveRules(cfg);
    logger.info(`[${this.name}.postProcess] rows=${rows.length}, effectiveRules=${coverage.effective.length}/8`);

    if (rows.length === 0) {
      return {
        type: this.type, sql: '', data: [],
        schema: queryResult.schema ?? [],
        insightsData: {
          summary: { totalRecordCount: 0, totalFilterRecordCount: 0, riskRecordCount: 0, criticalRecordCount: 0 },
          insights: [{
            id: 'no-risk-subjects', cardType: 'standard', iconKey: 'warning',
            title: '未发现风险主体',
            description:
              `当前生效规则 ${coverage.effective.length}/8 项，观察区间${cfg.windows.observationDays > 0 ? `近 ${cfg.windows.observationDays} 天` : '覆盖全部历史数据'}，` +
              '未命中任何启用规则的阈值，可放宽阈值或补充依赖列后重跑',
            sortOrder: 1,
          }],
        },
        displayConfig: this.buildDisplayConfig(cfg),
      };
    }

    // 注入两列 → 按等级/分数排序（唯一真值：严重→高→中→低，同级降序）
    const decorated: SuspiciousOrderRow[] = rows.map((r) => ({
      ...r,
      risk_evidence: buildRiskEvidence(r, cfg),
      suggestion: buildSuggestion(r.risk_level),
    }));
    decorated.sort(compareRiskRows);

    const levelCount = (lv: string) => decorated.filter((r) => String(r.risk_level) === lv).length;
    const severeCount = levelCount('严重');
    const riskCount = severeCount + levelCount('高') + levelCount('中');
    const abnormalOrders = decorated.reduce((a, r) => a + safeNum(r.order_count_abnormal), 0);
    const avgScore = decorated.reduce((a, r) => a + safeNum(r.risk_score), 0) / decorated.length;
    const topN = Math.max(1, Math.min(10, Math.trunc(safeNum(cfg.topN)) || 5));
    const { severeScore, highScore, midScore } = cfg.tiers;

    // 卡片 2：严重风险主体（无严重也保留卡片，仅改文案，杜绝卡片数量随数据漂移）
    const severeSubjects = decorated.filter((r) => String(r.risk_level) === '严重');
    const severeNames = severeSubjects.slice(0, topN).map((r) => String(r.user_id ?? ''));
    const severeText = severeNames.length > 0
      ? severeNames.join('、') + (severeSubjects.length > topN ? ` 等 ${severeSubjects.length} 个` : '')
      : '本次未发现严重风险主体';

    // 卡片 3：团伙聚集（三维度命中主体数 + 涉及账号数合计）
    const hasLabel = (r: SuspiciousOrderRow, key: SuspiciousOrderRuleKey) =>
      asStringArray(r.risk_type).indexOf(SUSPICIOUS_RULE_LABEL[key]) >= 0;
    const clusterDims: Array<{ key: SuspiciousOrderRuleKey; label: string; col: string }> = [
      { key: 'addressCluster', label: '同地址', col: 'addr_cluster_users' },
      { key: 'mobileCluster', label: '同手机', col: 'mobile_cluster_users' },
      { key: 'deviceCluster', label: '同设备', col: 'device_cluster_accounts' },
    ];
    const clusterSegs = clusterDims.map((d) => {
      const hit = decorated.filter((r) => hasLabel(r, d.key));
      return hit.length === 0
        ? null
        : `${d.label} ${hit.length} 个主体（关联账号合计 ${hit.reduce((a, r) => a + safeNum(r[d.col]), 0)}）`;
    }).filter((s): s is string => s !== null);

    // 卡片 4：规则覆盖三态文案（只拼非零分段；「全部纳入」仅在 8/8 时使用）
    const coverageSegs: string[] = [];
    if (coverage.closed.length > 0) {
      coverageSegs.push(`已关闭 ${coverage.closed.length} 项（${coverage.closed.map((k) => SUSPICIOUS_RULE_LABEL[k]).join('、')}）`);
    }
    if (coverage.skipped.length > 0) {
      coverageSegs.push(`缺依赖列跳过 ${coverage.skipped.length} 项（${coverage.skipped.map((k) => SUSPICIOUS_RULE_LABEL[k]).join('、')}）`);
    }
    coverageSegs.push(coverage.effective.length === 8
      ? '8 项规则全部纳入本次检测'
      : `生效 ${coverage.effective.length}/8 项`);

    const overviewMetrics: InsightMetric[] = [
      { label: '风险主体数', value: decorated.length },
      { label: '严重·高风险数', value: severeCount + levelCount('高') },
      { label: '平均风险分', value: Number(avgScore.toFixed(1)) },
      { label: '生效规则', value: coverage.effective.length },
    ];

    const insights: InsightItem[] = [
        {
          id: 'risk-overview', cardType: 'standard', iconKey: 'warning',
          title: '风险主体概览',
          description:
            `共 ${decorated.length} 个风险主体：严重 ${severeCount}、高 ${levelCount('高')}、中 ${levelCount('中')}、低 ${levelCount('低')}；` +
            `平均风险分 ${Number(avgScore.toFixed(1))}；分档阈值 ≥${severeScore} 严重 / ≥${highScore} 高 / ≥${midScore} 中`,
          suggestion: severeCount > 0
            ? '优先处理严重风险主体，再看高风险清单'
            : '无严重风险主体，按中/高档批量处置即可',
          sortOrder: 1,
          metrics: overviewMetrics,
        },
        {
          id: 'critical-subjects', cardType: 'standard', iconKey: 'critical',
          title: '严重风险主体',
          description: severeText,
          suggestion: severeSubjects.length > 0 ? '立即拦截并人工复核，必要时联动账号体系冻结' : undefined,
          sortOrder: 2,
        },
        {
          id: 'cluster-gangs', cardType: 'standard', iconKey: 'user',
          title: '团伙聚集',
          description: clusterSegs.length > 0 ? clusterSegs.join('；') : '未发现多账号聚集',
          suggestion: clusterSegs.length > 0 ? '同簇账号建议批量处置（同一自然人多账号规避限购）' : undefined,
          sortOrder: 3,
        },
        {
          id: 'rule-coverage', cardType: 'standard', iconKey: 'quality',
          title: '检测规则覆盖',
          description: coverageSegs.join('；'),
          sortOrder: 4,
        },
    ];

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: decorated.length,
        totalFilterRecordCount: abnormalOrders,
        riskRecordCount: riskCount,
        criticalRecordCount: severeCount,
      },
      insights,
    };

    const schema = (queryResult.schema ?? []) as Array<{ name?: string }>;
    const withField = (list: unknown[], name: string) =>
      list.some((s) => (s as { name?: string }).name === name) ? list : [...list, { name, type: 'STRING' }];
    const enhancedSchema = withField(withField(schema, 'risk_evidence'), 'suggestion');

    return {
      type: this.type, sql: '',
      // SAFETY: rows 是 SQL 20 列原值透传 + 注入的 2 个字符串列，Record 视图只做渲染层契约，不做字段级断言
      data: decorated as unknown as Record<string, unknown>[],
      schema: enhancedSchema,
      insightsData,
      displayConfig: this.buildDisplayConfig(cfg),
    };
  }

  /**
   * displayConfig 与空结果路径同源（禁止另写一份）；不含 rowColorizer —— 颜色由渲染层主题驱动，
   * 硬编码色值会违反 theme.md。
   */
  private buildDisplayConfig(cfg: SuspiciousOrderDetectConfig): OperatorDisplayConfig {
    const m = cfg.fieldMapping;
    const { severeScore, highScore, midScore } = cfg.tiers;
    // 未映射订单号列时行计数退化为数据行数，口径说明必须跟随配置（不写死）
    const rowCaliber = hasColumnValue(m.orderIdCol) ? '' : '；未指定订单号列时按数据行计数';
    const clusterTip = (label: string) =>
      `同一${label}在 ${cfg.windows.clusterWindowMinutes} 分钟窗口内关联的账号数（按时间窗整除对齐的固定分桶统计，跨桶边界前后的聚集可能被低估）`;

    return {
      defaultSort: { column: 'risk_score', order: 'descend' },
      columnFormatters: {
        risk_type: { type: 'json_tag_badges' },
        risk_level: { type: 'risk_badge' },
        account_age_days: { type: 'duration_days', unit: '天' },
      },
      columnTooltips: {
        risk_score:
          `风险分 = 命中规则权重之和（上限 100）；分档 ≥${severeScore} 严重 / ≥${highScore} 高 / ≥${midScore} 中 / 其余低`,
        order_count: `区间内订单数${rowCaliber}${rowCaliber ? '，请确保一行一订单' : ''}`,
        order_count_abnormal: `命中任一风险规则的订单数，同一订单只计一次${rowCaliber}`,
        max_window_orders:
          `按 ${cfg.windows.burstWindowMinutes} 分钟整除对齐的固定分桶统计的单桶最大下单数，跨桶边界前后的突发可能被低估${rowCaliber}`,
        addr_cluster_users: clusterTip('地址前缀（前 ' + cfg.thresholds.addressPrefixLength + ' 字符）'),
        mobile_cluster_users: clusterTip('手机号（去分隔符并全角转半角）'),
        device_cluster_accounts: clusterTip('设备标识'),
        account_age_days:
          '账号年龄 = 统计截止时间 − 注册时间；缺注册时间时退回首单时间，再退回本表最早下单时间；基准晚于统计截止时间时按 0 天计',
        refund_rate: '退款/取消订单占比（百分比）',
        order_ids: '最多展示 10 个订单号，超出以「等 N 笔」标注',
        skipped_rules: '本次因缺少依赖列而跳过的规则（配置补齐该列后自动纳入）',
      },
    };
  }
}

