/**
 * Flow Constants
 * Constants and configuration for the analysis flow feature
 */

import type { FlowColors } from './types';

// ============================================================================
// Color Scheme - Premium Dark Theme with Orange Accent
// Based on design system: Dark audio + warm accent
// ============================================================================

export const FLOW_COLORS: FlowColors = {
  conditionGroup: {
    and: {
      background: 'rgba(255, 107, 0, 0.12)', // Subtle orange transparent
      border: 'rgba(255, 107, 0, 0.6)',
      title: '#FF8533',
    },
    or: {
      background: 'rgba(255, 107, 0, 0.2)', // Deeper orange
      border: 'rgba(255, 133, 51, 0.7)',
      title: '#FF9A5C',
    },
    nested: {
      background: 'rgba(255, 107, 0, 0.28)', // Deepest orange
      border: 'rgba(255, 154, 92, 0.8)',
      title: '#FFAF85',
    },
  },
  node: {
    table: {
      background: 'rgba(28, 25, 23, 0.95)', // Warm dark
      border: 'rgba(68, 64, 60, 0.8)', // Stone-700
    },
    merge: {
      background: 'rgba(28, 25, 23, 0.98)',
      border: '#FF6B00', // Primary orange for + node
    },
    operator: {
      background: 'rgba(28, 25, 23, 0.95)',
      border: '#FA8C16', // Orange for business operator
    },
    join: {
      background: 'rgba(28, 25, 23, 0.95)',
      border: '#F97316', // Orange accent
    },
    condition: {
      background: 'rgba(28, 25, 23, 0.95)',
      border: '#3B82F6', // Blue accent
    },
    conditionDefinition: {
      background: 'rgba(28, 25, 23, 0.95)',
      border: '#8B5CF6', // Purple accent for condition definition nodes (CG1, CG2, etc.)
      title: '#A78BFA',
    },
    select: {
      background: 'rgba(28, 25, 23, 0.95)',
      border: '#10B981', // Emerald accent
    },
    end: {
      background: 'rgba(28, 25, 23, 0.95)',
      border: '#CA8A04', // Gold accent
    },
  },
  edge: {
    default: 'rgba(120, 113, 108, 0.6)', // Stone-500
    selected: '#FF6B00',
    error: '#EF4444',
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
  defaultZoom: 0.83,
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
  udf_replace_column: {
    name: '替换特定列值',
    description: '按规则替换指定列的数据值',
    icon: '🔄',
    color: '#722ed1',
  },
  udf_up_lower: {
    name: '大小写转换',
    description: '将指定列的字符串统一转换为大写或小写',
    icon: '🔠',
    color: '#722ed1',
  },
  udf_format_number: {
    name: '数字精度控制',
    description: '对指定列进行精度控制（四舍五入/截断/进位）',
    icon: '🔢',
    color: '#722ed1',
  },
  udf_flag_spec: {
    name: '数据标记',
    description: '根据条件对指定列进行打标/分类',
    icon: '🏷️',
    color: '#722ed1',
  },
  udf_format_date: {
    name: '日期时间格式化',
    description: '跨时区日期时间格式转换',
    icon: '📅',
    color: '#722ed1',
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

// ============================================================================
// Placeholder Naming Constants
// ============================================================================

/**
 * Placeholder naming rules:
 * - Prefix: CG (Condition Group)
 * - Group number: auto-incrementing (1, 2, 3...)
 * - Condition number: auto-incrementing within group (1, 2, 3...)
 * - Format: CG{group}_{condition} (e.g., CG1_1, CG1_2, CG2_1)
 */
export const PLACEHOLDER_CONSTANTS = {
  DEFAULT_PREFIX: 'CG',
  MAX_REF_ID_LENGTH: 5, // Q18: 5 character limit for node name
  ALLOWED_REF_ID_PATTERN: /^[a-zA-Z0-9]+$/, // Q18: alphanumeric only
  SEPARATOR: '_',
} as const;

// ============================================================================
// Merge Node Hint Texts (Q17: dynamically calculated based on upstream node)
// ============================================================================

export const MERGE_NODE_HINTS = {
  DEFAULT: '选择算子',
  AFTER_SELECT: '定义条件',
  AFTER_CONDITION_DEFINITION: '绑定关系',
  AFTER_RELATION: '执行OR保存',
} as const;

// ============================================================================
// Custom Expression Validation (Q3: only AND/OR/并且/或者 and parentheses)
// ============================================================================

export const CUSTOM_EXPRESSION_CONSTANTS = {
  ALLOWED_OPERATORS: ['AND', 'OR', '并且', '或者'],
  ALLOWED_PATTERNS: /^[a-zA-Z0-9_\s\(\)]+$/,
  MAX_NESTING_DEPTH: Infinity, // Q3: no limit
} as const;
