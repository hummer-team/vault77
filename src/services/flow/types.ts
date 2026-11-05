/**
 * Flow Service Types
 * Core type definitions for the analysis flow feature
 */

import type { Node, Edge } from '@xyflow/react';

// ============================================================================
// Enums
// ============================================================================

export enum FlowNodeType {
  DATA_SOURCE = 'dataSource', // Data source selection node (was START)
  TABLE = 'table',
  MERGE = 'merge', // + node for aggregating multiple tables
  OPERATOR = 'operator', // Business operator selection node
  JOIN = 'join',
  CONDITION = 'condition',
  CONDITION_GROUP_RELATION = 'conditionGroupRelation',
  CONDITION_GROUP_DEFINITION = 'conditionGroupDefinition', // Condition group with placeholders (GC_1, GC_2, etc.)
  SELECT = 'select',
  SELECT_AGG = 'selectAgg',
  END = 'end',
  UDF_CONFIG = 'udfConfig', // UDF operator parameter configuration node
}

/** Identifies how the EndNode was created / what triggered it */
export enum EndNodeTriggerSource {
  /** User clicked "直接执行" — skip condition-filling, execute immediately */
  DIRECT = 'direct',
  /** EndNode reached after completing a full condition flow */
  CONDITION = 'condition',
}

export enum JoinType {
  INNER = 'INNER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  CROSS = 'CROSS',
}

export enum OperatorType {
  ASSOCIATION = 'association',
  ANOMALY = 'anomaly',
  CLUSTERING = 'clustering',
  UDF_REPLACE_COLUMN = 'udf_replace_column',  // Data-cleaning: replace specific column values
  UDF_UP_LOWER       = 'udf_up_lower',        // Data-cleaning: upper/lower case transformation
  UDF_FORMAT_NUMBER  = 'udf_format_number',   // Data-cleaning: number precision / rounding
  UDF_FLAG_SPEC      = 'udf_flag_spec',       // Data-cleaning: flag / label specific column values
  UDF_FORMAT_DATE    = 'udf_format_date',     // Data-cleaning: date/time format conversion
  BASIC_STATS = 'basic_stats',
  ORDER_DISTRIBUTION = 'order_distribution',  // Order distribution: time / amount / geo
  REPURCHASE_CYCLE = 'repurchase_cycle',  // User growth: repurchase cycle + churn risk
  ARBITRAGE_ANALYZE = 'arbitrage_analyze',  // Risk control: price arbitrage analysis
  INVENTORY_FORECAST = 'inventory_forecast',  // Inventory: batch multi-SKU demand forecasting
  MARKET_BASKET = 'market_basket',  // MBA: association rules mining (frequent co-purchase patterns)
  ABNORMAL_AMOUNT = 'abnormal_amount',  // Risk control: order amount anomaly detection
  RFM_PROFILE = 'rfm_profile',  // User growth: RFM customer segmentation via K-Means WASM
  ORDER_CHANNEL_ANALYSIS = 'order_channel_analysis',  // Operations: channel/source/platform ROI attribution
  ORDER_FUNNEL_ANALYSIS = 'order_funnel_analysis',    // Operations: full-chain order funnel conversion analysis
  FULFILLMENT_EFFICIENCY = 'fulfillment_efficiency',  // Operations: pay→ship→receive fulfillment time analysis
  NET_AMOUNT_CALC = 'net_amount_calc',  // Order accounting: net amount after refund/rejection
  PROFIT_MARGIN_CALC = 'profit_margin_calc',  // Order accounting: gross/net profit margin calculation
  PLATFORM_FEE_ALLOCATE = 'platform_fee_allocate',  // 平台佣金/服务费自动分摊
  ACTIVITY_EFFECT_SPLIT = 'activity_effect_split',  // 运营复盘：活动/优惠券/直播间效果拆分
  SUSPICIOUS_ORDER_DETECT = 'suspicious_order_detect',  // 风险风控：恶意订单/刷单/异常下单检测
  ZERO_NEGATIVE_ORDER_DETECT = 'zero_negative_order_detect',  // 风险风控：0元单/负金额单/优惠溢出检测
}

export enum LogicType {
  AND = 'AND',
  OR = 'OR',
}

export enum FieldType {
  INTEGER = 'INTEGER',
  BIGINT = 'BIGINT',
  SMALLINT = 'SMALLINT',
  TINYINT = 'TINYINT',
  DECIMAL = 'DECIMAL',
  NUMERIC = 'NUMERIC',
  REAL = 'REAL',
  DOUBLE = 'DOUBLE',
  VARCHAR = 'VARCHAR',
  TEXT = 'TEXT',
  CHAR = 'CHAR',
  TIMESTAMP = 'TIMESTAMP',
  DATE = 'DATE',
  TIME = 'TIME',
  BOOLEAN = 'BOOLEAN',
  BLOB = 'BLOB',
  JSON = 'JSON',
  UUID = 'UUID',
  ARRAY = 'ARRAY',
  UNKNOWN = 'UNKNOWN',
}

export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
}

// ============================================================================
// Base Types
// ============================================================================

export interface Position {
  x: number;
  y: number;
}

export interface Field {
  name: string;
  type: FieldType;
  nullable: boolean;
}

export interface TableSchema {
  tableName: string;
  fields: Field[];
}

// ============================================================================
// Node Data Types
// ============================================================================

export interface BaseNodeData extends Record<string, unknown> {
  label?: string;
  description?: string;
}

export interface DataSourceNodeData extends BaseNodeData {
  selectedTables?: string[];
}

/** @deprecated Use DataSourceNodeData instead */
export type StartNodeData = DataSourceNodeData;

export interface TableNodeData extends BaseNodeData {
  tableName: string;
  fields: Field[];
  expanded: boolean;
  alias: string;
}

export interface MergeNodeData extends BaseNodeData {
  tableCount: number;
  nextStep?: 'join' | 'select';
}

export interface OperatorNodeData extends BaseNodeData {
  operatorType?: OperatorType; // 'association' | 'anomaly' | 'clustering'
  /** Business kernel name selected from applied kernels */
  kernelName?: string;
}

export interface JoinCondition {
  leftField: string;
  rightField: string;
  leftTable: string;
  rightTable: string;
}

/**
 * A single condition row in the TableJoinBuildPanel.
 * `logic` is the AND/OR connector shown before this row (undefined for the first row).
 */
export interface JoinConditionRow {
  id: string;
  leftTable: string;
  leftField: string;
  operator: string;
  rightTable: string;
  rightField: string;
  logic?: 'AND' | 'OR';
}

/**
 * Data stored on a table→table join edge (type='join').
 */
export interface JoinEdgeData extends Record<string, unknown> {
  joinType: JoinType;
  sourceTableName: string;
  targetTableName: string;
  conditions: JoinConditionRow[];
  description?: string;
  /** Global creation order across all join edges in the canvas */
  order: number;
  /** Whether the user has explicitly saved this join configuration */
  configured: boolean;
}

export interface JoinNodeData extends BaseNodeData {
  joinType: JoinType;
  leftTable: string;
  rightTable: string;
  conditions: JoinCondition[];
  order: number;
}

export interface ConditionNodeData extends BaseNodeData {
  tableName: string;
  field: string;
  operator: string;
  value: string | number | null | string[];
  logicType: LogicType;
}

export interface ConditionGroupRelationNodeData extends BaseNodeData {
  logicType: LogicType;
  conditionIds: string[];
  customExpression?: string; // For CUSTOM type (Q14): e.g., "GC1 AND (GC2 OR GC3)"
  relationType?: 'AND' | 'OR' | 'CUSTOM'; // Extended logic type for relation node
  savedConditionIds?: string[]; // Backup of conditionIds when switching to CUSTOM mode
  savedLogicType?: LogicType; // Backup of logicType when switching to CUSTOM mode
  relationDisplayName?: string; // User-friendly display name for relation node, e.g., "关系_1" (template uses GC_1 placeholder)
}

/**
 * Condition item within a condition definition node
 * Represents a single condition line with placeholder
 */
/** Controls how % wildcards are applied when operator is LIKE / NOT LIKE */
export type LikeMode = 'both' | 'left' | 'right';

export interface ConditionItem {
  id: string;
  field: string;
  operator: string;
  placeholder: string; // e.g., "GC1_1", "GC1_2"
  valueType: FieldType;
  value?: string | number | null | string[]; // Actual value filled later
  /** Wildcard position for LIKE / NOT LIKE operators (default: 'both') */
  likeMode?: LikeMode;
}

/**
 * Condition Definition Node Data (条件组)
 * Represents a group of conditions with placeholders (GC_1, GC_2, etc.)
 * Used for deferred value filling
 */
export interface ConditionGroupDefinitionNodeData extends BaseNodeData {
  refId: string; // Internal ID for templates, e.g., "GC1", "GC2"
  groupDisplayName?: string; // User-friendly display name, e.g., "条件组_1" (template uses GC_1 placeholder)
  tableName: string;
  logicType: LogicType; // User-selectable AND/OR for joining conditions within this node
  conditions: ConditionItem[];
}

export interface SelectField {
  tableName: string;
  fieldName: string;
  alias?: string;
  aggregate?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';
}

export interface SelectNodeData extends BaseNodeData {
  fields: SelectField[];
  selectAll: boolean;
  /** Optional: set when this select node is linked to a UDF data-cleaning operator */
  udfFunctionName?: string;
  udfKernelName?: string;
  replacementRules?: ReplaceRule[];
  /** Selected output columns for udf_replace_spec_column_value; empty = show all */
  outputColumns?: string[];
  /** Config for udf_up_lower_str */
  upLowerConfig?: UpLowerConfig;
  /** Config for udf_format_number */
  formatNumberConfig?: FormatNumberConfig;
  /** Config for udf_flag_spec_column */
  flagSpecConfig?: FlagSpecConfig;
  /** Config for udf_format_date_time */
  formatDateConfig?: FormatDateConfig;
  /** Config for fn_basic_statis */
  basicStatsConfig?: BasicStatsConfig;
  /** Config for fn_ecom_order_distribution */
  orderDistConfig?: OrderDistributionConfig;
  /** Config for fn_ecom_repurchase_cycle */
  repurchaseCycleConfig?: RepurchaseCycleConfig;
  /** Config for fn_ecom_arbitrage_analyze */
  arbitrageAnalyzeConfig?: ArbitrageAnalyzeConfig;
  /** Config for fn_ecom_inventory_forecast */
  inventoryForecastConfig?: InventoryForecastConfig;
  /** Config for fn_ecom_market_basket */
  marketBasketConfig?: MarketBasketConfig;
  /** Config for fn_ecom_abnormal_amount */
  abnormalAmountConfig?: AbnormalAmountConfig;
  /** Config for fn_ecom_rfm_profile */
  rfmProfileConfig?: RfmProfileConfig;
  /** Config for fn_ecom_order_channel_analysis */
  orderChannelAnalysisConfig?: OrderChannelAnalysisConfig;
  /** Config for fn_ecom_order_funnel_analysis */
  orderFunnelAnalysisConfig?: OrderFunnelAnalysisConfig;
  /** Config for fn_ecom_fulfillment_efficiency */
  fulfillmentEfficiencyConfig?: FulfillmentEfficiencyConfig;
  /** Config for fn_ecom_order_net_amount_calc */
  netAmountCalcConfig?: NetAmountCalcConfig;
  /** Config for fn_ecom_order_profit_margin_calc */
  profitMarginCalcConfig?: ProfitMarginCalcConfig;
  platformFeeAllocateConfig?: PlatformFeeAllocateConfig;
  /** fn_ecom_activity_effect_split 配置 */
  activityEffectSplitConfig?: ActivityEffectSplitConfig;
  /** fn_ecom_suspicious_order_detect 配置 */
  suspiciousOrderDetectConfig?: SuspiciousOrderDetectConfig;
  /** fn_ecom_zero_negative_order_detect 配置 */
  zeroNegativeDetectConfig?: ZeroNegativeOrderDetectConfig;
}

export interface SelectAggNodeData extends BaseNodeData {
  fields: SelectField[];
  groupByFields: string[];
}

// ============================================================================
// BasicStats Types (fn_basic_statis)
// ============================================================================

/** Supported aggregate functions */
export type AggFunction = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

/** A single aggregation field: one column + one function */
export interface AggFieldConfig {
  id: string;
  column: string;
  func: AggFunction;
  /** Auto-derived alias: `${func.toLowerCase()}_${column}` */
  alias: string;
  distinct?: boolean;
}

/** A single HAVING-equivalent filter on an aggregated result */
export interface HavingFilter {
  id: string;
  /** Must match one of AggFieldConfig.alias */
  resultAlias: string;
  operator: '>' | '>=' | '<' | '<=';
  value: number;
}

/** A single ORDER BY entry */
export interface SortConfig {
  id: string;
  /** Can be a groupBy column name or an AggFieldConfig.alias */
  column: string;
  direction: 'ASC' | 'DESC';
}

/** Complete config stored on SelectNodeData for fn_basic_statis */
export interface BasicStatsConfig {
  tableName: string;
  aggFields: AggFieldConfig[];
  /** Columns to GROUP BY; chosen from data source excluding stat columns */
  groupByColumns: string[];
  /** Time granularity config for GROUP BY columns (only for time-type columns) */
  groupByGranularities?: {
    [columnName: string]: 'year' | 'quarter' | 'month' | 'week' | 'day';
  };
  /** Precision config for numeric aggregation results (SUM/AVG/MAX/MIN only) */
  columnPrecision?: {
    [columnName: string]: number;
  };
  /** Precision strategy (ROUND, TRUNCATE, etc.) for numeric aggregation columns */
  columnPrecisionStrategy?: {
    [columnName: string]: 'ROUND' | 'TRUNCATE';
  };
  /** Result filters (HAVING equivalent) */
  havingFilters: HavingFilter[];
  /** ORDER BY entries */
  sortConfigs: SortConfig[];
}

// ============================================================================
// OrderDistribution types
// ============================================================================

