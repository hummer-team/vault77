/**
 * Flow Service Types
 * Core type definitions for the analysis flow feature
 */

import type { Node, Edge } from '@xyflow/react';

// ============================================================================
// Enums
// ============================================================================

export enum FlowNodeType {
  START = 'start',
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
  UDF_REPLACE_COLUMN = 'udf_replace_column', // Data-cleaning: replace specific column values
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

export interface StartNodeData extends BaseNodeData {
  selectedTables?: string[];
}

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
 * Condition Definition Node Data
 * Represents a condition group with placeholders (CG1, CG2, etc.)
 * Used for deferred value filling
 */
export interface ConditionDefinitionNodeData extends BaseNodeData {
  refId: string; // User-visible name, e.g., "CG1", editable, max 5 chars, alphanumeric
  tableName: string;
  logicType: LogicType.AND; // Fixed to AND for internal conditions (Q4)
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
}

export interface SelectAggNodeData extends BaseNodeData {
  fields: SelectField[];
  groupByFields: string[];
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
  /** Replacement rules configured by the user */
  replacementRules: ReplaceRule[];
}

export interface EndNodeData extends BaseNodeData {
  operatorType: OperatorType;
  executable: boolean;
  errors: ValidationError[];
  executing?: boolean;
  result?: AnalysisResult;
}

export type FlowNodeData =
  | StartNodeData
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
  type?: 'default' | 'smoothstep' | 'straight';
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
  postProcess(queryResult: { data: any[]; schema: any[] }): Promise<AnalysisResult>;
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

  // Actions
  setFlowName: (name: string) => void;
  setOperatorType: (type: OperatorType) => void;
  setNodes: (nodes: FlowNode[]) => void;
  addNode: (node: FlowNode) => void;
  updateNode: (id: string, data: Partial<FlowNodeData>) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: FlowEdge) => void;
  removeEdge: (id: string) => void;
  setSelectedNode: (id: string | null) => void;
  setDetailPanelOpen: (open: boolean) => void;
  setErrorPanelOpen: (open: boolean) => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  resetFlow: () => void;

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
