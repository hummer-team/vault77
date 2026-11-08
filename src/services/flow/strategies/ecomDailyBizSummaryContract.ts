/**
 * fn_ecom_daily_biz_summary 契约段（feature 17 · 从 strategy 抽出以控体量）
 *
 * 类型 / 默认配置 / 12 字段字典 / 正则预填 / 质量短码 / 槽位同源拼装 / 阻断判据。
 * 消费者（策略 validate、抽屉门禁、`isUdfConfigured`、单测）只读此处的导出，禁止任一端另写判据或中文名。
 */
import {
  hasColumnValue,
  parseRefundStatusValues,
  type DailyBizSummaryConfig,
  type FormulaSlot,
} from '../types';


// ============================================================================
// 类型
// ============================================================================

export type DailyBizFieldKey = keyof DailyBizSummaryConfig['fieldMapping'];

/** 槽位组（组内可引用域不同，见 DAILY_BIZ_SLOT_FIELDS） */
export type DailyBizSlotGroup = 'salesSlots' | 'profitSlots' | 'netProfitSlots' | 'feeSlots';

/** 质量短码（本算子内闭集，书写次序 = 拼接次序） */
export type DailyBizQualityCode = 'OK' | 'ROW_LEVEL' | 'NO_STATUS_FILTER' | 'NO_PROFIT_COL' | 'NULL_AMOUNT';

/** 阻断/提示项码闭集（前 6 个为 error，`no-fee-col` 为 warning） */
export type DailyBizBlockerCode =
  | 'no-order-date'
  | 'no-sales-col'
  | 'no-sales-slot'
  | 'no-profit-slot'
  | 'no-net-profit-slot'
  | 'no-fee-slot'
  | 'no-fee-col';

export interface DailyBizBlocker {
  code: DailyBizBlockerCode;
  message: string;
  severity: 'error' | 'warning';
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
  grossProfitCol: /毛利|毛利额|毛利金额|^gross[_\s]?profit([_\s]?(amount|amt))?$/i,
  costCol: /成本|进价|采购价|^(cost([_\s]?(amount|amt|price))?|cogs)$/i,
  refundAmountCol: /退款金额|退货金额|退款额|^refund([_\s]?(amount|amt|fee))?$/i,
  feeTotalCol: /费用合计|总费用|平台费用|^fee[_\s]?total$|^total[_\s]?fee$/i,
  commissionFeeCol: /佣金|扣点|^commission([_\s]?(fee|amount))?$/i,
  shippingFeeCol: /运费|物流费|^shipping([_\s]?(fee|cost))?$|^freight$/i,
  serviceFeeCol: /服务费|技术服务费|^service[_\s]?fee$/i,
  quantityCol: /销量|数量|件数|^quantity$|^qty$|^sold[_\s]?count$/i,
};

/** 金额类字段：候选列先过硬正则，再排除语义干扰词（Issue 4） */
export const DAILY_BIZ_AMOUNT_GUARDED_FIELDS: readonly DailyBizFieldKey[] = [
  'salesCol', 'grossProfitCol', 'costCol', 'refundAmountCol',
  'feeTotalCol', 'commissionFeeCol', 'shippingFeeCol', 'serviceFeeCol',
];

/** 语义排除词：命中即不参与金额槽预填（率 / 占比 / 状态 / 原因 …） */
export const DAILY_BIZ_AMOUNT_DENY = /(率|占比|比例|状态|原因|说明|备注|类型|时间|日期)/i;

/** 候选列判定唯一入口：正则命中 ∧（非金额类 或 不含语义排除词） */
export function isDailyBizCandidateColumn(field: DailyBizFieldKey, column: string): boolean {
  if (!DAILY_BIZ_FIELD_MATCH_PATTERNS[field].test(column)) return false;
  return DAILY_BIZ_AMOUNT_GUARDED_FIELDS.indexOf(field) < 0 || !DAILY_BIZ_AMOUNT_DENY.test(column);
}

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

/**
 * 对比口径文案唯一真源（Issue 2）：抽屉 tip / 三个 *_cmp tooltip / 洞察卡 suggestion
 * / 元数据 constraints[10] 四处同文。月末夹取已用 duckdb v1.5.6 实测（见 plan §5）。
 */
export const DAILY_BIZ_COMPARE_COPY =
  '对比列按对齐日比较：日环比对齐昨日、周环比对齐上周同日、月环比对齐上月同日（上月无该日时取上月最后一天）、年同比对齐去年同日；对齐日无出数时该列为空值而非 0；关闭对比时三列不输出。';

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

