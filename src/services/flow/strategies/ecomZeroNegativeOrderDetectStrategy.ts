/**
 * fn_ecom_zero_negative_order_detect — 0 元单 / 负金额单检测（feature 16）
 *
 * SQL 管道（固定 7 段、恰好 1 个 WITH、零分号）：
 *   src_all      归一化投影（`userWhere` 唯一注入点）
 *     → src_filtered  观察窗口 / 状态剔除 / 误报豁免 + `has_null_amount` 标记
 *     → keyed     订单键（`order_id` 为空则合成 `ROW#N`）
 *     → agg       订单级聚合（金额 SUM / 订单级字段 MAX / 负单价 MIN）
 *     → base_calc 派生列 `expected_amount` / `net_pay_amount`
 *     → calc      损失金额 + 8 个命中标志
 *     → judged    8 标志相或 → `is_abnormal`
 *   SELECT 只投影数值与布尔，中文文案全部在 postProcess（R3-3）
 *
 * 阈值经 `resolveZeroNegativeThresholds` 归一后以数字字面量内联，杜绝 `NaN` 表达式。
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  ZERO_NEGATIVE_DERIVED_COLS,
  ZERO_NEGATIVE_RULE_CODE,
  ZERO_NEGATIVE_RULE_KEYS,
  ZERO_NEGATIVE_RULE_LABEL,
  ZERO_NEGATIVE_RULE_PRIORITY,
  ZERO_NEGATIVE_SOURCE_COLS,
  DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG,
  cloneZeroNegativeOrderDetectConfig,
  collectZeroNegativeBlockers,
  collectZeroNegativeRuleCoverage,
  collectZeroNegativeSkippedRules,
  compareZeroNegativeRows,
  hasColumnValue,
  joinZeroNegativeQuality,
  parseRefundStatusValues,
  resolveZeroNegativeThresholds,
  riskLevelFromLoss,
  zeroNegativeSlotHuman,
  zeroNegativeSlotSql,
  type AnalysisResult,
  type FlowEdge,
  type FlowNode,
  type InsightItem,
  type InsightMetric,
  type InsightSummary,
  type OperatorDisplayConfig,
  type SelectNodeData,
  type FormulaSlot,
  type ValidationError,
  type ZeroNegativeOrderDetectConfig,
  type ZeroNegativeRiskLevel,
  type ZeroNegativeRuleCoverage,
  type ZeroNegativeRuleKey,
  type ZeroNegativeSortableRow,
} from '../types';
import { logger } from '../../../utils/logger';

const MS_DAY = 86_400_000;

/** 空输入 / 缺表 / 缺配置 / 含阻断项时的降级查询：语法合法、恒 0 行 */
export const DEGRADE_SQL =
  'SELECT NULL::VARCHAR AS order_id, NULL::DOUBLE AS loss_amount, FALSE AS is_abnormal WHERE 1 = 0';

/** 规则键 → 命中标志列名（标志列名的唯一真源，禁止别处手写） */
export const ZERO_NEGATIVE_FLAG_COL: Record<ZeroNegativeRuleKey, string> = {
  zero_pay: 'hit_zero_pay',
  negative_pay: 'hit_negative_pay',
  negative_unit_price: 'hit_negative_unit_price',
  discount_overflow: 'hit_discount_overflow',
  negative_field: 'hit_negative_field',
  amount_mismatch: 'hit_amount_mismatch',
  discount_sum_mismatch: 'hit_discount_sum_mismatch',
  penny_order: 'hit_penny_order',
};

/** 最终 SELECT 的输出列（顺序固定，单测按序列断言） */
const FINAL_COLUMNS: string[] = [
  'order_id', 'order_time', 'expected_amount', 'pay_amount', 'discount_total', 'net_pay_amount', 'loss_amount',
  ...ZERO_NEGATIVE_RULE_KEYS.map((key) => ZERO_NEGATIVE_FLAG_COL[key]),
  'has_null_amount', 'is_abnormal',
];

const SOURCE_COL_SET = new Set<string>(ZERO_NEGATIVE_SOURCE_COLS);
const DERIVED_COL_SET = new Set<string>([...ZERO_NEGATIVE_SOURCE_COLS, ...ZERO_NEGATIVE_DERIVED_COLS]);

// ============================================================================
// 工具函数（本文件私有，各 1 行；不为 1 行函数引入跨模块耦合）
// ============================================================================

const has = hasColumnValue;

/** 标识符转义：兼容中文列名与保留字，且阻断 `"` 注入 */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** 字符串字面量转义（唯一允许的字面量拼装入口） */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** 数值字面量：调用方保证已归一（有限且非负），此处不做兜底 */
function num(value: number): string {
  return String(value);
}

function strExpr(col?: string): string {
  return has(col) ? `CAST(${q(col as string)} AS VARCHAR)` : 'CAST(NULL AS VARCHAR)';
}

function numExpr(col?: string): string {
  return has(col) ? `CAST(${q(col as string)} AS DOUBLE)` : 'CAST(NULL AS DOUBLE)';
}

function tsMsExpr(col?: string): string {
  return has(col) ? `ts_to_epoch_ms(${q(col as string)})` : 'CAST(NULL AS BIGINT)';
}

