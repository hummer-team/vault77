/**
 * EcomPlatformFeeAllocateStrategy — fn_ecom_platform_fee_allocate（平台佣金/服务费自动分摊）
 *
 * SQL 管道（CTE）：
 *   src   → 过滤源表（userWhere 注入于此），ROW_NUMBER() OVER () AS _src_rn
 *   ord   → order_fee_total 逐列去重取总（每费用槽 MAX(COALESCE(col,0)) OVER (PARTITION BY 订单) 相加）
 *           + row_weight（amount→COALESCE("A",0) / quantity→COALESCE("Q",0) / even→1）
 *           + order_weight_total
 *   alloc → alloc_base（零权重→0，否则 ROUND(费×权重/总权重,2)）+ rn（单内金额最大行=1）
 *   agg   → alloc_sum = SUM(alloc_base) OVER (PARTITION BY 订单)
 *   fin   → allocated_fee（rn=1 回补尾差，保证逐单 Σ == ROUND(order_fee_total,2)）
 *           + is_rounding_adjust + alloc_ratio_pct（0–1 比例，×100 由展示层负责）
 *   末段  → SELECT * EXCLUDE(6 中间列) + alloc_mode_label + product_net_profit；
 *           ORDER BY 订单 ASC, 金额 DESC, _src_rn ASC（订单聚簇 + 单内金额降序）
 *
 * postProcess：4 张洞察卡（summary/top-orders/rounding-adjust/zero-weight-abnormal）
 * + 空结果 1 张 warning 卡；displayConfig 不设 defaultSort（保护 SQL 聚簇序）。
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  DEFAULT_FEE_ALLOCATE_CONFIG,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type OperatorInsightsData,
  type InsightItem,
  type InsightMetric,
  type OperatorDisplayConfig,
  type PlatformFeeAllocateConfig,
  type FeeAllocateMode,
  type FormulaSlot,
  type ValidationError,
} from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// Field match patterns (for drawer auto-fill)
// ============================================================================

export const FIELD_MATCH_PATTERNS: Record<string, RegExp> = {
  orderIdCol: /订单[ _. -]?(单号|编号|号|id)|order[ _. -]?(id|no)/i,
  amountCol: /商品金额|金额|product[ _. -]?amount|price/i,
  quantityCol: /购买数量|数量|quantity|qty/i,
  platformFeeCol: /平台佣金|佣金|platform[ _. -]?fee|commission/i,
  adFeeCol: /广告费|广告|ad[ _. -]?fee|promotion/i,
  serviceFeeCol: /服务费|service[ _. -]?fee/i,
  shippingFeeCol: /运费|物流|shipping|freight|delivery/i,
};

/** 分摊模式 → 用户可见文案（决议 9，与核 detailedDescription/OPERATOR_CONFIG 逐句一致） */
const MODE_LABEL: Record<FeeAllocateMode, string> = {
  amount: '金额比例分摊',
  quantity: '数量比例分摊',
  even: '整单均摊',
};

const FEE_SLOT_KEYS = ['slot1', 'slot2', 'slot3', 'slot4'] as const;
const DEDUCT_SLOT_KEYS = ['slot1', 'slot2'] as const;

/** SQL 输出新增列（决议 7 固定列集；enrichedSchema 缺失才补） */
const NEW_COLUMNS: Array<{ name: string; type: string }> = [
  { name: 'order_fee_total', type: 'DOUBLE' },
  { name: 'allocated_fee', type: 'DOUBLE' },
  { name: 'alloc_ratio_pct', type: 'DOUBLE' },
  { name: 'is_rounding_adjust', type: 'BOOLEAN' },
  { name: 'alloc_mode_label', type: 'VARCHAR' },
  { name: 'product_net_profit', type: 'DOUBLE' },
];

/** buildOperatorSql 记录、postProcess 消费（strategy-rules §三：禁止 postProcess 重读节点） */
interface LastConfig {
  mode: FeeAllocateMode;
  orderIdCol: string;
  amountCol: string;
}

type AllocRow = Record<string, unknown>;

