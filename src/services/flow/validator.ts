/**
 * Flow Validator
 * Comprehensive validation for flow configurations
 */

import {
  FlowNodeType,
  JoinType,
  FieldType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
  type ValidationError,
  type TableNodeData,
  type JoinNodeData,
  type ConditionNodeData,
  type SelectNodeData,
  type SelectAggNodeData,
  type EndNodeData,
} from './types';
import { VALIDATION_MESSAGES } from './constants';

/**
 * Validate entire flow configuration
 */
export function validateFlow(
  nodes: FlowNode[],
  edges: FlowEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Required node validation
  errors.push(...validateRequiredNodes(nodes));

  // 2. Table node validation
  errors.push(...validateTableNodes(nodes));

  // 3. Join node validation
  errors.push(...validateJoinNodes(nodes, edges));

  // 4. Condition node validation
  errors.push(...validateConditionNodes(nodes));

  // 5. Select node validation
  errors.push(...validateSelectNodes(nodes));

  // 6. End node validation
  errors.push(...validateEndNode(nodes));

  // 7. Circular dependency check
  errors.push(...detectCircularDependencies(nodes, edges));

  // 8. Connection validation
  errors.push(...validateConnections(nodes, edges));

  return errors;
}

/**
 * Validate required nodes exist
 */
function validateRequiredNodes(nodes: FlowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Must have at least one table node
  const hasTableNode = nodes.some((n) => n.type === FlowNodeType.TABLE);
  if (!hasTableNode) {
    errors.push({
      nodeId: 'flow',
      nodeType: FlowNodeType.END,
      message: VALIDATION_MESSAGES.NO_TABLE,
      severity: ValidationSeverity.ERROR,
    });
  }

  // Must have exactly one end node
  const endNodes = nodes.filter((n) => n.type === FlowNodeType.END);
  if (endNodes.length === 0) {
    errors.push({
      nodeId: 'flow',
      nodeType: FlowNodeType.END,
      message: '缺少结束节点',
      severity: ValidationSeverity.ERROR,
    });
  } else if (endNodes.length > 1) {
    errors.push({
      nodeId: 'flow',
      nodeType: FlowNodeType.END,
      message: '只能有一个结束节点',
      severity: ValidationSeverity.ERROR,
    });
  }

  return errors;
}

/**
 * Validate table nodes
 */
function validateTableNodes(nodes: FlowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const tableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);

  tableNodes.forEach((node) => {
    const data = node.data as TableNodeData;

    // Check table name is not empty
    if (!data.tableName || data.tableName.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: VALIDATION_MESSAGES.TABLE_NOT_SELECTED,
        severity: ValidationSeverity.ERROR,
      });
    }

    // Check fields exist
    if (!data.fields || data.fields.length === 0) {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: '表没有字段',
        severity: ValidationSeverity.ERROR,
      });
    }

    // Check for duplicate table aliases
    const alias = data.alias;
    if (alias) {
      const duplicateAlias = tableNodes.some(
        (n) =>
          n.id !== node.id &&
          (n.data as TableNodeData).alias === alias
      );
      if (duplicateAlias) {
        errors.push({
          nodeId: node.id,
          nodeType: node.type,
          message: `表别名 "${alias}" 重复`,
          severity: ValidationSeverity.ERROR,
        });
      }
    }
  });

  return errors;
}

/**
 * Validate join nodes
 */
