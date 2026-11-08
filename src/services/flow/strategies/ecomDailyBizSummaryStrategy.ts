/**
 * fn_ecom_daily_biz_summary — 店铺每日经营全景汇总（feature 17）
 *
 * 契约段（类型 / 字典 / 判据）在 `ecomDailyBizSummaryContract.ts`，此处 `export *` 转发保持导入面不变。
 * 本文件只保留 SQL 生成层（Phase 1）、策略类（Phase 2）与展示配置。
 */
import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  hasColumnValue,
  parseRefundStatusValues,
  type AnalysisResult,
  type ColumnFormatterSpec,
  type DailyBizSummaryConfig,
  type FlowEdge,
  type FlowNode,
  type FormulaSlot,
  type InsightItem,
  type InsightMetric,
  type OperatorDisplayConfig,
  type SelectNodeData,
  type ValidationError,
} from '../types';
import {
  DAILY_BIZ_COMPARE_COPY,
  DAILY_BIZ_NO_FEE_COL_MESSAGE,
  DAILY_BIZ_QUALITY_DESC,
  DEFAULT_DAILY_BIZ_SUMMARY_CONFIG,
  allowedDailyBizSlots,
  cloneDailyBizSummaryConfig,
  collectDailyBizBlockers,
  dailyBizBlockingErrors,
  dailyBizFeeExprSql,
  dailyBizNetProfitExprSql,
  dailyBizSlotHuman,
  dailyBizSlotSql,
  hasDailyBizFeeSource,
  isDailyBizSlotColumnAllowed,
  joinDailyBizQuality,
  resolveDailyBizProfitSlots,
  resolveDailyBizQualityCodes,
  type DailyBizQualityCode,
  type DailyBizSlotGroup,
} from './ecomDailyBizSummaryContract';
import { logger } from '../../../utils/logger';

// 契约段符号在此统一转发，对外导入面（strategy 路径）不变
export * from './ecomDailyBizSummaryContract';

// ============================================================================
// Phase 1 — SQL 生成层（5 段 CTE：src → agg → sales_calc → calc → metric）
// ============================================================================

/** 空输入 / 缺表 / 含阻断项时的降级查询：语法合法、恒 0 行 */
export const DAILY_BIZ_DEGRADE_SQL = 'SELECT 1 WHERE false';

/** 对比偏移常量（Q3/Q10/Q15：同一模板，仅位移不同） */
export const DAILY_BIZ_COMPARE_SHIFT: Record<Exclude<DailyBizSummaryConfig['compareMode'], 'none'>, string> = {
  day: '1 DAY',
  week: '7 DAYS',
  month: '1 MONTH',
  year: '1 YEAR',
};

/** `agg → sales_calc → calc → metric` 逐层透传的源列别名（顺序固定，8 项） */
export const DAILY_BIZ_PASSTHROUGH_COLS = [
  'net_amount', 'gross_profit', 'cost_amount', 'refund_amount',
  'fee_total_src', 'commission_fee', 'shipping_fee', 'service_fee',
] as const;

/** 标识符转义（兼容中文列名与保留字，阻断 `"` 注入） */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** 数值列投影：未映射直接给 NULL（不走 SUM，保住退款率的 NULL 语义） */
function colExpr(col?: string): string {
  return hasColumnValue(col) ? `CAST(${q(col as string)} AS DOUBLE)` : 'CAST(NULL AS DOUBLE)';
}

function strColExpr(col?: string): string {
  return hasColumnValue(col) ? `CAST(${q(col as string)} AS VARCHAR)` : 'CAST(NULL AS VARCHAR)';
}

function tsColExpr(col?: string): string {
  return hasColumnValue(col) ? `CAST(${q(col as string)} AS TIMESTAMP)` : 'CAST(NULL AS TIMESTAMP)';
}

/** 槽位表达式；空集给 `CAST(NULL AS DOUBLE)`（派生层列存在但为空，供比率列自然传导 NULL） */
function slotExpr(slots: FormulaSlot[]): string {
  const valid = (slots ?? []).filter((s) => hasColumnValue(s?.column));
  return valid.length > 0 ? dailyBizSlotSql(valid) : 'CAST(NULL AS DOUBLE)';
}

