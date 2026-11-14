/**
 * SKU/SPU 销量毛利排行分析 · 策略实现（六段 CTE + 校验钩子）
 *
 * 结构：src（源列归一 + 状态剔除 + userWhere 唯一注入）→ sku_agg（SKU 级键聚合）
 *      → calc（对象键聚合）→ sales（槽位派生）→ metric（毛利/比率）→ tag（排名/ABC/动销）。
 * 口径与判定一律取自契约段，本文件只负责拼 SQL 与把判据搬到校验结果里。
 */
import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type AnalysisResult,
  type EcomSkuSalesAnalysisConfig,
  type InsightItem,
  type OperatorDisplayConfig,
  type FlowEdge,
  type FlowNode,
  type FormulaSlot,
  type SelectNodeData,
  type ValidationError,
  hasColumnValue,
} from '../types';
import {
  DEFAULT_SKU_SALES_CONFIG,
  allowedSkuSalesSlots,
  buildSkuSalesFormulaPreview,
  cloneSkuSalesConfig,
  collectSkuSalesBlockers,
  joinSkuSalesQuality,
  parseSkuSalesStatusList,
  resolveSkuSalesEffectiveAbcMetric,
  resolveSkuSalesObjectKey,
  resolveSkuSalesProfitSlots,
  resolveSkuSalesQualityCodes,
  resolveSkuSalesSkuAggKey,
  skuSalesBlockingErrors,
} from './ecomSkuSalesAnalysisContract';
import { logger } from '../../../utils/logger';

// 契约段符号在此统一转发，对外导入面（strategy 路径）不变
export * from './ecomSkuSalesAnalysisContract';

// ============================================================================
// Phase 1 — SQL 生成层（6 段 CTE：src → sku_agg → calc → sales → metric → tag）
// ============================================================================

/** 空输入 / 缺表 / 含阻断项时的降级查询：语法合法、恒 0 行 */
export const SKU_SALES_DEGRADE_SQL = 'SELECT 1 WHERE false';

/** `sku_agg → calc` 两层透传的四个金额类源列（顺序固定） */
const SKU_SALES_AMOUNT_COLS = ['net_amount', 'gross_profit', 'cost_amount', 'refund_amount'] as const;

/** 附加维度 → src 层别名（与落库列同名） */
const SKU_SALES_DIM_COLS: Record<string, string> = {
  category: 'category',
  brand: 'brand',
  shop: 'shop',
};