/** 槽位数值求值（与 `dailyBizSlotSql` 的 `COALESCE(<col>, 0)` 逐项同义）：空槽位 `null`，缺键按 0 计 */
export function evalDailyBizSlot(
  slots: FormulaSlot[],
  values: Record<string, number | null | undefined>,
): number | null {
  const parts = (slots ?? []).filter((s) => hasColumnValue(s?.column));
  if (parts.length === 0) return null;
  return parts.reduce((acc, s) => {
    const raw = values?.[s.column];
    const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    return s.operator === '-' ? acc - v : acc + v;
  }, 0);
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

// ── 费用可用性（Issue 3 唯一判定点） ────────────────────────────────────────

export type DailyBizSourceCol = (typeof DAILY_BIZ_SOURCE_COLS)[number];

/** 源别名 → fieldMapping 键（与 src 层投影一一对应，12 键全覆盖） */
export const DAILY_BIZ_SOURCE_COL_FIELD: Record<DailyBizSourceCol, DailyBizFieldKey> = {
  order_date: 'orderDateCol',
  order_id: 'orderIdCol',
  order_status: 'orderStatusCol',
  net_amount: 'salesCol',
  gross_profit: 'grossProfitCol',
  cost_amount: 'costCol',
  refund_amount: 'refundAmountCol',
  fee_total_src: 'feeTotalCol',
  commission_fee: 'commissionFeeCol',
  shipping_fee: 'shippingFeeCol',
  service_fee: 'serviceFeeCol',
  quantity: 'quantityCol',
};

export const DAILY_BIZ_NO_FEE_COL_MESSAGE = '未识别到费用列，净利与净利率本期为空';

/** 分项「是否真的有映射到的列」唯一判定点：语义 = 映射，不是槽位数组长度 */
export function dailyBizFeeItemsMapped(cfg: DailyBizSummaryConfig): boolean {
  const m = cfg.fieldMapping;
  return allowedDailyBizSlots('feeSlots', cfg.feeSlots).some((s) =>
    hasColumnValue(m[DAILY_BIZ_SOURCE_COL_FIELD[s.column as DailyBizSourceCol]]));
}

/** 费用可用性唯一判定点：`single_column` 只看合计列；`slot_sum` 看分项映射列或合计列（后者为既有兜底） */
export function hasDailyBizFeeSource(cfg: DailyBizSummaryConfig): boolean {
  const m = cfg.fieldMapping;
  if (cfg.feeCaliber !== 'slot_sum') return hasColumnValue(m.feeTotalCol);
  return dailyBizFeeItemsMapped(cfg) || hasColumnValue(m.feeTotalCol);
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

/** 候选 ≥2 的字段（不猜，交用户手选） */
export interface DailyBizAmbiguousField {
  field: DailyBizFieldKey;
  candidates: string[];
}

export interface DailyBizMatchResult {
  mapping: DailyBizSummaryConfig['fieldMapping'];
  ambiguous: DailyBizAmbiguousField[];
}

/** 表驱动预填 + 歧义检测：一次串行遍历、同一份 consumed（已填值不覆盖，歧义不猜） */
export function matchDailyBizColumns(
  columns: string[],
  current: DailyBizSummaryConfig['fieldMapping'],
): DailyBizMatchResult {
  const next = { ...current };
  const ambiguous: DailyBizAmbiguousField[] = [];
  const consumed = new Set<string>();
  for (const key of DAILY_BIZ_FIELD_MATCH_ORDER) {
    if (hasColumnValue(next[key])) consumed.add(next[key] as string);
  }
  const available = (columns ?? []).filter((c) => typeof c === 'string' && hasColumnValue(c));
  for (const key of DAILY_BIZ_FIELD_MATCH_ORDER) {
    if (hasColumnValue(next[key])) continue;
    const hits = available.filter((c) => !consumed.has(c) && isDailyBizCandidateColumn(key, c));
    if (hits.length === 1) {
      next[key] = hits[0];
      consumed.add(hits[0]);
    } else if (hits.length >= 2) {
      ambiguous.push({ field: key, candidates: hits });
    }
  }
  return { mapping: next, ambiguous };
}

/** 阻断项（固定次序；只有 severity='error' 会让 validate / 门禁阻断，降级一律不阻断） */
export function collectDailyBizBlockers(cfg?: DailyBizSummaryConfig): DailyBizBlocker[] {
  const c = cfg ?? DEFAULT_DAILY_BIZ_SUMMARY_CONFIG;
  const blockers: DailyBizBlocker[] = [];
  if (!hasColumnValue(c.fieldMapping?.orderDateCol)) {
    blockers.push({ code: 'no-order-date', severity: 'error', message: '请选择「订单支付时间」列，否则无法按天汇总' });
  }
  if (!hasColumnValue(c.fieldMapping?.salesCol)) {
    blockers.push({ code: 'no-sales-col', severity: 'error', message: '请选择「销售额（实收）」列，否则无法计算销售与净利' });
  }
  if (allowedDailyBizSlots('salesSlots', c.salesSlots).length === 0) {
    blockers.push({ code: 'no-sales-slot', severity: 'error', message: '销售额公式至少需要一个有效项' });
  }
  if (allowedDailyBizSlots('profitSlots', c.profitSlots).length === 0) {
    blockers.push({ code: 'no-profit-slot', severity: 'error', message: '毛利公式至少需要一个有效项' });
  }
  if (allowedDailyBizSlots('netProfitSlots', c.netProfitSlots).length === 0) {
    blockers.push({ code: 'no-net-profit-slot', severity: 'error', message: '净利公式至少需要一个有效项' });
  }
  if (c.feeCaliber === 'slot_sum' && resolveDailyBizFeeSlots(c).length === 0) {
    blockers.push({ code: 'no-fee-slot', severity: 'error', message: '费用口径选择「分项相加」时，佣金/运费/服务费至少需要一项' });
  }
  // 费用列不可用只是数值为空（净利/净利率本期为空），不阻断执行
  if (!hasDailyBizFeeSource(c)) {
    blockers.push({ code: 'no-fee-col', severity: 'warning', message: DAILY_BIZ_NO_FEE_COL_MESSAGE });
  }
  return blockers;
}

/** 门禁谓词：仅 severity='error' 的阻断项生效（停用配置 / validate ERROR / 节点门禁共用） */
export function dailyBizBlockingErrors(cfg?: DailyBizSummaryConfig): DailyBizBlocker[] {
  return collectDailyBizBlockers(cfg).filter((b) => b.severity === 'error');
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