/** 显式透传清单（Issue 5）：`"date"` + order_cnt + 8 个别名（+ quantity 条件）+ 本层新增列 */
function passthroughList(layer: 'a' | 's' | 'c', cfg: DailyBizSummaryConfig, extra: string[]): string {
  const cols = [`${layer}.${q('date')}`, `${layer}.order_cnt`];
  for (const col of DAILY_BIZ_PASSTHROUGH_COLS) cols.push(`${layer}.${q(col)}`);
  if (hasColumnValue(cfg.fieldMapping.quantityCol)) cols.push(`${layer}.${q('quantity')}`);
  cols.push(...extra);
  return cols.join(',\n    ');
}

/** ① 归一化投影 + 状态剔除；`userWhere` 只在此层注入 */
export function buildDailyBizSrcCte(
  tableName: string,
  cfg: DailyBizSummaryConfig,
  userWhere: string,
): string {
  const m = cfg.fieldMapping;
  const proj = [
    `${tsColExpr(m.orderDateCol)} AS order_date`,
    `${strColExpr(m.orderIdCol)} AS order_id`,
    `${strColExpr(m.orderStatusCol)} AS order_status`,
    `${colExpr(m.salesCol)} AS net_amount`,
    `${colExpr(m.grossProfitCol)} AS gross_profit`,
    `${colExpr(m.costCol)} AS cost_amount`,
    `${colExpr(m.refundAmountCol)} AS refund_amount`,
    `${colExpr(m.feeTotalCol)} AS fee_total_src`,
    `${colExpr(m.commissionFeeCol)} AS commission_fee`,
    `${colExpr(m.shippingFeeCol)} AS shipping_fee`,
    `${colExpr(m.serviceFeeCol)} AS service_fee`,
  ];
  if (hasColumnValue(m.quantityCol)) proj.push(`${colExpr(m.quantityCol)} AS quantity`);

  const conds: string[] = [];
  const uw = (userWhere ?? '').replace(/^WHERE\s+/i, '').trim();
  if (uw) conds.push(`(${uw})`);

  const statuses = parseRefundStatusValues(cfg.excludeStatusValues);
  if (hasColumnValue(m.orderStatusCol) && statuses.length > 0) {
    // 形态写死（plan §3.1）：NULL 行必须放行（`NULL NOT IN (...)` 求值为 UNKNOWN 会静默丢行）；空剔除集不生成整条条件
    const ref = q(m.orderStatusCol as string);
    conds.push(
      `(${ref} IS NULL OR UPPER(TRIM(CAST(${ref} AS VARCHAR))) NOT IN (${statuses.map(lit).join(', ')}))`,
    );
  }

  return `src AS (\n  SELECT\n    ${proj.join(',\n    ')}\n  FROM ${q(tableName)}${
    conds.length ? `\n  WHERE ${conds.join('\n    AND ')}` : ''
  }\n)`;
}

/** ② 日粒度聚合：已映射列 SUM，未映射列 CAST(NULL)（不参与 SUM） */
export function buildDailyBizAggCte(cfg: DailyBizSummaryConfig): string {
  const m = cfg.fieldMapping;
  const sumOrNull = (mapped: boolean, alias: string): string =>
    mapped ? `SUM(src.${q(alias)}) AS ${q(alias)}` : `CAST(NULL AS DOUBLE) AS ${q(alias)}`;
  const proj = [
    `date_trunc('day', src.${q('order_date')}) AS "date"`,
    hasColumnValue(m.orderIdCol)
      ? `COUNT(DISTINCT src.${q('order_id')}) AS order_cnt`
      : 'COUNT(*) AS order_cnt',
    sumOrNull(hasColumnValue(m.salesCol), 'net_amount'),
    sumOrNull(hasColumnValue(m.grossProfitCol), 'gross_profit'),
    sumOrNull(hasColumnValue(m.costCol), 'cost_amount'),
    sumOrNull(hasColumnValue(m.refundAmountCol), 'refund_amount'),
    sumOrNull(hasColumnValue(m.feeTotalCol), 'fee_total_src'),
    sumOrNull(hasColumnValue(m.commissionFeeCol), 'commission_fee'),
    sumOrNull(hasColumnValue(m.shippingFeeCol), 'shipping_fee'),
    sumOrNull(hasColumnValue(m.serviceFeeCol), 'service_fee'),
  ];
  if (hasColumnValue(m.quantityCol)) proj.push(`SUM(src.${q('quantity')}) AS ${q('quantity')}`);

  return `agg AS (\n  SELECT\n    ${proj.join(',\n    ')}\n  FROM src\n  GROUP BY 1\n)`;
}

