/**
 * fn_ecom_daily_biz_summary — 店铺每日经营全景汇总（feature 17）
 *
 * 契约段（Phase 0）：类型 / 默认配置 / 12 字段字典 / 正则预填 / 质量短码 / 槽位同源拼装 / 阻断判据。
 * 消费者（策略 validate、抽屉门禁、`isUdfConfigured`、单测）只读此处的导出，禁止任一端另写判据或中文名。
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
  type OperatorDisplayConfig,
  type SelectNodeData,
  type ValidationError,
} from '../types';
import { logger } from '../../../utils/logger';

// ============================================================================
// 类型
// ============================================================================

export type DailyBizFieldKey = keyof DailyBizSummaryConfig['fieldMapping'];

/** 槽位组（组内可引用域不同，见 DAILY_BIZ_SLOT_FIELDS） */
export type DailyBizSlotGroup = 'salesSlots' | 'profitSlots' | 'netProfitSlots' | 'feeSlots';

/** 质量短码（本算子内闭集，书写次序 = 拼接次序） */
export type DailyBizQualityCode = 'OK' | 'ROW_LEVEL' | 'NO_STATUS_FILTER' | 'NO_PROFIT_COL' | 'NULL_AMOUNT';

export interface DailyBizBlocker {
  code: string;
  message: string;
}

// ============================================================================
// 字段与列名字典
// ============================================================================

/** 12 个源列投影别名（`fee_total` 撞名 → `fee_total_src`） */
export const DAILY_BIZ_SOURCE_COLS = [
  'order_date', 'order_id', 'order_status', 'net_amount', 'gross_profit', 'cost_amount',
  'refund_amount', 'fee_total_src', 'commission_fee', 'shipping_fee', 'service_fee', 'quantity',
] as const;

/** 保留名（= `calc` / `metric` 层输出名，源列不得占用） */
export const DAILY_BIZ_RESERVED_COLS = ['sales', 'profit', 'fee_total'] as const;

/** 各组槽位可引用域（越界项在构建 SQL 前丢弃） */
export const DAILY_BIZ_SLOT_FIELDS: Record<DailyBizSlotGroup, readonly string[]> = {
  salesSlots: DAILY_BIZ_SOURCE_COLS,
  profitSlots: [...DAILY_BIZ_SOURCE_COLS, 'sales'],
  netProfitSlots: [...DAILY_BIZ_SOURCE_COLS, ...DAILY_BIZ_RESERVED_COLS],
  feeSlots: DAILY_BIZ_SOURCE_COLS,
};

export const DAILY_BIZ_SLOT_OPERATORS: ReadonlyArray<'+' | '-'> = ['+', '-'];

/** 槽位列 → 业务中文名（SQL 与人话预览共用同一字典） */
export const DAILY_BIZ_COLUMN_LABEL: Record<string, string> = {
  order_date: '订单支付时间',
  order_id: '订单号',
  order_status: '订单状态',
  net_amount: '销售额（实收）',
  gross_profit: '毛利额',
  cost_amount: '商品成本',
  refund_amount: '退款金额',
  fee_total_src: '费用合计',
  commission_fee: '佣金',
  shipping_fee: '运费',
  service_fee: '服务费',
  quantity: '销量',
  sales: '销售额',
  profit: '毛利',
  fee_total: '费用合计',
};

/** 12 字段槽 → 业务中文名（抽屉标签唯一来源） */
export const DAILY_BIZ_FIELD_LABEL: Record<DailyBizFieldKey, string> = {
  orderDateCol: '订单支付时间',
  salesCol: '销售额（实收）',
  orderIdCol: '订单号',
  orderStatusCol: '订单状态',
  grossProfitCol: '毛利额',
  costCol: '商品成本',
  refundAmountCol: '退款金额',
  feeTotalCol: '费用合计',
  commissionFeeCol: '佣金',
  shippingFeeCol: '运费',
  serviceFeeCol: '服务费',
  quantityCol: '销量',
};

/** 必填字段（validate / 抽屉星号 / blockers 三处共读） */
export const DAILY_BIZ_REQUIRED_FIELDS: readonly DailyBizFieldKey[] = ['orderDateCol', 'salesCol'];