/** `(a IS NULL OR UPPER(TRIM(a)) NOT IN (...))`：NULL 必须放行，否则 NOT IN 遇 NULL 静默丢行 */
function notInExpr(ref: string, values: string[]): string {
  return `(${ref} IS NULL OR UPPER(TRIM(${ref})) NOT IN (${values.map(lit).join(', ')}))`;
}

// ============================================================================
// 生效门禁
// ============================================================================

export type ZeroNegativeGates = Record<ZeroNegativeRuleKey, boolean>;

/** 生效 = 已启用 且 未因缺列跳过（判据唯一来源：Phase 0 的覆盖度函数） */
export function computeZeroNegativeGates(cfg: ZeroNegativeOrderDetectConfig): ZeroNegativeGates {
  const effective = new Set<string>(collectZeroNegativeRuleCoverage(cfg).effective);
  const gates = {} as ZeroNegativeGates;
  for (const key of ZERO_NEGATIVE_RULE_KEYS) gates[key] = effective.has(key);
  return gates;
}

// ============================================================================
// CTE 构造（顺序即依赖顺序）
// ============================================================================

/** ① 归一化投影；`userWhere` 只在此层注入（先收集条件再 join） */
export function buildSrcAllCte(
  tableName: string,
  cfg: ZeroNegativeOrderDetectConfig,
  userWhere: string,
): string {
  const m = cfg.fieldMapping;
  const proj = [
    `${strExpr(m.orderIdCol)} AS order_id`,
    `${strExpr(m.orderTimeCol)} AS order_time`,
    `${tsMsExpr(m.orderTimeCol)} AS order_time_ms`,
    `${strExpr(m.orderStatusCol)} AS order_status`,
    `${numExpr(m.payAmountCol)} AS pay_amount`,
    `${numExpr(m.productAmountCol)} AS product_amount`,
    `${numExpr(m.discountTotalCol)} AS discount_total`,
    `${numExpr(m.quantityCol)} AS quantity`,
    `${numExpr(m.unitPriceCol)} AS unit_price`,
    `${numExpr(m.couponAmountCol)} AS coupon_amount`,
    `${numExpr(m.platformDiscountCol)} AS platform_discount`,
    `${numExpr(m.merchantDiscountCol)} AS merchant_discount`,
    `${numExpr(m.refundAmountCol)} AS refund_amount`,
    `${strExpr(m.exemptionCol)} AS exemption_value`,
  ].join(',\n    ');

  const conds: string[] = [];
  const uw = (userWhere ?? '').replace(/^WHERE\s+/i, '').trim();
  if (uw) conds.push(`(${uw})`);

  return `src_all AS (\n  SELECT\n    ${proj}\n  FROM ${q(tableName)}${
    conds.length ? `\n  WHERE ${conds.join('\n    AND ')}` : ''
  }\n)`;
}

/** ② 口径过滤（观察窗口 / 状态剔除 / 豁免）+ 必填金额缺失标记 */
export function buildSrcFilteredCte(cfg: ZeroNegativeOrderDetectConfig): string {
  const m = cfg.fieldMapping;
  const conds: string[] = [];

  const days = cfg.windows.observationDays;
  if (days > 0 && has(m.orderTimeCol)) {
    conds.push(
      `order_time_ms >= (SELECT MAX(order_time_ms) FROM src_all) - ${num(days * MS_DAY)}`,
    );
  }

  const statusValues = parseRefundStatusValues(cfg.excludeStatusValues);
  if (has(m.orderStatusCol) && statusValues.length > 0) {
    conds.push(notInExpr('order_status', statusValues));
  }

  const exemptionValues = parseRefundStatusValues(cfg.exemptionValues);
  if (has(m.exemptionCol) && exemptionValues.length > 0) {
    conds.push(notInExpr('exemption_value', exemptionValues));
  }

  const flag = '(pay_amount IS NULL OR product_amount IS NULL) AS has_null_amount';
  return `src_filtered AS (\n  SELECT *, ${flag}\n  FROM src_all${
    conds.length ? `\n  WHERE ${conds.join('\n    AND ')}` : ''
  }\n)`;
}

/** ③ 订单键：`order_id` 缺失时合成 `ROW#N`，统一一条聚合路径 */
export function buildKeyedCte(): string {
  return (
    'keyed AS (\n' +
    '  SELECT *,\n' +
    "    CASE WHEN order_id IS NOT NULL AND TRIM(order_id) <> '' THEN order_id\n" +
    "         ELSE 'ROW#' || CAST(ROW_NUMBER() OVER () AS VARCHAR) END AS order_key\n" +
    '  FROM src_filtered\n' +
    ')'
  );
}

/** ④ 订单级聚合（明细金额 SUM、订单级字段 MAX、负单价取 MIN 以免漏报） */
export function buildAggCte(): string {
  const proj = [
    'MAX(order_id) AS order_id',
    'MIN(order_time) AS order_time',
    'MAX(order_status) AS order_status',
    'SUM(product_amount) AS product_amount',
    'SUM(COALESCE(discount_total, 0)) AS discount_total',
    'MAX(pay_amount) AS pay_amount',
    'SUM(quantity) AS quantity',
    'MIN(unit_price) AS unit_price',
    'SUM(COALESCE(coupon_amount, 0)) AS coupon_amount',
    'SUM(COALESCE(platform_discount, 0)) AS platform_discount',
    'SUM(COALESCE(merchant_discount, 0)) AS merchant_discount',
    'MAX(refund_amount) AS refund_amount',
    'BOOL_OR(has_null_amount) AS has_null_amount',
  ].join(',\n    ');
  return `agg AS (\n  SELECT\n    ${proj}\n  FROM keyed\n  GROUP BY order_key\n)`;
}