/** ③ 销售额派生（仅引用 agg 源列） */
export function buildDailyBizSalesCte(cfg: DailyBizSummaryConfig): string {
  const list = passthroughList('a', cfg, [`${slotExpr(allowedDailyBizSlots('salesSlots', cfg.salesSlots))} AS sales`]);
  return `sales_calc AS (\n  SELECT\n    ${list}\n  FROM agg a\n)`;
}

/** ④ 毛利 + 费用合计派生（毛利可引用 sales；费用按口径三支：NULL / 分项和 / 合计列兜底） */
export function buildDailyBizCalcCte(cfg: DailyBizSummaryConfig): string {
  // 费用表达式判据在契约段（`dailyBizFeeExprSql`），与抽屉 SQL 明细共用同一真源（§3.2 五分支表）
  const feeExpr = dailyBizFeeExprSql(cfg);
  const list = passthroughList('s', cfg, [
    `s.${q('sales')}`,
    `${slotExpr(resolveDailyBizProfitSlots(cfg))} AS profit`,
    `${feeExpr} AS fee_total`,
  ]);
  return `calc AS (\n  SELECT\n    ${list}\n  FROM sales_calc s\n)`;
}

/** ⑤ 净利派生（可引用 sales / profit / fee_total）；费用不可用时引用了任一费用别名的净利公式整体置 NULL */
export function buildDailyBizMetricCte(cfg: DailyBizSummaryConfig): string {
  // 净利表达式判据在契约段（`dailyBizNetProfitExprSql`），与抽屉 SQL 明细共用同一真源
  const netExpr = dailyBizNetProfitExprSql(cfg);
  const list = passthroughList('c', cfg, [
    `c.${q('sales')}`,
    `c.${q('profit')}`,
    `c.${q('fee_total')}`,
    `${netExpr} AS net_profit`,
  ]);
  return `metric AS (\n  SELECT\n    ${list}\n  FROM calc c\n)`;
}

/** 输出列 schema（15 列基准；关闭对比 −3，未映射销量 −1） */
export function dailyBizOutputSchema(cfg: DailyBizSummaryConfig): Array<{ name: string; type: string }> {
  const cols: Array<{ name: string; type: string }> = [
    { name: 'date', type: 'DATE' },
    { name: 'order_cnt', type: 'BIGINT' },
    { name: 'sales', type: 'DOUBLE' },
    { name: 'profit', type: 'DOUBLE' },
    { name: 'refund_amount', type: 'DOUBLE' },
    { name: 'refund_rate', type: 'DOUBLE' },
    { name: 'fee_total', type: 'DOUBLE' },
    { name: 'net_profit', type: 'DOUBLE' },
    { name: 'net_profit_rate', type: 'DOUBLE' },
    { name: 'avg_order_value', type: 'DOUBLE' },
  ];
  if (hasColumnValue(cfg.fieldMapping.quantityCol)) cols.push({ name: 'quantity', type: 'DOUBLE' });
  if (cfg.compareMode !== 'none') {
    cols.push(
      { name: 'sales_cmp', type: 'DOUBLE' },
      { name: 'profit_cmp', type: 'DOUBLE' },
      { name: 'net_profit_cmp', type: 'DOUBLE' },
    );
  }
  cols.push({ name: 'data_quality_flag', type: 'VARCHAR' });
  return cols;
}

