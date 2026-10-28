/**
 * fn_ecom_activity_effect_split — 活动/优惠券/直播间效果拆分（feature 14）
 *
 * SQL 管道（决策 #16 / #4 / #6）：
 *   WITH src AS (SELECT * FROM "tbl" WHERE <userWhere ∧ 排除状态>)
 *   每个生效维度：[baseline_delta 时 win_<dim> → base_<dim>] → agg_<dim> → d_<dim>
 *   恒生成 agg_natural → d_natural（自然成交对照行，决策 #4）
 *   SELECT * FROM (d_* UNION ALL … UNION ALL d_natural)
 *   ORDER BY dimension_type ASC, lift_amount DESC NULLS LAST
 *
 * 输出 14 列长表（决策 #14）；全 SQL 恰好 1 个 WITH、无任何分号
 * （duckDBUdfService 按 ';' 切分语句）。
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
  cloneActivityEffectSplitConfig,
  hasColumnValue,
  DIMENSION_COLUMN_KEY,
  ACTIVITY_DIMENSION_LABEL,
  collectActivitySplitBlockers,
  type ActivityEffectSplitConfig,
  type ActivityEffectSplitFieldMapping,
  type ActivitySplitDimension,
  type AnalysisResult,
  type FlowEdge,
  type FlowNode,
  type FormulaSlot,
  type InsightItem,
  type InsightMetric,
  type OperatorDisplayConfig,
  type OperatorInsightsData,
  type SelectNodeData,
  type ValidationError,
} from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// 模块级常量（供 Phase 3 抽屉直接 import）
// ============================================================================

export const DIMENSION_LABEL: Record<ActivitySplitDimension | 'natural', string> = {
  ...ACTIVITY_DIMENSION_LABEL,
  natural: '自然成交',
};

/** 决策 #4：自然成交行标签为固定常量，恒生成 1 行、与维度勾选解耦（不做动态拼接） */
export const NATURAL_ROW_LABEL = '自然成交（无活动/无券/无直播）';

/**
 * 决策 #18：共 22 项（`/i`，中英混排），与配置列字段一一对应。
 * 16 个 fieldMapping 列键 + 6 个槽位/单列键（抽屉用于预填成本槽位、拉动首槽与单列成本）。
 */
export const ACTIVITY_FIELD_MATCH_PATTERNS: Record<string, RegExp> = {
  activityIdCol: /活动[ _. -]?(编号|id|号)|活动[ _. -]?id|act[ _. -]?id|activity[ _. -]?(id|code)|campaign[ _. -]?id/i,
  activityNameCol: /活动[名标]?称|活动名|activity[ _. -]?name|campaign[ _. -]?name/i,
  activityTypeCol: /活动类型|活动玩法|activity[ _. -]?type|promotion[ _. -]?type|campaign[ _. -]?type/i,
  couponIdCol: /优惠券[ _. -]?(编号|号|id)|券[ _. -]?(编号|号|id)|coupon[ _. -]?(id|code|no)|voucher[ _. -]?id/i,
  couponAmountCol: /优惠券金额|券金额|优惠[总金]*额|coupon[ _. -]?amount/i,
  liveRoomIdCol: /直播间?[ _. -]?(编号|号|id)|live[ _. -]?(room)?[ _. -]?id|room[ _. -]?id/i,
  payTimeCol: /支付(时间|日期)|付款时间|pay[ _. -]?(time|date)|paid[ _. -]?(at|time)/i,
  activityStartCol: /活动开始|开始(时间|日期)|activity[ _. -]?start|start[ _. -]?(time|date)|begin[ _. -]?time/i,
  activityEndCol: /活动结束|结束(时间|日期)|activity[ _. -]?end|end[ _. -]?(time|date)/i,
  netAmountCol: /(?:订单)?实付(?:金额)?|净(金额|款|额)|支付金额|net[ _. -]?(amount|paid)|pay[ _. -]?amount|actual[ _. -]?(amount|pay)/i,
  productAmountCol: /商品[实付]*金额|product[ _. -]?(amount|price)|goods[ _. -]?amount|item[ _. -]?amount/i,
  orderIdCol: /订单[ _. -]?(编号|号|id)|order[ _. -]?(id|no)/i,
  userIdCol: /用户[ _. -]?(编号|号|id)|会员[ _. -]?(编号|号|id)|买家[ _. -]?(编号|号|id)|buyer[ _. -]?id|user[ _. -]?id|member[ _. -]?id/i,
  quantityCol: /购买数量|数量|quantity|qty/i,
  couponStatusCol: /优惠券状态|券状态|coupon[ _. -]?status/i,
  orderStatusCol: /订单状态|order[ _. -]?status/i,
  couponAmountSlot: /优惠券金额|券金额|coupon[ _. -]?amount/i,
  discountAmountSlot: /优惠总[金额]+|优惠[金额]+合计|折扣(金额)?|discount[ _. -]?(total|amount)/i,
  platformSubsidySlot: /平台补贴|补贴(金额)?|platform[ _. -]?subsidy|subsidy/i,
  adCostSlot: /广告费|投流(费)?|推广费|坑位费|ad[ _. -]?cost|promotion[ _. -]?cost/i,
  liftAmountSlot: /拉动金额|活动金额|lift[ _. -]?amount/i,
  costSingleColumn: /活动成本|成本(金额|列)?|subsidy[ _. -]?cost|total[ _. -]?cost|cost/i,
};

