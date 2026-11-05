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
  ZERO_NEGATIVE_RULE_KEYS,
  ZERO_NEGATIVE_RULE_LABEL,
  ZERO_NEGATIVE_SOURCE_COLS,
  cloneZeroNegativeOrderDetectConfig,
  collectZeroNegativeBlockers,
  collectZeroNegativeRuleCoverage,
  collectZeroNegativeSkippedRules,
  hasColumnValue,
  parseRefundStatusValues,
  resolveZeroNegativeThresholds,
  zeroNegativeSlotSql,
  type AnalysisResult,
  type FlowEdge,
  type FlowNode,
  type SelectNodeData,
  type FormulaSlot,
  type ValidationError,
  type ZeroNegativeOrderDetectConfig,
  type ZeroNegativeRuleKey,
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

  /** Phase 2 补全行级富化 / 洞察卡 / 展示配置；此处仅直通行集以保持编译闭合 */
  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const cfg = this._lastConfig;
    const rows = Array.isArray((data as { data?: unknown } | undefined)?.data)
      ? ((data as { data: unknown[] }).data)
      : [];
    logger.info(
      `[${this.name}.postProcess] rows=${rows.length}, ` +
      `effective=${cfg ? collectZeroNegativeRuleCoverage(cfg).effective.length : 0}/8`,
    );
    return {
      type: this.type,
      sql: '',
      data: rows,
      schema: ((data as { schema?: unknown[] } | undefined)?.schema ?? []) as unknown[],
    } as AnalysisResult;
  }
}