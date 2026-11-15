/**
 * SKU/SPU 销量毛利排行分析 · 契约段
 *
 * 「一处定义、多处共读」：字段字典 / 正则预填 / 槽位引用域 / 质量码 / 阻断判据全部在此定义，
 * 策略 validate、抽屉确认门禁、isUdfConfigured 与单测均从此处取判据，禁止各写一份判定。
 */
import {
  hasColumnValue,
  type EcomSkuSalesAnalysisConfig,
  type FormulaSlot,
} from '../types';

// ============================================================================
// 字段字典
// ============================================================================

export type SkuSalesFieldKey = keyof EcomSkuSalesAnalysisConfig['fieldMapping'];

export type SkuSalesSlotGroup = 'salesSlots' | 'profitSlots';

/** 字段业务中文名（抽屉标签 + 公式预览共用；均不含禁用技术词） */
export const SKU_SALES_FIELD_LABEL: Record<SkuSalesFieldKey, string> = {
  skuIdCol: 'SKU 编码',
  productIdCol: '商品编码',
  categoryCol: '商品品类',
  brandCol: '品牌',
  shopCol: '店铺',
  salesCol: '实收金额',
  quantityCol: '销量',
  grossProfitCol: '毛利额',
  costCol: '商品成本',
  refundAmountCol: '退款金额',
  stockQtyCol: '库存数量',
  orderIdCol: '订单号',
  orderStatusCol: '订单状态',
};

/** 源列别名 → 业务中文名（公式人话串与下拉 label 共用） */
export const SKU_SALES_COLUMN_LABEL: Record<string, string> = {
  net_amount: '实收金额',
  gross_profit: '毛利额',
  cost_amount: '商品成本',
  refund_amount: '退款金额',
  sales: '销售额',
  quantity: '销量',
  stock_qty: '库存数量',
  order_id: '订单号',
  order_status: '订单状态',
  category: '商品品类',
  brand: '品牌',
  shop: '店铺',
  sku_id: 'SKU 编码',
  product_id: '商品编码',
  margin_rate: '毛利率',
  sell_through_rate: '售罄率',
  turnover_rate: '动销率',
};

/** 与统计粒度无关的必填字段（SKU 编码 / 商品编码的必填随粒度切换，由抽屉按粒度判定） */
export const SKU_SALES_REQUIRED_FIELDS: SkuSalesFieldKey[] = ['salesCol', 'quantityCol'];

/** 金额类字段：预填时额外套用金额排除词 */
export const SKU_SALES_AMOUNT_FIELDS: SkuSalesFieldKey[] = [
  'salesCol', 'grossProfitCol', 'costCol', 'refundAmountCol',
];

/** 金额排除词（比率/状态/时间类列不得当金额用） */
export const SKU_SALES_AMOUNT_DENY = /(率|占比|比例|状态|原因|说明|备注|类型|时间|日期|件数|数量|库存)/i;

// ============================================================================
// 正则预填（Q10）
// ============================================================================

export const SKU_SALES_FIELD_MATCH_PATTERNS: Record<SkuSalesFieldKey, RegExp> = {
  skuIdCol: /(^|_)sku(_?id)?(_|$)|sku_?code|sku编码|商品sku|单品编码/i,
  productIdCol: /(^|_)(product(_?id)?|spu(_?id)?|goods(_?id)?)(_|$)|商品编码|商品id|款式编码|spu编码/i,
  salesCol: /(^|_)(net_?amount|sale(s)?_?amount|pay_?amount|gmv|revenue)(_|$)|实收金额|销售额|成交金额|实付金额|支付金额/i,
  quantityCol: /(^|_)(quantity|qty|sales_?qty|sold_?qty)(_|$)|销量|销售数量|售出数量|件数/i,
  grossProfitCol: /(^|_)(gross_?profit|profit_?amount)(_|$)|毛利额|毛利金额/i,
  costCol: /(^|_)(cost(_?amount|_?price)?|goods_?cost|cogs)(_|$)|商品成本|成本额|成本金额/i,
  refundAmountCol: /(^|_)(refund(_?amount|_?amt)?)(_|$)|退款金额|退货金额/i,
  stockQtyCol: /(^|_)(stock(_?qty|_?quantity)?|inventory(_?qty)?)(_|$)|库存数量|库存量|期末库存/i,
  orderIdCol: /(^|_)(order(_?id|_?no)?)(_|$)|订单号|订单编号/i,
  orderStatusCol: /(^|_)(order_?status|status)(_|$)|订单状态|交易状态/i,
  categoryCol: /(^|_)(category|cat_?name|class)(_|$)|品类|类目|商品分类/i,
  brandCol: /(^|_)(brand|brand_?name)(_|$)|品牌/i,
  shopCol: /(^|_)(shop|store|shop_?name|store_?name)(_|$)|店铺|门店/i,
};