/** 标识符转义（兼容中文列名与保留字，阻断 `"` 注入） */
function q(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/** 字符串字面量转义 */
function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** 数值投影：未映射给 NULL（不折 0，守住比率列的 NULL 语义） */
function numCast(col?: string): string {
  return `CAST(${q(col as string)} AS DOUBLE)`;
}

function strCast(col?: string): string {
  return `CAST(${q(col as string)} AS VARCHAR)`;
}

interface SkuSalesPlan {
  cfg: EcomSkuSalesAnalysisConfig;
  /** 第一层分组键（SKU 级） */
  skuAggKey: 'sku_id' | 'product_id';
  /** 第二层分组键（对象键，兼排序 tiebreak 与输出列） */
  objectKey: 'sku_id' | 'product_id';
  /** 附加维度列别名，无附加维度为 null */
  dimCol: string | null;
  /** 附加维度列的源列名 */
  dimSource: string | null;
  salesSql: string | null;
  profitSql: string | null;
  /** ABC 排序指标（已按毛利可用性回落） */
  abcMetricRef: string;
  qualityFlag: string;
}

/** 由配置推导全部结构参数（唯一推导点，各层只消费结果） */
function planSkuSales(cfg: EcomSkuSalesAnalysisConfig): SkuSalesPlan {
  const m = cfg.fieldMapping;
  const preview = buildSkuSalesFormulaPreview(cfg);
  const profitAvailable = resolveSkuSalesProfitSlots(m, cfg.profitSlots).length > 0;
  const abcMetric = resolveSkuSalesEffectiveAbcMetric(profitAvailable, cfg.abcMetric);
  const dimCol = cfg.extraDimension === 'none' ? null : SKU_SALES_DIM_COLS[cfg.extraDimension] ?? null;
  const dimSource =
    cfg.extraDimension === 'category' ? m.categoryCol
      : cfg.extraDimension === 'brand' ? m.brandCol
        : cfg.extraDimension === 'shop' ? m.shopCol
          : '';

  return {
    cfg,
    skuAggKey: resolveSkuSalesSkuAggKey(m, cfg.groupLevel),
    objectKey: resolveSkuSalesObjectKey(m, cfg.groupLevel),
    dimCol,
    dimSource: hasColumnValue(dimSource) ? (dimSource as string) : null,
    salesSql: preview.salesSql,
    profitSql: preview.profitSql,
    abcMetricRef: abcMetric === 'profit' ? 'm."profit"' : 'm."sales"',
    qualityFlag: joinSkuSalesQuality(resolveSkuSalesQualityCodes(cfg)),
  };
}

/** 状态剔除片段；未映射或空集合返回空串（不生成子句） */
export function buildSkuSalesStatusClause(cfg: EcomSkuSalesAnalysisConfig): string {
  const col = cfg.fieldMapping.orderStatusCol;
  const statuses = parseSkuSalesStatusList(cfg.excludeStatusValues);
  if (!hasColumnValue(col) || statuses.length === 0) return '';
  const list = statuses.map(lit).join(', ');
  return `COALESCE(UPPER(TRIM(CAST(${q(col as string)} AS VARCHAR))), '') NOT IN (${list})`;
}

/**
 * `src` 层 WHERE 的唯一合成点：三档写死，`userWhere` 只在此处包裹注入。
 */
export function composeSkuSalesSrcWhere(statusClause: string, userWhere: string): string {
  const status = (statusClause ?? '').trim();
  const user = (userWhere ?? '').replace(/^WHERE\s+/i, '').trim();
  const hasUser = user !== '' && user !== '1=1';
  if (!status && !hasUser) return '';
  if (!status) return `WHERE ${user}`;
  if (!hasUser) return `WHERE ${status}`;
  return `WHERE ${status} AND (${user})`;
}

/** ① `src`：源列投影（只投影已映射列）+ 状态剔除 + `userWhere` 唯一注入 */
function buildSkuSalesSrcCte(tableName: string, plan: SkuSalesPlan, userWhere: string): string {
  const { cfg, skuAggKey, objectKey, dimSource } = plan;
  const m = cfg.fieldMapping;
  const proj: string[] = [];

  // 对象键与 SKU 级键可能需要两列（spu + 已映射 SKU 编码）
  const keyCols: Array<['sku_id' | 'product_id', string | undefined]> = [
    ['sku_id', m.skuIdCol],
    ['product_id', m.productIdCol],
  ];
  const neededKeys = new Set<string>([skuAggKey, objectKey]);
  for (const [alias, src] of keyCols) {
    if (!neededKeys.has(alias) || !hasColumnValue(src)) continue;
    proj.push(`${strCast(src)} AS ${q(alias)}`);
  }

  if (dimSource) proj.push(`${strCast(dimSource)} AS ${q(plan.dimCol as string)}`);
  for (const [alias, src] of [
    ['net_amount', m.salesCol],
    ['gross_profit', m.grossProfitCol],
    ['cost_amount', m.costCol],
    ['refund_amount', m.refundAmountCol],
  ] as Array<[string, string | undefined]>) {
    if (hasColumnValue(src)) proj.push(`${numCast(src)} AS ${q(alias)}`);
  }
  if (hasColumnValue(m.quantityCol)) proj.push(`${numCast(m.quantityCol)} AS "quantity"`);
  if (hasColumnValue(m.stockQtyCol)) proj.push(`${numCast(m.stockQtyCol)} AS "stock_qty"`);
  if (hasColumnValue(m.orderIdCol)) proj.push(`${strCast(m.orderIdCol)} AS "order_id"`);
  if (hasColumnValue(m.orderStatusCol)) proj.push(`${strCast(m.orderStatusCol)} AS "order_status"`);

  const where = composeSkuSalesSrcWhere(buildSkuSalesStatusClause(cfg), userWhere);
  return [
    'src AS (',
    '  SELECT',
    `    ${proj.join(',\n    ')}`,
    `  FROM ${q(tableName)}`,
    where ? `  ${where}` : '',
    ')',
  ].filter(Boolean).join('\n');
}

/** ② `sku_agg`：GROUP BY SKU 级键 + 附加维度；对象键不同时以 MAX 投影（不进 GROUP BY） */
function buildSkuSalesSkuAggCte(plan: SkuSalesPlan): string {
  const { cfg, skuAggKey, objectKey, dimCol } = plan;
  const m = cfg.fieldMapping;
  const proj = [`s.${q(skuAggKey)} AS ${q(skuAggKey)}`];
  if (objectKey !== skuAggKey) proj.push(`MAX(s.${q(objectKey)}) AS ${q(objectKey)}`);
  if (dimCol) proj.push(`s.${q(dimCol)} AS ${q(dimCol)}`);

  for (const col of SKU_SALES_AMOUNT_COLS) {
    proj.push(hasColumnValue(srcColOf(m, col))
      ? `SUM(s.${q(col)}) AS ${q(col)}`
      : `CAST(NULL AS DOUBLE) AS ${q(col)}`);
  }
  proj.push(hasColumnValue(m.quantityCol)
    ? 'SUM(s."quantity") AS "quantity"'
    : 'CAST(NULL AS DOUBLE) AS "quantity"');
  // 单 SKU 级库存快照：MAX（跨 SKU 归并才 SUM）
  proj.push(hasColumnValue(m.stockQtyCol)
    ? 'MAX(s."stock_qty") AS "stock_qty"'
    : 'CAST(NULL AS DOUBLE) AS "stock_qty"');
  proj.push(hasColumnValue(m.orderIdCol)
    ? 'COUNT(DISTINCT s."order_id") AS "order_cnt"'
    : 'COUNT(*) AS "order_cnt"');

  const groupBy = [`s.${q(skuAggKey)}`];
  if (dimCol) groupBy.push(`s.${q(dimCol)}`);
  return [
    'sku_agg AS (',
    '  SELECT',
    `    ${proj.join(',\n    ')}`,
    '  FROM src s',
    `  GROUP BY ${groupBy.join(', ')}`,
    ')',
  ].join('\n');
}

/** 字段槽 → 对应配置字段（sku_agg 判断"是否映射"用） */
function srcColOf(m: EcomSkuSalesAnalysisConfig['fieldMapping'], alias: string): string | undefined {
  switch (alias) {
    case 'net_amount': return m.salesCol;
    case 'gross_profit': return m.grossProfitCol;
    case 'cost_amount': return m.costCol;
    case 'refund_amount': return m.refundAmountCol;
    default: return undefined;
  }
}

/** ③ `calc`：GROUP BY 对象键 + 附加维度；只做 SUM，不派生销售额（V9） */
function buildSkuSalesCalcCte(plan: SkuSalesPlan): string {
  const { objectKey, dimCol } = plan;
  const proj = [`k.${q(objectKey)} AS ${q(objectKey)}`];
  if (dimCol) proj.push(`k.${q(dimCol)} AS ${q(dimCol)}`);
  for (const col of SKU_SALES_AMOUNT_COLS) proj.push(`SUM(k.${q(col)}) AS ${q(col)}`);
  proj.push('SUM(k."quantity") AS "quantity"');
  proj.push('SUM(k."stock_qty") AS "stock_qty"');   // 跨 SKU 归并 = SUM(MAX)
  proj.push('SUM(k."order_cnt") AS "order_cnt"');

  const groupBy = [`k.${q(objectKey)}`];
  if (dimCol) groupBy.push(`k.${q(dimCol)}`);
  return [
    'calc AS (',
    '  SELECT',
    `    ${proj.join(',\n    ')}`,
    '  FROM sku_agg k',
    `  GROUP BY ${groupBy.join(', ')}`,
    ')',
  ].join('\n');
}

/** ④ `sales`：单表达式层派生销售额（聚合层内同层别名引用会绑回源列，V9） */
function buildSkuSalesSalesCte(plan: SkuSalesPlan): string {
  const expr = plan.salesSql ?? 'CAST(NULL AS DOUBLE)';
  return [
    'sales AS (',
    '  SELECT',
    '    c.*,',
    `    (${expr}) AS "sales"`,
    '  FROM calc c',
    ')',
  ].join('\n');
}

/** ⑤ `metric`：毛利 + 毛利率 + 售罄率（比率一律 NULLIF 兜零） */
function buildSkuSalesMetricCte(plan: SkuSalesPlan): string {
  const profit = plan.profitSql ?? 'CAST(NULL AS DOUBLE)';
  return [
    'metric AS (',
    '  SELECT',
    '    sl.*,',
    `    (${profit}) AS "profit",`,
    `    (${profit}) / NULLIF(sl."sales", 0) AS "margin_rate",`,
    '    sl."quantity" / NULLIF(sl."quantity" + sl."stock_qty", 0) AS "sell_through_rate"',
    '  FROM sales sl',
    ')',
  ].join('\n');
}

/** ⑥ `tag`：排名 + ABC 累计占比 + 整表动销率（累计基数 GREATEST 钳位，ORDER BY 用原值） */
function buildSkuSalesTagCte(plan: SkuSalesPlan): string {
  const metric = plan.abcMetricRef;
  const tiebreak = `m.${q(plan.objectKey)}`;
  return [
    'tag AS (',
    '  SELECT',
    '    m.*,',
    `    ROW_NUMBER() OVER (ORDER BY ${metric} DESC, ${tiebreak}) AS "rank",`,
    `    SUM(GREATEST(${metric}, 0)) OVER (ORDER BY ${metric} DESC, ${tiebreak}`,
    '      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)',
    `      / NULLIF(SUM(GREATEST(${metric}, 0)) OVER (), 0) AS "abc_share",`,
    '    SUM(CASE WHEN m."quantity" > 0 THEN 1 ELSE 0 END) OVER ()',
    '      / NULLIF(SUM(CASE WHEN m."stock_qty" > 0 THEN 1 ELSE 0 END) OVER (), 0) AS "turnover_rate"',
    '  FROM metric m',
    ')',
  ].join('\n');
}

/** 滞销判据片段：`is_slow_moving` 与「滞销款」共用同一实现（只写一次） */
function slowMovingCondition(cfg: EcomSkuSalesAnalysisConfig, alias: string): string {
  const thr = cfg.slowMovingQtyThreshold;
  return `${alias}."quantity" < ${thr} AND (${alias}."stock_qty" IS NULL OR ${alias}."stock_qty" > 0)`;
}

/** 主 SELECT 的输出列清单（按 §5 逐列拼接，出现条件列动态生成） */
function buildSkuSalesSelectList(plan: SkuSalesPlan): string[] {
  const { cfg, objectKey, dimCol } = plan;
  const out: string[] = ['t."rank"'];
  out.push(`t.${q(objectKey)}`);
  // 另一键：对象键为 product_id 时才输出 sku_id
  if (objectKey === 'product_id') out.push('t."sku_id"');
  if (dimCol === 'category') out.push('t."category"');
  if (dimCol === 'brand') out.push('t."brand"');
  if (dimCol === 'shop') out.push('t."shop"');
  out.push('t."order_cnt"');
  out.push('ROUND(t."quantity", 2) AS "quantity"');
  out.push('ROUND(t."sales", 2) AS "sales"');
  out.push('ROUND(t."profit", 2) AS "profit"');
  out.push('ROUND(t."margin_rate", 4) AS "margin_rate"');
  out.push('ROUND(t."stock_qty", 2) AS "stock_qty"');
  out.push('ROUND(t."sell_through_rate", 4) AS "sell_through_rate"');
  out.push('ROUND(t."turnover_rate", 4) AS "turnover_rate"');

  const a = cfg.abcThresholdA;
  const b = cfg.abcThresholdB;
  out.push([
    'CASE WHEN t."abc_share" IS NULL THEN NULL',
    `     WHEN t."abc_share" * 100 <= ${a} THEN 'A'`,
    `     WHEN t."abc_share" * 100 <= ${b} THEN 'B'`,
    "     ELSE 'C' END AS \"abc_class\"",
  ].join('\n     '));
  out.push([
    'CASE WHEN t."quantity" IS NULL THEN NULL',
    `     WHEN ${slowMovingCondition(cfg, 't')}`,
    '     THEN TRUE ELSE FALSE END AS "is_slow_moving"',
  ].join('\n     '));
  out.push([
    `CASE WHEN ${slowMovingCondition(cfg, 't')} THEN '滞销款'`,
    `     WHEN t."abc_share" * 100 <= ${a} THEN '爆款'`,
    `     WHEN t."margin_rate" * 100 >= ${cfg.profitMarginThreshold} AND t."quantity" > 0 THEN '利润款'`,
    "     ELSE '普通' END AS \"tag\"",
  ].join('\n     '));
  out.push(`${lit(plan.qualityFlag)} AS "data_quality_flag"`);
  return out;
}

/**
 * 拼装完整 SQL（六段 CTE + 主 SELECT + TopN）。
 * 调用方负责表名与阻断项判断；本函数假定配置可出数。
 */
export function buildSkuSalesSql(
  tableName: string,
  config: EcomSkuSalesAnalysisConfig,
  userWhere: string,
): string {
  const cfg = cloneSkuSalesConfig(config);
  const plan = planSkuSales(cfg);
  const ctes = [
    buildSkuSalesSrcCte(tableName, plan, userWhere),
    buildSkuSalesSkuAggCte(plan),
    buildSkuSalesCalcCte(plan),
    buildSkuSalesSalesCte(plan),
    buildSkuSalesMetricCte(plan),
    buildSkuSalesTagCte(plan),
  ];

  const lines = [
    `WITH ${ctes[0]},`,
    ...ctes.slice(1, -1).map((cte) => `${cte},`),
    ctes[ctes.length - 1],
    'SELECT',
    `  ${buildSkuSalesSelectList(plan).join(',\n  ')}`,
    'FROM tag t',
  ];
  if (cfg.topN > 0) lines.push(`WHERE t."rank" <= ${cfg.topN}`);
  lines.push('ORDER BY t."rank"');
  return lines.join('\n');
}

/** 供单测直接取用的结构参数（避免重复推导） */
export function describeSkuSalesPlan(config: EcomSkuSalesAnalysisConfig): {
  skuAggKey: string;
  objectKey: string;
  abcMetric: EcomSkuSalesAnalysisConfig['abcMetric'];
  qualityFlag: string;
} {
  const plan = planSkuSales(cloneSkuSalesConfig(config));
  return {
    skuAggKey: plan.skuAggKey,
    objectKey: plan.objectKey,
    abcMetric: resolveSkuSalesEffectiveAbcMetric(
      resolveSkuSalesProfitSlots(plan.cfg.fieldMapping, plan.cfg.profitSlots).length > 0,
      plan.cfg.abcMetric,
    ),
    qualityFlag: plan.qualityFlag,
  };
}

export class EcomSkuSalesAnalysisStrategy extends BaseStrategy {
  readonly type = OperatorType.SKU_SALES_ANALYSIS;
  readonly name = 'EcomSkuSalesAnalysisStrategy';

  /** buildOperatorSql 记录、postProcess 唯一配置来源（禁止 postProcess 重读节点） */
  private _lastConfig: EcomSkuSalesAnalysisConfig | null = null;

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
      ?.ecomSkuSalesAnalysisConfig;

    // 先赋值再判降级：单例策略不得把上一个节点的配置残留给无配置节点
    const cfg = rawCfg ? cloneSkuSalesConfig(rawCfg) : null;
    this._lastConfig = cfg;

    if (!tableName || !cfg || skuSalesBlockingErrors(cfg).length > 0) {
      logger.warn(
        `[${this.name}.buildOperatorSql] 降级空查询: table=${tableName || '<空>'}, config=${cfg ? 'ok' : '<缺失>'}, ` +
        `blockers=${skuSalesBlockingErrors(cfg ?? undefined).map((b) => b.code).join('/') || '<无>'}`,
      );
      return SKU_SALES_DEGRADE_SQL;
    }

    const sql = buildSkuSalesSql(tableName, cfg, userWhere);
    logger.info(
      `[${this.name}.buildOperatorSql] table=${tableName}, group=${cfg.groupLevel}, ` +
      `dim=${cfg.extraDimension}, topN=${cfg.topN}`,
    );
    return sql;
  }

  /** 阻断项按 severity 映射 ERROR / WARNING（降级口径只是 WARNING，不阻断节点生效） */
  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[],
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    if (!selectNode) return [];
    const cfg = (selectNode.data as SelectNodeData | undefined)?.ecomSkuSalesAnalysisConfig;

    const errors: ValidationError[] = [];
    const push = (message: string, severity: ValidationSeverity = ValidationSeverity.ERROR): void => {
      errors.push({ nodeId: selectNode.id, nodeType: FlowNodeType.SELECT, severity, message });
    };

    for (const blocker of collectSkuSalesBlockers(cfg)) {
      push(blocker.message, blocker.severity === 'warning' ? ValidationSeverity.WARNING : ValidationSeverity.ERROR);
    }
    if (!cfg) return errors;

    const groups: Array<['salesSlots' | 'profitSlots', FormulaSlot[] | undefined, string]> = [
      ['salesSlots', cfg.salesSlots, '销售额'],
      ['profitSlots', cfg.profitSlots, '毛利'],
    ];
    for (const [group, slots, label] of groups) {
      const dropped = (slots ?? []).filter(
        (s) => hasColumnValue(s?.column) && !allowedSkuSalesSlots(group, [s]).length,
      );
      if (dropped.length > 0) {
        push(`${label}公式中 ${dropped.length} 项不在可引用范围，已忽略`, ValidationSeverity.WARNING);
      }
    }
    if (resolveSkuSalesProfitSlots(cfg.fieldMapping, cfg.profitSlots).length === 0) {
      push('毛利公式没有可用的引用项，毛利与毛利率本期为空', ValidationSeverity.WARNING);
    }
    push('时间范围继承上游筛选条件', ValidationSeverity.WARNING);
    return errors;
  }

  /** 结果加工：行透传 + 双计数 + 洞察卡 + 输出契约（排序与截断均由 SQL 保证，此处不二次处理） */
  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const cfg = this._lastConfig ?? DEFAULT_SKU_SALES_CONFIG;
    const queryResult = (data ?? {}) as { data?: unknown };
    const rows = (Array.isArray(queryResult.data) ? queryResult.data : []).filter(
      (r): r is SkuSalesRow => !!r && typeof r === 'object',
    );

    const quality = joinSkuSalesQuality(resolveSkuSalesQualityCodes(cfg));
    logger.info(`[${this.name}.postProcess] rows=${rows.length}, quality=${quality}`);

    return {
      type: this.type,
      sql: '',
      data: rows,
      schema: buildSkuSalesOutputSchema(cfg) as unknown[],
      insightsData: {
        summary: {
          totalRecordCount: rows.length,
          totalFilterRecordCount: rows.filter((r) => (rowNum(r, 'quantity') ?? 0) > 0).length,
        },
        insights: buildSkuSalesInsights(rows, cfg),
      },
      displayConfig: buildSkuSalesDisplayConfig(cfg),
    };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 2 — 输出契约 / 洞察卡 / 展示配置（中文文案全部在此生成）