const safeNum = (v: unknown): number => {
  const n = typeof v === 'bigint' ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const safeBool = (v: unknown): boolean => v === true || v === 1 || v === '1' || v === 'true';

/** 列名归一：非字符串/空白一律视为「无此维度」（问题 16：禁止空列名参与取列） */
const readColumnName = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** 单元格 → 分组键：空值归一到空串，避免 'null'/'undefined' 字符串混入分组 */
const cellKey = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export class EcomPlatformFeeAllocateStrategy extends BaseStrategy {
  readonly type = OperatorType.PLATFORM_FEE_ALLOCATE;
  readonly name = '平台佣金/服务费自动分摊';

  private _lastConfig: LastConfig | null = null;

  override getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.SELECT];
  }

  // --------------------------------------------------------------------------
  // Validation
  // --------------------------------------------------------------------------

  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[],
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { platformFeeAllocateConfig?: PlatformFeeAllocateConfig } | undefined)
      ?.platformFeeAllocateConfig;
    if (!selectNode || !cfg) return [];

    const errors: ValidationError[] = [];
    const push = (message: string) => errors.push({
      nodeId: selectNode.id,
      nodeType: FlowNodeType.SELECT,
      severity: ValidationSeverity.ERROR,
      message,
    });

    if (!cfg.fieldMapping?.orderIdCol) push('缺少必填字段: 订单号列');
    if (!cfg.fieldMapping?.amountCol) push('缺少必填字段: 商品金额列');
    if (cfg.mode === 'quantity' && !cfg.fieldMapping?.quantityCol) {
      push('缺少必填字段: 购买数量列（按数量比例分摊时必填）');
    }
    if (!FEE_SLOT_KEYS.some((k) => cfg.feeSlots?.[k]?.column)) {
      push('缺少费用槽位: 至少配置一项费用列');
    }
    return errors;
  }

  // --------------------------------------------------------------------------
  // SQL generation
  // --------------------------------------------------------------------------

  override buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _ph?: unknown,
    userWhere?: string,
  ): string {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const tableName =
      (nodes.find((n) => n.type === FlowNodeType.TABLE)?.data as { tableName?: string })
        ?.tableName ?? '';

    const cfg = (selectNode?.data as { platformFeeAllocateConfig?: PlatformFeeAllocateConfig } | undefined)
      ?.platformFeeAllocateConfig;

    if (!tableName || !cfg) {
      logger.warn(
        `[EcomPlatformFeeAllocate] 降级空查询: table=${tableName || '<空>'}, ` +
        `config=${cfg ? 'ok' : '<缺失>'}`,
      );
      return 'SELECT 1 WHERE false';
    }

    const { orderIdCol, amountCol, quantityCol } = cfg.fieldMapping;
    this._lastConfig = { mode: cfg.mode, orderIdCol, amountCol };

    const O = `"${orderIdCol}"`;
    const A = `"${amountCol}"`;
    const Q = quantityCol ? `"${quantityCol}"` : '0';

    logger.info(`[${this.name}.buildOperatorSql] mode=${cfg.mode}, table=${tableName}, orderIdCol=${orderIdCol}, amountCol=${amountCol}`);

    // 费用总额：逐列去重（每槽 MAX OVER 订单分区）后相加，防重复计费且不漏跨行填充（决议 3）
    const feeTerms = FEE_SLOT_KEYS
      .map((k) => cfg.feeSlots[k])
      .filter((s: FormulaSlot) => !!s?.column)
      .map((s: FormulaSlot, i) =>
        `${i === 0 ? (s.operator === '-' ? '- ' : '') : `${s.operator} `}MAX(COALESCE("${s.column}", 0)) OVER (PARTITION BY ${O})`)
      .join(' ');
    const feeTotalExpr = feeTerms || '0.0';
    logger.debug(`[${this.name}.buildOperatorSql] 费用槽位生效 ${FEE_SLOT_KEYS.filter((k) => !!cfg.feeSlots[k]?.column).length}/4`);

    // 权重表达式：三种 mode 仅在此处分叉（决议 2）
    const weightExpr =
      cfg.mode === 'amount' ? `COALESCE(${A}, 0)`
      : cfg.mode === 'quantity' ? `COALESCE(${Q}, 0)`
      : '1';
    const weightTotalExpr =
      cfg.mode === 'even'
        ? `COUNT(*) OVER (PARTITION BY ${O})`
        : `SUM(${weightExpr}) OVER (PARTITION BY ${O})`;

    // 扣减槽：product_net_profit = 本行金额 − 分摊费用 ± 扣减项
    const deductSuffix = DEDUCT_SLOT_KEYS
      .map((k) => cfg.deductSlots[k])
      .filter((s: FormulaSlot) => !!s?.column)
      .map((s: FormulaSlot) => ` ${s.operator} COALESCE("${s.column}", 0)`)
      .join('');

    const whereClause = userWhere?.trim()
      ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '').trim()}`
      : '';

    return `WITH src AS (
  SELECT *, ROW_NUMBER() OVER () AS _src_rn
  FROM "${tableName}"${whereClause}
),
ord AS (
  SELECT *,
    ${feeTotalExpr} AS order_fee_total,
    ${weightExpr} AS row_weight,
    ${weightTotalExpr} AS order_weight_total
  FROM src
),
alloc AS (
  SELECT *,
    CASE WHEN order_weight_total <= 0 THEN 0.0
         ELSE ROUND(order_fee_total * row_weight / order_weight_total, 2) END AS alloc_base,
    ROW_NUMBER() OVER (PARTITION BY ${O} ORDER BY COALESCE(${A}, 0) DESC, COALESCE(${Q}, 0) DESC, _src_rn ASC) AS rn
  FROM ord
),
agg AS (
  SELECT *, SUM(alloc_base) OVER (PARTITION BY ${O}) AS alloc_sum
  FROM alloc
),
fin AS (
  SELECT *,
    CASE WHEN order_weight_total <= 0 THEN 0.0
         WHEN rn = 1 THEN ROUND(order_fee_total - alloc_sum + alloc_base, 2)
         ELSE alloc_base END AS allocated_fee,
    CASE WHEN rn = 1 AND order_weight_total > 0
              AND ABS(ROUND(order_fee_total - alloc_sum + alloc_base, 2) - alloc_base) > 0.005
         THEN true ELSE false END AS is_rounding_adjust,
    CASE WHEN order_weight_total <= 0 THEN 0.0
         ELSE ROUND(row_weight / order_weight_total, 4) END AS alloc_ratio_pct
  FROM agg
)
SELECT * EXCLUDE (_src_rn, row_weight, order_weight_total, alloc_base, alloc_sum, rn),
       '${MODE_LABEL[cfg.mode]}' AS alloc_mode_label,
       ROUND(COALESCE(${A}, 0) - allocated_fee${deductSuffix}, 2) AS product_net_profit