/** 主 SELECT：比率与对比列同级引用，`*_cmp` 仅在开启对比时输出 */
export function buildDailyBizFinalSelect(cfg: DailyBizSummaryConfig): string {
  const compare = cfg.compareMode !== 'none';
  const cols = [
    'CAST(m."date" AS DATE) AS "date"',
    'm.order_cnt',
    'ROUND(m.sales, 2) AS sales',
    'ROUND(m.profit, 2) AS profit',
    'ROUND(m.refund_amount, 2) AS refund_amount',
    'ROUND(m.refund_amount / NULLIF(m.sales, 0), 4) AS refund_rate',
    'ROUND(m.fee_total, 2) AS fee_total',
    'ROUND(m.net_profit, 2) AS net_profit',
    'ROUND(m.net_profit / NULLIF(m.sales, 0), 4) AS net_profit_rate',
    'ROUND(m.sales / NULLIF(m.order_cnt, 0), 2) AS avg_order_value',
  ];
  if (hasColumnValue(cfg.fieldMapping.quantityCol)) cols.push('ROUND(m.quantity, 2) AS quantity');
  if (compare) {
    cols.push(
      'ROUND((m.sales - p.sales) * 1.0 / NULLIF(p.sales, 0), 4) AS sales_cmp',
      'ROUND((m.profit - p.profit) * 1.0 / NULLIF(p.profit, 0), 4) AS profit_cmp',
      'ROUND((m.net_profit - p.net_profit) * 1.0 / NULLIF(p.net_profit, 0), 4) AS net_profit_cmp',
    );
  }
  cols.push(`${lit(joinDailyBizQuality(resolveDailyBizQualityCodes(cfg)))} AS data_quality_flag`);

  const join = compare
    ? `\nLEFT JOIN metric p ON p."date" = m."date" - INTERVAL ${lit(DAILY_BIZ_COMPARE_SHIFT[cfg.compareMode as Exclude<DailyBizSummaryConfig['compareMode'], 'none'>])}`
    : '';
  return `SELECT ${cols.join(',\n       ')}\nFROM metric m${join}\nORDER BY m."date"`;
}

/** 完整 SQL 拼装（策略与单测共用同一入口） */
export function buildDailyBizSql(
  tableName: string,
  cfg: DailyBizSummaryConfig,
  userWhere: string,
): string {
  const ctes = [
    buildDailyBizSrcCte(tableName, cfg, userWhere),
    buildDailyBizAggCte(cfg),
    buildDailyBizSalesCte(cfg),
    buildDailyBizCalcCte(cfg),
    buildDailyBizMetricCte(cfg),
  ];
  return `WITH ${ctes.join(',\n')}\n${buildDailyBizFinalSelect(cfg)}`;
}

// ============================================================================
// 策略
// ============================================================================

export class EcomDailyBizSummaryStrategy extends BaseStrategy {
  readonly type = OperatorType.DAILY_BIZ_SUMMARY;
  readonly name = 'EcomDailyBizSummaryStrategy';

  /** buildOperatorSql 记录、postProcess 唯一配置来源（禁止 postProcess 重读节点） */
  private _lastConfig: DailyBizSummaryConfig | null = null;

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
    const rawCfg = (nodes.find((n) => n.type === FlowNodeType.SELECT)?.data as SelectNodeData | undefined)
      ?.dailyBizSummaryConfig;

    // 先赋值再判降级：单例策略不得把上一个节点的配置残留给无配置节点
    const cfg = rawCfg ? cloneDailyBizSummaryConfig(rawCfg) : null;
    this._lastConfig = cfg;

    if (!tableName || !cfg || dailyBizBlockingErrors(cfg).length > 0) {
      logger.warn(
        `[${this.name}.buildOperatorSql] 降级空查询: table=${tableName || '<空>'}, config=${cfg ? 'ok' : '<缺失>'}, ` +
        `blockers=${dailyBizBlockingErrors(cfg ?? undefined).map((b) => b.code).join('/') || '<无>'}`,
      );
      return DAILY_BIZ_DEGRADE_SQL;
    }