/** 槽位过滤：应付组只许源列（不可自引用），损失组可再引用两个派生列 */
function slotsOf(slots: FormulaSlot[] | undefined, allowed: Set<string>): FormulaSlot[] {
  return (slots ?? []).filter((slot) => allowed.has(slot?.column));
}

/** ⑤ 派生列：应付金额（槽位）与净实付（退款已映射才抵减） */
export function buildBaseCalcCte(cfg: ZeroNegativeOrderDetectConfig): string {
  const expected = zeroNegativeSlotSql(slotsOf(cfg.formula?.expectedSlots, SOURCE_COL_SET));
  const netPay = has(cfg.fieldMapping.refundAmountCol)
    ? 'COALESCE(pay_amount, 0) - COALESCE(refund_amount, 0)'
    : 'COALESCE(pay_amount, 0)';
  return (
    'base_calc AS (\n' +
    '  SELECT *,\n' +
    `    (${expected}) AS expected_amount,\n` +
    `    ${netPay} AS net_pay_amount\n` +
    '  FROM agg\n' +
    ')'
  );
}

/** 单条规则判据（不含 `has_null_amount` 门禁与括号包裹） */
function ruleBody(key: ZeroNegativeRuleKey, cfg: ZeroNegativeOrderDetectConfig): string {
  const t = resolveZeroNegativeThresholds(cfg);
  const tol = num(t.toleranceYuan);
  const minGap = num(t.mismatchMinYuan);
  const pennyMax = num(t.pennyOrderMaxYuan);
  switch (key) {
    case 'zero_pay':
      return `ABS(pay_amount) <= ${tol} AND product_amount > 0`;
    case 'negative_pay':
      return 'pay_amount < 0';
    case 'negative_unit_price':
      return has(cfg.fieldMapping.unitPriceCol)
        ? `unit_price < 0`
        : 'quantity > 0 AND product_amount / NULLIF(quantity, 0) < 0';
    case 'discount_overflow':
      return `discount_total > product_amount + ${tol}`;
    case 'negative_field':
      return '(product_amount < 0 OR discount_total < 0)';
    case 'amount_mismatch':
      return `ABS(pay_amount - expected_amount) > ${tol} AND ABS(pay_amount - expected_amount) >= ${minGap}`;
    case 'discount_sum_mismatch':
      return `ABS(coupon_amount + platform_discount + merchant_discount - discount_total) > ${tol}`;
    case 'penny_order':
      return `pay_amount > 0 AND pay_amount <= ${pennyMax} AND (product_amount - pay_amount) >= ${minGap}`;
    default:
      return 'FALSE';
  }
}

/** ⑥ 损失金额 + 8 个命中标志（关闭/跳过 → 固定 FALSE，列名恒齐） */
export function buildCalcCte(cfg: ZeroNegativeOrderDetectConfig, gates: ZeroNegativeGates): string {
  const lossSlots = zeroNegativeSlotSql(slotsOf(cfg.formula?.lossSlots, DERIVED_COL_SET));
  const overflow = cfg.includeOverflowLoss ? 'GREATEST(0, -expected_amount)' : '0';
  const flags = ZERO_NEGATIVE_RULE_KEYS.map((key) => {
    const body = gates[key] ? `(${ruleBody(key, cfg)}) AND NOT has_null_amount` : 'FALSE';
    return `${body} AS ${ZERO_NEGATIVE_FLAG_COL[key]}`;
  }).join(',\n    ');
  return (
    'calc AS (\n' +
    '  SELECT *,\n' +
    `    GREATEST(0, (${lossSlots})) + ${overflow} AS loss_amount,\n` +
    `    ${flags}\n` +
    '  FROM base_calc\n' +
    ')'
  );
}

/** ⑦ 异常标志：8 个命中标志相或（关闭的规则恒 FALSE，语义即「命中任一可判定规则」） */
export function buildJudgedCte(): string {
  const anyHit = ZERO_NEGATIVE_RULE_KEYS.map((key) => ZERO_NEGATIVE_FLAG_COL[key]).join(' OR ');
  return `judged AS (\n  SELECT *, (${anyHit}) AS is_abnormal\n  FROM calc\n)`;
}

/** 最终投影：数值与布尔，无中文文案 */
export function buildFinalSelect(): string {
  return `SELECT ${FINAL_COLUMNS.join(', ')}\nFROM judged`;
}

// ============================================================================
// 策略
// ============================================================================

export class EcomZeroNegativeOrderDetectStrategy extends BaseStrategy {
  readonly type = OperatorType.ZERO_NEGATIVE_ORDER_DETECT;
  readonly name = 'EcomZeroNegativeOrderDetectStrategy';