/** 固定匹配次序：更精确的在前，先到先得 */
export const SKU_SALES_FIELD_MATCH_ORDER: SkuSalesFieldKey[] = [
  'skuIdCol', 'productIdCol', 'salesCol', 'quantityCol', 'grossProfitCol', 'costCol',
  'refundAmountCol', 'stockQtyCol', 'orderIdCol', 'orderStatusCol', 'categoryCol', 'brandCol', 'shopCol',
];

// ============================================================================
// 槽位引用域（Q3 / Q12）
// ============================================================================

/** 槽位可引用的金额类源列（= src 层投影别名） */
export const SKU_SALES_SLOT_SOURCE_COLS = ['net_amount', 'gross_profit', 'cost_amount', 'refund_amount'] as const;

export const SKU_SALES_SLOT_FIELDS: Record<SkuSalesSlotGroup, readonly string[]> = {
  salesSlots: SKU_SALES_SLOT_SOURCE_COLS,
  profitSlots: [...SKU_SALES_SLOT_SOURCE_COLS, 'sales'],
};

export const SKU_SALES_SLOT_OPERATORS: ReadonlyArray<'+' | '-'> = ['+', '-'];

export function isSkuSalesSlotColumnAllowed(group: SkuSalesSlotGroup, column?: string): boolean {
  if (!hasColumnValue(column)) return false;
  return SKU_SALES_SLOT_FIELDS[group].indexOf(column as string) >= 0;
}

/**
 * 仅按「可引用域」过滤（不含源数据映射判定），返回项为副本。
 * 构建 SQL 的入口请用 `usableSkuSalesSlots`：它同时丢弃「源数据未映射」项。
 */
export function allowedSkuSalesSlots(group: SkuSalesSlotGroup, slots?: FormulaSlot[]): FormulaSlot[] {
  const list = Array.isArray(slots) ? slots : [];
  return list
    .filter((s) => !!s && SKU_SALES_SLOT_OPERATORS.indexOf(s.operator) >= 0 && isSkuSalesSlotColumnAllowed(group, s.column))
    .map((s) => ({ operator: s.operator, column: s.column }));
}

export function skuSalesSlotsIncludeRefund(slots?: FormulaSlot[]): boolean {
  return allowedSkuSalesSlots('salesSlots', slots).some((s) => s.column === 'refund_amount');
}

/** 槽位别名 → 依赖的源列字段槽（`sales` 是派生别名，没有自己的源列） */
const SKU_SALES_SLOT_SOURCE_FIELD: Record<string, SkuSalesFieldKey> = {
  net_amount: 'salesCol',
  gross_profit: 'grossProfitCol',
  cost_amount: 'costCol',
  refund_amount: 'refundAmountCol',
};

/**
 * 槽位别名的源数据是否已映射。
 * 未映射时聚合层只会产出 `CAST(NULL AS DOUBLE)`，引用它的公式整列退化为 NULL（静默全空），
 * 因此与越界项同样丢弃并由 `slot-dropped` 告警。
 */
export function isSkuSalesSlotColumnMapped(
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'] | undefined,
  column?: string,
): boolean {
  if (!hasColumnValue(column)) return false;
  const field = SKU_SALES_SLOT_SOURCE_FIELD[column as string];
  if (field) return hasColumnValue(fieldMapping?.[field]);
  // `sales` 等派生别名没有独立源数据，其可用性由 `no-sales-slot` 单独把关
  return column === 'sales';
}

export type SkuSalesSlotDropReason = 'out-of-range' | 'unmapped-source';