/** Sub-type selector for the order distribution operator */
export type OrderDistSubType = 'time_dist' | 'amount_dist' | 'geo_dist';

/** Comparison type for 同比/环比 */
export type ComparisonType = 'yoy' | 'mom'; // year-over-year | month-over-month

/** Time granularity for time distribution */
export type TimeGranularity = 'day' | 'week' | 'month';

/** A single amount bucket definition */
export interface AmountBucket {
  /** Minimum value (inclusive) */
  min: number | null; // null means -Infinity (open lower bound)
  /** Maximum value (exclusive) */
  max: number | null; // null means +Infinity (open upper bound)
  /** Display label */
  label: string;
}

/** Config for time trend distribution sub-type */
export interface TimeDistConfig {
  orderTimeColumn: string;
  orderAmountColumn: string;
  granularity: TimeGranularity;
  currentStart: string; // ISO date string
  currentEnd: string;
  enableComparison: boolean;
  comparisonType?: ComparisonType;
  // comparison period is auto-computed; user may override
  comparisonStart?: string;
  comparisonEnd?: string;
}

/** Config for amount range distribution sub-type */
export interface AmountDistConfig {
  orderAmountColumn: string;
  orderTimeColumn: string; // needed for time-scoped comparison
  buckets: AmountBucket[];
  currentStart: string;
  currentEnd: string;
  enableComparison: boolean;
  comparisonType?: ComparisonType;
  comparisonStart?: string;
  comparisonEnd?: string;
}

/** Config for geographic distribution sub-type */
export interface GeoDistConfig {
  geoColumn: string;     // user-selected geographic column
  orderAmountColumn: string;
  orderTimeColumn: string;
  currentStart: string;
  currentEnd: string;
  enableComparison: boolean;
  comparisonType?: ComparisonType;
  comparisonStart?: string;
  comparisonEnd?: string;
}

/** Top-level config stored on SelectNode for fn_ecom_order_distribution */
export interface OrderDistributionConfig {
  subType: OrderDistSubType;
  timeDist?: TimeDistConfig;
  amountDist?: AmountDistConfig;
  geoDist?: GeoDistConfig;
}

// ============================================================================
// RepurchaseCycle types  (fn_ecom_repurchase_cycle)
// ============================================================================

/** Output mode: detail churn-warning table or category-level summary table */
export type RepurchaseCycleOutputMode = 'detail' | 'summary';

/** Reference date mode for "today" baseline */
export type RepurchaseCycleRefDateMode = 'max_order_date' | 'custom';

/** Risk level thresholds (user-configurable) */
export interface RepurchaseCycleThresholds {
  /** ratio < stable = "稳定" (default 0.8) */
  stable: number;
  /** ratio < watch = "关注" (default 1.2) */
  watch: number;
  /** ratio < warning = "预警" (default 2.0); above = "已流失" */
  warning: number;
}

/** Top-level config stored on SelectNode for fn_ecom_repurchase_cycle */
export interface RepurchaseCycleConfig {
  /** User ID column name (selected by user) */
  userIdCol: string;
  /** Order time column name (selected by user) */
  orderTimeCol: string;
  /** Category column name (selected by user) */
  categoryCol: string;
  /** Which output mode to generate */
  outputMode: RepurchaseCycleOutputMode;
  /** Reference date mode */
  refDateMode: RepurchaseCycleRefDateMode;
  /** Custom reference date (ISO string, only used when refDateMode = 'custom') */
  customRefDate?: string;
  /** Risk level thresholds */
  thresholds: RepurchaseCycleThresholds;
  /** Detail mode: risk levels to include in output (empty = all) */
  detailRiskFilter: string[];
  /** Summary mode: only show users with order_count >= 2 */
  summaryValidOnly: boolean;
}

// ============================================================================
// ArbitrageAnalyze types (fn_ecom_arbitrage_analyze)
// ============================================================================

/** Manual field mapping for the 4 mandatory core fields */
export interface ArbitrageFieldMapping {
  /** Column mapped to order_id */
  orderIdCol: string;
  /** Column mapped to amount (挂牌原价) */
  amountCol: string;
  /** Column mapped to cost (成本) */
  costCol: string;
  /** Column mapped to coupon_amount (优惠券抵扣) */
  couponAmountCol: string;
}

/** Auto-matched optional field columns (system-detected, not user-operated) */
export interface ArbitrageAutoFieldMapping {
  skuIdCol?: string;
  categoryIdCol?: string;
  orderTimeCol?: string;
  userIdCol?: string;
  deviceIdCol?: string;
  receiverAddrCol?: string;
  activityIdCol?: string;
  activityTypeCol?: string;
  activityStartCol?: string;
  activityEndCol?: string;
}

/** Risk rule threshold values (all configurable, no hardcoded constants allowed) */
export interface ArbitrageThresholds {
  /** Gross margin rate below this = low margin (default 0.05) */
  lowMarginRate: number;
  /** Discount rate below this in non-promotion = extreme discount (default 0.6) */
  extremeDiscountRate: number;
  /** Product price deviation below -this = severe deviation (default 0.3) */
  productDeviationRate: number;
  /** Category price deviation below -this = severe deviation (default 0.4) */
  categoryDeviationRate: number;
  /** actual_payment < cost * this triggers coupon anomaly (default 0.9) */
  couponCostRatio: number;
  /** Non-promotion discount rate below this + coupon triggers coupon anomaly (default 0.5) */
  couponDiscountRate: number;
}

/** Arbitrage detection configuration */
export interface ArbitrageDetectionConfig {
  /**
   * Method to calculate historical baseline for hourly spike detection.
   * - 'batch_avg': Batch-wide per-SKU average hourly order count (default, simpler)
   * - 'same_hour_avg': Average order count for the same hour of day across all dates
   */
  hourlySpikeMethod: 'batch_avg' | 'same_hour_avg';
  /** Orders in 1h exceeding baseline * this multiplier = spike (default 3) */
  hourlySpikeMult: number;
  /** Single user single-day same-SKU orders exceeding this = suspicious (default 5) */
  purchaseLimit: number;
  /** Address prefix truncation length for clustering (default 15) */
  addressPrefixLength: number;
  /** Different users with same address prefix ordering same SKU in 2h (default 5) */
  addressClusterThreshold: number;
  /** Different accounts from same device ordering same SKU in 2h (default 3) */
  deviceAccountThreshold: number;
}

/** Per-category rule enable/disable toggles */
export interface ArbitrageRuleToggles {
  marginRules: boolean;
  discountRules: boolean;
  priceDeviationRules: boolean;
  couponAnomalyRules: boolean;
  arbitrageRules: boolean;
  /** When true, clearance orders skip all margin rules (default false) */
  clearanceMarginExempt: boolean;
}

/** Top-level config stored on SelectNode for fn_ecom_arbitrage_analyze */
export interface ArbitrageAnalyzeConfig {
  /** Manually mapped core fields (user-selected) */
  fieldMapping: ArbitrageFieldMapping;
  /** Auto-matched optional fields (system-detected) */
  autoFieldMapping?: ArbitrageAutoFieldMapping;
  /** Risk rule thresholds */
  thresholds: ArbitrageThresholds;
  /** Arbitrage detection parameters */
  arbitrage: ArbitrageDetectionConfig;
  /** Rule on/off toggles */
  ruleToggles: ArbitrageRuleToggles;
  /**
   * Output columns to include in the result. Defaults to all 11 columns
   * defined in design/fn_ecom_arbitrage_analyze.md §2.5.
   */
  selectedOutputColumns?: string[];
}



/**
 * Config for fn_ecom_inventory_forecast — batch multi-SKU inventory demand forecasting.
 *
 * The strategy will:
 *   1. GROUP BY skuCol + date_trunc(granularity, timeCol), SUM(demandCol) in DuckDB
 *   2. Pass the aggregated Arrow IPC data to predict_inventory_demand_batch()
 *   3. Return TOP5 InsightItems (by SUM prediction) + full detail table
 */
export interface InventoryForecastConfig {
  /** Column used as the SKU / product identifier */
  skuCol: string;
  /** Date/time column used for time-series ordering and aggregation */
  timeCol: string;
  /** Numeric column representing historical demand quantity (will be SUMmed per period) */
  demandCol: string;
  /** Time granularity for aggregation — determines the meaning of predictSteps */
  granularity: 'day' | 'week' | 'month';
  /**
   * Number of future time steps to forecast.
   * Ranges: day → 1-30, week → 1-12, month → 1-24.
   */
  predictSteps: number;
  /**
   * Forecasting algorithm mode.
   * 'seasonal_7' is ONLY valid when granularity === 'day' (period hardcoded to 7).
   */
  predictionMode:
    | 'linear'
    | 'polynomial_2'
    | 'polynomial_3'
    | 'seasonal_7'
    | 'ensemble';
  /**
   * Trend sensitivity threshold (0–1, default 0.08 = 8%).
   * If second-half avg demand exceeds first-half by > threshold → rising.
   * If it drops by > threshold → declining.
   */
  trendThreshold?: number;
}

/**
 * Config for fn_ecom_market_basket — Market Basket Analysis (关联销售建议).
 *
 * Phase-1: DuckDB SQL self-join computes 2-item association rules.
 * Phase-2: postProcess calls find_association_patterns() Wasm for k-itemsets.
 *
 * min_support is stored as a ratio (0.01 = 1%). The Phase-1 SQL converts it
 * to an absolute order count internally. The Phase-2 Wasm call uses
 * Math.round(totalOrders * minSupport) at runtime.
 *
 * Best practice (Phase-2): start with Math.round(totalOrders * 0.01);
 * double if > 500 patterns returned, halve if < 10 patterns returned.
 */
export interface MarketBasketConfig {
  /** Column used as the order / transaction identifier */
  orderIdCol: string;
  /** Column used as the product / SKU identifier */
  productIdCol: string;
  /**
   * Minimum support threshold as a ratio (0.005–0.05, default 0.01 = 1%).
   * Converted to absolute count = Math.round(totalOrders * minSupport) before Wasm.
   */
  minSupport: number;
  /** Minimum confidence threshold (0.1–0.8, default 0.30 = 30%). */
  minConfidence: number;
  /** Minimum lift threshold (default 1.2 — values > 1 indicate positive association). */
  minLift: number;
  /**
   * Maximum items per order. Orders exceeding this are excluded (B2B bulk order isolation).
   * Default 50. Prevents cartesian explosion in the self-join.
   */
  maxItemsPerOrder: number;
  /** Maximum number of association rules to return (default 500). */
  topN: number;
  /** Maximum number of insight cards to display (default 5, range 1–10). */
  topInsights?: number;
  /**
   * When true, enables FP-Growth Wasm path (k-itemsets, supports 3-item combos).
   * Default false — uses faster DuckDB SQL self-join for 2-item rules only.
   * Recommended only when data has < 50k orders (analysis time increases).
   */
  enableTriples?: boolean;
}

// ============================================================================
// AbnormalAmount types (fn_ecom_abnormal_amount)
// ============================================================================

/**
 * Field mapping for fn_ecom_abnormal_amount.
 * Required fields must be set before execution; optional fields add extra detection dimensions.
 */
export interface AbnormalAmountFieldMapping {
  /** Required: order identifier column */
  orderIdCol: string;
  /** Required: actual payment amount column */
  amountCol: string;
  /** Required: original / list price column (needed for discount_rate feature) */
  originalAmountCol: string;
  /** Optional: order timestamp column — enables daily amount percentile rank feature */
  orderTimeCol?: string;
  /** Optional: user identifier column — enables user daily order count feature (requires orderTimeCol) */
  userIdCol?: string;
  /** Optional: SKU / product identifier column — reserved for future feature dimensions */
  skuIdCol?: string;
  /** Optional: category identifier column — reserved for future feature dimensions */
  categoryIdCol?: string;
}

/**
 * Risk level thresholds — user-adjustable via Drawer sliders.
 * Scores are from the isolation forest algorithm [0, 1].
 */
export interface AbnormalAmountRiskThresholds {
  /** score >= high → risk_level = '高' (default: 0.9) */
  high: number;
  /** score >= medium && < high → risk_level = '中' (default: 0.7) */
  medium: number;
}

/**
 * Top-level config stored on SelectNodeData for fn_ecom_abnormal_amount.
 */
export interface AbnormalAmountConfig {
  fieldMapping: AbnormalAmountFieldMapping;
  /** Isolation forest anomaly detection threshold [0, 1]. Default: 0.8 */
  anomalyThreshold: number;
  /** Feature scaling mode: 0=None, 1=MinMax, 2=Standard. Default: 2 */
  scalingMode: 0 | 1 | 2;
  /** Risk level thresholds (user-adjustable) */
  riskThresholds: AbnormalAmountRiskThresholds;
  /** Sampling rate [0.25, 1.0] applied when row count > samplingThreshold. Default: 0.75 */
  samplingRate: number;
  /** Row count threshold that triggers sampling. Default: 50000 */
  samplingThreshold: number;
  /** GPU acceleration strategy. Default: 'auto' */
  useGPU: 'auto' | 'force' | 'disable';
}

// ============================================================================
// RFM Profile Types (fn_ecom_rfm_profile)
// ============================================================================

/**
 * Config stored on SelectNodeData for fn_ecom_rfm_profile.
 * DuckDB computes R/F/M per user; WASM K-Means assigns cluster labels.
 */
export interface RfmProfileConfig {
  /** Column name identifying the customer/user (used as Arrow IPC id column) */
  userIdColumn: string;
  /** Column name for order timestamp — used to compute recency via DATEDIFF */
  orderTimeColumn: string;
  /** Column name for order amount — used to compute monetary via SUM */
  amountColumn: string;
  /** Number of K-Means clusters. Range: 2–10. Default: 5 */
  nClusters: number;
  /** WASM scaling mode: 0=None, 1=MinMax, 2=Standard (recommended). Default: 2 */
  scalingMode: 0 | 1 | 2;
}

/** Primary dimension to aggregate by in fn_ecom_order_channel_analysis */
export type ChannelDimension = 'channel' | 'source' | 'platform' | 'live_room';

