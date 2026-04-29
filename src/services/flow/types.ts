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
  CONDITION_GROUP = 'conditionGroup',
  CONDITION_DEFINITION = 'conditionDefinition', // Condition group with placeholders (CG1, CG2, etc.)
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

export interface ConditionGroupNodeData extends BaseNodeData {
  logicType: LogicType;
  conditionIds: string[];
  customExpression?: string; // For CUSTOM type (Q14): e.g., "CG1 AND (CG2 OR CG3)"
  relationType?: 'AND' | 'OR' | 'CUSTOM'; // Extended logic type for relation node
  savedConditionIds?: string[]; // Backup of conditionIds when switching to CUSTOM mode
  savedLogicType?: LogicType; // Backup of logicType when switching to CUSTOM mode
  relationDisplayName?: string; // User-friendly display name for relation node, e.g., "关系_1" (template uses CG_1 placeholder)
}

/**
 * Condition item within a condition definition node
 * Represents a single condition line with placeholder
 */
export interface ConditionItem {
  id: string;
  field: string;
  operator: string;
  placeholder: string; // e.g., "CG1_1", "CG1_2"
  valueType: FieldType;
  value?: string | number | null | string[]; // Actual value filled later
}

/**
 * Condition Definition Node Data (条件组)
 * Represents a group of conditions with placeholders (GC_1, GC_2, etc.)
 * Used for deferred value filling
 */
export interface ConditionDefinitionNodeData extends BaseNodeData {
  refId: string; // Internal ID for templates, e.g., "GC_1" (was "CG1")
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
// UDF Node Data Types
// ============================================================================

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
  | ConditionGroupNodeData
  | ConditionDefinitionNodeData
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
  warnings: ValidationError[];
}

// ============================================================================
// Strategy Types
// ============================================================================

export interface AnalysisResult {
  type: OperatorType;
  sql: string;
  data: any[];
  schema?: any[];
  insights?: string[];
  visualizations?: {
    type: 'scatter' | 'radar' | 'table';
    config: unknown;
  }[];
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
  placeholderValues: Record<string, unknown>; // { "CG1_1": value, "CG1_2": value }

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