/** 列名匹配正则（中英混写，大小写不敏感） */
export const DAILY_BIZ_FIELD_MATCH_PATTERNS: Record<DailyBizFieldKey, RegExp> = {
  orderDateCol:
    /(订单|下单|付款|支付|成交).{0,2}(日期|时间)|^(order[_\s]?(date|time)|pay(ment)?[_\s]?time|paid[_\s]?at|trade[_\s]?time|created?[_\s]?(at|time)|date)$/i,
  salesCol: /销售额|实收|实付|成交额|成交金额|^(net[_\s]?amount|actual[_\s]?(amount|amt)|paid[_\s]?(amount|amt)|sales([_\s]?amount)?|gmv)$/i,
  orderIdCol: /订单号|订单编号|单号|^(order[_\s]?(id|no)|orderid|orderno|trans[_\s]?id|bill[_\s]?id)$/i,
  orderStatusCol: /订单状态|状态|^order[_\s]?status$|^status$/i,
  grossProfitCol: /毛利|^gross[_\s]?profit$|^gross[_\s]?margin$/i,
  costCol: /成本|进价|采购价|^(cost([_\s]?(amount|amt|price))?|cogs)$/i,
  refundAmountCol: /退款|退货|^refund[_\s]?(amount|amt)?$/i,
  feeTotalCol: /费用合计|总费用|平台费用|^fee[_\s]?total$|^total[_\s]?fee$/i,
  commissionFeeCol: /佣金|扣点|^commission([_\s]?(fee|amount))?$/i,
  shippingFeeCol: /运费|物流费|^shipping([_\s]?(fee|cost))?$|^freight$/i,
  serviceFeeCol: /服务费|技术服务费|^service[_\s]?fee$/i,
  quantityCol: /销量|数量|件数|^quantity$|^qty$|^sold[_\s]?count$/i,
};

/** 预填匹配次序（先到先得：更精确的正则在前） */
export const DAILY_BIZ_FIELD_MATCH_ORDER: readonly DailyBizFieldKey[] = [
  'orderDateCol', 'salesCol', 'orderIdCol', 'orderStatusCol', 'refundAmountCol', 'feeTotalCol',
  'grossProfitCol', 'costCol', 'commissionFeeCol', 'shippingFeeCol', 'serviceFeeCol', 'quantityCol',
];

// ============================================================================
// 质量短码
// ============================================================================

export const DAILY_BIZ_QUALITY_ORDER: readonly Exclude<DailyBizQualityCode, 'OK'>[] = [
  'ROW_LEVEL', 'NO_STATUS_FILTER', 'NO_PROFIT_COL', 'NULL_AMOUNT',
];

/** 逐码业务说明（抽屉质量区与洞察卡共用） */
export const DAILY_BIZ_QUALITY_DESC: Record<DailyBizQualityCode, string> = {
  OK: '口径完整，无需降级',
  ROW_LEVEL: '未映射订单号，订单数按数据行计数',
  NO_STATUS_FILTER: '未剔除取消/未支付等无效状态，无效单也计入统计',
  NO_PROFIT_COL: '未映射毛利额列，毛利按销售额减商品成本降级或输出空值',
  NULL_AMOUNT: '未映射退款金额，退款金额与退款率输出空值',
};

// ============================================================================
// 默认配置
// ============================================================================

export const DEFAULT_DAILY_BIZ_EXCLUDE_STATUSES =
  '已取消,交易关闭,已关闭,未支付,待付款,CANCELLED,CLOSED,UNPAID';

/** 净利默认槽位（口径切换的唯一默认来源） */
export function dailyBizDefaultNetProfitSlots(salesCaliber: 'gross' | 'net'): FormulaSlot[] {
  return salesCaliber === 'net'
    ? [{ operator: '+', column: 'sales' }, { operator: '-', column: 'fee_total' }]
    : [
        { operator: '+', column: 'sales' },
        { operator: '-', column: 'refund_amount' },
        { operator: '-', column: 'fee_total' },
      ];
}