// ════════════════════════════════════════════════════════════════════════════

type SkuSalesRow = Record<string, unknown>;

/** 恒定输出项（顺序与主 SELECT 一致，对象键与维度项另置于首部之后） */
const SKU_SALES_CONST_OUTPUT_COLS = [
  'order_cnt',
  'quantity',
  'sales',
  'profit',
  'margin_rate',
  'stock_qty',
  'sell_through_rate',
  'turnover_rate',
  'abc_class',
  'is_slow_moving',
  'tag',
  'data_quality_flag',
];

/** 维度项来源解析：与 SQL 投影同源，未映射则不出该列 */
function resolveSkuSalesDimSource(cfg: EcomSkuSalesAnalysisConfig): string | null {
  const m = cfg.fieldMapping;
  const source =
    cfg.extraDimension === 'category'
      ? m.categoryCol
      : cfg.extraDimension === 'brand'
        ? m.brandCol
        : cfg.extraDimension === 'shop'
          ? m.shopCol
          : '';
  return hasColumnValue(source) ? (source as string) : null;
}

/** 输出列：排名 + 对象键 + 可选维度项 + 12 个恒定项 */
export function buildSkuSalesOutputSchema(config: EcomSkuSalesAnalysisConfig): string[] {
  const dim = resolveSkuSalesDimSource(config);
  return [
    'rank',
    resolveSkuSalesObjectKey(config.fieldMapping, config.groupLevel),
    ...(dim ? [dim] : []),
    ...SKU_SALES_CONST_OUTPUT_COLS,
  ];
}