  /** buildOperatorSql 记录、postProcess 唯一配置来源（禁止 postProcess 重读节点） */
  private _lastConfig: ZeroNegativeOrderDetectConfig | null = null;

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
      ?.zeroNegativeDetectConfig;

    // 先赋值再判降级：单例策略不得把上一个节点的配置残留给无配置节点
    this._lastConfig = cfg ? cloneZeroNegativeOrderDetectConfig(cfg) : null;

    const blockers = collectZeroNegativeBlockers(cfg);
    if (!tableName || !cfg || blockers.length > 0) {
      logger.warn(
        `[${this.name}.buildOperatorSql] 降级空查询: table=${tableName || '<空>'}, config=${cfg ? 'ok' : '<缺失>'}, ` +
        `blockers=${blockers.map((b) => b.code).join('/') || '<无>'}`,
      );
      return DEGRADE_SQL;
    }

    const gates = computeZeroNegativeGates(cfg);
    const ctes = [
      buildSrcAllCte(tableName, cfg, userWhere),
      buildSrcFilteredCte(cfg),
      buildKeyedCte(),
      buildAggCte(),
      buildBaseCalcCte(cfg),
      buildCalcCte(cfg, gates),
      buildJudgedCte(),
    ];

    const sql = `WITH ${ctes.join(',\n')}\n${buildFinalSelect()}`;
    logger.info(
      `[${this.name}.buildOperatorSql] table=${tableName}, ctes=${ctes.length}, ` +
      `effective=${ZERO_NEGATIVE_RULE_KEYS.filter((k) => gates[k]).length}/8`,
    );
    return sql;
  }

  /** 阻断项 → ERROR；缺依赖列跳过 → 逐条 WARNING + 汇总 WARNING（判据与 SQL 生成同源） */
  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[],
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    if (!selectNode) return [];
    const cfg = (selectNode.data as SelectNodeData | undefined)?.zeroNegativeDetectConfig;

    const errors: ValidationError[] = [];
    const push = (message: string, severity: ValidationSeverity = ValidationSeverity.ERROR): void => {
      errors.push({ nodeId: selectNode.id, nodeType: FlowNodeType.SELECT, severity, message });
    };

    for (const blocker of collectZeroNegativeBlockers(cfg)) push(blocker.message);

    if (!cfg) return errors;

    const skipped = collectZeroNegativeSkippedRules(cfg);
    for (const key of skipped) {
      push(`『${ZERO_NEGATIVE_RULE_LABEL[key]}』已开启但缺少依赖列，本次不参与计算`, ValidationSeverity.WARNING);
    }

    // 覆盖摘要：仅 skipped>0 时提示；用户主动关闭不算跳过
    const coverage = collectZeroNegativeRuleCoverage(cfg);
    if (coverage.skipped.length > 0) {
      push(
        `本次 8 项规则中生效 ${coverage.effective.length} 项（缺少依赖列跳过 ${coverage.skipped.length} 项：` +
        `${coverage.skipped.map((k) => ZERO_NEGATIVE_RULE_LABEL[k]).join('、')}）`,
        ValidationSeverity.WARNING,
      );
    }
    return errors;
  }

  /** Phase 2：行级富化 / 空结果四态 / 4+1 洞察卡 / 展示配置（配置唯一来源 _lastConfig） */
  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const cfg = this._lastConfig ?? DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG;
    const queryResult = (data ?? {}) as { data?: unknown; schema?: unknown[] };
    const rows = (Array.isArray(queryResult.data) ? queryResult.data : []) as ZeroNegativeRawRow[];
    const skipped = collectZeroNegativeSkippedRules(cfg);
    const coverage = collectZeroNegativeRuleCoverage(cfg);
    logger.info(
      `[${this.name}.postProcess] rows=${rows.length}, effectiveRules=${coverage.effective.length}/8, skipped=${skipped.length}`,
    );

    const decorated = rows.map((row) => enrichZeroNegativeRow(row, cfg, skipped));
    decorated.sort(compareZeroNegativeRows);
    const hitCount = decorated.filter((r) => r.is_abnormal === true).length;

    const insights = decorateInsightsForState(decorated, skipped, coverage, hitCount);
    if (insights) {
      // 空结果四态：只产出 1 张卡；无行时不保留行集，有行时行集照旧输出
      return {
        type: this.type,
        sql: '',
        data: insights.dropRows ? [] : decorated.map(toOutputRow),
        schema: ZERO_NEGATIVE_OUTPUT_SCHEMA as unknown[],
        insightsData: { summary: buildSummary(decorated, hitCount), insights: insights.items },
        displayConfig: buildDisplayConfig(cfg),
      };
    }

    return {
      type: this.type,
      sql: '',
      data: decorated.map(toOutputRow),
      schema: ZERO_NEGATIVE_OUTPUT_SCHEMA as unknown[],
      insightsData: { summary: buildSummary(decorated, hitCount), insights: buildInsightItems(decorated, cfg, skipped, hitCount) },
      displayConfig: buildDisplayConfig(cfg),
    };
  }
}
// ════════════════════════════════════════════════════════════════════════════
// Phase 2 — postProcess：行级富化 / 空结果四态 / 4+1 洞察卡 / 展示配置
// 全部中文文案在此生成（R3-3：SQL 只出数值与布尔）
// ════════════════════════════════════════════════════════════════════════════