export const DEFAULT_DAILY_BIZ_SUMMARY_CONFIG: DailyBizSummaryConfig = {
  fieldMapping: {
    orderDateCol: '',
    salesCol: '',
    orderIdCol: '',
    orderStatusCol: '',
    grossProfitCol: '',
    costCol: '',
    refundAmountCol: '',
    feeTotalCol: '',
    commissionFeeCol: '',
    shippingFeeCol: '',
    serviceFeeCol: '',
    quantityCol: '',
  },
  salesCaliber: 'gross',
  feeCaliber: 'single_column',
  compareMode: 'day',
  excludeStatusValues: DEFAULT_DAILY_BIZ_EXCLUDE_STATUSES,
  salesSlots: [{ operator: '+', column: 'net_amount' }],
  profitSlots: [{ operator: '+', column: 'gross_profit' }],
  netProfitSlots: dailyBizDefaultNetProfitSlots('gross'),
  feeSlots: [
    { operator: '+', column: 'commission_fee' },
    { operator: '+', column: 'shipping_fee' },
    { operator: '+', column: 'service_fee' },
  ],
};

/** 深拷贝（槽位数组独立，改副本不影响默认配置） */
export function cloneDailyBizSummaryConfig(cfg?: DailyBizSummaryConfig): DailyBizSummaryConfig {
  const src = cfg ?? DEFAULT_DAILY_BIZ_SUMMARY_CONFIG;
  const slots = (s: FormulaSlot[] | undefined): FormulaSlot[] =>
    (s ?? []).map((x) => ({ operator: x.operator, column: x.column }));
  return {
    fieldMapping: { ...DEFAULT_DAILY_BIZ_SUMMARY_CONFIG.fieldMapping, ...(src.fieldMapping ?? {}) },
    salesCaliber: src.salesCaliber ?? 'gross',
    feeCaliber: src.feeCaliber ?? 'single_column',
    compareMode: src.compareMode ?? 'day',
    excludeStatusValues: src.excludeStatusValues ?? DEFAULT_DAILY_BIZ_EXCLUDE_STATUSES,
    salesSlots: slots(src.salesSlots),
    profitSlots: slots(src.profitSlots),
    netProfitSlots: slots(src.netProfitSlots),
    feeSlots: slots(src.feeSlots),
  };
}

// ============================================================================
// 槽位：引用域 / SQL / 人话（同源）
// ============================================================================

export function isDailyBizSlotColumnAllowed(group: DailyBizSlotGroup, column: string): boolean {
  if (!hasColumnValue(column)) return false;
  return (DAILY_BIZ_SLOT_FIELDS[group] as readonly string[]).indexOf(column) >= 0;
}

/** 越界槽位丢弃（构建 SQL 与预览的唯一入口） */
export function allowedDailyBizSlots(group: DailyBizSlotGroup, slots: FormulaSlot[] | undefined): FormulaSlot[] {
  return (slots ?? []).filter((s) => isDailyBizSlotColumnAllowed(group, s?.column));
}

/** 槽位表达式：`COALESCE(<col>, 0)` 按运算符串联，空集 `NULL::DOUBLE` */
export function dailyBizSlotSql(slots: FormulaSlot[]): string {
  const parts = (slots ?? []).filter((s) => hasColumnValue(s?.column));
  if (parts.length === 0) return 'NULL::DOUBLE';
  return parts
    .map((s, i) => {
      const term = `COALESCE("${s.column.replace(/"/g, '""')}", 0)`;
      if (i === 0) return s.operator === '-' ? `-${term}` : term;
      return `${s.operator} ${term}`;
    })
    .join(' ');
}

/** 槽位人话：与 `dailyBizSlotSql` 同源同判空（空集 `?`） */
export function dailyBizSlotHuman(slots: FormulaSlot[]): string {
  const parts = (slots ?? []).filter((s) => hasColumnValue(s?.column));
  if (parts.length === 0) return '?';
  return parts
    .map((s, i) => {
      const label = DAILY_BIZ_COLUMN_LABEL[s.column] ?? s.column;
      if (i === 0) return s.operator === '-' ? `-${label}` : label;
      return `${s.operator} ${label}`;
    })
    .join(' ');
}

// ============================================================================
// 口径：毛利降级 / 费用口径 / 销售额口径切换
// ============================================================================