/** 表格展示：默认按排名升序，金额/比率格式化与标签徽章 */
export function buildSkuSalesDisplayConfig(
  config: EcomSkuSalesAnalysisConfig,
): OperatorDisplayConfig {
  const caliber = config.salesCaliber === 'net' ? '已扣除退款' : '未扣除退款';
  return {
    defaultSort: { column: 'rank', order: 'ascend' },
    columnFormatters: {
      sales: { type: 'currency_signed', unit: '元', precision: 2 },
      profit: { type: 'currency_signed', unit: '元', precision: 2 },
      margin_rate: { type: 'percent_signed', precision: 1 },
      sell_through_rate: { type: 'percent_signed', precision: 1 },
      turnover_rate: { type: 'percent_signed', precision: 1 },
      tag: { type: 'json_tag_badges', priorityTags: ['滞销款', '爆款', '利润款'] },
    },
    columnTooltips: {
      sales: `本期成交金额，${caliber}`,
      profit: '本期成交金额减去商品成本后的毛利',
      margin_rate: '毛利占成交金额的比例，成交金额为 0 时为空',
      sell_through_rate: '销量占销量与库存之和的比例，库存未识别时为空',
      turnover_rate: '有销量商品数与有库存商品数的比值，用于看整体动销面',
    },
  };
}