type ZeroNegativeRawRow = Record<string, unknown>;

interface ZeroNegativeDecoratedRow extends ZeroNegativeSortableRow {
  order_id: string | null;
  order_time: string | null;
  abnormal_type: string | null;
  abnormal_types: string | null;
  abnormal_reasons: string | null;
  risk_level: ZeroNegativeRiskLevel;
  loss_amount: number | null;
  expected_amount: number | null;
  pay_amount: number | null;
  discount_total: number | null;
  suggestion: string | null;
  data_quality_flag: string;
  skipped_rules: string | null;
  net_pay_amount: number | null;
  is_abnormal: boolean;
  /** 内部标记：仅用于空结果态判定与质量短码，输出前剥离 */
  has_null_amount: boolean;
}

/** 输出列（15）：内部 `hit_*` / `has_null_amount` 用完即丢，不进 schema */
const ZERO_NEGATIVE_OUTPUT_SCHEMA: ReadonlyArray<{ name: string; type: string }> = [
  { name: 'order_id', type: 'VARCHAR' },
  { name: 'order_time', type: 'VARCHAR' },
  { name: 'abnormal_type', type: 'VARCHAR' },
  { name: 'abnormal_types', type: 'VARCHAR' },
  { name: 'abnormal_reasons', type: 'VARCHAR' },
  { name: 'risk_level', type: 'VARCHAR' },
  { name: 'loss_amount', type: 'DOUBLE' },
  { name: 'expected_amount', type: 'DOUBLE' },
  { name: 'pay_amount', type: 'DOUBLE' },
  { name: 'discount_total', type: 'DOUBLE' },
  { name: 'suggestion', type: 'VARCHAR' },
  { name: 'data_quality_flag', type: 'VARCHAR' },
  { name: 'skipped_rules', type: 'VARCHAR' },
  { name: 'net_pay_amount', type: 'DOUBLE' },
  { name: 'is_abnormal', type: 'BOOLEAN' },
];

const RISK_LEVELS: readonly ZeroNegativeRiskLevel[] = ['严重', '高', '中', '低'];