// ============================================================================
// SQL 辅助纯函数（模块级，便于单测直测）
// ============================================================================

/** 「已映射」唯一判据 = Phase 0 `hasColumnValue`（'' 与 undefined 语义等价），禁止另写一份 */
const has = hasColumnValue;

/**
 * 决策 #12：`NULL` / 空串 / 纯空白 / `0` / `'0'` / 数值 0 一律视为「无该维度」。
 * 第二分支覆盖浮点标识列（`CAST(0.0 AS DOUBLE)` 的字符串是 `'0.0'`，不命中 `IN ('', '0')`）；
 * `TRY_CAST` 对非数值串返回 NULL → `COALESCE(..., 1)` → 不命中，整表达式永不为 NULL。
 * @internal 供单测直测
 */
export function isEmptyExpr(col: string): string {
  return (
    `COALESCE(TRIM(CAST("${col}" AS VARCHAR)), '') IN ('', '0') ` +
    `OR COALESCE(TRY_CAST(TRIM(CAST("${col}" AS VARCHAR)) AS DOUBLE), 1) = 0`
  );
}

function numExpr(col: string): string {
  return `COALESCE(CAST("${col}" AS DOUBLE), 0)`;
}

function filledSlots(slots: FormulaSlot[]): FormulaSlot[] {
  return (slots ?? []).filter((s) => has(s.column));
}

/** 槽位求和表达式；空槽过滤后无槽 → `CAST(NULL AS DOUBLE)`（校验的 warning 判据与此同源） */
function slotSumExpr(slots: FormulaSlot[]): string {
  const fs = filledSlots(slots);
  if (fs.length === 0) return 'CAST(NULL AS DOUBLE)';
  return fs.map((s) => `${s.operator} ${numExpr(s.column)}`).join(' ');
}

/** 「同组内成本列是否至少有一行非空」的覆盖计数（subsidy_cost 的唯一「成本不可用」判据，第 4 轮评审 Issue 3） */
function costPresenceExpr(config: ActivityEffectSplitConfig): string {
  if (config.costCaliber === 'single_column' && has(config.costSingleColumn)) {
    return `SUM(CASE WHEN "${config.costSingleColumn}" IS NOT NULL THEN 1 ELSE 0 END)`;
  }
  const fs = filledSlots(config.costSlots);
  if (config.costCaliber === 'slot_sum' && fs.length > 0) {
    return `SUM(CASE WHEN (${fs.map((s) => `"${s.column}" IS NOT NULL`).join(' OR ')}) THEN 1 ELSE 0 END)`;
  }
  return '0';
}

/** 拉动金额口径 L（决策 #5 / #6 / #8） */
function liftExpr(config: ActivityEffectSplitConfig): string {
  const m = config.fieldMapping;
  switch (config.liftCaliber) {
    case 'product_amount':
      return numExpr(m.productAmountCol ?? '');
    case 'custom_slots':
      return slotSumExpr(config.liftSlots);
    case 'activity_gmv':
    case 'baseline_delta':
    default:
      return numExpr(m.netAmountCol);
  }
}

/** 补贴成本口径 C（决策 #7） */
function costExpr(config: ActivityEffectSplitConfig): string {
  return config.costCaliber === 'single_column'
    ? numExpr(config.costSingleColumn)
    : slotSumExpr(config.costSlots);
}

function orderCountExpr(m: ActivityEffectSplitFieldMapping): string {
  return has(m.orderIdCol) ? `COUNT(DISTINCT "${m.orderIdCol}")` : 'COUNT(*)';
}

function condOrderCountExpr(m: ActivityEffectSplitFieldMapping, cond: string): string {
  return has(m.orderIdCol)
    ? `COUNT(DISTINCT CASE WHEN ${cond} THEN "${m.orderIdCol}" END)`
    : `COUNT(CASE WHEN ${cond} THEN 1 END)`;
}

/** 券去重键：券号 + 用户号（核销率专用）；缺用户列退化为券号 */
function couponKeyExpr(m: ActivityEffectSplitFieldMapping): string {
  return has(m.userIdCol)
    ? `"${m.couponIdCol}" || '|' || COALESCE(CAST("${m.userIdCol}" AS VARCHAR), '')`
    : `"${m.couponIdCol}"`;
}