FROM fin
ORDER BY ${O} ASC, COALESCE(${A}, 0) DESC, _src_rn ASC`;
  }

  // --------------------------------------------------------------------------
  // Post-process: insight cards + enriched schema
  // --------------------------------------------------------------------------

  override async postProcess(data: unknown): Promise<AnalysisResult> {
    const queryResult = data as {
      data?: AllocRow[];
      schema?: Record<string, string>[];
    };
    const rawRows = queryResult?.data ?? [];
    const baseSchema = (queryResult?.schema ?? []) as Record<string, string>[];

    if (!rawRows.length) {
      return this._buildEmptyResult(baseSchema);
    }

    // 问题 16：不再用 DEFAULT_FEE_ALLOCATE_CONFIG 的空列名伪造「订单维度」。
    // 缺列时跳过对应层级的统计，而不是把全部行按空键归并成 1 笔订单（错误值）。
    const last = this._lastConfig;
    const mode = last?.mode ?? DEFAULT_FEE_ALLOCATE_CONFIG.mode;
    const orderIdCol = readColumnName(last?.orderIdCol);
    const amountCol = readColumnName(last?.amountCol);
    const hasOrderDim = orderIdCol.length > 0;
    const hasAmountDim = amountCol.length > 0;

    // 行归一化（决议 7 输出列固定，不新增列）
    const rows: AllocRow[] = rawRows.map((r) => ({
      ...r,
      order_fee_total: safeNum(r.order_fee_total),
      allocated_fee: safeNum(r.allocated_fee),
      alloc_ratio_pct: safeNum(r.alloc_ratio_pct),
      product_net_profit: safeNum(r.product_net_profit),
      is_rounding_adjust: safeBool(r.is_rounding_adjust),
      alloc_mode_label: String(r.alloc_mode_label ?? ''),
    }));

    logger.info(
      `[${this.name}.postProcess] rows=${rows.length}, mode=${mode}, ` +
      `hasOrderDim=${hasOrderDim}, hasAmountDim=${hasAmountDim}`,
    );

    // 订单聚合：Σ allocated_fee / 订单费用 / 零权重判定（无订单列时整体跳过）
    const byOrder = new Map<string, { fee: number; orderFeeTotal: number; allZeroRatio: boolean }>();
    let totalAllocated = 0;
    let totalAmount = 0;
    for (const row of rows) {
      const fee = row.allocated_fee as number;
      totalAllocated += fee;
      if (hasAmountDim) totalAmount += safeNum(row[amountCol]);
      if (!hasOrderDim) continue;
      const oid = cellKey(row[orderIdCol]);
      const agg = byOrder.get(oid) ?? { fee: 0, orderFeeTotal: 0, allZeroRatio: true };
      agg.fee += fee;
      agg.orderFeeTotal = Math.max(agg.orderFeeTotal, row.order_fee_total as number);
      agg.allZeroRatio = agg.allZeroRatio && (row.alloc_ratio_pct as number) === 0;
      byOrder.set(oid, agg);
    }
    const orderCount = hasOrderDim ? byOrder.size : undefined;

    // 卡① 分摊汇总
    const modeSentence = {
      amount: '按商品金额比例分摊',
      quantity: '按商品数量比例分摊',
      even: '整单均摊',
    }[mode];
    const avgRatio = totalAmount > 0 ? totalAllocated / totalAmount : 0;
    // 无订单列 / 无金额列时降级文案：绝不输出「共 1 笔订单」「平均费率 0.00%」这类伪值
    const summaryHead = [
      ...(orderCount === undefined ? [] : [`共 ${orderCount} 笔订单`]),
      modeSentence,
    ].join('，');
    const summaryMetrics: InsightMetric[] = [
      { label: '总分摊费用', value: totalAllocated, unit: '元', highlight: true },
    ];
    if (orderCount !== undefined) summaryMetrics.push({ label: '订单数', value: orderCount, unit: '单' });
    if (hasAmountDim) summaryMetrics.push({ label: '平均费率', value: avgRatio, unit: '%' });
    // 量纲单点（问题 8）：下方乘 100 是全文件唯一一处，仅用于 description 文案。
    // 表格列 alloc_ratio_pct 保持 0–1，×100 由展示层 percent_signed 契约完成
    // （ResultsDisplay.tsx:145-152）；指标 value 按 InsightMetric 契约存 0–1 原始小数，
    // ×100 由卡片展示层完成（types.ts unit='%' 约定）。禁止在此预乘指标值。
    const cardSummary: InsightItem = {
      id: 'fee-allocate-summary',
      cardType: 'standard',
      iconKey: 'order',
      title: '分摊汇总',
      sortOrder: 1,
      description: hasAmountDim
        ? `${summaryHead}；平均费率 ${(avgRatio * 100).toFixed(2)}%`
        : summaryHead,
      metrics: summaryMetrics,
    };

    // 卡② 费用最高的订单（Top5，按订单聚合 order_fee_total 降序）
    // 订单列缺失时该卡无意义，整体不产出（问题 16）
    let cardTopOrders: InsightItem | undefined;
    if (hasOrderDim) {
      const orderFees = [...byOrder.entries()]
        .map(([oid, agg]) => ({ oid, fee: agg.orderFeeTotal }))
        .sort((a, b) => b.fee - a.fee);
      const sortedFees = orderFees.map((o) => o.fee).sort((a, b) => a - b);
      const median = sortedFees.length
        ? sortedFees.length % 2 === 1
          ? sortedFees[(sortedFees.length - 1) / 2]
          : (sortedFees[sortedFees.length / 2 - 1] + sortedFees[sortedFees.length / 2]) / 2
        : 0;
      cardTopOrders = {
        id: 'fee-allocate-top-orders',
        cardType: 'standard',
        iconKey: 'insight',
        title: '费用最高的订单',
        sortOrder: 2,
        description: orderFees.slice(0, 5).map((o) => `${o.oid}(${o.fee.toFixed(2)}元)`).join('、'),
        metrics: [
          { label: '最高单', value: orderFees[0]?.fee ?? 0, unit: '元', highlight: true },
          { label: '中位', value: median, unit: '元' },
          { label: '费用>0订单数', value: orderFees.filter((o) => o.fee > 0).length, unit: '单' },
        ],
      };
    }

    // 卡③ 尾差回补行（决议 5/8）
    const adjustRows = rows.filter((r) => r.is_rounding_adjust === true);
    const adjustOrderCount = hasOrderDim
      ? new Set(adjustRows.map((r) => cellKey(r[orderIdCol]))).size
      : undefined;
    const roundingMetrics: InsightMetric[] = [
      { label: '尾差行数', value: adjustRows.length, unit: '行' },
    ];
    if (adjustOrderCount !== undefined) {
      roundingMetrics.push({ label: '涉及订单数', value: adjustOrderCount, unit: '单' });
    }
    const cardRounding: InsightItem = {
      id: 'rounding-adjust',
      cardType: 'standard',
      iconKey: 'insight',
      title: '尾差回补行',
      sortOrder: 3,
      description: '尾差回补至订单内金额最大行，逐单对平（Σ分摊额 = 订单费用）',
      metrics: roundingMetrics,
    };

    logger.debug(
      `[${this.name}.postProcess] orderCount=${orderCount === undefined ? 'n/a' : orderCount}, ` +
      `adjustRows=${adjustRows.length}`,
    );

    // 卡④ 零权重异常订单（费用>0 但该单分摊比例全 0；决议 8 提醒档位 warning）
    // 订单维判定需要订单列，缺列时不产出（问题 16）
    let cardZeroWeight: InsightItem | undefined;
    if (hasOrderDim) {
      let abnormalCount = 0;
      for (const agg of byOrder.values()) {
        if (agg.orderFeeTotal > 0 && agg.allZeroRatio) abnormalCount++;
      }
      cardZeroWeight = {
        id: 'zero-weight-abnormal',
        cardType: 'standard',
        iconKey: abnormalCount > 0 ? 'warning' : 'safe',
        title: '零权重异常订单',
        sortOrder: 4,
        description: abnormalCount > 0
          ? `${abnormalCount} 笔订单费用大于 0 但分摊比例为 0`
          : '无零权重异常订单',
        ...(abnormalCount > 0 ? { suggestion: '检查该订单商品金额/数量是否缺失' } : {}),
        metrics: [
          { label: '异常订单数', value: abnormalCount, unit: '单' },
        ],
      };
    }

    const insights: InsightItem[] = [cardSummary];
    if (cardTopOrders) insights.push(cardTopOrders);
    insights.push(cardRounding);
    if (cardZeroWeight) insights.push(cardZeroWeight);

    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: rows.length,
        totalFilterRecordCount: rows.length,
        ...(orderCount === undefined ? {} : { totalOrderCount: orderCount }),
      },
      insights,
    };

    // displayConfig：不设 defaultSort（JS 重排会覆盖 SQL 订单聚簇序，决议 10）；
    // alloc_ratio_pct 出 SQL 保持 0–1，percent_signed 负责 ×100
    const displayConfig: OperatorDisplayConfig = {
      columnFormatters: {
        allocated_fee: { type: 'currency_signed', unit: '元', precision: 2 },
        order_fee_total: { type: 'currency_signed', unit: '元', precision: 2 },
        product_net_profit: { type: 'currency_signed', unit: '元', precision: 2 },
        alloc_ratio_pct: { type: 'percent_signed', precision: 2 },
      },
      columnTooltips: {
        allocated_fee: '本行分摊到的订单费用（保留 2 位小数，尾差行含回补额）',
        product_net_profit: '商品金额 − 分摊费用 − 可选扣减后的单品净利',
        order_fee_total: '按订单逐列去重后的订单费用总额（佣金＋广告费…）',
        alloc_ratio_pct: '本行权重占订单权重合计的比例（比值存储，按百分比展示）',
        is_rounding_adjust: '分摊尾差回补行（订单内金额最大行）',
        alloc_mode_label: '本次采用的分摊模式',
      },
    };

    return {
      type: OperatorType.PLATFORM_FEE_ALLOCATE,
      sql: '',
      data: rows as unknown[],
      schema: this._enrichSchema(baseSchema),
      insightsData,
      displayConfig,
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /** 6 新列均由 SQL 产出；仅当 schema 缺失时才补（问题 6：禁止拼接重复列） */
  private _enrichSchema(schema: Record<string, string>[]): Record<string, string>[] {
    const existing = new Set(schema.map((c) => (c as { name?: string }).name));
    const missing = NEW_COLUMNS.filter((c) => !existing.has(c.name));
    return missing.length ? [...schema, ...missing] : schema;
  }

  private _buildEmptyResult(schema: Record<string, string>[]): AnalysisResult {
    const warningItem: InsightItem = {
      id: 'fee-allocate-empty-result',
      cardType: 'standard',
      iconKey: 'warning',
      title: '无分摊结果',
      description: '当前数据源为空或过滤条件过严',
      sortOrder: 1,
    };

    return {
      type: OperatorType.PLATFORM_FEE_ALLOCATE,
      sql: '',
      data: [],
      schema: this._enrichSchema(schema) as unknown[],
      insightsData: { insights: [warningItem] } as OperatorInsightsData,
      displayConfig: {} as OperatorDisplayConfig,
    };
  }
}