export interface SkuSalesSlotResolution {
  /** 可进入 SQL 的槽位项 */
  usable: FormulaSlot[];
  /** 被丢弃项：越界（不在可引用范围）或源数据未映射 */
  dropped: Array<{ slot: FormulaSlot; reason: SkuSalesSlotDropReason }>;
}

/**
 * 槽位项唯一解析点：越界项与源数据未映射项在此丢弃，其余为可用集。
 * 构建 SQL / 判空 / 公式预览共用本函数，保证三者口径一致。
 */
export function resolveSkuSalesSlots(
  group: SkuSalesSlotGroup,
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'] | undefined,
  slots?: FormulaSlot[],
): SkuSalesSlotResolution {
  const usable: FormulaSlot[] = [];
  const dropped: SkuSalesSlotResolution['dropped'] = [];
  for (const slot of Array.isArray(slots) ? slots : []) {
    // 空槽位（尚未选列）与非法运算符属编辑中间态，不产生告警
    if (!slot || SKU_SALES_SLOT_OPERATORS.indexOf(slot.operator) < 0 || !hasColumnValue(slot.column)) continue;
    if (!isSkuSalesSlotColumnAllowed(group, slot.column)) {
      dropped.push({ slot: { operator: slot.operator, column: slot.column }, reason: 'out-of-range' });
      continue;
    }
    if (!isSkuSalesSlotColumnMapped(fieldMapping, slot.column)) {
      dropped.push({ slot: { operator: slot.operator, column: slot.column }, reason: 'unmapped-source' });
      continue;
    }
    usable.push({ operator: slot.operator, column: slot.column });
  }
  return { usable, dropped };
}

/** 可用槽位项（`resolveSkuSalesSlots` 的可用集） */
export function usableSkuSalesSlots(
  group: SkuSalesSlotGroup,
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'] | undefined,
  slots?: FormulaSlot[],
): FormulaSlot[] {
  return resolveSkuSalesSlots(group, fieldMapping, slots).usable;
}

function columnLabel(col: string): string {
  return SKU_SALES_COLUMN_LABEL[col] ?? col;
}

/** 槽位 → SQL 片段（列名一律双引号；空集返回 null） */
export function skuSalesSlotSql(slots?: FormulaSlot[]): string | null {
  const list = Array.isArray(slots) ? slots : [];
  if (list.length === 0) return null;
  return list
    .map((s, i) => `${i === 0 ? '' : s.operator === '-' ? ' - ' : ' + '}"${s.column}"`)
    .join('');
}

/** 槽位 → 人话串（与 skuSalesSlotSql 同源同分支；空集返回 null） */
export function skuSalesSlotHuman(slots?: FormulaSlot[]): string | null {
  const list = Array.isArray(slots) ? slots : [];
  if (list.length === 0) return null;
  return list
    .map((s, i) => `${i === 0 ? '' : s.operator === '-' ? ' \u2212 ' : ' + '}${columnLabel(s.column)}`)
    .join('');
}

/** 毛利槽位：用户配置优先，缺毛利额时按「销售额 − 商品成本」降级，两路都缺给空集 */
export function resolveSkuSalesProfitSlots(
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'],
  profitSlots?: FormulaSlot[],
): FormulaSlot[] {
  const allowed = usableSkuSalesSlots('profitSlots', fieldMapping, profitSlots);
  if (allowed.length > 0) return allowed;
  if (hasColumnValue(fieldMapping?.grossProfitCol)) return [{ operator: '+', column: 'gross_profit' }];
  if (hasColumnValue(fieldMapping?.costCol)) {
    return [{ operator: '+', column: 'sales' }, { operator: '-', column: 'cost_amount' }];
  }
  return [];
}

/** 销售额口径唯一实现点：净额口径再扣一次退款 */
export function applySkuSalesCaliber(config: EcomSkuSalesAnalysisConfig): string | null {
  const base = skuSalesSlotSql(usableSkuSalesSlots('salesSlots', config?.fieldMapping, config?.salesSlots));
  if (base === null) return null;
  // 退款源数据未映射时不做减法：否则会得到 `- COALESCE(CAST(NULL AS DOUBLE), 0)`，
  // 净额口径静默退化为毛额（CR-1-3）
  const refundMapped = isSkuSalesSlotColumnMapped(config?.fieldMapping, 'refund_amount');
  return config.salesCaliber === 'net' && refundMapped ? `${base} - COALESCE("refund_amount", 0)` : base;
}