function validateJoinNodes(
  nodes: FlowNode[],
  _edges: FlowEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const tableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);
  const joinNodes = nodes.filter((n) => n.type === FlowNodeType.JOIN);

  // If multiple tables, must have join nodes
  if (tableNodes.length > 1 && joinNodes.length === 0) {
    errors.push({
      nodeId: 'flow',
      nodeType: FlowNodeType.END,
      message: VALIDATION_MESSAGES.NO_JOIN_FOR_MULTIPLE_TABLES,
      severity: ValidationSeverity.ERROR,
    });
  }

  joinNodes.forEach((node) => {
    const data = node.data as JoinNodeData;

    // Check join conditions exist
    if (!data.conditions || data.conditions.length === 0) {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: VALIDATION_MESSAGES.JOIN_CONDITION_EMPTY,
        severity: ValidationSeverity.ERROR,
      });
      return;
    }

    // Validate each join condition
    data.conditions.forEach((condition, index) => {
      // Check tables exist
      const leftTable = tableNodes.find(
        (n) => (n.data as TableNodeData).tableName === condition.leftTable
      );
      const rightTable = tableNodes.find(
        (n) => (n.data as TableNodeData).tableName === condition.rightTable
      );

      if (!leftTable) {
        errors.push({
          nodeId: node.id,
          nodeType: node.type,
          message: `JOIN条件${index + 1}: 左表 "${condition.leftTable}" 不存在`,
          severity: ValidationSeverity.ERROR,
        });
      }

      if (!rightTable) {
        errors.push({
          nodeId: node.id,
          nodeType: node.type,
          message: `JOIN条件${index + 1}: 右表 "${condition.rightTable}" 不存在`,
          severity: ValidationSeverity.ERROR,
        });
      }

      // Check fields exist and types match
      if (leftTable && rightTable) {
        const leftTableData = leftTable.data as TableNodeData;
        const rightTableData = rightTable.data as TableNodeData;

        const leftField = leftTableData.fields.find(
          (f) => f.name === condition.leftField
        );
        const rightField = rightTableData.fields.find(
          (f) => f.name === condition.rightField
        );

        if (!leftField) {
          errors.push({
            nodeId: node.id,
            nodeType: node.type,
            message: `JOIN条件${index + 1}: 左表字段 "${condition.leftField}" 不存在`,
            severity: ValidationSeverity.ERROR,
          });
        }

        if (!rightField) {
          errors.push({
            nodeId: node.id,
            nodeType: node.type,
            message: `JOIN条件${index + 1}: 右表字段 "${condition.rightField}" 不存在`,
            severity: ValidationSeverity.ERROR,
          });
        }

        // Check type compatibility
        if (leftField && rightField) {
          if (!areTypesCompatible(leftField.type, rightField.type)) {
            errors.push({
              nodeId: node.id,
              nodeType: node.type,
              message: `JOIN条件${index + 1}: 字段类型不匹配 (${leftField.type} vs ${rightField.type})`,
              severity: ValidationSeverity.ERROR,
            });
          }
        }
      }
    });

    // Check join type is valid
    if (!Object.values(JoinType).includes(data.joinType)) {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: `无效的JOIN类型: ${data.joinType}`,
        severity: ValidationSeverity.ERROR,
      });
    }
  });

  return errors;
}

/**
 * Validate condition nodes
 */
function validateConditionNodes(nodes: FlowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const conditionNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION);
  const tableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);

  conditionNodes.forEach((node) => {
    const data = node.data as ConditionNodeData;

    // Check table exists
    if (!data.tableName || data.tableName.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: '请选择表',
        severity: ValidationSeverity.ERROR,
      });
      return;
    }

    const table = tableNodes.find(
      (n) => (n.data as TableNodeData).tableName === data.tableName
    );

    if (!table) {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: `表 "${data.tableName}" 不存在`,
        severity: ValidationSeverity.ERROR,
      });
      return;
    }

    // Check field exists
    if (!data.field || data.field.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: '请选择字段',
        severity: ValidationSeverity.ERROR,
      });
      return;
    }

    const tableData = table.data as TableNodeData;
    const field = tableData.fields.find((f) => f.name === data.field);

    if (!field) {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: `字段 "${data.field}" 不存在`,
        severity: ValidationSeverity.ERROR,
      });
      return;
    }

    // Check operator is not empty
    if (!data.operator || data.operator.trim() === '') {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: '请选择操作符',
        severity: ValidationSeverity.ERROR,
      });
    }

    // Check value is not empty (unless IS NULL / IS NOT NULL)
    if (
      !data.operator.includes('NULL') &&
      (data.value === null || data.value === undefined || data.value === '')
    ) {
      errors.push({
        nodeId: node.id,
        nodeType: node.type,
        message: '请输入条件值',
        severity: ValidationSeverity.ERROR,
      });
    }
  });

  return errors;
}

/**
 * Validate select nodes
 */
function validateSelectNodes(nodes: FlowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const selectNodes = nodes.filter(
    (n) => n.type === FlowNodeType.SELECT || n.type === FlowNodeType.SELECT_AGG
  );

  selectNodes.forEach((node) => {
    const data = node.data as SelectNodeData | SelectAggNodeData;

    // Check at least one field is selected (or selectAll is true)
    if ('selectAll' in data) {
      if (!data.selectAll && data.fields.length === 0) {
        errors.push({
          nodeId: node.id,
          nodeType: node.type,
          message: VALIDATION_MESSAGES.SELECT_FIELD_EMPTY,
          severity: ValidationSeverity.ERROR,
        });
      }
    } else {
      if (data.fields.length === 0) {
        errors.push({
          nodeId: node.id,
          nodeType: node.type,
          message: VALIDATION_MESSAGES.SELECT_FIELD_EMPTY,
          severity: ValidationSeverity.ERROR,
        });
      }
    }
  });

  return errors;
}

/**
 * Validate end node
 */