/** 数值读取：非有限值（含 null / 非数字字符串）一律 null，不被静默当 0 */
function safeNum(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 十进制安全四舍五入：直接 ×100 会让 10.005 得 1000.4999… → 10.00 */
function round2(value: number | null): number | null {
  if (value === null) return null;
  const shifted = Number(`${value}e2`);
  if (!Number.isFinite(shifted)) return Math.round(value * 100) / 100;
  return Number(`${Math.round(shifted)}e-2`);
}

/** 金额文案：null 用「—」占位，不伪造 0.00 */
function moneyText(value: number | null): string {
  return value === null ? '—' : value.toFixed(2);
}

function textOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** 规则命中原因（带实际数值，主类型用） */
function buildZeroNegativeReason(key: ZeroNegativeRuleKey, row: ZeroNegativeRawRow): string {
  const pay = moneyText(round2(safeNum(row.pay_amount)));
  const expected = moneyText(round2(safeNum(row.expected_amount)));
  const discount = moneyText(round2(safeNum(row.discount_total)));
  const netPay = moneyText(round2(safeNum(row.net_pay_amount)));
  const loss = moneyText(round2(safeNum(row.loss_amount)));
  switch (key) {
    case 'zero_pay':
      return `实付 ${pay} 元而应付金额 ${expected} 元`;
    case 'negative_pay':
      return `实付 ${pay} 元为负（净实付 ${netPay} 元）`;
    case 'negative_unit_price':
      return `存在负单价，应付金额合计 ${expected} 元`;
    case 'discount_overflow':
      return `优惠合计 ${discount} 元致应付金额降为 ${expected} 元，超额 ${loss} 元`;
    case 'negative_field':
      return `应付金额 ${expected} 元为负，商品金额或优惠合计存在负值`;
    case 'amount_mismatch':
      return `实付 ${pay} 元与应付 ${expected} 元不一致，差额 ${loss} 元`;
    case 'discount_sum_mismatch':
      return `优惠合计 ${discount} 元与券/平台/商家分项之和不一致`;
    case 'penny_order':
      return `实付 ${pay} 元而应付金额 ${expected} 元，差额 ${loss} 元`;
    default:
      return `命中规则，损失 ${loss} 元`;
  }
}

/** 处置建议（按主类型给一句话动作） */
function buildZeroNegativeSuggestion(key: ZeroNegativeRuleKey): string {
  switch (key) {
    case 'zero_pay':
      return '确认是否为赠品/试用/纯积分兑换单，非预期则核查下单链路与优惠叠加配置';
    case 'negative_pay':
      return '核对退款/冲正单是否混入正式单，确认后转财务对账';
    case 'negative_unit_price':
      return '核查商品单价取数字段是否混入退款/冲正行，确认后修正单价口径';
    case 'discount_overflow':
      return '检查优惠券/补贴是否重复叠加或超额发放，确认后调整优惠计算口径';
    case 'negative_field':
      return '核对商品金额与优惠合计的取数口径，确认后修正源数据';
    case 'amount_mismatch':
      return '核对实付与应付的恒等式，定位差额来源（运费、改价、补差价）';
    case 'discount_sum_mismatch':
      return '核对优惠券/平台补贴/商家优惠三个分项是否漏记或多记';
    case 'penny_order':
      return '确认是否为低价引流或改价单，核对实付与应付差额的归属';
    default:
      return '核对数据源与口径后重跑';
  }
}

/** 单行富化：命中键按根因优先级排序，主类型取首位（R3-2） */
function enrichZeroNegativeRow(
  row: ZeroNegativeRawRow,
  cfg: ZeroNegativeOrderDetectConfig,
  skipped: readonly ZeroNegativeRuleKey[],
): ZeroNegativeDecoratedRow {
  const hits = ZERO_NEGATIVE_RULE_PRIORITY.filter((k) => row[ZERO_NEGATIVE_FLAG_COL[k]] === true);
  const loss = round2(safeNum(row.loss_amount));
  const { level } = riskLevelFromLoss(loss ?? 0, hits.length, cfg.tiers);
  const nullAmount = row.has_null_amount === true;
  return {
    order_id: textOf(row.order_id),
    order_time: textOf(row.order_time),
    abnormal_type: hits.length > 0 ? ZERO_NEGATIVE_RULE_LABEL[hits[0]] : null,
    abnormal_types: hits.length > 0 ? hits.map((k) => ZERO_NEGATIVE_RULE_CODE[k]).join(',') : null,
    abnormal_reasons: hits.length > 0
      ? hits.map((k) => `${ZERO_NEGATIVE_RULE_CODE[k]} ${ZERO_NEGATIVE_RULE_LABEL[k]}：${buildZeroNegativeReason(k, row)}`).join('；')
      : null,
    risk_level: level,
    loss_amount: loss,
    expected_amount: round2(safeNum(row.expected_amount)),
    pay_amount: round2(safeNum(row.pay_amount)),
    discount_total: round2(safeNum(row.discount_total)),
    suggestion: hits.length > 0 ? buildZeroNegativeSuggestion(hits[0]) : null,
    data_quality_flag: joinZeroNegativeQuality([
      hasColumnValue(cfg.fieldMapping.orderIdCol) ? null : 'ROW_LEVEL',
      skipped.length > 0 ? 'PARTIAL_RULES' : null,
      nullAmount ? 'NULL_AMOUNT' : null,
    ]),
    skipped_rules: skipped.length > 0 ? skipped.map((k) => ZERO_NEGATIVE_RULE_CODE[k]).join(',') : null,
    net_pay_amount: round2(safeNum(row.net_pay_amount)),
    is_abnormal: row.is_abnormal === true,
    has_null_amount: nullAmount,
  };
}

/** 剥离内部列：只保留 ZERO_NEGATIVE_OUTPUT_SCHEMA 声明的 15 列 */
function toOutputRow(row: ZeroNegativeDecoratedRow): Record<string, unknown> {
  // SAFETY: 遍历键全部来自 ZERO_NEGATIVE_OUTPUT_SCHEMA，均为 ZeroNegativeDecoratedRow 的静态字段，
  // 动态下标访问因此安全（TS 无法静态校验字符串下标）。
  const source = row as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const col of ZERO_NEGATIVE_OUTPUT_SCHEMA) {
    out[col.name] = source[col.name] ?? null;
  }
  return out;
}

/** 空结果四态（R2-8）：命中即只产出 1 张卡。只有第 4 态给健康结论 */
function decorateInsightsForState(
  rows: readonly ZeroNegativeDecoratedRow[],
  skipped: readonly ZeroNegativeRuleKey[],
  coverage: ZeroNegativeRuleCoverage,
  hitCount: number,
): { items: InsightItem[]; dropRows: boolean } | null {
  const card = (id: string, iconKey: InsightItem['iconKey'], title: string, description: string): InsightItem[] => [
    { id, cardType: 'standard', iconKey, title, description, sortOrder: 1 },
  ];

  if (rows.length === 0) {
    if (coverage.effective.length === 0) {
      const names = skipped.length > 0 ? skipped.map((k) => ZERO_NEGATIVE_RULE_LABEL[k]).join('、') : '全部规则';
      return {
        dropRows: true,
        items: card(
          'no-effective-rules', 'quality', '无法执行任何检测规则',
          `本次生效规则 0/8 项（${names} 因缺少依赖列被跳过）。请先完成实付金额、商品金额两列映射，` +
          '并按需补齐单价/数量、优惠分项、退款金额等列后重新运行。',
        ),
      };
    }
    return {
      dropRows: true,
      items: card(
        'no-orders', 'quality', '本次没有可判定的订单',
        `当前生效规则 ${coverage.effective.length}/8 项。数据源为空，或全部订单被观察区间 / 状态剔除过滤，` +
        '请检查数据源与筛选条件。',
      ),
    };
  }

  if (rows.every((r) => r.has_null_amount)) {
    return {
      dropRows: false,
      items: card(
        'all-null-amount', 'quality', '全部订单因金额缺失未参与判定',
        `${rows.length} 行全部存在实付金额或商品金额缺失，未参与任何规则判定。请检查这两列的取数与空值情况后重跑。`,
      ),
    };
  }

  if (hitCount === 0) {
    return {
      dropRows: false,
      items: card(
        'no-hit', 'safe', '未发现 0 元单 / 负金额 / 优惠溢出',
        `已按生效规则 ${coverage.effective.length}/8 项扫描 ${rows.length} 个订单，未命中任何启用规则的阈值。`,
      ),
    };
  }

  return null;
}