/** How to calculate refund rate */
export type RefundRateMode = 'count' | 'amount';

/**
 * Config stored on SelectNodeData for fn_ecom_order_channel_analysis.
 * Groups orders by a single chosen dimension and computes per-channel KPIs.
 */
export interface OrderChannelAnalysisConfig {
  /** Primary grouping dimension type (displayed label in drawer) */
  dimension: ChannelDimension;
  /** Actual column name in user data for the selected dimension */
  dimensionCol: string;
  /** Order ID column — used for COUNT DISTINCT */
  orderIdCol: string;
  /** Net sales amount column */
  netAmountCol: string;
  /** Gross profit column */
  grossProfitCol: string;
  /**
   * Refund rate calculation mode:
   *   'count'  → SUM(is_refund=1) / COUNT(order_id)  (default)
   *   'amount' → SUM(refund_amount) / SUM(net_amount)
   */
  refundRateMode: RefundRateMode;
  /** Column for 0/1 refund flag — required when refundRateMode = 'count' */
  isRefundCol?: string;
  /** Column for refund amount — required when refundRateMode = 'amount' */
  refundAmountCol?: string;
  /**
   * ROI health baseline (0–1). Channels above this threshold are flagged as "high quality".
   * Default: 0.3 (30%).
   */
  roiThreshold?: number;
  /**
   * Number of top channels (by total_amount) to surface as insight cards.
   * Default: 3.
   */
  topN?: number;
}

// ============================================================================
// OrderFunnelAnalysis Types (fn_ecom_order_funnel_analysis)
// ============================================================================

/**
 * Identifies each step key in the order funnel.
 * 'order' is the locked anchor step; others are user-toggleable.
 */
export type FunnelStepKey =
  | 'order'       // 下单 (locked, always ON)
  | 'pay'         // 支付
  | 'confirm'     // 审核/确认
  | 'ship'        // 发货
  | 'receive'     // 签收
  | 'review'      // 评价
  | 'repurchase'; // 复购 (requires userIdCol)

/** Config for a single funnel step — stores the column binding and toggle state */
export interface FunnelStepConfig {
  /** Whether this step is included in the funnel (always true for 'order') */
  enabled: boolean;
  /** Actual column name in user data representing the timestamp/signal for this step */
  colName: string;
}

/**
 * Config stored on SelectNodeData for fn_ecom_order_funnel_analysis.
 * Builds a dynamic order-to-repurchase conversion funnel.
 */
export interface OrderFunnelAnalysisConfig {
  /** Order ID column (COUNT DISTINCT for unique order count) */
  orderIdCol: string;
  /** Per-step toggle + column binding */
  steps: Record<FunnelStepKey, FunnelStepConfig>;
  /**
   * User ID column — required only when the 'repurchase' step is enabled.
   * Repurchase = users who placed ≥2 orders.
   */
  userIdCol?: string;
  /**
   * Column name containing order status values.
   * When provided, the strategy uses this column in the exclusion WHERE clause.
   * Falls back to 'order_status' if omitted.
   */
  orderStatusCol?: string;
  /**
   * Comma-separated order_status values to exclude from analysis
   * (e.g. "cancelled,closed"). Empty string = no filter.
   */
  excludeStatuses?: string;
}

// ============================================================================
// FulfillmentEfficiency Types (fn_ecom_fulfillment_efficiency)
// ============================================================================

/**
 * Config stored on SelectNodeData for fn_ecom_fulfillment_efficiency.
 * Analyses the full-chain fulfillment time from pay → ship → receive,
 * grouped by region and carrier, with configurable on-time thresholds.
 */
export interface FulfillmentEfficiencyConfig {
  /** Source table name */
  tableName: string;
  /** Column name for payment timestamp */
  payTimeColumn: string;
  /** Column name for shipping/dispatch timestamp */
  shipTimeColumn: string;
  /** Column name for receive/delivery timestamp */
  receiveTimeColumn: string;
  /** Column name for region/area grouping */
  regionColumn: string;
  /** Column name for carrier/logistics provider grouping */
  carrierColumn: string;
  /** Max hours from pay to ship considered on-time (default 24) */
  payToShipThreshold: number;
  /** Max hours from ship to receive considered on-time (default 48) */
  shipToReceiveThreshold: number;
  /** Max hours from pay to receive considered on-time overall (default 72) */
  onTimeThreshold: number;
}

// ============================================================================
// NetAmountCalc Types (fn_ecom_order_net_amount_calc)
// ============================================================================

/**
 * A single formula slot: operator (+/-) and column name.
 * Used in the structured formula builder for net amount calculation.
 */
export interface FormulaSlot {
  operator: '+' | '-';
  column: string;
}

/**
 * Config stored on SelectNodeData for fn_ecom_order_net_amount_calc.
 * Row-level atomic calculation: net_amount = pay_amount - refund_amount - rejection_amount.
 * When order_status is in excludedStatuses, net_amount is forced to 0.
 */
export interface NetAmountCalcConfig {
  fieldMapping: {
    /** Required: actual payment amount column */
    payAmountCol: string;
    /** Required: refund amount column */
    refundAmountCol: string;
    /** Required: rejection amount column */
    rejectionAmountCol: string;
    /** Required: order status column */
    orderStatusCol: string;
    /** Optional: order ID column for downstream grouping */
    orderIdCol?: string;
    /** Optional: user ID column for downstream grouping */
    userIdCol?: string;
    /** Optional: SKU ID column for downstream grouping */
    skuIdCol?: string;
    /** Optional: order time column for downstream grouping */
    orderTimeCol?: string;
  };
  /** Structured formula: 3 slots with operator */
  formulaSlots: {
    slot1: FormulaSlot;
    slot2: FormulaSlot;
    slot3: FormulaSlot;
  };
  /** Comma-separated excluded statuses, default 'CANCELLED' */
  excludedStatuses: string;
}

/**
 * Config stored on SelectNodeData for fn_ecom_order_profit_margin_calc.
 * Row-level atomic calculation:
 *   profit = net_amount ± cost ± shipping_fee ± platform_fee ± service_fee
 *   profit_margin = profit / net_amount (with zero-division protection)
 * Risk classification: high_risk / warning / healthy based on warningThresholdPct
 */
export interface ProfitMarginCalcConfig {
  fieldMapping: {
    /** Required: net amount column */
    netAmountCol: string;
    /** Required: product cost column */
    costCol: string;
    /** Optional: shipping fee column (default 0 if not mapped) */
    shippingFeeCol?: string;
    /** Optional: platform fee/commission column */
    platformFeeCol?: string;
    /** Optional: service fee column */
    serviceFeeCol?: string;
    /** Optional: order ID column for downstream grouping */
    orderIdCol?: string;
    /** Optional: user ID column for downstream grouping */
    userIdCol?: string;
    /** Optional: SKU ID column for downstream grouping */
    skuIdCol?: string;
    /** Optional: order time column for downstream grouping */
    orderTimeCol?: string;
    /** Optional: category column for downstream grouping */
    categoryCol?: string;
    /** Optional: channel column for downstream grouping */
    channelCol?: string;
  };
  /** 5 structured formula slots with operator (+/-) */
  formulaSlots: {
    slot1: FormulaSlot;
    slot2: FormulaSlot;
    slot3: FormulaSlot;
    slot4: FormulaSlot;
    slot5: FormulaSlot;
  };
  /** Warning threshold percentage (0-100, default 5, step 0.5) */
  warningThresholdPct: number;
}

export type FeeAllocateMode = 'amount' | 'quantity' | 'even';

/**
 * Config stored on SelectNodeData for fn_ecom_platform_fee_allocate.
 * Order-level fee allocation: fee (deduped per order) apportioned to detail rows
 * by even / amount-ratio / quantity-ratio; rounding residual lands on the
 * max-amount row so that SUM(allocated_fee) == order fee per order.
 */
export interface PlatformFeeAllocateConfig {
  mode: FeeAllocateMode;                     // default 'amount'
  fieldMapping: {
    orderIdCol: string;
    amountCol: string;
    quantityCol?: string;                    // mode='quantity' 时必填
  };
  feeSlots: { slot1: FormulaSlot; slot2: FormulaSlot; slot3: FormulaSlot; slot4: FormulaSlot };
  deductSlots: { slot1: FormulaSlot; slot2: FormulaSlot };
}

/** 默认配置 — 计划 11 §0.1：slot1 锚定 +平台佣金、slot2 +广告费，slot3/4 与扣减槽留空 */
export const DEFAULT_FEE_ALLOCATE_CONFIG: PlatformFeeAllocateConfig = {
  mode: 'amount',
  fieldMapping: { orderIdCol: '', amountCol: '', quantityCol: '' },
  feeSlots: {
    slot1: { operator: '+', column: 'platform_fee' },
    slot2: { operator: '+', column: 'ad_fee' },
    slot3: { operator: '+', column: '' },
    slot4: { operator: '+', column: '' },
  },
  deductSlots: {
    slot1: { operator: '-', column: '' },
    slot2: { operator: '-', column: '' },
  },
};

/** 拆分维度（决策 #1 / #3） */
export type ActivitySplitDimension = 'activity' | 'coupon' | 'live_room' | 'activity_type';
/** 拉动金额口径（决策 #5 / #6 / #8） */
export type ActivityLiftCaliber = 'activity_gmv' | 'product_amount' | 'baseline_delta' | 'custom_slots';
/** 补贴成本口径（决策 #7 / #8） */
export type ActivityCostCaliber = 'slot_sum' | 'single_column';

export interface ActivityEffectSplitConfig {
  dimensions: ActivitySplitDimension[];
  fieldMapping: ActivityEffectSplitFieldMapping;
  /** 决策 #5 / #6：`baseline_delta` 即「开启基线对比」的唯一真值（不另设布尔开关字段） */
  liftCaliber: ActivityLiftCaliber;
  costCaliber: ActivityCostCaliber;
  liftSlots: FormulaSlot[];
  costSlots: FormulaSlot[];
  costSingleColumn: string;
  excludedStatuses: string;
  topN: number;
}

export interface ActivityEffectSplitFieldMapping {
  activityIdCol: string;          // 维度「活动」列（维度分组键）
  activityNameCol?: string;       // 维度「活动」展示名；映射后 dimension_label = COALESCE(名称, 活动列)
  activityTypeCol?: string;       // 维度「活动类型」列
  couponIdCol?: string;           // 维度「优惠券」列
  couponAmountCol?: string;       // 优惠金额列：coupon_order_ratio 的判定依据（决策 #4）
  liveRoomIdCol?: string;         // 维度「直播间」列
  netAmountCol: string;           // 必填：订单实付金额（默认 lift 口径）
  productAmountCol?: string;      // lift 口径 = 商品实付金额
  payTimeCol?: string;            // 基线口径必填
  activityStartCol?: string;      // 基线口径必填
  activityEndCol?: string;        // 基线口径必填
  couponStatusCol?: string;       // 核销率（决策 #9）
  orderStatusCol?: string;        // 排除法过滤（决策 #11）
  orderIdCol?: string;            // 订单量去重；缺省用 COUNT(*)
  userIdCol?: string;             // 核销率去重键、券覆盖占比
  quantityCol?: string;           // 销量
}

export const DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG: ActivityEffectSplitConfig = {
  dimensions: ['activity', 'coupon', 'live_room'],   // #1 / #3：activity_type 默认关闭
  fieldMapping: { activityIdCol: '', activityNameCol: '', couponAmountCol: '', netAmountCol: '' },
  liftCaliber: 'activity_gmv',                       // #5
  costCaliber: 'slot_sum',                           // #7
  liftSlots: [{ operator: '+', column: '' }],
  costSlots: [
    { operator: '+', column: 'coupon_amount' },
    { operator: '+', column: 'discount_amount' },
    { operator: '+', column: 'platform_subsidy' },
    { operator: '+', column: 'ad_cost' },
  ],
  costSingleColumn: '',
  excludedStatuses: 'CANCELLED,CLOSED',              // #11
  topN: 3,                                           // #14
};

/**
 * 逐字段深拷贝：默认常量为模块级单例，抽屉与策略均不得共享其嵌套引用。
 * 不使用 `structuredClone`，纯 TS 显式克隆，jsdom 环境下同样可测。
 */
export function cloneActivityEffectSplitConfig(cfg: ActivityEffectSplitConfig): ActivityEffectSplitConfig {
  return {
    ...cfg,
    dimensions: [...cfg.dimensions],
    fieldMapping: { ...cfg.fieldMapping },
    liftSlots: cfg.liftSlots.map((s) => ({ ...s })),
    costSlots: cfg.costSlots.map((s) => ({ ...s })),
  };
}

/** 维度中文化标签：Phase 1 校验文案 / Phase 3 抽屉门禁共用，禁止各写一份 */
export const ACTIVITY_DIMENSION_LABEL: Record<ActivitySplitDimension, string> = {
  activity: '活动',
  coupon: '优惠券',
  live_room: '直播间',
  activity_type: '活动类型',
};

/** 维度 → 必填列键：Phase 1 校验 / Phase 2 isUdfConfigured / Phase 3 抽屉门禁共用同一映射，禁止各写一份 */
export const DIMENSION_COLUMN_KEY: Record<ActivitySplitDimension, keyof ActivityEffectSplitFieldMapping> = {
  activity: 'activityIdCol',
  coupon: 'couponIdCol',
  live_room: 'liveRoomIdCol',
  activity_type: 'activityTypeCol',
};

/** 「已映射」唯一判据：'' 与 undefined 语义等价 */
export function hasColumnValue(col?: string): boolean {
  return !!col && col.trim() !== '';
}

/** 所选维度中尚未映射列的维度列表；空数组 = 维度门禁通过（dimensions 为空时由调用方单独判定） */
export function missingDimensionColumns(cfg?: ActivityEffectSplitConfig): ActivitySplitDimension[] {
  return (cfg?.dimensions ?? []).filter((d) => !hasColumnValue(cfg?.fieldMapping?.[DIMENSION_COLUMN_KEY[d]]));
}