// ============================================================================
// 粒度 / 对象键 / 排序指标（降级唯一判定点）
// ============================================================================

export function resolveSkuSalesEffectiveGroupLevel(
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'],
  groupLevel: EcomSkuSalesAnalysisConfig['groupLevel'],
): EcomSkuSalesAnalysisConfig['groupLevel'] {
  if (groupLevel !== 'spu') return 'sku';
  return hasColumnValue(fieldMapping?.productIdCol) ? 'spu' : 'sku';
}

/** 统计对象键：spu → product_id，sku → sku_id */
export function resolveSkuSalesObjectKey(
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'],
  groupLevel: EcomSkuSalesAnalysisConfig['groupLevel'],
): 'sku_id' | 'product_id' {
  return resolveSkuSalesEffectiveGroupLevel(fieldMapping, groupLevel) === 'spu' ? 'product_id' : 'sku_id';
}

/** SKU 级聚合键：映射了 SKU 编码用别名，否则用对象键（按 SPU 统计时同一 SPU 仍需在 SKU 级先聚合库存） */
export function resolveSkuSalesSkuAggKey(
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'],
  groupLevel: EcomSkuSalesAnalysisConfig['groupLevel'],
): 'sku_id' | 'product_id' {
  return hasColumnValue(fieldMapping?.skuIdCol) ? 'sku_id' : resolveSkuSalesObjectKey(fieldMapping, groupLevel);
}

/** ABC 排序指标：毛利不可用时回落销售额 */
export function resolveSkuSalesEffectiveAbcMetric(
  profitAvailable: boolean,
  abcMetric: EcomSkuSalesAnalysisConfig['abcMetric'],
): EcomSkuSalesAnalysisConfig['abcMetric'] {
  return abcMetric === 'profit' && !profitAvailable ? 'sales' : abcMetric;
}

// ============================================================================
// 质量码与阻断项（Q7）
// ============================================================================

export type SkuSalesQualityCode =
  | 'OK'
  | 'ROW_LEVEL'
  | 'NO_STOCK_COL'
  | 'NO_PROFIT_COL'
  | 'NO_STATUS_FILTER'
  | 'SPU_FALLBACK';

/** 固定拼接次序 */
export const SKU_SALES_QUALITY_ORDER: ReadonlyArray<Exclude<SkuSalesQualityCode, 'OK'>> = [
  'ROW_LEVEL', 'NO_STOCK_COL', 'NO_PROFIT_COL', 'NO_STATUS_FILTER', 'SPU_FALLBACK',
];

export const SKU_SALES_QUALITY_DESC: Record<SkuSalesQualityCode, string> = {
  OK: '口径完整',
  ROW_LEVEL: '订单号未识别，订单数按数据行计',
  NO_STOCK_COL: '库存数量未识别，售罄率与动销率本期为空，滞销只看销量',
  NO_PROFIT_COL: '毛利额未识别，毛利按销售额减商品成本降级，或输出空值',
  NO_STATUS_FILTER: '订单状态未识别，取消与未支付单未剔除',
  SPU_FALLBACK: '商品编码未识别，已自动回退按 SKU 统计',
};

export type SkuSalesBlockerCode =
  | 'no-object-key'
  | 'no-sku-key'
  | 'no-sales-col'
  | 'no-quantity-col'
  | 'no-sales-slot'
  | 'no-refund-col'
  | 'no-dim-col'
  | 'bad-abc-threshold'
  | 'bad-margin-threshold'
  | 'bad-slow-threshold'
  | 'bad-topn'
  | 'empty-profit-slots'
  | 'slot-dropped'
  | 'refund-double-deduct'
  | Exclude<SkuSalesQualityCode, 'OK'>;

export interface SkuSalesBlocker {
  code: SkuSalesBlockerCode;
  severity: 'error' | 'warning';
  message: string;
}

/** 剔除状态值解析：逗号分隔、去空白、大写（与 SQL 侧 UPPER(TRIM(...)) 同语义） */
export function parseSkuSalesStatusList(values?: string): string[] {
  return (values ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.toUpperCase());
}