/** 决策 #9 + 第 2 轮 Q3 方案 D：分母限定 {未使用, 已使用}，过期/退款/禁用不入分母；'已核销' 不入分子 */
function redemptionExpr(m: ActivityEffectSplitFieldMapping): string {
  if (!has(m.couponStatusCol) || !has(m.couponIdCol)) return 'CAST(NULL AS DOUBLE)';
  const used = `UPPER(TRIM(CAST("${m.couponStatusCol}" AS VARCHAR))) IN ('USED','已使用')`;
  const issued = `UPPER(TRIM(CAST("${m.couponStatusCol}" AS VARCHAR))) IN ('UNUSED','未使用','USED','已使用')`;
  const key = couponKeyExpr(m);
  return (
    `ROUND(COUNT(DISTINCT CASE WHEN ${used} THEN ${key} END) * 1.0 ` +
    `/ NULLIF(COUNT(DISTINCT CASE WHEN ${issued} THEN ${key} END), 0), 4)`
  );
}

/** 决策 #4：判定依据只能是 couponAmountCol，禁止用成本表达式 C */
function couponRatioExpr(m: ActivityEffectSplitFieldMapping): string {
  if (!has(m.couponAmountCol)) return 'CAST(NULL AS DOUBLE)';
  const cond = `COALESCE(CAST("${m.couponAmountCol}" AS DOUBLE), 0) > 0`;
  return `ROUND(${condOrderCountExpr(m, cond)} * 1.0 / NULLIF(${orderCountExpr(m)}, 0), 4)`;
}

// ============================================================================
// 行类型与数值安全
// ============================================================================

interface ActivitySplitRow {
  dimension_type: string;
  dimension_label: string;
  order_count: number | bigint;
  quantity: number | null;
  gmv: number;
  lift_amount: number | null;
  subsidy_cost: number | null;
  net_lift: number | null;
  roi: number | null;
  cost_rate: number | null;
  coupon_redemption_rate: number | null;
  coupon_order_ratio: number | null;
  avg_order_value: number | null;
  profit_effective_flag: '盈利' | '亏损' | '持平' | null;
}