interface ZeroNegativeTypeGroup {
  label: string;
  loss: number;
  count: number;
}

/** 主类型分组（含「其他」），各组金额之和恒等于总损失（R3-2） */
function groupByAbnormalType(
  rows: readonly ZeroNegativeDecoratedRow[],
  totalLoss: number,
): ZeroNegativeTypeGroup[] {
  const map = new Map<string, ZeroNegativeTypeGroup>();
  for (const row of rows) {
    if (row.abnormal_type === null) continue;
    const g = map.get(row.abnormal_type) ?? { label: row.abnormal_type, loss: 0, count: 0 };
    g.loss += row.loss_amount ?? 0;
    g.count += 1;
    map.set(row.abnormal_type, g);
  }
  const sorted = [...map.values()].sort((a, b) => b.loss - a.loss || b.count - a.count || a.label.localeCompare(b.label));
  const top = sorted.slice(0, 5);
  const rest = sorted.slice(5);
  const restLoss = rest.reduce((a, g) => a + g.loss, 0);
  const restCount = rest.reduce((a, g) => a + g.count, 0);
  // 未命中规则但有损失的订单并入「其他」，保证各组之和 == 总损失
  const residual = round2(totalLoss - top.reduce((a, g) => a + g.loss, 0) - restLoss) ?? 0;
  if (rest.length > 0) top.push({ label: '其他', loss: round2(restLoss) ?? 0, count: restCount });
  if (residual > 0) {
    const other = top.find((g) => g.label === '其他');
    if (other) other.loss = round2(other.loss + residual) ?? other.loss;
    else top.push({ label: '其他', loss: residual, count: 0 });
  }
  return top;
}

function buildLossOverviewCard(rows: readonly ZeroNegativeDecoratedRow[], totalLoss: number, hitCount: number): InsightItem {
  const metrics: InsightMetric[] = [
    { label: '总损失', value: totalLoss, unit: '元', highlight: true },
    { label: '命中订单数', value: hitCount, unit: '单' },
    { label: '命中率', value: rows.length > 0 ? hitCount / rows.length : 0, unit: '%' },
    { label: '平均单笔损失', value: hitCount > 0 ? totalLoss / hitCount : 0, unit: '元' },
  ];
  return {
    id: 'loss-overview',
    cardType: 'standard',
    iconKey: 'critical',
    title: '损失总览',
    description: `共扫描 ${rows.length} 个订单，命中 ${hitCount} 个，损失合计 ${moneyText(round2(totalLoss))} 元`,
    sortOrder: 1,
    metrics,
  };
}

function buildTypeCompositionCard(rows: readonly ZeroNegativeDecoratedRow[], totalLoss: number): InsightItem {
  const groups = groupByAbnormalType(rows, totalLoss);
  const text = groups.length > 0
    ? groups.map((g) => `${g.label} ${moneyText(round2(g.loss))} 元（${g.count} 单）`).join('、')
    : '本次未命中任何异常类型';
  const metrics: InsightMetric[] = groups.slice(0, 4).map((g) => ({
    label: g.label,
    value: round2(g.loss) ?? 0,
    unit: '元',
  }));
  return {
    id: 'type-composition',
    cardType: 'standard',
    iconKey: 'warning',
    title: '异常类型构成',
    description: text,
    sortOrder: 2,
    metrics,
    metadata: { groups },
  };
}

function buildRiskDistributionCard(rows: readonly ZeroNegativeDecoratedRow[], totalLoss: number): InsightItem {
  const metrics: InsightMetric[] = RISK_LEVELS.map((level) => {
    const hit = rows.filter((r) => r.risk_level === level);
    const amount = hit.reduce((a, r) => a + (r.loss_amount ?? 0), 0);
    return {
      label: `${level}（${hit.length} 单）`,
      value: totalLoss > 0 ? amount / totalLoss : 0,
      unit: '%',
      highlight: level === '严重' && hit.length > 0,
    };
  });
  const desc = RISK_LEVELS.map((level) => {
    const hit = rows.filter((r) => r.risk_level === level);
    const amount = hit.reduce((a, r) => a + (r.loss_amount ?? 0), 0);
    return `${level} ${hit.length} 单 / ${moneyText(round2(amount))} 元`;
  }).join('、');
  return {
    id: 'risk-distribution',
    cardType: 'standard',
    iconKey: 'insight',
    title: '风险分档分布',
    description: desc,
    sortOrder: 3,
    metrics,
  };
}