/** 毛利降级唯一判定点：有毛利列用槽位；无毛利列有成本列 → 销售额 − 商品成本；两路都缺 → `[]` */
export function resolveDailyBizProfitSlots(cfg: DailyBizSummaryConfig): FormulaSlot[] {
  if (hasColumnValue(cfg.fieldMapping.grossProfitCol)) {
    const configured = allowedDailyBizSlots('profitSlots', cfg.profitSlots);
    return configured.length > 0 ? configured : [{ operator: '+', column: 'gross_profit' }];
  }
  if (hasColumnValue(cfg.fieldMapping.costCol)) {
    return [{ operator: '+', column: 'sales' }, { operator: '-', column: 'cost_amount' }];
  }
  return [];
}

/** 费用口径唯一判定点：`slot_sum` 且分项有效 → 分项；否则回落合计列 */
export function resolveDailyBizFeeSlots(cfg: DailyBizSummaryConfig): FormulaSlot[] {
  if (cfg.feeCaliber !== 'slot_sum') return [];
  const slots = allowedDailyBizSlots('feeSlots', cfg.feeSlots);
  return slots.length > 0 ? slots : [];
}

function slotSignature(slots: FormulaSlot[] | undefined): string {
  return (slots ?? [])
    .filter((s) => hasColumnValue(s?.column))
    .map((s) => `${s.operator}${s.column}`)
    .join('|');
}

/** 净利槽位是否已被用户编辑（与当前口径默认值结构比较） */
export function isDailyBizNetProfitEdited(cfg: DailyBizSummaryConfig): boolean {
  return slotSignature(cfg.netProfitSlots) !== slotSignature(dailyBizDefaultNetProfitSlots(cfg.salesCaliber));
}

/** 口径与公式冲突：销售额已扣退款，净利公式仍含退款扣减项 */
export function hasDailyBizCaliberConflict(cfg: DailyBizSummaryConfig): boolean {
  if (cfg.salesCaliber !== 'net') return false;
  return (cfg.netProfitSlots ?? []).some((s) => hasColumnValue(s?.column) && s.column === 'refund_amount');
}

/** 口径切换：未编辑则重建默认槽位，已编辑则保留（Q12 唯一实现点） */
export function applyDailyBizSalesCaliber(
  cfg: DailyBizSummaryConfig,
  next: 'gross' | 'net',
): DailyBizSummaryConfig {
  const edited = isDailyBizNetProfitEdited(cfg);
  return {
    ...cfg,
    salesCaliber: next,
    netProfitSlots: edited ? (cfg.netProfitSlots ?? []).map((s) => ({ ...s })) : dailyBizDefaultNetProfitSlots(next),
  };
}

// ============================================================================
// 质量短码判定
// ============================================================================

/** 降级短码（输入仅配置，构建期纯函数） */
export function resolveDailyBizQualityCodes(cfg: DailyBizSummaryConfig): DailyBizQualityCode[] {
  const m = cfg.fieldMapping ?? {};
  const codes: DailyBizQualityCode[] = [];
  if (!hasColumnValue(m.orderIdCol)) codes.push('ROW_LEVEL');
  if (!hasColumnValue(m.orderStatusCol) || parseRefundStatusValues(cfg.excludeStatusValues).length === 0) {
    codes.push('NO_STATUS_FILTER');
  }
  if (!hasColumnValue(m.grossProfitCol)) codes.push('NO_PROFIT_COL');
  if (!hasColumnValue(m.refundAmountCol)) codes.push('NULL_AMOUNT');
  return codes.length === 0 ? ['OK'] : codes;
}

/** 短码拼接：固定次序、`+` 连接、空集 `OK` */
export function joinDailyBizQuality(codes: readonly DailyBizQualityCode[]): string {
  const set = new Set(codes.filter((c) => c !== 'OK'));
  if (set.size === 0) return 'OK';
  return DAILY_BIZ_QUALITY_ORDER.filter((c) => set.has(c)).join('+');
}

// ============================================================================
// 预填 / 阻断 / 公式预览
// ============================================================================