/** bigint 一律 Number() 化，非有限值归 0 —— 禁止直接对 bigint 做算术 */
function safeNum(v: unknown): number {
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 保留「空值即空」语义：null/undefined/非有限 → null（不兜底为 0，决策 #10） */
function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

const LIFT_CALIBER_LABEL: Record<ActivityEffectSplitConfig['liftCaliber'], string> = {
  activity_gmv: '活动期订单实付金额',
  product_amount: '商品实付金额',
  baseline_delta: '活动期实付金额 − 同标识等长前窗基线',
  custom_slots: '自定义费用项',
};

const COST_CALIBER_LABEL: Record<ActivityEffectSplitConfig['costCaliber'], string> = {
  slot_sum: '费用槽位求和',
  single_column: '单列成本',
};

// ============================================================================
// 策略类
// ============================================================================

/** 无 TABLE 节点 / 表名为空 / 配置未保存 / 维度全缺列时的统一降级 SQL（不抛错，postProcess 空结果兜底卡接管） */
const DEGRADE_SQL = 'SELECT NULL AS dimension_type WHERE 1 = 0';

export class EcomActivityEffectSplitStrategy extends BaseStrategy {
  readonly type = OperatorType.ACTIVITY_EFFECT_SPLIT;
  readonly name = '活动效果拆分';

  /** buildOperatorSql 记录、postProcess 唯一配置来源（strategy-rules §三：禁止 postProcess 重读节点） */
  private _lastConfig: ActivityEffectSplitConfig | null = null;

  override getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];   // 决策 #17
  }

  // --------------------------------------------------------------------------
  // 校验（决策 #21，错误消息业务化中文）
  // --------------------------------------------------------------------------

  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[],
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    if (!selectNode) return [];
    const cfg = (selectNode.data as SelectNodeData | undefined)?.activityEffectSplitConfig;
    const config = cfg ?? DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG;   // 从未保存过抽屉时按默认判定

    const errors: ValidationError[] = [];
    const push = (message: string, severity: ValidationSeverity = ValidationSeverity.ERROR) =>
      errors.push({ nodeId: selectNode.id, nodeType: FlowNodeType.SELECT, severity, message });

    // 规则 1–4 + 两条口径补充规则：与 isUdfConfigured / 抽屉确认门禁共用唯一判据（禁止各写一份）
    for (const blocker of collectActivitySplitBlockers(config)) {
      push(blocker.message);
    }
    // 非阻断提示（判据与 slotSumExpr 空槽同源，禁止另写一份）
    if (config.costCaliber === 'slot_sum' && slotSumExpr(config.costSlots) === 'CAST(NULL AS DOUBLE)') {
      push('成本费用项均未选择，投产比与成本率将置空', ValidationSeverity.WARNING);
    }
    if (config.liftCaliber === 'custom_slots' && slotSumExpr(config.liftSlots) === 'CAST(NULL AS DOUBLE)') {
      push('拉动金额费用项均未选择，拉动金额与下游指标将置空', ValidationSeverity.WARNING);
    }
    return errors;
  }

  // --------------------------------------------------------------------------
  // SQL 生成
  // --------------------------------------------------------------------------

  override buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string,
  ): string {
    const tableName =
      (nodes.find((n) => n.type === FlowNodeType.TABLE)?.data as { tableName?: string } | undefined)
        ?.tableName ?? '';
    const cfg = (nodes.find((n) => n.type === FlowNodeType.SELECT)?.data as SelectNodeData | undefined)
      ?.activityEffectSplitConfig;
    const config = cfg ?? DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG;

    const activeDims = config.dimensions.filter((d) => has(config.fieldMapping[DIMENSION_COLUMN_KEY[d]]));

    if (!tableName || !cfg || activeDims.length === 0) {
      logger.warn(
        `[${this.name}.buildOperatorSql] 降级空查询: table=${tableName || '<空>'}, ` +
        `config=${cfg ? 'ok' : '<缺失>'}, activeDims=${activeDims.length}`,
      );
      return DEGRADE_SQL;
    }

    this._lastConfig = cloneActivityEffectSplitConfig(config);   // 拼接 SQL 前赋值，深拷贝避免与抽屉共享引用

    const m = config.fieldMapping;
    const isBaseline = config.liftCaliber === 'baseline_delta';

    // src CTE：条件数组统一拼装，禁止「先写 WHERE 再追加 AND」
    const conds: string[] = [];
    const uw = (userWhere ?? '').replace(/^WHERE\s+/i, '').trim();
    if (uw) conds.push(`(${uw})`);
    const excludedValues = has(m.orderStatusCol)
      ? config.excludedStatuses
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .map((v) => `'${v.toUpperCase().replace(/'/g, "''")}'`)
      : [];
    if (excludedValues.length > 0) {
      conds.push(
        `COALESCE(UPPER(TRIM(CAST("${m.orderStatusCol}" AS VARCHAR))), '') NOT IN (${excludedValues.join(',')})`,
      );
    }
    const srcCte = `src AS (SELECT * FROM "${tableName}"${
      conds.length ? `\n  WHERE ${conds.join('\n    AND ')}` : ''
    })`;

    // 跨维度共享的聚合表达式
    const L = liftExpr(config);
    const C = costExpr(config);
    const N = numExpr(m.netAmountCol);
    const presence = costPresenceExpr(config);
    const oc = orderCountExpr(m);
    const qCol: string = m.quantityCol ?? '';
    const metricCols = [
      `${oc} AS order_count`,
      `${has(qCol) ? `SUM(${numExpr(qCol)})` : 'CAST(NULL AS DOUBLE)'} AS quantity`,
      `ROUND(SUM(${N}), 2) AS gmv`,
      `ROUND(SUM(${L}), 2) AS _act_lift`,
      `CASE WHEN ${presence} = 0 THEN CAST(NULL AS DOUBLE) ELSE ROUND(SUM(${C}), 2) END AS subsidy_cost`,
      `${redemptionExpr(m)} AS coupon_redemption_rate`,
      `${couponRatioExpr(m)} AS coupon_order_ratio`,
      `ROUND(SUM(${N}) / NULLIF(${oc}, 0), 2) AS avg_order_value`,
    ].join(',\n    ');

    /** 14 列定型模板（决策 #14）：delta 按「该层是否 JOIN base_<dim>」参数化，两处调用传不同 delta */
    const buildDelta = (joinBase: boolean): { expr: string; guard: string } =>
      isBaseline && joinBase
        ? { expr: '(a._act_lift - b.base_net)', guard: 'b.base_net IS NULL' }
        : { expr: 'a._act_lift', guard: 'FALSE' };
    const deltaDim = buildDelta(true);
    const deltaNatural = buildDelta(false);

    const dTemplate = (from: string, delta: { expr: string; guard: string }): string => {
      const g = delta.guard;
      const e = delta.expr;
      return (
        `SELECT\n` +
        `    a.dimension_type AS dimension_type,\n` +
        `    a.dimension_label AS dimension_label,\n` +
        `    a.order_count AS order_count,\n` +
        `    a.quantity AS quantity,\n` +
        `    a.gmv AS gmv,\n` +
        `    CASE WHEN ${g} THEN CAST(NULL AS DOUBLE) ELSE ROUND(${e}, 2) END AS lift_amount,\n` +
        `    a.subsidy_cost AS subsidy_cost,\n` +
        `    CASE WHEN ${g} OR a.subsidy_cost IS NULL THEN CAST(NULL AS DOUBLE) ELSE ROUND(${e} - a.subsidy_cost, 2) END AS net_lift,\n` +
        `    CASE WHEN ${g} OR a.subsidy_cost IS NULL OR a.subsidy_cost <= 0 THEN CAST(NULL AS DOUBLE) ELSE ROUND(${e} / a.subsidy_cost, 2) END AS roi,\n` +
        `    CASE WHEN ${g} OR a.subsidy_cost IS NULL OR a.subsidy_cost <= 0 OR ${e} <= 0 THEN CAST(NULL AS DOUBLE) ELSE ROUND(a.subsidy_cost / ${e}, 4) END AS cost_rate,\n` +
        `    a.coupon_redemption_rate AS coupon_redemption_rate,\n` +
        `    a.coupon_order_ratio AS coupon_order_ratio,\n` +
        `    a.avg_order_value AS avg_order_value,\n` +
        `    CASE WHEN ${g} OR a.subsidy_cost IS NULL THEN CAST(NULL AS VARCHAR) ` +
        `WHEN (${e} - a.subsidy_cost) > a.subsidy_cost * 0.01 THEN '盈利' ` +
        `WHEN (${e} - a.subsidy_cost) < -a.subsidy_cost * 0.01 THEN '亏损' ELSE '持平' END AS profit_effective_flag\n` +
        `  FROM ${from}`
      );
    };

    const ctes: string[] = [srcCte];
    const branches: string[] = [];

    for (const dim of activeDims) {
      const idCol = m[DIMENSION_COLUMN_KEY[dim]] as string;
      if (isBaseline) {
        // 基线两腿同口径（决策 #6）：win 窗口聚合 + base 等长前窗净额，两条件缺一不可
        ctes.push(
          `win_${dim} AS (\n` +
          `  SELECT CAST("${idCol}" AS VARCHAR) AS dim_key,\n` +
          `         MIN(CAST("${m.activityStartCol}" AS DATE)) AS win_start,\n` +
          `         MAX(CAST("${m.activityEndCol}" AS DATE)) AS win_end\n` +
          `  FROM src\n` +
          `  WHERE NOT (${isEmptyExpr(idCol)})\n` +
          `  GROUP BY 1\n` +
          `)`,
          `base_${dim} AS (\n` +
          `  SELECT w.dim_key AS dim_key, SUM(${numExpr(m.netAmountCol)}) AS base_net\n` +
          `  FROM win_${dim} w\n` +
          `  JOIN src s\n` +
          `    ON CAST(s."${idCol}" AS VARCHAR) = w.dim_key\n` +
          `   AND date_diff('day', w.win_start, CAST(s."${m.payTimeCol}" AS DATE))\n` +
          `       BETWEEN -GREATEST(date_diff('day', w.win_start, w.win_end) + 1, 1) AND -1\n` +
          `  GROUP BY 1\n` +
          `)`,
        );
      }
      const labelExpr =
        dim === 'activity' && has(m.activityNameCol)
          ? `COALESCE(MAX(NULLIF(TRIM(CAST("${m.activityNameCol}" AS VARCHAR)), '')), MAX(CAST("${idCol}" AS VARCHAR)))`
          : `MAX(CAST("${idCol}" AS VARCHAR))`;
      // 基线口径两腿同口径（决策 #6）：活动腿必须收敛到该维度值的活动窗口内，
      // 否则前窗订单会同时进入活动腿，gmv / order_count / quantity / subsidy_cost 被基线期订单污染
      // 必须是否定式 NOT EXISTS：正向 EXISTS 依赖 win_<dim> 存在，会把「活动起止时间整列为空」
      // 的维度值和「支付时间为 NULL」的订单静默剔除（CAST(NULL AS DATE) BETWEEN 返回 NULL → 行丢）。
      // NULL 行既不匹配窗口也不匹配反窗口 → NOT EXISTS 为真 → 行保留、基线腿 NULL → lift/net_lift/roi 为 NULL。
      const windowCond = isBaseline
        ? `\n    AND NOT EXISTS (\n` +
          `      SELECT 1 FROM win_${dim} w\n` +
          `      WHERE w.dim_key = CAST(src."${idCol}" AS VARCHAR)\n` +
          `        AND CAST(src."${m.payTimeCol}" AS DATE) NOT BETWEEN w.win_start AND w.win_end\n` +
          `    )`
        : '';
      ctes.push(
        `agg_${dim} AS (\n` +
        `  SELECT\n` +
        `    '${dim}' AS dimension_type,\n` +
        `    CAST("${idCol}" AS VARCHAR) AS dim_key,\n` +
        `    ${labelExpr} AS dimension_label,\n` +
        `    ${metricCols}\n` +
        `  FROM src\n` +
        `  WHERE NOT (${isEmptyExpr(idCol)})${windowCond}\n` +
        `  GROUP BY 1, 2\n` +
        `)`,
      );
      const from = isBaseline
        ? `agg_${dim} a LEFT JOIN base_${dim} b ON a.dim_key = b.dim_key`
        : `agg_${dim} a`;
      ctes.push(`d_${dim} AS (${dTemplate(from, deltaDim)})`);
      branches.push(`SELECT * FROM d_${dim}`);
    }

    // 自然成交分支：恒生成、恒 1 行、与维度勾选解耦（决策 #4）；三标识全未映射时 WHERE 为 1 = 1
    // 极性：自然成交 = 三标识**全空**（决策 #4），故条件为已映射标识列的 isEmptyExpr 以 AND 连接；
    // 每条独立加括号（isEmptyExpr 内含 OR，缺括号会让 AND 只作用于最后一个分支）
    const naturalConds = (['activityIdCol', 'couponIdCol', 'liveRoomIdCol'] as const)
      .map((k) => m[k])
      .filter((col) => has(col))
      .map((col) => `(${isEmptyExpr(col as string)})`);
    ctes.push(
      // 无 GROUP BY：常量分组列 + 无分组的聚合查询在空输入下仍返回 1 行（决策 #4「自然行恒 1 行」）
      `agg_natural AS (\n` +
      `  SELECT\n` +
      `    'natural' AS dimension_type,\n` +
      `    '${NATURAL_ROW_LABEL}' AS dimension_label,\n` +
      `    ${metricCols}\n` +
      `  FROM src\n` +
      `  WHERE ${naturalConds.length > 0 ? naturalConds.join('\n    AND ') : '1 = 1'}\n` +
      `)`,
      `d_natural AS (${dTemplate('agg_natural a', deltaNatural)})`,
    );
    branches.push('SELECT * FROM d_natural');

    const sql =
      `WITH ${ctes.join(',\n')}\n` +
      `SELECT * FROM (\n  ${branches.join('\n  UNION ALL\n  ')}\n` +
      `) ORDER BY dimension_type ASC, lift_amount DESC NULLS LAST`;

    logger.info(
      `[${this.name}.buildOperatorSql] table=${tableName}, dims=${activeDims.join('/')}, ` +
      `lift=${config.liftCaliber}, cost=${config.costCaliber}`,
    );
    return sql;
  }

  // --------------------------------------------------------------------------
  // 后处理：4 张洞察卡 + 空结果兜底（决策 #14）
  // --------------------------------------------------------------------------

  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const queryResult = data as { data?: unknown[]; schema?: unknown[] };
    const rows = (queryResult.data ?? []) as ActivitySplitRow[];
    if (rows.length === 0) {
      return this.buildEmptyResult(queryResult);
    }

    const config = this._lastConfig ?? DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG;
    const m = config.fieldMapping;
    const topN = Math.max(1, Math.min(10, Math.trunc(safeNum(config.topN)) || 3));
    const act = rows.filter((r) => r.dimension_type !== 'natural');

    const money = (label: string, v: unknown): InsightMetric | null => {
      const n = toNum(v);
      return n === null ? null : { label, value: n, unit: '元' };
    };
    const bare = (label: string, v: unknown): InsightMetric | null => {
      // 倍率 / 单量：渲染层只对 '%' 与 '元' 特判，单位必须写进 label（不设 unit）
      const n = toNum(v);
      return n === null ? null : { label, value: n };
    };
    const compact = (ms: (InsightMetric | null)[]): InsightMetric[] | undefined => {
      const v = ms.filter((x): x is InsightMetric => x !== null);
      return v.length > 0 ? v : undefined;
    };
    const nameOf = (r: ActivitySplitRow): string => {
      const zh = DIMENSION_LABEL[r.dimension_type as ActivitySplitDimension] ?? r.dimension_type;
      return `${zh}「${r.dimension_label}」${r.profit_effective_flag ? `：${r.profit_effective_flag}` : ''}`;
    };

    const insights: InsightItem[] = [];

    // 卡片 1：活动效果 TOP（非 natural 行，按 lift_amount 降序，空值不参与排序）
    const byLift = act
      .filter((r) => toNum(r.lift_amount) !== null)
      .sort((a, b) => safeNum(b.lift_amount) - safeNum(a.lift_amount))
      .slice(0, topN);
    const hasLossRow = act.some((r) => r.profit_effective_flag === '亏损');
    insights.push({
      id: 'top-lift',
      cardType: 'standard',
      iconKey: 'order',
      title: `活动效果 TOP${byLift.length}`,
      description:
        byLift.length > 0
          ? byLift.map(nameOf).join('；')
          : '无可比拉动金额（基线样本或成本口径缺失时拉动金额置空，不兜底为 0）',
      suggestion: byLift.length === 0
        ? undefined
        : hasLossRow
          ? '榜首含亏损行：优先降低补贴或收窄投放，再复制高拉动项'
          : '维持当前投放节奏，复盘高拉动项的可复制性',
      sortOrder: 1,
      metrics: compact([
        money('拉动金额', byLift[0]?.lift_amount),
        money('补贴成本', byLift[0]?.subsidy_cost),
        bare('投产比（倍）', byLift[0]?.roi),
      ]),
    });

    // 卡片 2：止损清单（net_lift 为负的非 natural 行）
    const losers = act
      .filter((r) => toNum(r.net_lift) !== null && safeNum(r.net_lift) < 0)
      .sort((a, b) => safeNum(a.net_lift) - safeNum(b.net_lift))
      .slice(0, topN);
    insights.push({
      id: 'loss-makers',
      cardType: 'standard',
      iconKey: 'warning',
      title: '需要止损的拆分项',
      description: losers.length > 0 ? losers.map(nameOf).join('；') : '未发现净增长为负的拆分项',
      suggestion: losers.length > 0 ? '降低补贴或收窄投放，必要时下线亏损维度值' : undefined,
      sortOrder: 2,
      metrics: compact([
        money('净增长', losers[0]?.net_lift),
        money('补贴成本', losers[0]?.subsidy_cost),
      ]),
    });

    // 卡片 3：投产比最高（成本 > 0 且 roi 可用）
    const best = act
      .filter((r) => toNum(r.roi) !== null && toNum(r.subsidy_cost) !== null && safeNum(r.subsidy_cost) > 0)
      .sort((a, b) => safeNum(b.roi) - safeNum(a.roi))[0];
    insights.push({
      id: 'efficient',
      cardType: 'standard',
      iconKey: 'insight',
      title: '投产比最高的拆分项',
      description: best ? nameOf(best) : '投产比不可用（成本列缺失或补贴成本未大于 0）',
      suggestion: best ? '可作为基准组合优先追加预算' : undefined,
      sortOrder: 3,
      metrics: compact([
        bare('投产比（倍）', best?.roi),
        money('拉动金额', best?.lift_amount),
        money('补贴成本', best?.subsidy_cost),
      ]),
    });

    // 卡片 4：口径说明（固定三条 + 条件追加，同批文案在 columnTooltips 对应列重复一次）
    const costNote = costPresenceExpr(config) === '0'
      || (act.length > 0 && act.every((r) => toNum(r.subsidy_cost) === null));
    const allIdentifiersMissing = !has(m.activityIdCol) && !has(m.couponIdCol) && !has(m.liveRoomIdCol);
    const liftSlotsEmpty = config.liftCaliber === 'custom_slots' && slotSumExpr(config.liftSlots) === 'CAST(NULL AS DOUBLE)';
    const caliberLines: string[] = [
      '跨维度行不可加总（同一订单会在多个维度各计一次）',
      'natural 行为活动 / 券 / 直播标识全空的订单',
      `拉动金额口径：${LIFT_CALIBER_LABEL[config.liftCaliber]}；成本口径：${COST_CALIBER_LABEL[config.costCaliber]}`,
    ];
    if (config.liftCaliber === 'baseline_delta') {
      caliberLines.push(
        '每条维度行只与同一活动 / 券 / 直播 / 活动类型在活动前等长窗口内的实付金额对比',
        '基线窗口取该维度值在本表内的最早活动开始至最晚活动结束',
        '前窗无同标识订单时拉动金额 / 净增长 / 投产比 / 成本率为空（不是 0）',
        '自然行为全时段净额（不受活动窗口约束），不参与基线扣减',
        '基线口径需按生效维度逐个前窗回扫，维度与标识越多执行越慢',
      );
    }
    if (allIdentifiersMissing) {
      caliberLines.push('未指定活动 / 券 / 直播任一标识列，自然成交行等于全部订单合计');
    }
    caliberLines.push(
      has(m.couponStatusCol)
        ? '核销率 = 已使用券 ÷（未使用 + 已使用）券，过期 / 退款 / 禁用不计入分母'
        : '缺少优惠券状态字段，核销率不可用',
    );
    if (!has(m.couponAmountCol)) {
      caliberLines.push('未指定优惠金额列，券覆盖占比不可用');
    }
    if (costNote) {
      caliberLines.push('成本列缺失或所选成本列在本区间内全部为空，投产比与成本率不可用');
    }
    if (liftSlotsEmpty) {
      caliberLines.push('拉动金额费用项均未选择，拉动金额与下游指标将置空');
    }
    insights.push({
      id: 'caliber-note',
      cardType: 'standard',
      iconKey: 'insight',
      title: '口径说明',
      description: caliberLines.join('；'),
      sortOrder: 4,
    });

    const insightsData: OperatorInsightsData = {
      summary: { totalRecordCount: rows.length, totalFilterRecordCount: act.length },
      insights,
    };

    return {
      type: OperatorType.ACTIVITY_EFFECT_SPLIT,
      sql: '',
      // SAFETY: rows 已是 SQL 14 列原值透传，ActivitySplitRow 仅是列名视图，不做字段级断言
      data: rows as unknown as Record<string, unknown>[],
      schema: (queryResult.schema ?? []) as unknown[],
      insightsData,
      displayConfig: this.buildDisplayConfig(config, liftSlotsEmpty, allIdentifiersMissing),
    };
  }

  // --------------------------------------------------------------------------
  // 内部构建
  // --------------------------------------------------------------------------

  /** 空结果兜底：1 张 warning 卡 + displayConfig 与正常路径同源（禁止另写一份） */
  private buildEmptyResult(queryResult: { data?: unknown[]; schema?: unknown[] }): AnalysisResult {
    const config = this._lastConfig ?? DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG;
    const m = config.fieldMapping;
    const liftSlotsEmpty = config.liftCaliber === 'custom_slots' && slotSumExpr(config.liftSlots) === 'CAST(NULL AS DOUBLE)';
    const allIdentifiersMissing = !has(m.activityIdCol) && !has(m.couponIdCol) && !has(m.liveRoomIdCol);
    return {
      type: OperatorType.ACTIVITY_EFFECT_SPLIT,
      sql: '',
      data: [],
      schema: (queryResult.schema ?? []) as unknown[],
      insightsData: {
        insights: [{
          id: 'no-rows',
          cardType: 'standard',
          iconKey: 'warning',
          title: '查询结果为空',
          description: '所选区间与过滤条件下没有任何订单参与拆分，请检查时间区间、过滤条件与维度列配置后重试',
          sortOrder: 1,
        }],
      },
      displayConfig: this.buildDisplayConfig(config, liftSlotsEmpty, allIdentifiersMissing),
    };
  }

  /** 排序唯一真值是 SQL 的 ORDER BY（不设 defaultSort，JS 重排会打散 dimension_type 聚簇序） */
  private buildDisplayConfig(
    config: ActivityEffectSplitConfig,
    liftSlotsEmpty: boolean,
    allIdentifiersMissing: boolean,
  ): OperatorDisplayConfig {
    const m = config.fieldMapping;
    let liftTip = `拉动金额（口径：${LIFT_CALIBER_LABEL[config.liftCaliber]}）`;
    if (config.liftCaliber === 'baseline_delta') {
      liftTip += '；基线窗口取该维度值在本表内的最早活动开始至最晚活动结束；前窗无同标识订单时为空（不是 0）'
        + '；基线口径需对每个生效维度各做一次前窗回扫与聚合，维度与标识越多执行越慢';
    }
    if (liftSlotsEmpty) liftTip += '；拉动金额费用项均未选择，拉动金额与下游指标将置空';
    let labelTip = '维度值展示名；跨维度行不可加总（同一订单会在多个维度各计一次）；natural 行为活动 / 券 / 直播标识全空的订单';
    if (allIdentifiersMissing) labelTip += '；未指定活动 / 券 / 直播任一标识列，自然成交行等于全部订单合计';

    return {
      columnFormatters: {
        cost_rate: { type: 'percent_signed', precision: 1, labelNegative: '' },
        coupon_redemption_rate: { type: 'percent_signed', precision: 1, labelNegative: '' },
        coupon_order_ratio: { type: 'percent_signed', precision: 1, labelNegative: '' },
        gmv: { type: 'currency_signed', unit: '元', precision: 2 },
        lift_amount: { type: 'currency_signed', unit: '元', precision: 2 },
        subsidy_cost: { type: 'currency_signed', unit: '元', precision: 2 },
        net_lift: { type: 'currency_signed', unit: '元', precision: 2 },
        avg_order_value: { type: 'currency_signed', unit: '元', precision: 2 },
      },
      columnTooltips: {
        dimension_type: '拆分维度类型（活动 / 优惠券 / 直播间 / 活动类型 / 自然成交）',
        dimension_label: labelTip,
        order_count: '该维度值覆盖的订单数（已映射订单号列时按订单号去重，否则按订单行数计）',
        quantity: '销量合计；未指定数量列时为空',
        gmv: '活动期订单实付金额合计',
        lift_amount: liftTip,
        subsidy_cost: `补贴成本（口径：${COST_CALIBER_LABEL[config.costCaliber]}）；成本列缺失或本区间内全部为空时置空`,
        net_lift: '净增长 = 拉动金额 − 补贴成本；成本或基线缺失时为空（不是 0）',
        roi: '投产比 = 拉动金额 ÷ 补贴成本（倍）；成本缺失或 ≤0 时为空',
        cost_rate: '成本率 = 补贴成本 ÷ 拉动金额（0–1 存储，按百分比展示）；拉动金额 ≤0 或成本缺失时为空',
        coupon_redemption_rate: has(m.couponStatusCol)
          ? '核销率 = 已使用券 ÷（未使用 + 已使用）券，过期 / 退款 / 禁用不计入分母'
          : '缺少优惠券状态字段，核销率不可用',
        coupon_order_ratio: has(m.couponAmountCol)
          ? '券覆盖占比 = 有优惠金额的订单数 ÷ 活动订单数（判定依据为优惠金额列，与成本口径无关）'
          : '未指定优惠金额列，券覆盖占比不可用',
        avg_order_value: '活动期客单价 = 实付金额合计 ÷ 订单数',
        profit_effective_flag: '盈亏判定：净增长与「补贴成本 × 1%」比较（盈利 / 亏损 / 持平）；成本或基线缺失时为空',
      },
    };
  }
}