/** 附加维度 → 对应字段槽 */
const DIMENSION_FIELD: Record<
  Exclude<EcomSkuSalesAnalysisConfig['extraDimension'], 'none'>,
  SkuSalesFieldKey
> = {
  category: 'categoryCol',
  brand: 'brandCol',
  shop: 'shopCol',
};

export function resolveSkuSalesQualityCodes(config?: EcomSkuSalesAnalysisConfig): SkuSalesQualityCode[] {
  if (!config) return ['OK'];
  const m = config.fieldMapping ?? {};
  const hit: SkuSalesQualityCode[] = [];
  if (!hasColumnValue(m.orderIdCol)) hit.push('ROW_LEVEL');
  if (!hasColumnValue(m.stockQtyCol)) hit.push('NO_STOCK_COL');
  if (!hasColumnValue(m.grossProfitCol)) hit.push('NO_PROFIT_COL');
  if (!hasColumnValue(m.orderStatusCol) || parseSkuSalesStatusList(config.excludeStatusValues).length === 0) {
    hit.push('NO_STATUS_FILTER');
  }
  if (config.groupLevel === 'spu' && resolveSkuSalesEffectiveGroupLevel(m, config.groupLevel) === 'sku') {
    hit.push('SPU_FALLBACK');
  }
  return hit.length > 0 ? hit : ['OK'];
}

export function joinSkuSalesQuality(codes?: SkuSalesQualityCode[]): string {
  const list = (codes ?? []).filter((c) => c !== 'OK');
  return list.length > 0 ? list.join('+') : 'OK';
}

/** 阻断项：11 个 ERROR 在前（固定次序），WARNING 在后；Drawer / validate / isUdfConfigured 共读 */
export function collectSkuSalesBlockers(config?: EcomSkuSalesAnalysisConfig): SkuSalesBlocker[] {
  if (!config) {
    return [{ code: 'no-object-key', severity: 'error', message: '请先选择商品编码：按 SKU 统计选 SKU 编码，按 SPU 统计选商品编码' }];
  }
  const m = config.fieldMapping ?? {};
  const errors: SkuSalesBlocker[] = [];
  const push = (code: SkuSalesBlockerCode, message: string): void => {
    errors.push({ code, severity: 'error', message });
  };

  const hasSku = hasColumnValue(m.skuIdCol);
  const hasProduct = hasColumnValue(m.productIdCol);
  if (!hasSku && !hasProduct) {
    push('no-object-key', '请先选择商品编码：按 SKU 统计选 SKU 编码，按 SPU 统计选商品编码');
  }
  if (config.groupLevel === 'sku' && !hasSku && hasProduct) {
    push('no-sku-key', '按 SKU 统计需选择 SKU 编码，或改用商品编码按 SPU 统计');
  }
  if (!hasColumnValue(m.salesCol)) push('no-sales-col', '请先选择实收金额');
  if (!hasColumnValue(m.quantityCol)) push('no-quantity-col', '请先选择销量');
  if (usableSkuSalesSlots('salesSlots', m, config.salesSlots).length === 0) {
    push('no-sales-slot', '销售额公式至少需要保留一项');
  }
  if (config.salesCaliber === 'net' && !hasColumnValue(m.refundAmountCol)) {
    push('no-refund-col', '已选「已扣退款」口径，请先选择退款金额，或改回「未扣退款」');
  }
  if (config.extraDimension !== 'none' && !hasColumnValue(m[DIMENSION_FIELD[config.extraDimension]])) {
    push('no-dim-col', '已选择附加维度，请先选择对应的品类 / 品牌 / 店铺');
  }
  if (!(0 < config.abcThresholdA && config.abcThresholdA < config.abcThresholdB && config.abcThresholdB <= 100)) {
    push('bad-abc-threshold', 'A 类阈值需小于 B 类阈值，且两者都在 0 到 100 之间');
  }
  if (!(config.profitMarginThreshold >= 0 && config.profitMarginThreshold <= 100)) {
    push('bad-margin-threshold', '毛利率阈值需在 0 到 100 之间');
  }
  if (!(config.slowMovingQtyThreshold >= 0)) {
    push('bad-slow-threshold', '滞销销量阈值不能小于 0');
  }
  if (!Number.isInteger(config.topN) || config.topN < 0) {
    push('bad-topn', '返回条数需为不小于 0 的整数（0 表示不限）');
  }

  const warnings: SkuSalesBlocker[] = [];
  const warn = (code: SkuSalesBlockerCode, message: string): void => {
    warnings.push({ code, severity: 'warning', message });
  };

  if (resolveSkuSalesProfitSlots(m, config.profitSlots).length === 0) {
    warn('empty-profit-slots', '毛利公式没有可用的引用项，毛利与毛利率本期为空');
  }
  for (const code of resolveSkuSalesQualityCodes(config)) {
    if (code === 'OK') continue;
    warn(code, `本次按降级口径出数：${SKU_SALES_QUALITY_DESC[code]}（${code}）`);
  }
  const groups: Array<[SkuSalesSlotGroup, FormulaSlot[] | undefined, string]> = [
    ['salesSlots', config.salesSlots, '销售额'],
    ['profitSlots', config.profitSlots, '毛利'],
  ];
  for (const [group, slots, label] of groups) {
    // 逐条丢弃项一条 WARNING（计划 §4「每条被丢弃项一条提示」）
    for (const { slot, reason } of resolveSkuSalesSlots(group, m, slots).dropped) {
      const name = columnLabel(slot.column as string);
      const why = reason === 'unmapped-source' ? '未匹配到源数据' : '不在可引用范围';
      warn('slot-dropped', `${label}公式中的「${name}」${why}，已忽略`);
    }
  }
  if (config.salesCaliber === 'net' && skuSalesSlotsIncludeRefund(config.salesSlots)) {
    warn('refund-double-deduct', '已选「已扣退款」口径，销售额公式中的退款金额会被重复扣除');
  }

  return [...errors, ...warnings];
}