/** 表驱动预填：仅填空槽，唯一命中才写（已填值不覆盖，歧义不猜） */
export function matchDailyBizColumns(
  columns: string[],
  current: DailyBizSummaryConfig['fieldMapping'],
): DailyBizSummaryConfig['fieldMapping'] {
  const next = { ...current };
  const consumed = new Set<string>();
  for (const key of DAILY_BIZ_FIELD_MATCH_ORDER) {
    if (hasColumnValue(next[key])) consumed.add(next[key] as string);
  }
  const available = (columns ?? []).filter((c) => typeof c === 'string' && hasColumnValue(c));
  for (const key of DAILY_BIZ_FIELD_MATCH_ORDER) {
    if (hasColumnValue(next[key])) continue;
    const pattern = DAILY_BIZ_FIELD_MATCH_PATTERNS[key];
    const hits = available.filter((c) => !consumed.has(c) && pattern.test(c));
    if (hits.length === 1) {
      next[key] = hits[0];
      consumed.add(hits[0]);
    }
  }
  return next;
}

/** 阻断项（固定次序；只有这些会让 validate 出 ERROR，降级一律不阻断） */
export function collectDailyBizBlockers(cfg?: DailyBizSummaryConfig): DailyBizBlocker[] {
  const c = cfg ?? DEFAULT_DAILY_BIZ_SUMMARY_CONFIG;
  const blockers: DailyBizBlocker[] = [];
  if (!hasColumnValue(c.fieldMapping?.orderDateCol)) {
    blockers.push({ code: 'no-order-date', message: '请选择「订单支付时间」列，否则无法按天汇总' });
  }
  if (!hasColumnValue(c.fieldMapping?.salesCol)) {
    blockers.push({ code: 'no-sales-col', message: '请选择「销售额（实收）」列，否则无法计算销售与净利' });
  }
  if (allowedDailyBizSlots('salesSlots', c.salesSlots).length === 0) {
    blockers.push({ code: 'no-sales-slot', message: '销售额公式至少需要一个有效项' });
  }
  if (allowedDailyBizSlots('profitSlots', c.profitSlots).length === 0) {
    blockers.push({ code: 'no-profit-slot', message: '毛利公式至少需要一个有效项' });
  }
  if (allowedDailyBizSlots('netProfitSlots', c.netProfitSlots).length === 0) {
    blockers.push({ code: 'no-net-profit-slot', message: '净利公式至少需要一个有效项' });
  }
  if (c.feeCaliber === 'slot_sum' && resolveDailyBizFeeSlots(c).length === 0) {
    blockers.push({ code: 'no-fee-slot', message: '费用口径选择「分项相加」时，佣金/运费/服务费至少需要一项' });
  }
  return blockers;
}

export interface DailyBizFormulaPreview {
  salesHuman: string;
  salesSql: string;
  profitHuman: string;
  profitSql: string;
  netProfitHuman: string;
  netProfitSql: string;
  feeHuman: string;
  feeSql: string;
  /** 折叠区 SQL 明细：与 CTE 生成同源，抽屉直接渲染不再拼串 */
  sqlLines: string[];
}

/** 公式预览：面板显示的公式与真实算法恒等（AC6） */
export function buildDailyBizFormulaPreview(cfg: DailyBizSummaryConfig): DailyBizFormulaPreview {
  const salesSlots = allowedDailyBizSlots('salesSlots', cfg.salesSlots);
  const profitSlots = resolveDailyBizProfitSlots(cfg);
  const netProfitSlots = allowedDailyBizSlots('netProfitSlots', cfg.netProfitSlots);
  const feeSlots = resolveDailyBizFeeSlots(cfg);
  const feeSource: FormulaSlot[] = feeSlots.length > 0 ? feeSlots : [{ operator: '+', column: 'fee_total_src' }];

  const salesSql = dailyBizSlotSql(salesSlots);
  const profitSql = dailyBizSlotSql(profitSlots);
  const feeSql = dailyBizSlotSql(feeSource);
  const netProfitSql = dailyBizSlotSql(netProfitSlots);

  return {
    salesHuman: dailyBizSlotHuman(salesSlots),
    salesSql,
    profitHuman: dailyBizSlotHuman(profitSlots),
    profitSql,
    netProfitHuman: dailyBizSlotHuman(netProfitSlots),
    netProfitSql,
    feeHuman: dailyBizSlotHuman(feeSource),
    feeSql,
    sqlLines: [
      `sales      = ${salesSql}`,
      `profit     = ${profitSql}`,
      `fee_total  = ${feeSql}`,
      `net_profit = ${netProfitSql}`,
    ],
  };
}

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
  return `sales_calc AS (\n  SELECT a.*, ${slotExpr(allowedDailyBizSlots('salesSlots', cfg.salesSlots))} AS sales\n  FROM agg a\n)`;
}