function validateEndNode(nodes: FlowNode[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const endNodes = nodes.filter((n) => n.type === FlowNodeType.END);

  if (endNodes.length === 0) {
    return errors; // Already checked in validateRequiredNodes
  }

  const endNode = endNodes[0];
  const data = endNode.data as EndNodeData;

  // Check operator type is selected
  if (!data.operatorType) {
    errors.push({
      nodeId: endNode.id,
      nodeType: endNode.type,
      message: VALIDATION_MESSAGES.OPERATOR_NOT_SELECTED,
      severity: ValidationSeverity.ERROR,
    });
  }

  return errors;
}

/**
 * Detect circular dependencies in the flow
 */
function detectCircularDependencies(
  nodes: FlowNode[],
  edges: FlowEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  // Build adjacency list
  const adjacencyList = new Map<string, string[]>();
  nodes.forEach((node) => {
    adjacencyList.set(node.id, []);
  });

  edges.forEach((edge) => {
    const targets = adjacencyList.get(edge.source) || [];
    targets.push(edge.target);
    adjacencyList.set(edge.source, targets);
  });

  // DFS to detect cycles
  function hasCycle(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  // Check each node
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (hasCycle(node.id)) {
        errors.push({
          nodeId: 'flow',
          nodeType: FlowNodeType.END,
          message: VALIDATION_MESSAGES.CIRCULAR_REFERENCE,
          severity: ValidationSeverity.ERROR,
        });
        break;
      }
    }
  }

  return errors;
}

/**
 * Validate connections between nodes
 */
function validateConnections(
  nodes: FlowNode[],
  _edges: FlowEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check all edges have valid source and target
  _edges.forEach((edge) => {
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);

    if (!sourceNode) {
      errors.push({
        nodeId: 'flow',
        nodeType: FlowNodeType.END,
        message: `连线源节点不存在: ${edge.source}`,
        severity: ValidationSeverity.ERROR,
      });
    }

    if (!targetNode) {
      errors.push({
        nodeId: 'flow',
        nodeType: FlowNodeType.END,
        message: `连线目标节点不存在: ${edge.target}`,
        severity: ValidationSeverity.ERROR,
      });
    }
  });

  return errors;
}

/**
 * Check if two field types are compatible for JOIN
 */
function areTypesCompatible(type1: FieldType, type2: FieldType): boolean {
  // Exact match
  if (type1 === type2) return true;

  // Numeric types are compatible with each other
  const numericTypes = [
    FieldType.INTEGER,
    FieldType.BIGINT,
    FieldType.SMALLINT,
    FieldType.TINYINT,
    FieldType.DECIMAL,
    FieldType.NUMERIC,
    FieldType.REAL,
    FieldType.DOUBLE,
  ];

  if (numericTypes.includes(type1) && numericTypes.includes(type2)) {
    return true;
  }

  // String types are compatible with each other
  const stringTypes = [FieldType.VARCHAR, FieldType.TEXT, FieldType.CHAR];

  if (stringTypes.includes(type1) && stringTypes.includes(type2)) {
    return true;
  }

  // Date/Time types are compatible with each other
  const dateTypes = [FieldType.DATE, FieldType.TIMESTAMP, FieldType.TIME];

  if (dateTypes.includes(type1) && dateTypes.includes(type2)) {
    return true;
  }

  return false;
}

/**
 * Validate a single node on update (real-time validation)
 */
export function validateNode(
  node: FlowNode,
  allNodes: FlowNode[],
  allEdges: FlowEdge[]
): ValidationError[] {
  const errors: ValidationError[] = [];

  switch (node.type) {
    case FlowNodeType.TABLE:
      errors.push(...validateTableNodes([node]));
      break;

    case FlowNodeType.JOIN:
      errors.push(...validateJoinNodes([node, ...allNodes], allEdges));
      break;

    case FlowNodeType.CONDITION:
      errors.push(...validateConditionNodes([node, ...allNodes]));
      break;

    case FlowNodeType.SELECT:
    case FlowNodeType.SELECT_AGG:
      errors.push(...validateSelectNodes([node]));
      break;

    case FlowNodeType.END:
      errors.push(...validateEndNode([node]));
      break;

    default:
      break;
  }

  return errors;
}

/**
 * Analyze SQL query plan for optimization suggestions
 */
export interface OptimizationSuggestion {
  type: 'index' | 'join_order' | 'filter_pushdown' | 'redundant_column';
  message: string;
  severity: 'info' | 'warning';
}

export async function analyzeQueryPlan(
  sql: string
): Promise<OptimizationSuggestion[]> {
  const suggestions: OptimizationSuggestion[] = [];
  
  const upperSql = sql.toUpperCase();

  // Check for missing WHERE clause on queries without LIMIT
  if (!upperSql.includes('WHERE') && !upperSql.includes('LIMIT')) {
    suggestions.push({
      type: 'filter_pushdown',
      message: '建议添加 WHERE 条件以减少扫描的数据量',
      severity: 'warning',
    });
  }

  // Check for SELECT *
  if (sql.includes('SELECT *')) {
    suggestions.push({
      type: 'redundant_column',
      message: '建议明确指定需要的列,避免使用 SELECT *',
      severity: 'info',
    });
  }

  // Check for multiple JOIN without proper conditions
  const joinCount = (sql.match(/JOIN/gi) || []).length;
  if (joinCount > 2) {
    suggestions.push({
      type: 'join_order',
      message: '多表JOIN建议优化JOIN顺序,将小表放在前面',
      severity: 'info',
    });
  }

  return suggestions;
}