/**
 * 活动效果拆分的阻断原因（规则 1–4 + 两条口径补充规则）。
 * 消息即业务化中文文案，三处复用（策略校验 / `isUdfConfigured` / 抽屉确认门禁），禁止各写一份判定。
 */
export interface ActivitySplitBlocker {
  code:
    | 'no-dimension'
    | 'missing-dimension-column'
    | 'no-net-amount'
    | 'baseline-time-missing'
    | 'top-n-out-of-range'
    | 'product-amount-missing'
    | 'single-column-missing';
  message: string;
}

/**
 * 唯一阻断判据（Phase 1 校验规则 1–4 + 两条补充规则）：
 * `validateOperatorSpecific` 逐条转成 ERROR，`isUdfConfigured` 与抽屉门禁取 `length === 0`。
 * 非阻断提示（空成本槽 / 空拉动槽）不属于阻断原因，由策略侧以 WARNING 单独返回。
 */
export function collectActivitySplitBlockers(cfg?: ActivityEffectSplitConfig): ActivitySplitBlocker[] {
  // 从未保存过抽屉时按默认配置判定（与策略校验同源）
  const c = cfg ?? DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG;
  const blockers: ActivitySplitBlocker[] = [];

  if (c.dimensions.length === 0) {
    blockers.push({ code: 'no-dimension', message: '请至少选择一个拆分维度（活动 / 优惠券 / 直播间 / 活动类型）' });
  }
  for (const dim of missingDimensionColumns(c)) {
    blockers.push({
      code: 'missing-dimension-column',
      message: `${ACTIVITY_DIMENSION_LABEL[dim]}维度尚未指定数据列`,
    });
  }
  if (!hasColumnValue(c.fieldMapping.netAmountCol)) {
    blockers.push({ code: 'no-net-amount', message: '请指定订单实付金额列' });
  }
  if (
    c.liftCaliber === 'baseline_delta' &&
    !(hasColumnValue(c.fieldMapping.payTimeCol) &&
      hasColumnValue(c.fieldMapping.activityStartCol) &&
      hasColumnValue(c.fieldMapping.activityEndCol))
  ) {
    blockers.push({ code: 'baseline-time-missing', message: '基线对比需要订单支付时间与活动起止时间' });
  }
  if (!Number.isFinite(c.topN) || c.topN < 1 || c.topN > 10) {
    blockers.push({ code: 'top-n-out-of-range', message: '洞察数量需在 1–10 之间' });
  }
  if (c.liftCaliber === 'product_amount' && !hasColumnValue(c.fieldMapping.productAmountCol)) {
    blockers.push({ code: 'product-amount-missing', message: '商品实付金额口径需要指定商品金额列' });
  }
  if (c.costCaliber === 'single_column' && !hasColumnValue(c.costSingleColumn)) {
    blockers.push({ code: 'single-column-missing', message: '单列成本口径需要指定成本列' });
  }
  return blockers;
}

// ============================================================================
// fn_ecom_suspicious_order_detect — 恶意订单/刷单/异常下单检测（feature 15）
// 契约层：类型 / 默认值 / 阻断判据 / 生效规则判据，策略、抽屉、SelectNode 三处同源
// ============================================================================

/** 8 条风险规则键（顺序 = 打分与文案顺序，禁止随意调换：SQL 分值数组与校准表依赖它） */
export type SuspiciousOrderRuleKey =
  | 'burstOrders' | 'addressCluster' | 'mobileCluster' | 'deviceCluster'
  | 'newAccounts'  | 'priceAnomaly'  | 'amountDeviation' | 'refundAnomaly';

/** 规则键全集（单一事实源，遍历顺序 = 此顺序） */
export const SUSPICIOUS_ORDER_RULE_KEYS: SuspiciousOrderRuleKey[] = [
  'burstOrders', 'addressCluster', 'mobileCluster', 'deviceCluster',
  'newAccounts', 'priceAnomaly', 'amountDeviation', 'refundAnomaly',
];

export interface SuspiciousOrderDetectFieldMapping {
  userIdCol: string;            // 必填：风控主体
  orderTimeCol: string;         // 必填：下单时间
  addressCol?: string;          // R2 收货地址
  mobileCol?: string;           // R3 收货手机
  deviceCol?: string;           // R4 设备号
  amountCol?: string;           // R6/R7 订单实付金额
  originalAmountCol?: string;   // R6 原价/吊牌价
  orderIdCol?: string;          // 订单号明细列（D2 方案 C）
  orderStatusCol?: string;      // R8 订单状态
  registerTimeCol?: string;     // R5 注册时间（三级链第 1 级）
  firstOrderTimeCol?: string;   // R5 首次下单时间（三级链第 2 级）
}

export interface SuspiciousOrderDetectThresholds {
  burstOrderCount: number;          // 10
  addrClusterUsers: number;         // 3
  mobileClusterUsers: number;       // 3
  deviceClusterUsers: number;       // 3
  newAccountMaxAgeDays: number;     // 7
  newAccountMinOrders: number;      // 3
  priceAnomalyMaxRatio: number;     // 0.3
  priceAnomalyMinOrders: number;    // 2
  amountDeviationMultiple: number;  // 3
  amountDeviationMinOrders: number; // 2
  refundMinOrders: number;          // 2
  refundRatePercent: number;        // 30（百分比）
  addressPrefixLength: number;      // 15（D12 归一化口径，与 arbitrage LEFT(addr,15) 同源）
}

export interface SuspiciousOrderDetectWindows {
  burstWindowMinutes: number;    // 60  （D11 突发窗口）
  clusterWindowMinutes: number;  // 120 （D11 聚集窗口）
  observationDays: number;       // 0 = 全部数据（D11 观察区间）
}

export interface SuspiciousOrderDetectRuleToggles {
  burstOrders: boolean;      // 核心·默认 true
  addressCluster: boolean;   // 核心·true
  mobileCluster: boolean;    // 核心·true
  deviceCluster: boolean;    // 核心·true
  newAccounts: boolean;      // 核心·true
  priceAnomaly: boolean;     // 增强·默认 false
  amountDeviation: boolean;  // 增强·false
  refundAnomaly: boolean;    // 增强·false
}

export type SuspiciousOrderDetectWeights = Record<SuspiciousOrderRuleKey, number>;

export interface SuspiciousOrderDetectTiers {
  severeScore: number; // 80
  highScore: number;   // 60
  midScore: number;    // 40
}

export interface SuspiciousOrderDetectConfig {
  fieldMapping: SuspiciousOrderDetectFieldMapping;
  thresholds: SuspiciousOrderDetectThresholds;
  windows: SuspiciousOrderDetectWindows;
  ruleToggles: SuspiciousOrderDetectRuleToggles;
  weights: SuspiciousOrderDetectWeights;
  tiers: SuspiciousOrderDetectTiers;
  /** R8 判定为退款/取消的订单状态值（逗号分隔、`UPPER(TRIM())` 后逐项比对，大小写不敏感） */
  refundStatusValues: string;
  /** 洞察卡片列出的风险主体数，1–10，默认 5 */
  topN: number;
}

/** 默认权重合计 100（D10 校准表基准：5 项共振即 80 分入「严重」） */
export const DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS: SuspiciousOrderDetectWeights = {
  burstOrders: 20, addressCluster: 20, mobileCluster: 15, deviceCluster: 15,
  newAccounts: 10, priceAnomaly: 10, amountDeviation: 5, refundAnomaly: 5,
};

/** 默认配置：核心 5 项开启、增强 3 项关闭（D16「零配置即得到宣称能力」） */
export const DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG: SuspiciousOrderDetectConfig = {
  fieldMapping: {
    userIdCol: '', orderTimeCol: '', addressCol: '', mobileCol: '', deviceCol: '',
    amountCol: '', originalAmountCol: '', orderIdCol: '', orderStatusCol: '',
    registerTimeCol: '', firstOrderTimeCol: '',
  },
  thresholds: {
    burstOrderCount: 10, addrClusterUsers: 3, mobileClusterUsers: 3, deviceClusterUsers: 3,
    newAccountMaxAgeDays: 7, newAccountMinOrders: 3, priceAnomalyMaxRatio: 0.3,
    priceAnomalyMinOrders: 2, amountDeviationMultiple: 3, amountDeviationMinOrders: 2,
    refundMinOrders: 2, refundRatePercent: 30, addressPrefixLength: 15,
  },
  windows: { burstWindowMinutes: 60, clusterWindowMinutes: 120, observationDays: 0 },
  ruleToggles: {
    burstOrders: true, addressCluster: true, mobileCluster: true, deviceCluster: true,
    newAccounts: true, priceAnomaly: false, amountDeviation: false, refundAnomaly: false,
  },
  weights: { ...DEFAULT_SUSPICIOUS_ORDER_DETECT_WEIGHTS },
  tiers: { severeScore: 80, highScore: 60, midScore: 40 },
  refundStatusValues: 'REFUNDED,RETURNED,CANCELLED,已退款,退款成功,已退货,已取消,交易关闭,退货退款',
  topN: 5,
};

/** 规则中文标签：`risk_type` 数组、`skipped_rules` 文案、抽屉行标题三处共用 */
export const SUSPICIOUS_RULE_LABEL: Record<SuspiciousOrderRuleKey, string> = {
  burstOrders: '密集下单', addressCluster: '同地址多账号', mobileCluster: '同手机多账号',
  deviceCluster: '同设备多账号', newAccounts: '批量小号', priceAnomaly: '改价异常',
  amountDeviation: '金额突变', refundAnomaly: '退款异常',
};

/**
 * 规则 → 依赖列键（R1/R5 无额外依赖恒不跳过：R5 由三级链兜底，D6）。
 * `collectSkippedRules` 与抽屉「已开启但缺列」提示共用此映射。
 */
export const SUSPICIOUS_RULE_DEPENDENCY_COLS: Partial<
  Record<SuspiciousOrderRuleKey, Array<keyof SuspiciousOrderDetectFieldMapping>>
> = {
  addressCluster: ['addressCol'],
  mobileCluster: ['mobileCol'],
  deviceCluster: ['deviceCol'],
  priceAnomaly: ['amountCol', 'originalAmountCol'],
  amountDeviation: ['amountCol'],
  refundAnomaly: ['orderStatusCol'],
};

/** 逐层深拷贝：默认常量是模块级单例，抽屉与策略不得共享其嵌套引用（不使用 structuredClone，jsdom 可测） */
export function cloneSuspiciousOrderDetectConfig(cfg: SuspiciousOrderDetectConfig): SuspiciousOrderDetectConfig {
  return {
    fieldMapping: { ...cfg.fieldMapping },
    thresholds: { ...cfg.thresholds },
    windows: { ...cfg.windows },
    ruleToggles: { ...cfg.ruleToggles },
    weights: { ...cfg.weights },
    tiers: { ...cfg.tiers },
    refundStatusValues: cfg.refundStatusValues,
    topN: cfg.topN,
  };
}

export type SuspiciousOrderDetectBlockerCode =
  | 'no-user-id' | 'no-order-time' | 'burst-window-invalid' | 'burst-count-invalid'
  | 'cluster-window-invalid' | 'address-prefix-invalid' | 'observation-days-invalid'
  | 'threshold-non-positive' | 'weight-out-of-range' | 'weight-total-invalid' | 'tier-order-invalid'
  | 'top-n-invalid';

export interface SuspiciousOrderDetectBlocker {
  code: SuspiciousOrderDetectBlockerCode;
  message: string;
}

/** 计数类阈值下限（`burstOrderCount` 有专属 code，故排除） */
const SUSPICIOUS_COUNT_THRESHOLDS: Array<keyof SuspiciousOrderDetectThresholds> = [
  'addrClusterUsers', 'mobileClusterUsers', 'deviceClusterUsers',
  'newAccountMaxAgeDays', 'newAccountMinOrders', 'priceAnomalyMinOrders',
  'amountDeviationMinOrders', 'refundMinOrders',
];

/**
 * 恶意订单检测的阻断原因（0.7 表 12 项）。
 * 消息即业务化中文，三处复用（策略 validate / `isUdfConfigured` / 抽屉确认门禁），禁止各写一份判定。
 */
export function collectSuspiciousOrderBlockers(
  cfg?: SuspiciousOrderDetectConfig,
): SuspiciousOrderDetectBlocker[] {
  const c = cfg ?? DEFAULT_SUSPICIOUS_ORDER_DETECT_CONFIG;
  const t = c.thresholds;
  const w = c.windows;
  const blockers: SuspiciousOrderDetectBlocker[] = [];

  if (!hasColumnValue(c.fieldMapping.userIdCol)) {
    blockers.push({ code: 'no-user-id', message: '请指定用户ID列（风控主体）' });
  }
  if (!hasColumnValue(c.fieldMapping.orderTimeCol)) {
    blockers.push({ code: 'no-order-time', message: '请指定订单下单时间列' });
  }
  if (!Number.isFinite(w.burstWindowMinutes) || w.burstWindowMinutes <= 0) {
    blockers.push({ code: 'burst-window-invalid', message: '密集下单观察时长需大于 0 分钟' });
  }
  if (!Number.isFinite(t.burstOrderCount) || t.burstOrderCount < 2) {
    blockers.push({ code: 'burst-count-invalid', message: '密集下单订单数阈值需不小于 2 单' });
  }
  if (!Number.isFinite(w.clusterWindowMinutes) || w.clusterWindowMinutes <= 0) {
    blockers.push({ code: 'cluster-window-invalid', message: '聚集观察时长需大于 0 分钟' });
  }
  if (!Number.isFinite(t.addressPrefixLength) || t.addressPrefixLength < 1 || t.addressPrefixLength > 40) {
    blockers.push({ code: 'address-prefix-invalid', message: '地址前缀长度需在 1–40 个字符之间' });
  }
  if (!Number.isFinite(w.observationDays) || w.observationDays < 0) {
    blockers.push({ code: 'observation-days-invalid', message: '观察区间天数不能为负数' });
  }
  const thresholdBad =
    SUSPICIOUS_COUNT_THRESHOLDS.some((k) => !Number.isFinite(t[k]) || t[k] < 1) ||
    !Number.isFinite(t.priceAnomalyMaxRatio) || t.priceAnomalyMaxRatio <= 0 || t.priceAnomalyMaxRatio > 1 ||
    !Number.isFinite(t.refundRatePercent) || t.refundRatePercent <= 0 || t.refundRatePercent > 100 ||
    !Number.isFinite(t.amountDeviationMultiple) || t.amountDeviationMultiple <= 0;
  if (thresholdBad) {
    blockers.push({ code: 'threshold-non-positive', message: '规则阈值需为正数且处于合理区间' });
  }
  const weightValues = SUSPICIOUS_ORDER_RULE_KEYS.map((k) => c.weights[k]);
  if (weightValues.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) {
    blockers.push({ code: 'weight-out-of-range', message: '单项规则权重需在 0–100 之间' });
  }
  if (weightValues.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) <= 0) {
    blockers.push({ code: 'weight-total-invalid', message: '规则权重合计需大于 0' });
  }
  const { severeScore, highScore, midScore } = c.tiers;
  if (
    !Number.isFinite(severeScore) || !Number.isFinite(highScore) || !Number.isFinite(midScore) ||
    !(100 >= severeScore && severeScore > highScore && highScore > midScore && midScore >= 1)
  ) {
    blockers.push({ code: 'tier-order-invalid', message: '风险分档需满足 严重 > 高 > 中，且均不超过 100' });
  }
  if (!Number.isFinite(c.topN) || c.topN < 1 || c.topN > 10) {
    blockers.push({ code: 'top-n-invalid', message: '洞察列出主体数需在 1–10 之间' });
  }
  return blockers;
}