/** 数值读取：非有限值一律 null，不被静默当 0 */
function rowNum(row: SkuSalesRow, key: string): number | null {
  const value = row[key];
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function fmtRowNum(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const SKU_SALES_CARD = {
  empty: 'sku-sales-empty',
  qty: 'sku-sales-qty-champion',
  profit: 'sku-sales-profit-champion',
  slow: 'sku-sales-slow-moving',
  cr5: 'sku-sales-cr5',
} as const;

/** 非空 → 最多 4 张卡（销量/毛利冠军、滞销预警、Top5 集中度）；空 → 单张提示卡 */
function buildSkuSalesInsights(
  rows: SkuSalesRow[],
  cfg: EcomSkuSalesAnalysisConfig,
): InsightItem[] {
  if (rows.length === 0) {
    return [
      {
        id: SKU_SALES_CARD.empty,
        cardType: 'standard',
        iconKey: 'warning',
        title: '本期没有可分析的商品数据',
        description: '请检查时间范围、商品编码与销量的选择后重试',
        sortOrder: 1,
      },
    ];
  }

  const quality = joinSkuSalesQuality(resolveSkuSalesQualityCodes(cfg));
  const objectKey = resolveSkuSalesObjectKey(cfg.fieldMapping, cfg.groupLevel);
  const cards: Array<Omit<InsightItem, 'sortOrder'>> = [];

  // 销量冠军：占本次返回集的销量比例
  const totalQty = rows.reduce((acc, r) => acc + Math.max(rowNum(r, 'quantity') ?? 0, 0), 0);
  const qtyTop = [...rows]
    .filter((r) => (rowNum(r, 'quantity') ?? 0) > 0)
    .sort((a, b) => (rowNum(b, 'quantity') ?? 0) - (rowNum(a, 'quantity') ?? 0))[0];
  if (qtyTop) {
    const qty = rowNum(qtyTop, 'quantity') ?? 0;
    const share = totalQty > 0 ? (qty / totalQty) * 100 : 0;
    cards.push({
      id: SKU_SALES_CARD.qty,
      cardType: 'standard',
      iconKey: 'order',
      title: `${String(qtyTop[objectKey] ?? '')} 销量第一`,
      description: `本期销量 ${fmtRowNum(qty)} 件，占 ${share.toFixed(1)}%`,
    });
  }

  // 毛利冠军：未识别毛利或毛利全空均不出卡
  const profitIdentified = resolveSkuSalesProfitSlots(cfg.fieldMapping, cfg.profitSlots).length > 0;
  const profitTop = profitIdentified
    ? [...rows]
      .filter((r) => rowNum(r, 'profit') !== null)
      .sort((a, b) => (rowNum(b, 'profit') ?? 0) - (rowNum(a, 'profit') ?? 0))[0]
    : undefined;
  if (profitTop) {
    const profit = rowNum(profitTop, 'profit') ?? 0;
    const margin = rowNum(profitTop, 'margin_rate');
    cards.push({
      id: SKU_SALES_CARD.profit,
      cardType: 'standard',
      iconKey: 'price',
      title: `${String(profitTop[objectKey] ?? '')} 毛利第一`,
      description:
        `本期毛利 ${fmtRowNum(profit)} 元` +
        (margin === null ? '' : `，毛利率 ${(margin * 100).toFixed(1)}%`),
    });
  }

  // 滞销预警：非空分支恒定出卡，并承载负毛利的累计口径披露
  const slowCount = rows.filter((r) => r.is_slow_moving === true).length;
  const slowParts = [
    slowCount === 0
      ? '本期无滞销商品'
      : `${slowCount} 个商品本期无销量但仍有库存，建议清仓或降价`,
  ];
  if (quality.includes('NO_STOCK_COL')) slowParts.push('未识别库存，售罄率/动销率本期为空');
  const negCount =
    cfg.abcMetric === 'profit' ? rows.filter((r) => (rowNum(r, 'profit') ?? 0) < 0).length : 0;
  if (negCount > 0) {
    slowParts.push(
      cfg.topN > 0 && rows.length === cfg.topN
        ? `返回的前 ${cfg.topN} 条中有 ${negCount} 个商品毛利为负，ABC 与爆款仅按正贡献累计`
        : `本期有 ${negCount} 个商品毛利为负，ABC 与爆款仅按正贡献累计`,
    );
  }
  cards.push({
    id: SKU_SALES_CARD.slow,
    cardType: 'standard',
    iconKey: 'warning',
    title: '滞销预警',
    description: slowParts.join('；'),
  });

  // Top5 集中度：分母 = 本次返回集合计，非正不出卡
  const totalSales = rows.reduce((acc, r) => acc + (rowNum(r, 'sales') ?? 0), 0);
  if (totalSales > 0) {
    const top5 = [...rows]
      .map((r) => rowNum(r, 'sales') ?? 0)
      .sort((a, b) => b - a)
      .slice(0, 5)
      .reduce((acc, v) => acc + v, 0);
    const cr5 = ((top5 / totalSales) * 100).toFixed(1);
    const parts = [`Top5 集中度 ${cr5}%`];
    if (cfg.topN > 0 && rows.length === cfg.topN) {
      parts.push(`按返回的前 ${cfg.topN} 条计算，非全量`);
    }
    if (quality.includes('SPU_FALLBACK')) parts.push('已按 SKU 统计');
    cards.push({
      id: SKU_SALES_CARD.cr5,
      cardType: 'standard',
      iconKey: 'insight',
      title: 'Top5 集中度',
      description: parts.join('；'),
    });
  }

  return cards.map((card, index) => ({ ...card, sortOrder: index + 1 }));
}