function buildTopLossOrdersCard(hitRows: readonly ZeroNegativeDecoratedRow[], topN: number): InsightItem {
  const entries = [...hitRows]
    .sort((a, b) => (b.loss_amount ?? 0) - (a.loss_amount ?? 0) || String(a.order_id ?? '').localeCompare(String(b.order_id ?? '')))
    .slice(0, topN)
    .map((r) => ({ order_id: r.order_id ?? '—', abnormal_type: r.abnormal_type ?? '—', loss_amount: r.loss_amount ?? 0 }));
  const desc = entries.length > 0
    ? entries.map((e) => `${e.order_id}（${e.abnormal_type}）${moneyText(e.loss_amount)} 元`).join('；')
    : '本次无命中订单';
  const maxLoss = entries.reduce((a, e) => Math.max(a, e.loss_amount), 0);
  return {
    id: 'top-loss-orders',
    cardType: 'standard',
    iconKey: 'order',
    title: `损失 Top${topN} 订单`,
    description: desc,
    sortOrder: 4,
    metrics: [{ label: '最大单笔损失', value: round2(maxLoss) ?? 0, unit: '元', highlight: true }],
    metadata: { entries },
  };
}

function buildDataQualityCard(
  rows: readonly ZeroNegativeDecoratedRow[],
  cfg: ZeroNegativeOrderDetectConfig,
  skipped: readonly ZeroNegativeRuleKey[],
): InsightItem | null {
  const nullCount = rows.filter((r) => r.has_null_amount).length;
  const rowLevel = !hasColumnValue(cfg.fieldMapping.orderIdCol);
  if (skipped.length === 0 && !rowLevel && nullCount === 0) return null;

  const segs: string[] = [];
  if (skipped.length > 0) {
    segs.push(`缺依赖列跳过 ${skipped.length} 项规则（${skipped.map((k) => ZERO_NEGATIVE_RULE_LABEL[k]).join('、')}），结论未覆盖这些规则`);
  }
  if (rowLevel) segs.push('订单号列未映射，按行计数的指标为行级口径（同一订单的多行会重复计数）');
  if (nullCount > 0) segs.push(`${nullCount} 行因金额缺失未参与判定`);
  return {
    id: 'data-quality',
    cardType: 'standard',
    iconKey: 'quality',
    title: '数据质量提示',
    description: segs.join('；'),
    sortOrder: 5,
  };
}

/** 常驻 4 卡 + 条件质量卡；sortOrder 严格递增 */
function buildInsightItems(
  rows: readonly ZeroNegativeDecoratedRow[],
  cfg: ZeroNegativeOrderDetectConfig,
  skipped: readonly ZeroNegativeRuleKey[],
  hitCount: number,
): InsightItem[] {
  const totalLoss = rows.reduce((a, r) => a + (r.loss_amount ?? 0), 0);
  const hitRows = rows.filter((r) => r.is_abnormal);
  const topN = Math.max(1, Math.min(10, Math.trunc(safeNum(cfg.topN) ?? 5)));
  const items = [
    buildLossOverviewCard(rows, totalLoss, hitCount),
    buildTypeCompositionCard(rows, totalLoss),
    buildRiskDistributionCard(rows, totalLoss),
    buildTopLossOrdersCard(hitRows, topN),
  ];
  const quality = buildDataQualityCard(rows, cfg, skipped);
  if (quality) items.push(quality);
  return items;
}

function buildSummary(rows: readonly ZeroNegativeDecoratedRow[], hitCount: number): InsightSummary {
  const totalLoss = rows.reduce((a, r) => a + (r.loss_amount ?? 0), 0);
  return {
    totalRecordCount: rows.length,
    totalFilterRecordCount: hitCount,
    riskRecordCount: hitCount,
    criticalRecordCount: rows.filter((r) => r.risk_level === '严重').length,
    estimatedLoss: round2(totalLoss) ?? 0,
  };
}

/** 展示配置：行序唯一真值在 compareZeroNegativeRows，故不设 defaultSort / rowColorizer */
function buildDisplayConfig(cfg: ZeroNegativeOrderDetectConfig): OperatorDisplayConfig {
  const refundMapped = hasColumnValue(cfg.fieldMapping.refundAmountCol);
  return {
    tabs: [
      { label: '全量订单' },
      { label: '仅看异常单', filterField: 'is_abnormal', filterValue: true },
    ],
    columnFormatters: {
      risk_level: { type: 'risk_badge' },
      abnormal_types: { type: 'json_tag_badges' },
    },
    columnTooltips: {
      loss_amount:
        `损失 = GREATEST(0, ${zeroNegativeSlotHuman(cfg.formula.lossSlots)})` +
        (cfg.includeOverflowLoss ? ' + GREATEST(0, -应付金额)' : '') + '；超额优惠计入损失：' +
        (cfg.includeOverflowLoss ? '已开启' : '已关闭'),
      expected_amount: `应付金额 = ${zeroNegativeSlotHuman(cfg.formula.expectedSlots)}`,
      net_pay_amount: refundMapped
        ? '净实付 = 实付金额 − 退款金额'
        : '净实付 = 实付金额（未映射退款金额列）',
      data_quality_flag: '质量短码按 ROW_LEVEL → PARTIAL_RULES → NULL_AMOUNT 次序拼接，无问题为 OK',
      skipped_rules: '本次因缺少依赖列而跳过的规则短码（R1–R8）',
      abnormal_type: '主类型按根因优先级取首个命中：负数字段 > 负实付 > 优惠溢出 > 零实付 > 负单价 > 金额不符 > 一分钱单 > 分项不符',
      abnormal_types: '命中的全部规则短码，可能多于一个',
      is_abnormal: '是否命中任一已启用规则',
      order_time: '订单级最早时间；字符串列按字典序取值',
    },
  };
}
