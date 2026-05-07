/**
 * Flow Constants
 * Constants and configuration for the analysis flow feature
 */

import type { FlowColors } from './types';
import { FieldType } from './types';

// ============================================================================
// Color Scheme - Premium Dark Theme with Orange Accent
// Based on design system: Dark audio + warm accent
// ============================================================================

export const FLOW_COLORS: FlowColors = {
  conditionGroup: {
    and: {
      background: 'var(--vm-primary-light)',
      border: 'var(--vm-primary)',
      title: 'var(--vm-primary-hover)',
    },
    or: {
      background: 'var(--vm-primary-glow)',
      border: 'var(--vm-primary-hover)',
      title: 'var(--vm-primary-hover)',
    },
    nested: {
      background: 'var(--vm-primary-border)',
      border: 'var(--vm-primary)',
      title: 'var(--vm-primary-hover)',
    },
  },
  node: {
    table: {
      background: 'var(--vm-flow-node-bg)',
      border: 'var(--vm-border-mid)',
    },
    merge: {
      background: 'var(--vm-flow-node-bg)',
      border: 'var(--vm-primary)',
    },
    operator: {
      background: 'var(--vm-flow-node-bg)',
      border: '#FA8C16',
    },
    join: {
      background: 'var(--vm-flow-node-bg)',
      border: '#F97316',
    },
    condition: {
      background: 'var(--vm-flow-node-bg)',
      border: '#3B82F6',
    },
    conditionDefinition: {
      background: 'var(--vm-flow-node-bg)',
      border: '#8B5CF6',
      title: '#A78BFA',
    },
    select: {
      background: 'var(--vm-flow-node-bg)',
      border: '#10B981',
    },
    end: {
      background: 'var(--vm-flow-node-bg)',
      border: '#CA8A04',
    },
  },
  edge: {
    default: 'var(--vm-border-mid)',
    selected: 'var(--vm-primary)',
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
  basic_stats: {
    name: '基础统计',
    description: '通用聚合统计分析',
    icon: '📊',
    color: '#13c2c2',
  },
  order_distribution: {
    name: '订单分布分析',
    description: '分析订单在时间趋势、金额区间、地域三个维度的分布',
    icon: '📦',
    color: '#eb2f96',
  },
  repurchase_cycle: {
    name: '复购周期分析',
    description: '计算品类平均消耗时间，标记流失预警用户',
    icon: '🔄',
    color: '#52c41a',
  },
  arbitrage_analyze: {
    name: '价格套利分析',
    description: '自动识别异常毛利、折扣失控、价格偏离、黄牛套利等风险订单',
    icon: '🛡️',
    color: '#f5222d',
  },
  inventory_forecast: {
    name: '库存需求预测',
    description: '基于历史需求数据，批量预测多SKU未来需求趋势',
    icon: '📈',
    color: '#1890ff',
  },
  market_basket: {
    name: '关联销售建议',
    description: '挖掘频繁共购商品对，支持关联推荐与套装设计',
    icon: '🛒',
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
    { value: 'LIKE', label: '模糊匹配' },
    { value: 'NOT LIKE', label: '不匹配' },
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
  range: [
    { value: 'BETWEEN', label: '介于' },
    { value: 'NOT BETWEEN', label: '不介于' },
  ],
};

export type OperatorOption = { value: string; label: string };

const _NUMERIC_TYPES = new Set<FieldType>([
  FieldType.INTEGER, FieldType.BIGINT, FieldType.SMALLINT, FieldType.TINYINT,
  FieldType.DECIMAL, FieldType.NUMERIC, FieldType.REAL, FieldType.DOUBLE,
]);
const _STRING_TYPES = new Set<FieldType>([FieldType.VARCHAR, FieldType.TEXT, FieldType.CHAR]);
const _DATE_TYPES   = new Set<FieldType>([FieldType.DATE, FieldType.TIMESTAMP, FieldType.TIME]);

/**
 * Returns the operator options available for the given field type.
 * String types expose LIKE / STARTS WITH / ENDS WITH; numeric and date types do not.
 * Pass `undefined` (no field selected yet) to get all operators.
 */
export function getOperatorsByFieldType(fieldType: FieldType | string | undefined): OperatorOption[] {
  if (!fieldType || fieldType === FieldType.UNKNOWN) {
    return [
      ...SQL_OPERATORS.comparison,
      ...SQL_OPERATORS.string,
      ...SQL_OPERATORS.null,
      ...SQL_OPERATORS.set,
      ...SQL_OPERATORS.range,
    ];
  }

  const ft = fieldType as FieldType;

  if (_STRING_TYPES.has(ft)) {
    return [
      ...SQL_OPERATORS.comparison,
      ...SQL_OPERATORS.string,
      ...SQL_OPERATORS.null,
      ...SQL_OPERATORS.set,
    ];
  }

  if (_NUMERIC_TYPES.has(ft)) {
    return [
      ...SQL_OPERATORS.comparison,
      ...SQL_OPERATORS.null,
      ...SQL_OPERATORS.set,
      ...SQL_OPERATORS.range,
    ];
  }

  if (_DATE_TYPES.has(ft)) {
    return [
      ...SQL_OPERATORS.comparison,
      ...SQL_OPERATORS.null,
      ...SQL_OPERATORS.set,
      ...SQL_OPERATORS.range,
    ];
  }

  if (ft === FieldType.BOOLEAN) {
    return [
      ...SQL_OPERATORS.comparison.filter((op) => op.value === '=' || op.value === '!='),
      ...SQL_OPERATORS.null,
    ];
  }

  // BLOB, JSON, UUID, ARRAY — null / set as safe fallback
  return [
    ...SQL_OPERATORS.null,
    ...SQL_OPERATORS.set,
  ];
}

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
 * 
 * Condition Group (ConditionGroupDefinitionNode):
 * - Prefix: GC (Condition Group)
 * - Group number: auto-incrementing (1, 2, 3...)
 * - Format: GC{group} (e.g., GC1, GC2) → DisplayName: "条件组_1", "条件组_2"
 *
 * Condition Value (condition within ConditionGroupDefinitionNode):
 * - Prefix: CV (Condition Value)
 * - Group number: matches parent group (1, 2, 3...)
 * - Condition number: auto-incrementing within group (1, 2, 3...)
 * - Format: CV{group}_{condition} (e.g., CV1_1, CV1_2, CV2_1) → DisplayName: "条件值_1", "条件值_2"
 */
export const PLACEHOLDER_CONSTANTS = {
  CONDITION_GROUP_PREFIX: 'GC',
  CONDITION_VALUE_PREFIX: 'CV',
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
