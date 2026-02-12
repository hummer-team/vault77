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
  JOIN = 'join',
  CONDITION = 'condition',
  CONDITION_GROUP = 'conditionGroup',
  SELECT = 'select',
  SELECT_AGG = 'selectAgg',
  END = 'end',
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
  selectedTable?: string;
}

export interface TableNodeData extends BaseNodeData {
  tableName: string;
  fields: Field[];
  expanded: boolean;
  alias: string;
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
}

export interface SelectAggNodeData extends BaseNodeData {
  fields: SelectField[];
  groupByFields: string[];
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
  | JoinNodeData
  | ConditionNodeData
  | ConditionGroupNodeData
  | SelectNodeData
  | SelectAggNodeData
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
  data: unknown;
  insights?: string[];
  visualizations?: {
    type: 'scatter' | 'radar' | 'table';
    config: unknown;
  }[];
}

export interface FlowStrategy {
  readonly type: OperatorType;
  readonly name: string;
  buildSql(nodes: FlowNode[], edges: FlowEdge[]): string;
  validate(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[];
  getRequiredNodes(): FlowNodeType[];
  postProcess(data: unknown): Promise<AnalysisResult>;
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

  // UI state
  selectedNodeId: string | null;
  detailPanelOpen: boolean;
  errorPanelOpen: boolean;
  validationErrors: ValidationError[];

  // Actions
  setFlowName: (name: string) => void;
  setOperatorType: (type: OperatorType) => void;
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
    join: { background: string; border: string };
    condition: { background: string; border: string };
    select: { background: string; border: string };
    end: { background: string; border: string };
  };
  edge: {
    default: string;
    selected: string;
    error: string;
  };
}