    const sql = buildDailyBizSql(tableName, cfg, userWhere);
    logger.info(
      `[${this.name}.buildOperatorSql] table=${tableName}, caliber=${cfg.salesCaliber}/${cfg.feeCaliber}, ` +
      `compare=${cfg.compareMode}`,
    );
    return sql;
  }

  /** 阻断项按 severity 映射 ERROR / WARNING（`no-fee-col` 只是 WARNING，不阻断节点生效） */
  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[],
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    if (!selectNode) return [];
    const cfg = (selectNode.data as SelectNodeData | undefined)?.dailyBizSummaryConfig;

    const errors: ValidationError[] = [];
    const push = (message: string, severity: ValidationSeverity = ValidationSeverity.ERROR): void => {
      errors.push({ nodeId: selectNode.id, nodeType: FlowNodeType.SELECT, severity, message });
    };

    for (const blocker of collectDailyBizBlockers(cfg)) {
      push(blocker.message, blocker.severity === 'warning' ? ValidationSeverity.WARNING : ValidationSeverity.ERROR);
    }
    if (!cfg) return errors;

    for (const code of resolveDailyBizQualityCodes(cfg)) {
      if (code === 'OK') continue;
      push(`本次按降级口径出数：${DAILY_BIZ_QUALITY_DESC[code]}（${code}）`, ValidationSeverity.WARNING);
    }

    const groups: Array<[DailyBizSlotGroup, FormulaSlot[] | undefined, string]> = [
      ['salesSlots', cfg.salesSlots, '销售额'],
      ['profitSlots', cfg.profitSlots, '毛利'],
      ['netProfitSlots', cfg.netProfitSlots, '净利'],
      ['feeSlots', cfg.feeSlots, '费用分项'],
    ];
    for (const [group, slots, label] of groups) {
      const dropped = (slots ?? []).filter(
        (s) => hasColumnValue(s?.column) && !isDailyBizSlotColumnAllowed(group, s.column),
      );
      if (dropped.length > 0) {
        push(`${label}公式中 ${dropped.length} 项不在可引用范围，已忽略`, ValidationSeverity.WARNING);
      }
    }
    return errors;
  }

  /** Phase 2：空结果提示卡 / 5 张经营洞察卡 / 展示配置（配置唯一来源 _lastConfig） */
  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const cfg = this._lastConfig ?? DEFAULT_DAILY_BIZ_SUMMARY_CONFIG;
    const queryResult = (data ?? {}) as { data?: unknown };
    const rows = (Array.isArray(queryResult.data) ? queryResult.data : [])
      .filter((r): r is DailyBizRawRow => !!r && typeof r === 'object');
    const schema = dailyBizOutputSchema(cfg) as unknown[];
    const quality = joinDailyBizQuality(resolveDailyBizQualityCodes(cfg));

    logger.info(`[${this.name}.postProcess] rows=${rows.length}, quality=${quality}, compare=${cfg.compareMode}`);

    if (rows.length === 0) {
      return {
        type: this.type,
        sql: '',
        data: [],
        schema,
        insightsData: {
          summary: { totalRecordCount: 0, totalFilterRecordCount: 0 },
          insights: [buildDailyBizEmptyInsight()],
        },
        displayConfig: buildDailyBizDisplayConfig(cfg),
      };
    }

    const sorted = [...rows].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
    return {
      type: this.type,
      sql: '',
      data: sorted,
      schema,
      insightsData: {
        summary: {
          totalRecordCount: sorted.length,
          totalFilterRecordCount: sorted.filter((r) => (num(r, 'sales') ?? 0) > 0).length,
        },
        insights: buildDailyBizInsights(sorted, cfg, quality),
      },
      displayConfig: buildDailyBizDisplayConfig(cfg),
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 2 — postProcess：数值归一 / 洞察卡 / 展示配置（中文文案全部在此生成）
// ════════════════════════════════════════════════════════════════════════════

type DailyBizRawRow = Record<string, unknown>;

/** 数值读取：非有限值（含 null / BigInt 溢出 / 非数字字符串）一律 null，不被静默当 0 */
function num(row: DailyBizRawRow, key: string): number | null {
  const value = row?.[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** 两日期间隔天数（解析失败返回 null） */
function daysBetween(a: unknown, b: unknown): number | null {
  const ta = Date.parse(String(a ?? ''));
  const tb = Date.parse(String(b ?? ''));
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null;
  return Math.round(Math.abs(tb - ta) / 86_400_000);
}

/** 变化幅度：基数为 0 或缺失 → null（不产出 Infinity/NaN） */
function pctChange(prev: number | null, next: number | null): number | null {
  if (prev === null || next === null || prev === 0) return null;
  return (next - prev) / prev;
}

const fmtAmount = (v: number | null): string =>
  v === null ? '空值' : v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (v: number | null): string =>
  v === null ? '不可计算' : `${(v * 100).toFixed(1)}%`;

function sumOf(rows: DailyBizRawRow[], key: string): number | null {
  let total = 0;
  let seen = false;
  for (const row of rows) {
    const v = num(row, key);
    if (v === null) continue;
    total += v;
    seen = true;
  }
  return seen ? total : null;
}

/** 空结果提示卡（AC8） */
function buildDailyBizEmptyInsight(): InsightItem {
  return {
    id: 'daily-biz-empty',
    cardType: 'standard',
    iconKey: 'warning',
    title: '所选范围内没有可汇总的订单数据',
    description: '请检查订单支付时间列是否映射正确，或放宽条件节点过滤后重试。',
    sortOrder: 1,
  };
}

function buildDailyBizInsights(
  rows: DailyBizRawRow[],
  cfg: DailyBizSummaryConfig,
  quality: string,
): InsightItem[] {
  const items: InsightItem[] = [buildDailyBizTrendInsight(rows, cfg), buildDailyBizProfitInsight(rows, cfg)];

  const refundMapped = hasColumnValue(cfg.fieldMapping.refundAmountCol);
  items.push(buildDailyBizRefundInsight(rows, refundMapped));
  items.push(buildDailyBizOrderInsight(rows, quality));

  if (quality !== 'OK') items.push(buildDailyBizQualityInsight(quality));
  return items.map((item, i) => ({ ...item, sortOrder: i + 1 }));
}

/** 指标入列唯一入口：空值只能省略指标，不得写 0（Issue 3，`InsightMetric.value` 无 null 通道） */
function pushMetric(
  list: InsightMetric[],
  label: string,
  value: number | null,
  unit: string,
  highlight = false,
): void {
  if (value === null) return;
  list.push(highlight ? { label, value, unit, highlight } : { label, value, unit });
}

/** ① 经营趋势：首日 → 末日变化 + 区间累计；开启对比时 suggestion 指向对比口径单一真源 */
function buildDailyBizTrendInsight(rows: DailyBizRawRow[], cfg: DailyBizSummaryConfig): InsightItem {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const salesTotal = sumOf(rows, 'sales');
  const netProfitTotal = sumOf(rows, 'net_profit');
  const span = daysBetween(first.date, last.date);

  let description: string;
  if (rows.length < 2) {
    description = `仅一日数据，暂无趋势对比（${String(first.date ?? '')}）。`;
  } else {
    const salesPct = pctChange(num(first, 'sales'), num(last, 'sales'));
    const netPct = pctChange(num(first, 'net_profit'), num(last, 'net_profit'));
    description =
      `首日（${String(first.date ?? '')}）销售额 ${fmtAmount(num(first, 'sales'))} 元，` +
      `末日（${String(last.date ?? '')}）${fmtAmount(num(last, 'sales'))} 元，` +
      `期间销售额${trendWord(salesPct)}、净利${trendWord(netPct)}。`;
  }

  const metrics: InsightMetric[] = [];
  pushMetric(metrics, '统计天数', rows.length, '天');
  pushMetric(metrics, '累计销售额', salesTotal, '元');
  pushMetric(metrics, '累计净利', netProfitTotal, '元', true);

  return {
    id: 'daily-biz-trend',
    cardType: 'standard',
    iconKey: 'insight',
    title: '经营趋势',
    description,
    metrics,
    suggestion: cfg.compareMode === 'none' ? undefined : DAILY_BIZ_COMPARE_COPY,
    metadata: span === null ? undefined : { spanDays: span },
    sortOrder: 1,
  };
}

function trendWord(pct: number | null): string {
  if (pct === null) return '变化幅度不可计算';
  if (pct === 0) return '持平';
  return `${pct > 0 ? '上升' : '下降'} ${Math.abs(pct * 100).toFixed(1)}%`;
}

/** ② 盈利质量：区间净利率（按销售额加权）+ 毛利/费用合计；费用不可用时指标省略且文案同源 */
function buildDailyBizProfitInsight(rows: DailyBizRawRow[], cfg: DailyBizSummaryConfig): InsightItem {
  const salesTotal = sumOf(rows, 'sales');
  const netTotal = sumOf(rows, 'net_profit');
  const profitTotal = sumOf(rows, 'profit');
  const feeTotal = sumOf(rows, 'fee_total');
  const margin = salesTotal === null || netTotal === null || salesTotal === 0 ? null : netTotal / salesTotal;
  const feeMissing = !hasDailyBizFeeSource(cfg);

  const suggestion = feeMissing
    ? DAILY_BIZ_NO_FEE_COL_MESSAGE
    : margin === null
      ? '缺少销售额或净利数据，暂无法给出盈利建议。'
      : margin >= 0.2 ? '净利率健康，可维持现有费用投入。'
        : margin >= 0.05 ? '净利率偏薄，建议压缩费用或提升客单价。'
          : '净利率承压，建议核查费用结构与退款情况。';

  const description = margin === null
    ? '区间净利率无法计算（销售额合计为 0 或缺数）。'
    : `按销售额加权的区间净利率 ${fmtPct(margin)}，净利 ${fmtAmount(netTotal)} 元。`;

  const metrics: InsightMetric[] = [];
  pushMetric(metrics, '区间净利率', margin, '%', true);
  pushMetric(metrics, '毛利合计', profitTotal, '元');
  pushMetric(metrics, '费用合计', feeTotal, '元');

  return {
    id: 'daily-biz-profit-quality',
    cardType: 'standard',
    iconKey: 'insight',
    title: '盈利质量',
    description: feeMissing ? `${description}${DAILY_BIZ_NO_FEE_COL_MESSAGE}。` : description,
    suggestion,
    metrics,
    sortOrder: 2,
  };
}

/** ③ 退款与费用：金额口径退款率 */
function buildDailyBizRefundInsight(rows: DailyBizRawRow[], refundMapped: boolean): InsightItem {
  const refundTotal = sumOf(rows, 'refund_amount');
  const salesTotal = sumOf(rows, 'sales');
  const refundRate = !refundMapped || refundTotal === null || salesTotal === null || salesTotal === 0
    ? null
    : refundTotal / salesTotal;

  const metrics: InsightMetric[] = [];
  pushMetric(metrics, '退款金额合计', refundTotal, '元');
  pushMetric(metrics, '退款率', refundRate, '%');

  return {
    id: 'daily-biz-refund-fee',
    cardType: 'standard',
    iconKey: 'price',
    title: '退款与费用',
    description: !refundMapped || refundTotal === null
      ? '未映射退款金额列，退款率不可计算。'
      : `退款金额合计 ${fmtAmount(refundTotal)} 元，退款率 ${fmtPct(refundRate)}；销售数据已按所选销售额口径汇总。`,
    metrics,
    sortOrder: 3,
  };
}

/** ④ 订单与客单价 */
function buildDailyBizOrderInsight(rows: DailyBizRawRow[], quality: string): InsightItem {
  const orderTotal = sumOf(rows, 'order_cnt');
  const salesTotal = sumOf(rows, 'sales');
  const aov = orderTotal === null || salesTotal === null || orderTotal === 0 ? null : salesTotal / orderTotal;

  const rowLevelNote = quality.includes('ROW_LEVEL') ? '（订单数按数据行计数）' : '';
  const metrics: InsightMetric[] = [];
  pushMetric(metrics, '订单数合计', orderTotal, '笔');
  pushMetric(metrics, '客单价', aov, '元', true);

  return {
    id: 'daily-biz-orders',
    cardType: 'standard',
    iconKey: 'order',
    title: '订单与客单价',
    description: `区间订单数合计 ${orderTotal === null ? '空值' : orderTotal.toLocaleString('zh-CN')} 笔${rowLevelNote}，` +
      `客单价 ${fmtAmount(aov)} 元。`,
    metrics,
    sortOrder: 4,
  };
}

/** ⑤ 数据质量：仅在有降级短码时出现 */
function buildDailyBizQualityInsight(quality: string): InsightItem {
  const codes = quality.split('+') as DailyBizQualityCode[];
  return {
    id: 'daily-biz-quality',
    cardType: 'standard',
    iconKey: 'quality',
    title: '数据质量提示',
    description: codes.map((c) => DAILY_BIZ_QUALITY_DESC[c] ?? c).join('；'),
    suggestion: '补齐对应列后重新执行，可获得完整口径的日报。',
    sortOrder: 5,
  };
}

/** 展示配置：默认排序 / 数值格式化 / 列口径提示（不新增 formatter 类型） */
export function buildDailyBizDisplayConfig(cfg: DailyBizSummaryConfig): OperatorDisplayConfig {
  const formatters: Record<string, ColumnFormatterSpec> = {
    net_profit: { type: 'currency_signed', unit: '元', precision: 2 },
  };
  const compare = cfg.compareMode !== 'none';
  if (compare) {
    formatters.sales_cmp = { type: 'percent_signed', precision: 1 };
    formatters.profit_cmp = { type: 'percent_signed', precision: 1 };
    formatters.net_profit_cmp = { type: 'percent_signed', precision: 1 };
  }

  const profitHuman = dailyBizSlotHuman(resolveDailyBizProfitSlots(cfg));
  const quality = joinDailyBizQuality(resolveDailyBizQualityCodes(cfg));

  const tooltips: Record<string, string> = {
    sales: `销售额 = ${dailyBizSlotHuman(allowedDailyBizSlots('salesSlots', cfg.salesSlots))}`,
    profit: `毛利 = ${profitHuman}${hasColumnValue(cfg.fieldMapping.grossProfitCol) ? '' : '（未映射毛利额列，已按销售额减商品成本降级或输出空值）'}`,
    net_profit: `净利 = ${dailyBizSlotHuman(allowedDailyBizSlots('netProfitSlots', cfg.netProfitSlots))}；` +
      `销售额口径：${cfg.salesCaliber === 'net' ? '已扣退款（净额）' : '未扣退款（毛额）'}` +
      (hasDailyBizFeeSource(cfg) ? '' : `；${DAILY_BIZ_NO_FEE_COL_MESSAGE}`),
    refund_rate: '退款率 = 退款金额合计 ÷ 销售额合计（保留 4 位）；销售额为 0 或未映射退款金额时为空值',
    net_profit_rate: '净利率 = 净利 ÷ 销售额；分母为 0 时为空值',
    avg_order_value: '客单价 = 销售额 ÷ 订单数；分母为 0 时为空值',
    data_quality_flag: `当前短码：${quality}（按 ROW_LEVEL → NO_STATUS_FILTER → NO_PROFIT_COL → NULL_AMOUNT 次序拼接）`,
  };
  if (compare) {
    tooltips.sales_cmp = DAILY_BIZ_COMPARE_COPY;
    tooltips.profit_cmp = DAILY_BIZ_COMPARE_COPY;
    tooltips.net_profit_cmp = DAILY_BIZ_COMPARE_COPY;
  }

  return {
    defaultSort: { column: 'date', order: 'ascend' },
    columnFormatters: formatters,
    columnTooltips: tooltips,
  };
}