/** 门禁只看 error（warning 只提示不阻断） */
export function skuSalesBlockingErrors(config?: EcomSkuSalesAnalysisConfig): SkuSalesBlocker[] {
  return collectSkuSalesBlockers(config).filter((b) => b.severity === 'error');
}

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_SKU_SALES_EXCLUDE_STATUSES =
  '已取消,交易关闭,已关闭,未支付,待付款,CANCELLED,CLOSED,UNPAID';

export const DEFAULT_SKU_SALES_CONFIG: EcomSkuSalesAnalysisConfig = {
  fieldMapping: {
    skuIdCol: '',
    productIdCol: '',
    categoryCol: '',
    brandCol: '',
    shopCol: '',
    salesCol: '',
    quantityCol: '',
    grossProfitCol: '',
    costCol: '',
    refundAmountCol: '',
    stockQtyCol: '',
    orderIdCol: '',
    orderStatusCol: '',
  },
  groupLevel: 'sku',
  extraDimension: 'none',
  salesCaliber: 'gross',
  salesSlots: [{ operator: '+', column: 'net_amount' }],
  profitSlots: [{ operator: '+', column: 'gross_profit' }],
  abcMetric: 'sales',
  abcThresholdA: 70,
  abcThresholdB: 90,
  slowMovingQtyThreshold: 1,
  profitMarginThreshold: 30,
  topN: 200,
  excludeStatusValues: DEFAULT_SKU_SALES_EXCLUDE_STATUSES,
};

export function cloneSkuSalesConfig(config?: EcomSkuSalesAnalysisConfig): EcomSkuSalesAnalysisConfig {
  const src = config ?? DEFAULT_SKU_SALES_CONFIG;
  return {
    ...src,
    fieldMapping: { ...DEFAULT_SKU_SALES_CONFIG.fieldMapping, ...(src.fieldMapping ?? {}) },
    salesSlots: (src.salesSlots ?? []).map((s) => ({ ...s })),
    profitSlots: (src.profitSlots ?? []).map((s) => ({ ...s })),
  };
}

// ============================================================================
// 抽屉：label 与搜索
// ============================================================================

/** 下拉 label：`中文业务名（源列）`；中文名缺失时退化为源列名 */
export function skuSalesColumnOptionLabel(column: string): string {
  const label = SKU_SALES_COLUMN_LABEL[column];
  return label ? `${label}（${column}）` : column;
}