/** 列名匹配正则（中英双写，`i`）：抽屉自动预填与单测共同消费，键集 = fieldMapping 的 11 个键 */
export const SUSPICIOUS_FIELD_MATCH_PATTERNS: Record<keyof SuspiciousOrderDetectFieldMapping, RegExp> = {
  userIdCol: /用户[ _. -]?(编号|号|id)|会员[ _. -]?(编号|号|id)|买家[ _. -]?(编号|号|id)|user[ _. -]?id|buyer[ _. -]?id|member[ _. -]?id/i,
  // 下单分支排除「首次/首单」前缀：首单/首次下单时间归 firstOrderTimeCol，保证 11 列全映射时主体时间列唯一命中
  orderTimeCol: /(?<!首次)(?<!首单)下单(时间|日期)|订单(时间|日期)|创建时间|支付(时间|日期)|payment[ _. -]?time|pay[ _. -]?(time|date)|create[ _. -]?(time|at)|paid[ _. -]?(at|time)/i,
  addressCol: /收货地址|收件地址|详细地址|地址|receiver[ _. -]?addr|shipping[ _. -]?addr|address/i,
  mobileCol: /收货(手机|电话)|收件(手机|电话)|联系(手机|电话)|手机号?|mobile|phone|tel/i,
  deviceCol: /设备(号|id|编号)|device[ _. -]?(id|no)|imei|idfa|oaid|mac/i,
  amountCol: /实付(金额)?|支付金额|付款金额|订单金额|pay[ _. -]?amount|actual[ _. -]?(amount|pay)/i,
  originalAmountCol: /原价|吊牌价|划线价|标准价|市场价|list[ _. -]?price|origin(al)?[ _. -]?price|original[ _. -]?amount/i,
  orderIdCol: /订单[ _. -]?(编号|号|id)|order[ _. -]?(id|no)/i,
  orderStatusCol: /订单状态|交易状态|order[ _. -]?status|trade[ _. -]?status/i,
  registerTimeCol: /注册(时间|日期|日期时间)|register[ _. -]?(time|date|at)|sign[ _. -]?up[ _. -]?time/i,
  firstOrderTimeCol: /首次下单(时间|日期)|首单(时间|日期)|first[ _. -]?order[ _. -]?(time|date)/i,
};

/**
 * 评分校准表（0.3）：按当前权重降序累计「命中 N 项的最高可能得分」并落到档位。
 * 纯函数无 IO，供抽屉校准表与单测使用；合计超过 100 时按 100 夹取（与 SQL 的 LEAST 同口径）。
 */
export function buildScoreCalibration(
  weights: SuspiciousOrderDetectWeights,
  tiers: SuspiciousOrderDetectTiers,
): Array<{ hitCount: number; maxScore: number; level: string }> {
  const sorted = SUSPICIOUS_ORDER_RULE_KEYS
    .map((k) => (Number.isFinite(weights[k]) ? weights[k] : 0))
    .sort((a, b) => b - a);
  let acc = 0;
  return sorted.map((w, i) => {
    acc += w;
    const maxScore = Math.min(100, acc);
    const level = maxScore >= tiers.severeScore ? '严重'
      : maxScore >= tiers.highScore ? '高'
        : maxScore >= tiers.midScore ? '中' : '低';
    return { hitCount: i + 1, maxScore, level };
  });
}

/** 解析退款状态值集合：去空白、过滤空项、`toUpperCase()`（中文值不变，与 SQL 的 `UPPER(TRIM(...))` 对齐） */
export function parseRefundStatusValues(values: string): string[] {
  return (values ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => v.toUpperCase());
}

/**
 * 缺依赖列被跳过的规则（D6 降级判据唯一来源）：开关为 true 且依赖列未映射。
 * R1 只依赖两列必填、R5 有三级链兜底，两者永不出现于此列表。
 * 策略 `skipped_rules` 字面量、validate 降级 WARNING、抽屉提示三处共用，禁止各写一份。
 */
export function collectSkippedRules(cfg: SuspiciousOrderDetectConfig): SuspiciousOrderRuleKey[] {
  return SUSPICIOUS_ORDER_RULE_KEYS.filter((key) => {
    if (!cfg.ruleToggles?.[key]) return false;
    const deps = SUSPICIOUS_RULE_DEPENDENCY_COLS[key];
    if (!deps) return false;
    if (deps.some((col) => !hasColumnValue(cfg.fieldMapping?.[col]))) return true;
    // R8 额外要求退款状态值非空（全为空白等价于未配置）
    return key === 'refundAnomaly' && parseRefundStatusValues(cfg.refundStatusValues).length === 0;
  });
}

/** 规则覆盖三态（0.7「生效规则」唯一判据）：closed 用户主动关闭 / skipped 缺列跳过 / effective 真正参与打分 */
export interface SuspiciousOrderRuleCoverage {
  total: 8;
  closed: SuspiciousOrderRuleKey[];
  skipped: SuspiciousOrderRuleKey[];
  effective: SuspiciousOrderRuleKey[];
}

/**
 * 「生效规则 N/8」判据（禁止各处用 `8 - collectSkippedRules().length` 自行相减，那会把用户主动关闭的规则算成生效）。
 * 四处消费者：validate 覆盖 WARNING、洞察卡片 1 metrics、洞察卡片 4 文案、抽屉分组 ⑦。
 */
export function collectEffectiveRules(cfg: SuspiciousOrderDetectConfig): SuspiciousOrderRuleCoverage {
  const skipped = collectSkippedRules(cfg);
  const skippedSet = new Set<string>(skipped);
  const closed = SUSPICIOUS_ORDER_RULE_KEYS.filter((k) => cfg.ruleToggles?.[k] === false);
  const effective = SUSPICIOUS_ORDER_RULE_KEYS.filter((k) => !skippedSet.has(k) && closed.indexOf(k) < 0);
  return { total: 8, closed, skipped, effective };
}

/**
 * A single replacement rule for udf_replace_spec_column_value.
 * Each rule describes how to replace values in one target column.
 */
export interface ReplaceRule {
  /** Unique rule id (for React key) */
  id: string;
  /** Source table name */
  sourceTable: string;
  /** Column(s) to apply replacement on (supports multi-select) */
  targetColumn: string[];
  /** 'contains' = apply WHERE condition; 'all' = no condition filter; 'replace_all' = overwrite entire column unconditionally (fill_map) */
  conditionType: 'contains' | 'all' | 'replace_all';
  /** Optional condition expression string (used when conditionType = 'contains') */
  conditionValue?: string;
  /** Original value to match */
  originalValue: string;
  /** Replacement target value */
  targetValue: string;
  /** Whether to output an additional new column instead of in-place replace */
  addNewColumn: boolean;
}

/** Config for udf_up_lower_str — uppercase / lowercase column values */
export interface UpLowerConfig {
  /** Column names to transform */
  cols: string[];
  /** 'upper' converts to uppercase; 'lower' converts to lowercase */
  action: 'upper' | 'lower';
  /** Optional SQL WHERE expression applied inside the MACRO */
  condition?: string;
}

/** Config for udf_format_number — number rounding / precision */
export interface FormatNumberConfig {
  /** Map of column name → desired decimal places */
  colsConfig: Record<string, number>;
  /** Rounding mode (default: 'half_up') */
  roundMode?: 'half_up' | 'truncate' | 'ceil' | 'floor';
  /** Optional SQL WHERE expression applied inside the MACRO */
  condition?: string;
}

/** Config for udf_flag_spec_column — conditional labelling / flagging */
export interface FlagSpecConfig {
  /**
   * Map of output column name → case config.
   * Each case config has an ordered list of [conditionExpr, labelValue] pairs
   * and an optional ELSE label.
   */
  flagsConfig: Record<string, { cases: [string, string][]; else?: string }>;
  /** Optional SQL WHERE expression applied inside the MACRO */
  condition?: string;
}

/** Config for udf_format_date_time — timezone-aware date/time reformatting */
export interface FormatDateConfig {
  /**
   * Map of column name → transform parameters.
   * All fields default to safe values inside the MACRO when omitted.
   */
  colConfigJson: Record<string, {
    srcFmt?: string;  // source format token (e.g. 'auto', '%Y-%m-%d', ...)
    srcTz?: string;   // source timezone (e.g. 'UTC', 'America/New_York')
    dstTz?: string;   // destination timezone
    dstFmt?: string;  // output format token (e.g. 'datetime', 'date', 'epoch_s', ...)
  }>;
  /** Optional SQL WHERE expression applied inside the MACRO */
  condition?: string;
}

/**
 * UDF Config Node Data
 * Stores configuration parameters for a UDF operator node.
 * Currently supports udf_replace_spec_column_value; extend as needed.
 */
export interface UdfConfigNodeData extends BaseNodeData {
  /** BizKernel name (e.g., 'fn_ecom_data_clean_replace_spec_column_value') */
  kernelName: string;
  /** DuckDB MACRO function name (e.g., 'udf_replace_spec_column_value') */
  udfFunctionName: string;
  /** Replacement rules for udf_replace_spec_column_value */
  replacementRules?: ReplaceRule[];
  /** Selected output columns for udf_replace_spec_column_value; empty = show all */
  outputColumns?: string[];
  /** Config for udf_up_lower_str */
  upLowerConfig?: UpLowerConfig;
  /** Config for udf_format_number */
  formatNumberConfig?: FormatNumberConfig;
  /** Config for udf_flag_spec_column */
  flagSpecConfig?: FlagSpecConfig;
  /** Config for udf_format_date_time */
  formatDateConfig?: FormatDateConfig;
}

export interface EndNodeData extends BaseNodeData {
  operatorType: OperatorType;
  executable: boolean;
  errors: ValidationError[];
  executing?: boolean;
  result?: AnalysisResult;
  /** How this EndNode was created — determines whether condition filling is required */
  triggerSource?: EndNodeTriggerSource;
}

export type FlowNodeData =
  | DataSourceNodeData
  | TableNodeData
  | MergeNodeData
  | OperatorNodeData
  | JoinNodeData
  | ConditionNodeData
  | ConditionGroupRelationNodeData
  | ConditionGroupDefinitionNodeData
  | SelectNodeData
  | SelectAggNodeData
  | UdfConfigNodeData
  | EndNodeData;

// ============================================================================
// Flow Types
// ============================================================================

export interface FlowNode extends Node<FlowNodeData> {
  type: FlowNodeType;
}

export interface FlowEdge extends Edge {
  type?: 'default' | 'smoothstep' | 'straight' | 'join' | 'deletable';
  animated?: boolean;
}

