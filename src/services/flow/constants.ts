/**
 * Flow Constants
 * Constants and configuration for the analysis flow feature
 */

import type { FlowColors } from './types';

// ============================================================================
// Color Scheme - Dark Theme with Orange Accent
// ============================================================================

export const FLOW_COLORS: FlowColors = {
  conditionGroup: {
    and: {
      background: 'rgba(250, 140, 22, 0.15)', // Orange transparent
      border: '#fa8c16',
      title: '#fa8c16',
    },
    or: {
      background: 'rgba(250, 140, 22, 0.25)', // Deeper orange
      border: '#ff9c2b',
      title: '#ff9c2b',
    },
    nested: {
      background: 'rgba(250, 140, 22, 0.35)', // Deepest orange
      border: '#ffac46',
      title: '#ffac46',
    },
  },
  node: {
    table: {
      background: '#1f1f1f',
      border: '#434343',
    },
    join: {
      background: '#1f1f1f',
      border: '#fa8c16',
    },
    condition: {
      background: '#1f1f1f',
      border: '#1890ff',
    },
    select: {
      background: '#1f1f1f',
      border: '#52c41a',
    },
    end: {
      background: '#1f1f1f',
      border: '#fa8c16',
    },
  },
  edge: {
    default: '#8c8c8c',
    selected: '#fa8c16',
    error: '#ff4d4f',
  },
};

// ============================================================================
// Layout Constants
// ============================================================================

export const FLOW_LAYOUT = {
  // Node dimensions
  nodeWidth: 240,
  nodeHeight: 48,
  tableNodeMinHeight: 120,
  tableNodeMaxHeight: 320,

  // Spacing
  layerSpacing: 300, // Horizontal spacing between layers
  nodeSpacing: 150, // Vertical spacing between nodes
  snapGrid: [15, 15] as [number, number],

  // Initial positions
  startX: 50,
  startY: 300,

  // Canvas bounds
  minZoom: 0.2,
  maxZoom: 2,
  defaultZoom: 1,
};

// ============================================================================
// Field Type Icons
// ============================================================================

export const FIELD_TYPE_ICONS: Record<string, { icon: string; color: string }> =
  {
    INTEGER: { icon: '#️⃣', color: '#1890ff' },
    BIGINT: { icon: '#️⃣', color: '#1890ff' },
    SMALLINT: { icon: '#️⃣', color: '#1890ff' },
    TINYINT: { icon: '#️⃣', color: '#1890ff' },
    DECIMAL: { icon: '🔢', color: '#1890ff' },
    NUMERIC: { icon: '🔢', color: '#1890ff' },
    REAL: { icon: '🔢', color: '#1890ff' },
    DOUBLE: { icon: '🔢', color: '#1890ff' },
    VARCHAR: { icon: '🔤', color: '#52c41a' },
    TEXT: { icon: '🔤', color: '#52c41a' },
    CHAR: { icon: '🔤', color: '#52c41a' },
    TIMESTAMP: { icon: '📅', color: '#fa8c16' },
    DATE: { icon: '📅', color: '#fa8c16' },
    TIME: { icon: '📅', color: '#fa8c16' },
    BOOLEAN: { icon: '☑️', color: '#722ed1' },
    BLOB: { icon: '📦', color: '#8c8c8c' },
    JSON: { icon: '📄', color: '#13c2c2' },
    UUID: { icon: '🔑', color: '#eb2f96' },
    ARRAY: { icon: '📋', color: '#8c8c8c' },
    UNKNOWN: { icon: '❓', color: '#8c8c8c' },
  };

// ============================================================================
// Operator Type Config
// ============================================================================

export const OPERATOR_CONFIG = {
  association: {
    name: '关联查询',
    description: '多表关联查询分析',
    icon: '🔗',
    color: '#1890ff',
  },
  anomaly: {
    name: '异常洞察',
    description: '基于孤立森林的异常检测',
    icon: '🔍',
    color: '#fa8c16',
  },
  clustering: {
    name: '用户聚类',
    description: '基于K-Means的用户分群',
    icon: '👥',
    color: '#52c41a',
  },
};

// ============================================================================
// Validation Messages
// ============================================================================

export const VALIDATION_MESSAGES = {
  // Node errors
  TABLE_NOT_SELECTED: '请选择数据源',
  JOIN_CONDITION_EMPTY: '请配置JOIN条件',
  CONDITION_INCOMPLETE: '请完整配置条件',
  SELECT_FIELD_EMPTY: '请至少选择一个字段',
  OPERATOR_NOT_SELECTED: '请选择业务算子',

  // Type errors
  TYPE_MISMATCH: '字段类型不匹配',
  INVALID_JOIN: '无效的关联关系',

  // Flow errors
  NO_TABLE: '请至少添加一个表',
  NO_JOIN_FOR_MULTIPLE_TABLES: '多表查询需要配置JOIN关系',
  CIRCULAR_REFERENCE: '存在循环引用',
};

// ============================================================================
// Performance Constants
// ============================================================================

export const PERFORMANCE = {
  // Virtual scroll
  virtualScrollThreshold: 50, // Fields count to trigger virtual scroll
  virtualScrollItemHeight: 32,

  // Debounce
  nodeUpdateDebounce: 100,
  validationDebounce: 300,

  // Limits
  maxTables: 20,
  maxFieldsDisplay: 5,
  maxConditions: 50,
  executionTimeout: 10000, // 10 seconds
};

// ============================================================================
// SQL Operators
// ============================================================================

export const SQL_OPERATORS = {
  comparison: [
    { value: '=', label: '等于' },
    { value: '!=', label: '不等于' },
    { value: '>', label: '大于' },
    { value: '>=', label: '大于等于' },
    { value: '<', label: '小于' },
    { value: '<=', label: '小于等于' },
  ],
  string: [
    { value: 'LIKE', label: '包含' },
    { value: 'NOT LIKE', label: '不包含' },
    { value: 'STARTS WITH', label: '开头是' },
    { value: 'ENDS WITH', label: '结尾是' },
  ],
  null: [
    { value: 'IS NULL', label: '为空' },
    { value: 'IS NOT NULL', label: '不为空' },
  ],
  set: [
    { value: 'IN', label: '在列表中' },
    { value: 'NOT IN', label: '不在列表中' },
  ],
};

// ============================================================================
// Join Type Labels
// ============================================================================

export const JOIN_TYPE_LABELS: Record<string, string> = {
  INNER: '内连',
  LEFT: '左连',
  RIGHT: '右连',
  CROSS: '交叉连接',
};