/** 中英双向、大小写不敏感、去首尾空格的包含匹配 */
export function matchesSkuSalesColumnSearch(input: string, column: string): boolean {
  const needle = (input ?? '').trim().toLowerCase();
  if (!needle) return true;
  const col = (column ?? '').toLowerCase();
  const label = (SKU_SALES_COLUMN_LABEL[column] ?? '').toLowerCase();
  return col.indexOf(needle) >= 0 || (label !== '' && label.indexOf(needle) >= 0);
}

// ============================================================================
// 公式预览（与 SQL 同源）
// ============================================================================

export interface SkuSalesFormulaPreview {
  salesFormula: string | null;
  salesSql: string | null;
  profitFormula: string | null;
  profitSql: string | null;
  salesCaliberNote: string;
  droppedSlots: FormulaSlot[];
}

export function buildSkuSalesFormulaPreview(config: EcomSkuSalesAnalysisConfig): SkuSalesFormulaPreview {
  const cfg = config ?? DEFAULT_SKU_SALES_CONFIG;
  const salesAllowed = usableSkuSalesSlots('salesSlots', cfg.fieldMapping, cfg.salesSlots);
  const profitAllowed = resolveSkuSalesProfitSlots(cfg.fieldMapping ?? {}, cfg.profitSlots);

  const droppedSlots: FormulaSlot[] = [];
  const groups: Array<[SkuSalesSlotGroup, FormulaSlot[] | undefined]> = [
    ['salesSlots', cfg.salesSlots],
    ['profitSlots', cfg.profitSlots],
  ];
  for (const [group, slots] of groups) {
    for (const slot of Array.isArray(slots) ? slots : []) {
      if (!isSkuSalesSlotColumnAllowed(group, slot?.column)) droppedSlots.push({ ...slot });
    }
  }

  const salesSql = applySkuSalesCaliber(cfg);
  const salesHuman = skuSalesSlotHuman(salesAllowed);
  return {
    salesFormula: salesHuman,
    salesSql,
    profitFormula: skuSalesSlotHuman(profitAllowed),
    profitSql: skuSalesSlotSql(profitAllowed),
    salesCaliberNote: cfg.salesCaliber === 'net'
      ? (isSkuSalesSlotColumnMapped(cfg.fieldMapping, 'refund_amount')
          ? '销售额口径：已扣退款，再减一次退款金额'
          : '销售额口径：退款情况未提供，按未扣退款计算')
      : '销售额口径：未扣退款',
    droppedSlots,
  };
}

// ============================================================================
// 预填（Q10）
// ============================================================================

export interface SkuSalesAmbiguousField {
  field: SkuSalesFieldKey;
  candidates: string[];
}

export interface SkuSalesMatchResult {
  fieldMapping: EcomSkuSalesAnalysisConfig['fieldMapping'];
  ambiguous: SkuSalesAmbiguousField[];
}

/**
 * 列名 → 字段槽预填：固定次序、先到先得、已填值不覆盖、命中 ≥2 列留空并回报歧义。
 */
export function matchSkuSalesColumns(
  columns: string[],
  current?: EcomSkuSalesAnalysisConfig['fieldMapping'],
): SkuSalesMatchResult {
  const mapping: Record<string, string> = { ...(current ?? {}) };
  const used = new Set<string>();
  for (const key of SKU_SALES_FIELD_MATCH_ORDER) {
    if (hasColumnValue(mapping[key])) used.add(mapping[key]);
  }

  const pool = (Array.isArray(columns) ? columns : []).filter((c) => hasColumnValue(c));
  const ambiguous: SkuSalesAmbiguousField[] = [];
  for (const field of SKU_SALES_FIELD_MATCH_ORDER) {
    if (hasColumnValue(mapping[field])) continue;
    const pattern = SKU_SALES_FIELD_MATCH_PATTERNS[field];
    const amount = SKU_SALES_AMOUNT_FIELDS.indexOf(field) >= 0;
    const candidates = pool.filter(
      (c) => !used.has(c) && pattern.test(c) && (!amount || !SKU_SALES_AMOUNT_DENY.test(c)),
    );
    if (candidates.length === 1) {
      mapping[field] = candidates[0];
      used.add(candidates[0]);
    } else if (candidates.length > 1) {
      ambiguous.push({ field, candidates });
    }
  }

  return { fieldMapping: mapping as EcomSkuSalesAnalysisConfig['fieldMapping'], ambiguous };
}