/** ④ 毛利 + 费用合计派生（毛利可引用 sales；费用按口径二选一） */
export function buildDailyBizCalcCte(cfg: DailyBizSummaryConfig): string {
  const feeSlots = resolveDailyBizFeeSlots(cfg);
  const feeExpr = feeSlots.length > 0 ? slotExpr(feeSlots) : 'COALESCE("fee_total_src", 0)';
  return `calc AS (\n  SELECT s.*, ${slotExpr(resolveDailyBizProfitSlots(cfg))} AS profit,\n         ${feeExpr} AS fee_total\n  FROM sales_calc s\n)`;
}

/** ⑤ 净利派生（可引用 sales / profit / fee_total） */
export function buildDailyBizMetricCte(cfg: DailyBizSummaryConfig): string {
  return `metric AS (\n  SELECT c.*, ${slotExpr(allowedDailyBizSlots('netProfitSlots', cfg.netProfitSlots))} AS net_profit\n  FROM calc c\n)`;
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

    if (!tableName || !cfg || collectDailyBizBlockers(cfg).length > 0) {
      logger.warn(
        `[${this.name}.buildOperatorSql] 降级空查询: table=${tableName || '<空>'}, config=${cfg ? 'ok' : '<缺失>'}, ` +
        `blockers=${collectDailyBizBlockers(cfg ?? undefined).map((b) => b.code).join('/') || '<无>'}`,
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

  /** 阻断项 → ERROR；降级短码与越界槽位 → WARNING（降级一律不阻断） */
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

    for (const blocker of collectDailyBizBlockers(cfg)) push(blocker.message);
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
  const items: InsightItem[] = [buildDailyBizTrendInsight(rows), buildDailyBizProfitInsight(rows)];

  const refundMapped = hasColumnValue(cfg.fieldMapping.refundAmountCol);
  items.push(buildDailyBizRefundInsight(rows, refundMapped));
  items.push(buildDailyBizOrderInsight(rows, quality));

  if (quality !== 'OK') items.push(buildDailyBizQualityInsight(quality));
  return items.map((item, i) => ({ ...item, sortOrder: i + 1 }));
}

/** ① 经营趋势：首日 → 末日变化 + 区间累计 */
function buildDailyBizTrendInsight(rows: DailyBizRawRow[]): InsightItem {
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

  return {
    id: 'daily-biz-trend',
    cardType: 'standard',
    iconKey: 'insight',
    title: '经营趋势',
    description,
    metrics: [
      { label: '统计天数', value: rows.length, unit: '天' },
      { label: '累计销售额', value: salesTotal ?? 0, unit: '元' },
      { label: '累计净利', value: netProfitTotal ?? 0, unit: '元', highlight: true },
    ],
    metadata: span === null ? undefined : { spanDays: span },
    sortOrder: 1,
  };
}

function trendWord(pct: number | null): string {
  if (pct === null) return '变化幅度不可计算';
  if (pct === 0) return '持平';
  return `${pct > 0 ? '上升' : '下降'} ${Math.abs(pct * 100).toFixed(1)}%`;
}

/** ② 盈利质量：区间净利率（按销售额加权）+ 毛利/费用合计 */
function buildDailyBizProfitInsight(rows: DailyBizRawRow[]): InsightItem {
  const salesTotal = sumOf(rows, 'sales');
  const netTotal = sumOf(rows, 'net_profit');
  const profitTotal = sumOf(rows, 'profit');
  const feeTotal = sumOf(rows, 'fee_total');
  const margin = salesTotal === null || netTotal === null || salesTotal === 0 ? null : netTotal / salesTotal;

  const suggestion = margin === null
    ? '缺少销售额或净利数据，暂无法给出盈利建议。'
    : margin >= 0.2 ? '净利率健康，可维持现有费用投入。'
      : margin >= 0.05 ? '净利率偏薄，建议压缩费用或提升客单价。'
        : '净利率承压，建议核查费用结构与退款情况。';

  return {
    id: 'daily-biz-profit-quality',
    cardType: 'standard',
    iconKey: 'insight',
    title: '盈利质量',
    description: margin === null
      ? '区间净利率无法计算（销售额合计为 0 或缺数）。'
      : `按销售额加权的区间净利率 ${fmtPct(margin)}，净利 ${fmtAmount(netTotal)} 元。`,
    suggestion,
    metrics: [
      { label: '区间净利率', value: margin ?? 0, unit: '%', highlight: true },
      { label: '毛利合计', value: profitTotal ?? 0, unit: '元' },
      { label: '费用合计', value: feeTotal ?? 0, unit: '元' },
    ],
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

  return {
    id: 'daily-biz-refund-fee',
    cardType: 'standard',
    iconKey: 'price',
    title: '退款与费用',
    description: !refundMapped || refundTotal === null
      ? '未映射退款金额列，退款率不可计算。'
      : `退款金额合计 ${fmtAmount(refundTotal)} 元，退款率 ${fmtPct(refundRate)}；销售数据已按所选销售额口径汇总。`,
    metrics: [
      { label: '退款金额合计', value: refundTotal ?? 0, unit: '元' },
      { label: '退款率', value: refundRate ?? 0, unit: '%' },
    ],
    sortOrder: 3,
  };
}

/** ④ 订单与客单价 */
function buildDailyBizOrderInsight(rows: DailyBizRawRow[], quality: string): InsightItem {
  const orderTotal = sumOf(rows, 'order_cnt');
  const salesTotal = sumOf(rows, 'sales');
  const aov = orderTotal === null || salesTotal === null || orderTotal === 0 ? null : salesTotal / orderTotal;

  const rowLevelNote = quality.includes('ROW_LEVEL') ? '（订单数按数据行计数）' : '';
  return {
    id: 'daily-biz-orders',
    cardType: 'standard',
    iconKey: 'order',
    title: '订单与客单价',
    description: `区间订单数合计 ${orderTotal === null ? '空值' : orderTotal.toLocaleString('zh-CN')} 笔${rowLevelNote}，` +
      `客单价 ${fmtAmount(aov)} 元。`,
    metrics: [
      { label: '订单数合计', value: orderTotal ?? 0, unit: '笔' },
      { label: '客单价', value: aov ?? 0, unit: '元', highlight: true },
    ],
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
  const compareTip = '与上一可对齐出数日比较；无对齐日为空值（月环比对齐上月同日，上月无该日时取上月最后一天）';

  const tooltips: Record<string, string> = {
    sales: `销售额 = ${dailyBizSlotHuman(allowedDailyBizSlots('salesSlots', cfg.salesSlots))}`,
    profit: `毛利 = ${profitHuman}${hasColumnValue(cfg.fieldMapping.grossProfitCol) ? '' : '（未映射毛利额列，已按销售额减商品成本降级或输出空值）'}`,
    net_profit: `净利 = ${dailyBizSlotHuman(allowedDailyBizSlots('netProfitSlots', cfg.netProfitSlots))}；` +
      `销售额口径：${cfg.salesCaliber === 'net' ? '已扣退款（净额）' : '未扣退款（毛额）'}`,
    refund_rate: '退款率 = 退款金额合计 ÷ 销售额合计（保留 4 位）；销售额为 0 或未映射退款金额时为空值',
    net_profit_rate: '净利率 = 净利 ÷ 销售额；分母为 0 时为空值',
    avg_order_value: '客单价 = 销售额 ÷ 订单数；分母为 0 时为空值',
    data_quality_flag: `当前短码：${quality}（按 ROW_LEVEL → NO_STATUS_FILTER → NO_PROFIT_COL → NULL_AMOUNT 次序拼接）`,
  };
  if (compare) {
    tooltips.sales_cmp = compareTip;
    tooltips.profit_cmp = compareTip;
    tooltips.net_profit_cmp = compareTip;
  }

  return {
    defaultSort: { column: 'date', order: 'ascend' },
    columnFormatters: formatters,
    columnTooltips: tooltips,
  };
}