export interface FlowConfig {
  id: string;
  name: string;
  operatorType: OperatorType;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationError {
  nodeId: string;
  nodeType: FlowNodeType;
  message: string;
  severity: ValidationSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings?: ValidationError[];
}

/**
 * 执行阻断判据（唯一真值）：只有 ERROR 拦截执行，`WARNING` 为非阻断提示。
 * 消费方：`EndNode.executeFlow`（阻断前过滤）—— 避免「非阻断提示」被当作错误拦下。
 */
export function blockingValidationErrors(errors?: ValidationError[]): ValidationError[] {
  return (errors ?? []).filter((e) => e.severity !== ValidationSeverity.WARNING);
}

// ============================================================================
// Strategy Types
// ============================================================================

/**
 * ColumnFormatterSpec defines how to display a column value.
 * Pure serializable specs — no functions, only data-driven rules.
 */
export type ColumnFormatterSpec =
  | { type: 'ratio_to_fold'; precision?: number }
    // 0.8904 → "8.9折" | 1.0 → "无折扣"
  | { type: 'percent_signed'; precision?: number; labelNegative?: string }
    // -0.538 → "-53.8%（亏损）" | 0.12 → "+12.0%"
  | { type: 'currency_signed'; unit?: string; precision?: number }
    // -326.86 → "-326.86元（亏损）" | 50 → "+50.00元"
  | { type: 'percent_deviation'; prefix?: string; precision?: number }
    // -0.7137 → "比类目均价低71.4%"
  | { type: 'json_tag_badges'; priorityTags?: string[] }
    // ["异常毛利","偏离"] → colored Tag bubbles
  | { type: 'duration_days'; unit?: string }
    // 15.3 → "15天" | 0 → "首次购买"
  | { type: 'risk_badge' };
    // "高" → colored Badge

/**
 * RowColorizerConfig defines background color and badge color for rows by field value.
 */
export interface RowColorizerConfig {
  field: string;
  colorMap: Record<
    string,
    {
      bg: string; // e.g. 'rgba(255,77,79,0.12)' — transparent for light/dark compatibility
      badgeColor: string; // e.g. '#ff4d4f' — Ant Design color
    }
  >;
}

// ============================================================================
// Insights Data Types
// ============================================================================

/**
 * A single metric row displayed inside an InsightItem.
 *
 * @remarks
 * - `value` must always be the raw number — formatting is handled by the UI layer (InsightsPanel).
 * - `unit="%"` convention: backend stores raw decimal (e.g. 0.15), UI multiplies ×100 → "15.00%".
 * - `unit="元"` convention: backend stores raw number, UI formats with toLocaleString(2 decimals).
 * - Max 4 metrics per InsightItem to maintain visual density.
 */
export interface InsightMetric {
  /** Display label, e.g. "风险订单数" */
  label: string;
  /** Raw numeric value — never pre-format this before storing */
  value: number;
  /**
   * Display unit string that drives the formatter:
   * - "%" → multiply ×100 then append "%"
   * - "元" → toLocaleString zh-CN, 2 decimals
   * - others (e.g. "单", "条", "天") → integer locale string or 2-decimal fallback
   */
  unit?: string;
  /** When true, the metric value is rendered in the primary theme color and bold */
  highlight?: boolean;
}

/**
 * A single insight block rendered as a card in the InsightsPanel.
 * Naming uses "InsightItem", not "InsightCard" — no "Card" suffix per project convention.
 *
 * @remarks
 * - `cardType="custom"` enables `metadata.customColor` for icon/accent override.
 * - `sortOrder` is set by the operator; the UI renders in this order without re-sorting.
 * - `metrics` is optional; an InsightItem can be text-only (title + description).
 */
export interface InsightItem {
  /** Unique identifier — used for event callbacks (drill-down, future feature) */
  id: string;
  /**
   * Layout variant:
   * - "standard" — uses iconKey to pick a predefined icon + semantic color
   * - "custom" — uses metadata.customColor to override icon accent color
   */
  cardType: 'standard' | 'custom';
  /**
   * Semantic icon key — determines both the Ant Design icon component and its color.
   * Mapping:
   *   critical → WarningFilled       (var(--vm-color-error))
   *   warning  → ExclamationCircleFilled (var(--vm-color-warning))
   *   insight  → BulbFilled          (var(--vm-primary))
   *   safe     → CheckCircleFilled   (var(--vm-color-success))
   *   quality  → DatabaseFilled      (var(--vm-text-secondary))
   *   price    → TagFilled           (var(--vm-color-info))
   *   user     → UserOutlined        (var(--vm-primary))
   *   rfm      → BarChartOutlined    (var(--vm-color-warning))
   *   order    → ShoppingOutlined    (var(--vm-color-info))
   */
  iconKey: 'critical' | 'warning' | 'insight' | 'safe' | 'quality' | 'price' | 'user' | 'rfm' | 'order';
  /** Short title displayed at the top of the card */
  title: string;
  /** Optional supporting text — max 3 lines recommended */
  description?: string;
  /** Optional business recommendation — concise action advice shown below metrics */
  suggestion?: string;
  /** Render order; the UI displays items in ascending sortOrder without re-sorting */
  sortOrder: number;
  /** Optional metric rows — max 4 items for visual density */
  metrics?: InsightMetric[];
  /** Extra data for custom rendering or future drill-down callbacks */
  metadata?: {
    /** Hex or CSS variable string for custom icon accent color (cardType="custom" only) */
    customColor?: string;
    [key: string]: unknown;
  };
}

/**
 * Top-level summary bar displayed above the InsightItem grid.
 * Each field is optional except the two required counters — operators only populate
 * fields that are semantically meaningful for their analysis type.
 *
 * Visibility rule: if the operator returns `summary=undefined`, the UI hides the entire overview area.
 *
 * Field ownership:
 *   - totalRecordCount / totalFilterRecordCount — all operators (required when summary is defined)
 *   - riskRecordCount / criticalRecordCount / estimatedLoss — ArbitrageAnalyzeStrategy
 *   - repurchaseUserCount / avgRepurchaseDays — RepurchaseCycleStrategy
 *   - topRegion — OrderDistributionStrategy (geo_dist sub-type)
 *   - peakPeriod — OrderDistributionStrategy (time_dist sub-type)
 */
export interface InsightSummary {
  /** Total number of records in the raw analysis result */
  totalRecordCount: number;
  /** Number of records that match the primary filter condition (e.g. risk orders, repurchase users) */
  totalFilterRecordCount: number;
  /** [Arbitrage] Number of orders with risk_level in {中, 高, 严重} */
  riskRecordCount?: number;
  /** [Arbitrage] Number of orders with risk_level === "严重" */
  criticalRecordCount?: number;
  /** [Arbitrage] Sum of |gross_margin| for all negative-margin orders (unit: 元) */
  estimatedLoss?: number;
  /** [Repurchase] Number of users with order_count >= 2 */
  repurchaseUserCount?: number;
  /** [Repurchase] Average repurchase cycle days across all users (rounded to integer) */
  avgRepurchaseDays?: number;
  /** [OrderDist/geo] Name of the top region by order_count */
  topRegion?: string;
  /** [OrderDist/time] Label of the peak time period by order_count */
  peakPeriod?: string;
  /** [InventoryForecast] Total number of SKUs submitted for forecasting */
  forecastSkuCount?: number;
  /** [InventoryForecast] Number of SKUs that failed (ValidationError / ModelError) */
  failedSkuCount?: number;
  /** [InventoryForecast] SKU id with the highest total predicted demand */
  peakForecastSku?: string;
  /** [OrderChannel / order-based operators] Sum of order_count across all rows; displayed as "总订单数" */
  totalOrderCount?: number;
}

/**
 * Complete insights payload produced by a business analysis operator's postProcess().
 * This is attached to AnalysisResult.insightsData and flows to ResultsDisplay → InsightsPanel.
 *
 * Design rules:
 * - `summary=undefined` → InsightsPanel hides the overview bar (operator controls visibility)
 * - `insights=[]` → InsightsPanel shows a default fallback InsightItem ("暂无洞察")
 * - ML / UDF / LLM paths never populate this field → InsightsPanel is not rendered
 */
export interface OperatorInsightsData {
  /** Overview metric bar. Omit to hide the entire summary section. */
  summary?: InsightSummary;
  /** Ordered insight cards. Use empty array to trigger the fallback "暂无洞察" card. */
  insights: InsightItem[];
}

/** Tab filter config for operator result display */
export interface TabConfig {
  /** Tab label displayed to user */
  label: string;
  /** Field name to filter by; undefined = show all rows */
  filterField?: string;
  /** Value to match; rows where record[filterField] === filterValue are shown */
  filterValue?: unknown;
}

/**
 * OperatorDisplayConfig defines how ResultsDisplay should render operator results.
 * Pure data-driven — no business logic, only configuration.
 */
export interface OperatorDisplayConfig {
  /** Column to sort by default, in which order */
  defaultSort?: { column: string; order: 'ascend' | 'descend' };

  /** Row background coloring by field value */
  rowColorizer?: RowColorizerConfig;

  /** Column value formatters — map column name → formatter spec */
  columnFormatters?: Record<string, ColumnFormatterSpec>;

  /** Column header tooltips — map column name → tooltip text */
  columnTooltips?: Record<string, string>;

  /** If provided, renders a tab bar above the result table; each tab can filter rows */
  tabs?: TabConfig[];
}

export interface AnalysisResult {
  type: OperatorType;
  sql: string;
  data: any[];
  schema?: any[];
  displayConfig?: OperatorDisplayConfig;
  /**
   * Structured insights payload produced by business analysis operators.
   * Flows through AnalysisRecord → ResultsDisplay → InsightsPanel.
   * Undefined for LLM / UDF paths — InsightsPanel is not rendered in those cases.
   */
  insightsData?: OperatorInsightsData;
}

export interface FlowStrategy {
  readonly type: OperatorType;
  readonly name: string;
  buildSql(nodes: FlowNode[], edges: FlowEdge[], placeholderValues?: Record<string, unknown>): string;
  validate(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[];
  getRequiredNodes(): FlowNodeType[];
  postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult>;
}

/**
 * Extended interface for UDF-based strategies.
 * Declares udfFunctionName for MACRO routing and panel type resolution.
 */
export interface UdfFlowStrategy extends FlowStrategy {
  /** DuckDB MACRO function name, e.g. 'udf_up_lower_str' */
  readonly udfFunctionName: string;
}

// ============================================================================
// Store Types
// ============================================================================

export interface FlowState {
  // Flow data
  flowId: string;
  flowName: string;
  operatorType: OperatorType;
  nodes: FlowNode[];
  edges: FlowEdge[];

  // Placeholder values for deferred filling (Q13: stored in flowStore)
  placeholderValues: Record<string, unknown>; // { "GC1_1": value, "GC1_2": value }

  // UI state
  selectedNodeId: string | null;
  detailPanelOpen: boolean;
  errorPanelOpen: boolean;
  validationErrors: ValidationError[];
  /** Source node ID awaiting a manual "bind relation" connection, null when idle */
  pendingConnectionSource: string | null;
  setPendingConnectionSource: (id: string | null) => void;
  /** Currently highlighted edge ID (click-to-select), null when none */
  selectedEdgeId: string | null;
  setSelectedEdgeId: (id: string | null) => void;

  // Actions
  setFlowName: (name: string) => void;
  setOperatorType: (type: OperatorType) => void;
  setNodes: (nodes: FlowNode[]) => void;
  addNode: (node: FlowNode) => void;
  updateNode: (id: string, data: Partial<FlowNodeData>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: FlowEdge) => void;
  removeEdge: (id: string) => void;
  updateEdge: (id: string, data: Partial<Record<string, unknown>>) => void;
  setSelectedNode: (id: string | null) => void;
  setDetailPanelOpen: (open: boolean) => void;
  setErrorPanelOpen: (open: boolean) => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  resetFlow: () => void;

  // Join panel state
  joinPanelEdgeId: string | null;
  openJoinPanel: (edgeId: string) => void;
  closeJoinPanel: () => void;

  // Default kernel pre-selected from ChatPanel "/" trigger
  defaultKernelName: string | null;
  setDefaultKernelName: (name: string | null) => void;

  // Placeholder value actions
  setPlaceholderValue: (placeholder: string, value: unknown) => void;
  getPlaceholderValue: (placeholder: string) => unknown;
  getAllPlaceholderValues: () => Record<string, unknown>;
  clearPlaceholderValues: () => void;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface FlowColors {
  conditionGroup: {
    and: { background: string; border: string; title: string };
    or: { background: string; border: string; title: string };
    nested: { background: string; border: string; title: string };
  };
  node: {
    table: { background: string; border: string };
    merge: { background: string; border: string };
    operator: { background: string; border: string };
    join: { background: string; border: string };
    condition: { background: string; border: string };
    conditionDefinition: { background: string; border: string; title: string };
    select: { background: string; border: string };
    end: { background: string; border: string };
  };
  edge: {
    default: string;
    selected: string;
    error: string;
  };
}

// ============================================================================
// fn_ecom_zero_negative_order_detect — 0 元单 / 负金额单检测（feature 16）
// 契约层：类型 / 默认值 / 规则表 / 阻断判据 / 纯函数
// 消费者（策略 validate、抽屉应用门禁、SelectNode.isUdfConfigured）只读此处的导出，
// 禁止任一端另写阈值、规则中文名或阻断判据。
// ============================================================================

/** 8 条检测规则键（书写次序 = R1..R8，全模块唯一） */
export type ZeroNegativeRuleKey =
  | 'zero_pay' | 'negative_pay' | 'negative_unit_price' | 'discount_overflow'
  | 'negative_field' | 'amount_mismatch' | 'discount_sum_mismatch' | 'penny_order';

/** 规则短码：`abnormal_types` / `skipped_rules` / 证据文案前缀三处共用 */
export type ZeroNegativeRuleCode = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

/** 规则键全集（遍历顺序 = 此顺序） */
export const ZERO_NEGATIVE_RULE_KEYS: ZeroNegativeRuleKey[] = [
  'zero_pay', 'negative_pay', 'negative_unit_price', 'discount_overflow',
  'negative_field', 'amount_mismatch', 'discount_sum_mismatch', 'penny_order',
];

export const ZERO_NEGATIVE_RULE_CODE: Record<ZeroNegativeRuleKey, ZeroNegativeRuleCode> = {
  zero_pay: 'R1',
  negative_pay: 'R2',
  negative_unit_price: 'R3',
  discount_overflow: 'R4',
  negative_field: 'R5',
  amount_mismatch: 'R6',
  discount_sum_mismatch: 'R7',
  penny_order: 'R8',
};

/** 规则中文业务名（开关行标题、`abnormal_type` 主类型值、跳过的规则文案共用） */
export const ZERO_NEGATIVE_RULE_LABEL: Record<ZeroNegativeRuleKey, string> = {
  zero_pay: '零实付订单',
  negative_pay: '负实付订单',
  negative_unit_price: '负单价',
  discount_overflow: '优惠溢出',
  negative_field: '负金额字段',
  amount_mismatch: '金额不符',
  discount_sum_mismatch: '优惠分项不符',
  penny_order: '微额订单',
};

/** 一句话判定式（抽屉开关行副标题，与 SQL 判据同源） */
export const ZERO_NEGATIVE_RULE_DESC: Record<ZeroNegativeRuleKey, string> = {
  zero_pay: '实付金额为 0（容差内）且商品金额大于 0',
  negative_pay: '实付金额为负数',
  negative_unit_price: '单价为负；无单价列时按「商品金额 ÷ 数量」判定',
  discount_overflow: '优惠合计大于商品金额（超出容差）',
  negative_field: '商品金额或优惠合计为负数',
  amount_mismatch: '实付与应付的差额同时超过容差与最小可报告缺口',
  discount_sum_mismatch: '优惠券 + 平台补贴 + 商家优惠之和与优惠合计不符',
  penny_order: '实付大于 0 且不超过微额上限，并显著低于商品金额',
};

/** 默认启用的 6 条核心规则（R7/R8 为增强规则，默认关闭） */
export const DEFAULT_ZERO_NEGATIVE_RULES: ZeroNegativeRuleKey[] = [
  'zero_pay', 'negative_pay', 'negative_unit_price',
  'discount_overflow', 'negative_field', 'amount_mismatch',
];

/** 规则 → 依赖列（登记即「缺列自动跳过」；未登记表示无额外依赖，永不进 skipped 列表） */
export const ZERO_NEGATIVE_RULE_DEPENDENCY_COLS: Partial<
  Record<ZeroNegativeRuleKey, Array<keyof ZeroNegativeFieldMapping>>
> = {
  discount_sum_mismatch: ['couponAmountCol', 'platformDiscountCol', 'merchantDiscountCol'],
};

/** R3 独立谓词：单价列或数量列任一有值即可判定（两者皆空才跳过） */
export function canEvaluateNegativeUnitPrice(cfg: ZeroNegativeOrderDetectConfig): boolean {
  const m = cfg?.fieldMapping;
  return hasColumnValue(m?.unitPriceCol) || hasColumnValue(m?.quantityCol);
}

/**
 * 主类型优先级（根因优先）：`abnormal_type` 取此项最高命中的规则，
 * `abnormal_types` 仍保留全部命中短码。
 */
export const ZERO_NEGATIVE_RULE_PRIORITY: readonly ZeroNegativeRuleKey[] = [
  'negative_field', 'negative_pay', 'discount_overflow', 'zero_pay',
  'negative_unit_price', 'amount_mismatch', 'penny_order', 'discount_sum_mismatch',
];

/** 字段映射：13 个槽位（空串 = 未映射） */
export interface ZeroNegativeFieldMapping {
  orderIdCol: string;            // 可选：未映射时按数据行计数（ROW_LEVEL）
  orderTimeCol: string;          // 可选：观察窗口与 order_time 输出列
  orderStatusCol: string;        // 可选：状态剔除
  payAmountCol: string;          // 必填
  productAmountCol: string;      // 必填
  discountTotalCol: string;      // 必填
  quantityCol: string;           // 可选：R3 兜底分母
  unitPriceCol: string;          // 可选：R3 优先口径
  couponAmountCol: string;       // 可选：R7 分项
  platformDiscountCol: string;   // 可选：R7 分项
  merchantDiscountCol: string;   // 可选：R7 分项
  refundAmountCol: string;       // 可选：决定净实付 = 实付 − 退款
  exemptionCol: string;          // 可选：业务豁免列（如订单类型）
}

export interface ZeroNegativeThresholds {
  toleranceYuan: number;        // 容差（元），默认 0.01
  mismatchMinYuan: number;      // 最小可报告缺口（元），默认 1
  pennyOrderMaxYuan: number;    // 微额上限（元），默认 0.01
}

export interface ZeroNegativeRiskTiers {
  criticalYuan: number;         // 严重档，默认 500
  highYuan: number;             // 高档，默认 100
  mediumYuan: number;           // 中档，默认 10
  ruleCountUpgrade: number;     // 命中 N 类及以上升一档，默认 3
}

export interface ZeroNegativeOrderDetectConfig {
  fieldMapping: ZeroNegativeFieldMapping;
  /** undefined → `DEFAULT_ZERO_NEGATIVE_RULES`；空数组视为「未启用任何规则」而阻断 */
  enabledRules?: ZeroNegativeRuleKey[];
  thresholds: ZeroNegativeThresholds;
  tiers: ZeroNegativeRiskTiers;
  windows: { observationDays: number };
  /** 状态剔除值（逗号分隔，`UPPER(TRIM())` 比对，中英混写一视同仁） */
  excludeStatusValues: string;
  /** 误报豁免值（逗号分隔，命中 `exemptionCol` 的订单整单跳过） */
  exemptionValues: string;
  /** 超额优惠并入损失（`max(0, -应付)` 第二项） */
  includeOverflowLoss: boolean;
  formula: { expectedSlots: FormulaSlot[]; lossSlots: FormulaSlot[] };
  /** 洞察 TopN，1–10 */
  topN: number;
}

/** 派生列白名单（损失组槽位可引用；应付组不可自引用） */
export const ZERO_NEGATIVE_DERIVED_COLS = ['expected_amount', 'net_pay_amount'] as const;

export type ZeroNegativeDerivedCol = (typeof ZERO_NEGATIVE_DERIVED_COLS)[number];

export const ZERO_NEGATIVE_DERIVED_COL_LABEL: Record<ZeroNegativeDerivedCol, string> = {
  expected_amount: '应付金额',
  net_pay_amount: '净实付金额',
};

export const ZERO_NEGATIVE_SLOT_OPERATORS: ReadonlyArray<'+' | '-'> = ['+', '-'];

/** 槽位可引用的源数据列（= `src_all` 投影别名，SQL 表达式与预览共用同一套别名） */
export const ZERO_NEGATIVE_SOURCE_COLS = [
  'order_id', 'order_time', 'order_status', 'pay_amount', 'product_amount',
  'discount_total', 'quantity', 'unit_price', 'coupon_amount',
  'platform_discount', 'merchant_discount', 'refund_amount',
] as const;

export type ZeroNegativeSourceCol = (typeof ZERO_NEGATIVE_SOURCE_COLS)[number];

/** 投影别名 → 字段槽（预览据此把别名翻成业务中文名） */
export const ZERO_NEGATIVE_SOURCE_COL_FIELD: Record<ZeroNegativeSourceCol, keyof ZeroNegativeFieldMapping> = {
  order_id: 'orderIdCol',
  order_time: 'orderTimeCol',
  order_status: 'orderStatusCol',
  pay_amount: 'payAmountCol',
  product_amount: 'productAmountCol',
  discount_total: 'discountTotalCol',
  quantity: 'quantityCol',
  unit_price: 'unitPriceCol',
  coupon_amount: 'couponAmountCol',
  platform_discount: 'platformDiscountCol',
  merchant_discount: 'merchantDiscountCol',
  refund_amount: 'refundAmountCol',
};

/** 字段槽类型（13 槽） */
export type ZeroNegativeFieldKey = keyof ZeroNegativeFieldMapping;

/** 字段业务口径中文名（抽屉标签 + 预览显示名共用） */
export const ZERO_NEGATIVE_FIELD_LABEL: Record<ZeroNegativeFieldKey, string> = {
  orderIdCol: '订单号',
  orderTimeCol: '订单支付时间',
  orderStatusCol: '订单状态',
  payAmountCol: '实付金额',
  productAmountCol: '商品金额',
  discountTotalCol: '优惠合计',
  quantityCol: '商品数量',
  unitPriceCol: '商品单价',
  couponAmountCol: '优惠券金额',
  platformDiscountCol: '平台补贴',
  merchantDiscountCol: '商家优惠',
  refundAmountCol: '退款金额',
  exemptionCol: '订单类型列（豁免用）',
};

/** 必填字段唯一真源（validate / 抽屉星号 / blockers 三处共读） */
export const ZERO_NEGATIVE_REQUIRED_FIELDS: readonly ZeroNegativeFieldKey[] = [
  'payAmountCol', 'productAmountCol', 'discountTotalCol',
];

/** 列名匹配正则（中文 + 英文 + 蛇形，大小写不敏感），键集 = 13 个映射槽 */
export const ZERO_NEGATIVE_FIELD_MATCH_PATTERNS: Record<ZeroNegativeFieldKey, RegExp> = {
  payAmountCol: /实付(金额|额)?|支付(金额|额)|付款(金额|额)|pay[ _. -]?(amount|amt)/i,
  productAmountCol: /商品(金额|总额|原价)|货物金额|product[ _. -]?(amount|amt)|goods[ _. -]?(amount|amt)/i,
  discountTotalCol: /优惠(合计|总额|金额合计)|折扣合计|discount[ _. -]?(total|sum)|total[ _. -]?discount/i,
  quantityCol: /数量|件数|购买数量|quantity|qty/i,
  unitPriceCol: /单价|商品单价|unit[ _. -]?price|price/i,
  couponAmountCol: /优惠券(金额|额)?|券(金额|额)|coupon[ _. -]?(amount|amt|discount)/i,
  platformDiscountCol: /平台(补贴|优惠|承担)|platform[ _. -]?(discount|subsidy)/i,
  merchantDiscountCol: /商家(优惠|承担|补贴)|店铺优惠|merchant[ _. -]?(discount|subsidy)|seller[ _. -]?discount/i,
  refundAmountCol: /退款(金额|额)?|退货(金额|额)|refund[ _. -]?(amount|amt)/i,
  orderIdCol: /订单[ _. -]?(编号|号|id)|order[ _. -]?(id|no)/i,
  orderTimeCol: /支付(时间|日期)|下单(时间|日期)|订单(时间|日期)|paid[ _. -]?(at|time)|pay[ _. -]?(time|date)|order[ _. -]?(time|date)/i,
  orderStatusCol: /订单状态|交易状态|order[ _. -]?status|trade[ _. -]?status/i,
  exemptionCol: /订单类型|业务类型|单据类型|order[ _. -]?type|biz[ _. -]?type/i,
};

/** 预填匹配次序：更精确的正则优先，先到先得（避免 `coupon_discount_amount` 被优惠合计抢占） */
export const ZERO_NEGATIVE_FIELD_MATCH_ORDER: readonly ZeroNegativeFieldKey[] = [
  'couponAmountCol', 'platformDiscountCol', 'merchantDiscountCol', 'refundAmountCol',
  'payAmountCol', 'productAmountCol', 'discountTotalCol', 'quantityCol', 'unitPriceCol',
  'orderIdCol', 'orderTimeCol', 'orderStatusCol', 'exemptionCol',
];

/**
 * 表驱动预填：仅当「该槽当前为空」且「未被前序槽占用的候选列唯一命中」时写入。
 * 已有值不覆盖，多列同时命中不猜（返回原值）。
 */
export function matchZeroNegativeColumns(
  columns: string[],
  current: ZeroNegativeFieldMapping,
): ZeroNegativeFieldMapping {
  const next: ZeroNegativeFieldMapping = { ...current };
  // 已被槽位显式占用的列不再参与预填，避免抢占用户已确认的值
  const consumed = new Set<string>();
  for (const key of ZERO_NEGATIVE_FIELD_MATCH_ORDER) {
    if (hasColumnValue(next[key])) consumed.add(next[key]);
  }
  const available = (columns ?? []).filter((c) => typeof c === 'string' && hasColumnValue(c));
  for (const key of ZERO_NEGATIVE_FIELD_MATCH_ORDER) {
    if (hasColumnValue(next[key])) continue;
    const pattern = ZERO_NEGATIVE_FIELD_MATCH_PATTERNS[key];
    // 唯一命中才写：多列同时命中说明该槽有歧义，留给用户手选
    const hits = available.filter((c) => !consumed.has(c) && pattern.test(c));
    if (hits.length === 1) {
      next[key] = hits[0];
      consumed.add(hits[0]);
    }
  }
  return next;
}

export type ZeroNegativeBlockerCode =
  | 'no-pay-amount' | 'no-product-amount' | 'no-discount-total'
  | 'no-enabled-rule' | 'no-expected-slot' | 'no-loss-slot'
  | 'invalid-threshold' | 'invalid-risk-tiers' | 'invalid-observation-days' | 'invalid-top-n';

export interface ZeroNegativeBlocker {
  code: ZeroNegativeBlockerCode;
  message: string;
}

/** 阈值归一：非有限或负数兜底为默认值（SQL 拼装只从这里取数，防 NaN 表达式） */
export function resolveZeroNegativeThresholds(cfg?: ZeroNegativeOrderDetectConfig): ZeroNegativeThresholds {
  const fallback = DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG.thresholds;
  const pick = (value: number | undefined, def: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : def;
  return {
    toleranceYuan: pick(cfg?.thresholds?.toleranceYuan, fallback.toleranceYuan),
    mismatchMinYuan: pick(cfg?.thresholds?.mismatchMinYuan, fallback.mismatchMinYuan),
    pennyOrderMaxYuan: pick(cfg?.thresholds?.pennyOrderMaxYuan, fallback.pennyOrderMaxYuan),
  };
}

/** 生效规则（`enabledRules === undefined` → 六核心；未知键过滤并保持 R1..R8 次序） */
export function collectEnabledZeroNegativeRules(cfg?: ZeroNegativeOrderDetectConfig): ZeroNegativeRuleKey[] {
  const list = cfg?.enabledRules;
  if (list === undefined) return [...DEFAULT_ZERO_NEGATIVE_RULES];
  const picked = new Set<string>(Array.isArray(list) ? list : []);
  return ZERO_NEGATIVE_RULE_KEYS.filter((key) => picked.has(key));
}

/** 已启用但缺依赖列被跳过的规则（降级判据唯一来源） */
export function collectZeroNegativeSkippedRules(cfg?: ZeroNegativeOrderDetectConfig): ZeroNegativeRuleKey[] {
  if (!cfg) return [];
  const enabled = new Set<string>(collectEnabledZeroNegativeRules(cfg));
  return ZERO_NEGATIVE_RULE_KEYS.filter((key) => {
    if (!enabled.has(key)) return false;
    if (key === 'negative_unit_price') return !canEvaluateNegativeUnitPrice(cfg);
    const deps = ZERO_NEGATIVE_RULE_DEPENDENCY_COLS[key];
    if (!deps) return false;
    return deps.some((col) => !hasColumnValue(cfg.fieldMapping?.[col]));
  });
}

/** 规则覆盖三态：closed 用户关闭 / skipped 缺列跳过 / effective 真正参与判定 */
export interface ZeroNegativeRuleCoverage {
  total: 8;
  closed: ZeroNegativeRuleKey[];
  skipped: ZeroNegativeRuleKey[];
  effective: ZeroNegativeRuleKey[];
}

/** 覆盖度（禁止用 `8 - skipped` 自行相减，那会把主动关闭的规则算成生效） */
export function collectZeroNegativeRuleCoverage(cfg?: ZeroNegativeOrderDetectConfig): ZeroNegativeRuleCoverage {
  const enabled = new Set<string>(collectEnabledZeroNegativeRules(cfg));
  const skipped = collectZeroNegativeSkippedRules(cfg);
  const skippedSet = new Set<string>(skipped);
  return {
    total: 8,
    closed: ZERO_NEGATIVE_RULE_KEYS.filter((k) => !enabled.has(k)),
    skipped,
    effective: ZERO_NEGATIVE_RULE_KEYS.filter((k) => enabled.has(k) && !skippedSet.has(k)),
  };
}

/** 数据质量短码（闭集）：拼接次序固定，空集为 `OK` */
export type ZeroNegativeQualityCode = 'OK' | 'ROW_LEVEL' | 'PARTIAL_RULES' | 'NULL_AMOUNT';

export const ZERO_NEGATIVE_QUALITY_ORDER: readonly ZeroNegativeQualityCode[] = [
  'ROW_LEVEL', 'PARTIAL_RULES', 'NULL_AMOUNT',
];

export function joinZeroNegativeQuality(codes: Array<ZeroNegativeQualityCode | null | undefined>): string {
  const set = new Set<string>(codes.filter((c): c is ZeroNegativeQualityCode => !!c && c !== 'OK'));
  const picked = ZERO_NEGATIVE_QUALITY_ORDER.filter((c) => set.has(c));
  return picked.length > 0 ? picked.join('+') : 'OK';
}

/**
 * 阻断原因（固定次序输出）：三必填列 → 生效规则 → 两组槽位 → 阈值 → 分档 → 观察窗口 → TopN。
 * 消息即业务化中文，策略 validate / 抽屉应用门禁 / SelectNode 三处复用。
 */
export function collectZeroNegativeBlockers(cfg?: ZeroNegativeOrderDetectConfig): ZeroNegativeBlocker[] {
  const c = cfg ?? DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG;
  const m = c.fieldMapping;
  const blockers: ZeroNegativeBlocker[] = [];

  if (!hasColumnValue(m?.payAmountCol)) {
    blockers.push({ code: 'no-pay-amount', message: '请指定实付金额列' });
  }
  if (!hasColumnValue(m?.productAmountCol)) {
    blockers.push({ code: 'no-product-amount', message: '请指定商品金额列' });
  }
  if (!hasColumnValue(m?.discountTotalCol)) {
    blockers.push({ code: 'no-discount-total', message: '请指定优惠合计列' });
  }
  if (collectEnabledZeroNegativeRules(c).length === 0) {
    blockers.push({ code: 'no-enabled-rule', message: '请至少启用一条检测规则' });
  }
  // 金额列缺失时槽位表达式无从落地，不再叠加级联噪声
  if (blockers.length === 0) {
    const expected = c.formula?.expectedSlots ?? [];
    const loss = c.formula?.lossSlots ?? [];
    if (expected.length === 0 || !hasColumnValue(expected[0]?.column)) {
      blockers.push({ code: 'no-expected-slot', message: '请为「应付金额」公式保留至少一个起始计算项' });
    }
    if (loss.length === 0 || !hasColumnValue(loss[0]?.column)) {
      blockers.push({ code: 'no-loss-slot', message: '请为「损失金额」公式保留至少一个起始计算项' });
    }
  }
  const t = c.thresholds;
  if (
    !Number.isFinite(t?.toleranceYuan) || t.toleranceYuan < 0 ||
    !Number.isFinite(t?.mismatchMinYuan) || t.mismatchMinYuan < 0 ||
    !Number.isFinite(t?.pennyOrderMaxYuan) || t.pennyOrderMaxYuan < 0
  ) {
    blockers.push({ code: 'invalid-threshold', message: '阈值需为不小于 0 的数字' });
  }
  const tiers = c.tiers;
  if (
    !Number.isFinite(tiers?.criticalYuan) || !Number.isFinite(tiers?.highYuan) || !Number.isFinite(tiers?.mediumYuan) ||
    !(tiers.criticalYuan > tiers.highYuan && tiers.highYuan > tiers.mediumYuan && tiers.mediumYuan >= 0) ||
    !Number.isFinite(tiers?.ruleCountUpgrade) || tiers.ruleCountUpgrade < 1
  ) {
    blockers.push({ code: 'invalid-risk-tiers', message: '风险分档需满足「严重 > 高 > 中 ≥ 0」，且命中类数阈值不小于 1' });
  }
  const days = c.windows?.observationDays;
  if (!Number.isFinite(days) || days < 0) {
    blockers.push({ code: 'invalid-observation-days', message: '观察区间天数不能为负数' });
  }
  if (!Number.isFinite(c.topN) || c.topN < 1 || c.topN > 10) {
    blockers.push({ code: 'invalid-top-n', message: '洞察列出订单数需在 1–10 之间' });
  }
  return blockers;
}

/** 风险等级中文四档 + 渲染序号（0 = 最严重） */
export type ZeroNegativeRiskLevel = '严重' | '高' | '中' | '低';

const ZERO_NEGATIVE_LEVEL_BY_ORDER: readonly ZeroNegativeRiskLevel[] = ['严重', '高', '中', '低'];

export const ZERO_NEGATIVE_LEVEL_RANK: Record<string, number> = { 严重: 0, 高: 1, 中: 2, 低: 3 };

/**
 * 金额档 + 命中类数双因子分档（R2-2）：命中 ≥ `ruleCountUpgrade` 类升一档，封顶「严重」。
 * 只对损失金额低于严重档的行生效，严重档不越界。
 */
export function riskLevelFromLoss(
  lossAmount: number,
  hitCount: number,
  tiers: ZeroNegativeRiskTiers,
): { level: ZeroNegativeRiskLevel; order: 0 | 1 | 2 | 3 } {
  const loss = Number.isFinite(lossAmount) ? lossAmount : 0;
  let order: number;
  if (loss >= tiers.criticalYuan) order = 0;
  else if (loss >= tiers.highYuan) order = 1;
  else if (loss >= tiers.mediumYuan) order = 2;
  else order = 3;
  const need = Number.isFinite(tiers.ruleCountUpgrade) ? Math.max(1, Math.trunc(tiers.ruleCountUpgrade)) : 1;
  if (hitCount >= need && order > 0) order -= 1;
  return { level: ZERO_NEGATIVE_LEVEL_BY_ORDER[order], order: order as 0 | 1 | 2 | 3 };
}

export interface ZeroNegativeSortableRow {
  risk_level?: unknown;
  loss_amount?: unknown;
  order_id?: unknown;
}

/** 行序唯一真值：等级升序（严重→低）→ 损失金额降序 → `order_id` 升序兜底（稳定） */
export function compareZeroNegativeRows<T extends ZeroNegativeSortableRow>(a: T, b: T): number {
  const ra = ZERO_NEGATIVE_LEVEL_RANK[String(a.risk_level)] ?? 4;
  const rb = ZERO_NEGATIVE_LEVEL_RANK[String(b.risk_level)] ?? 4;
  if (ra !== rb) return ra - rb;
  const la = Number(a.loss_amount);
  const lb = Number(b.loss_amount);
  const sa = Number.isFinite(la) ? la : 0;
  const sb = Number.isFinite(lb) ? lb : 0;
  if (sa !== sb) return sb - sa;
  const ia = String(a.order_id ?? '');
  const ib = String(b.order_id ?? '');
  if (ia === ib) return 0;
  return ia < ib ? -1 : 1;
}

/** 槽位表达式（P1 SQL 与抽屉预览共用同一拼装规则）：`COALESCE(<col>, 0)` 按槽位运算符串联 */
export function zeroNegativeSlotSql(slots: FormulaSlot[]): string {
  const parts = (slots ?? []).filter((s) => hasColumnValue(s?.column));
  if (parts.length === 0) return 'NULL::DOUBLE';
  return parts
    .map((s, i) => {
      const term = `COALESCE(${s.column}, 0)`;
      if (i === 0) return s.operator === '-' ? `-${term}` : term;
      return `${s.operator} ${term}`;
    })
    .join(' ');
}

/** 槽位人话：派生列取中文名，源列按投影别名翻成字段业务名，未配置回落 `?` */
export function zeroNegativeSlotHuman(slots: FormulaSlot[]): string {
  const parts = (slots ?? []).filter((s) => hasColumnValue(s?.column));
  if (parts.length === 0) return '?';
  return parts
    .map((s, i) => {
      const label = zeroNegativeSlotColumnLabel(s.column);
      if (i === 0) return s.operator === '-' ? `-${label}` : label;
      return `${s.operator} ${label}`;
    })
    .join(' ');
}

/** 槽位列 → 展示名（派生列中文名 > 源列字段业务名 > 原列名 > `?`） */
export function zeroNegativeSlotColumnLabel(column: string): string {
  if (!hasColumnValue(column)) return '?';
  const derived = ZERO_NEGATIVE_DERIVED_COL_LABEL[column as ZeroNegativeDerivedCol];
  if (derived) return derived;
  const field = ZERO_NEGATIVE_SOURCE_COL_FIELD[column as ZeroNegativeSourceCol];
  if (field) return ZERO_NEGATIVE_FIELD_LABEL[field];
  return column;
}

export interface ZeroNegativeFormulaPreview {
  expectedHuman: string;
  expectedSql: string;
  lossHuman: string;
  lossSql: string;
  /** 折叠区两行 SQL：与 `buildBaseCalcCte` / `buildCalcCte` 同源，抽屉直接渲染不再拼串 */
  sqlLines: string[];
}

/** 超额优惠并入损失项：P1 SQL 与抽屉预览共用同一表达式，避免两处口径漂移 */
export function zeroNegativeOverflowLossSql(includeOverflowLoss?: boolean): string {
  return includeOverflowLoss ? 'GREATEST(0, -expected_amount)' : '0';
}

/** SQL 预览两行（派生列与损失列的完整表达式，非裸槽位）：与真实执行 SQL 同源 */
export function buildZeroNegativeSqlPreviewLines(
  expectedSql: string,
  lossSql: string,
  includeOverflowLoss?: boolean,
): string[] {
  return [
    `(${expectedSql}) AS expected_amount`,
    `GREATEST(0, (${lossSql})) + ${zeroNegativeOverflowLossSql(includeOverflowLoss)} AS loss_amount`,
  ];
}

/** 公式预览纯函数（抽屉只渲染，不拼串）：人话主行 + 折叠 SQL 行 */
export function buildZeroNegativeFormulaPreview(
  cfg?: ZeroNegativeOrderDetectConfig,
): ZeroNegativeFormulaPreview {
  const resolved = cfg ?? DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG;
  const formula = resolved.formula;
  const expectedSlots = formula?.expectedSlots ?? [];
  const lossSlots = formula?.lossSlots ?? [];
  const expectedSql = zeroNegativeSlotSql(expectedSlots);
  const lossSql = zeroNegativeSlotSql(lossSlots);
  return {
    expectedHuman: zeroNegativeSlotHuman(expectedSlots),
    expectedSql,
    lossHuman: zeroNegativeSlotHuman(lossSlots),
    lossSql,
    sqlLines: buildZeroNegativeSqlPreviewLines(expectedSql, lossSql, resolved.includeOverflowLoss),
  };
}

/** 逐层深拷贝：默认常量是模块级单例，抽屉与策略不得共享其嵌套引用 */
export function cloneZeroNegativeOrderDetectConfig(
  cfg: ZeroNegativeOrderDetectConfig,
): ZeroNegativeOrderDetectConfig {
  return {
    fieldMapping: { ...cfg.fieldMapping },
    enabledRules: cfg.enabledRules ? [...cfg.enabledRules] : undefined,
    thresholds: { ...cfg.thresholds },
    tiers: { ...cfg.tiers },
    windows: { ...cfg.windows },
    excludeStatusValues: cfg.excludeStatusValues,
    exemptionValues: cfg.exemptionValues,
    includeOverflowLoss: cfg.includeOverflowLoss,
    formula: {
      expectedSlots: (cfg.formula?.expectedSlots ?? []).map((s) => ({ ...s })),
      lossSlots: (cfg.formula?.lossSlots ?? []).map((s) => ({ ...s })),
    },
    topN: cfg.topN,
  };
}

/** 默认配置：核心 6 条开启、增强 2 条关闭，零配置即得到宣称能力 */
export const DEFAULT_ZERO_NEGATIVE_ORDER_DETECT_CONFIG: ZeroNegativeOrderDetectConfig = {
  fieldMapping: {
    orderIdCol: '', orderTimeCol: '', orderStatusCol: '',
    payAmountCol: '', productAmountCol: '', discountTotalCol: '',
    quantityCol: '', unitPriceCol: '',
    couponAmountCol: '', platformDiscountCol: '', merchantDiscountCol: '',
    refundAmountCol: '', exemptionCol: '',
  },
  enabledRules: [...DEFAULT_ZERO_NEGATIVE_RULES],
  thresholds: { toleranceYuan: 0.01, mismatchMinYuan: 1, pennyOrderMaxYuan: 0.01 },
  tiers: { criticalYuan: 500, highYuan: 100, mediumYuan: 10, ruleCountUpgrade: 3 },
  windows: { observationDays: 0 },
  excludeStatusValues:
    '已取消,交易关闭,已退款,退款成功,已退货,退货退款,CANCELLED,CLOSED,REFUNDED,RETURNED',
  exemptionValues: '',
  includeOverflowLoss: true,
  formula: {
    expectedSlots: [
      { operator: '+', column: 'product_amount' },
      { operator: '-', column: 'discount_total' },
    ],
    lossSlots: [
      { operator: '+', column: 'expected_amount' },
      { operator: '-', column: 'net_pay_amount' },
    ],
  },
  topN: 5,
};
