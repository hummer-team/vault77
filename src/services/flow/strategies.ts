/**
 * Flow Strategy Implementations
 * Implements the strategy pattern for different business operators
 */

import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type FlowStrategy,
  type ValidationError,
  type AnalysisResult,
  type FlowNode,
  type FlowEdge,
  type JoinNodeData,
  type JoinEdgeData,
  type ConditionNodeData,
  type SelectNodeData,
  type SelectAggNodeData,
  type ConditionGroupDefinitionNodeData,
  type ConditionGroupRelationNodeData,
  type ConditionItem,
} from './types';
import { VALIDATION_MESSAGES } from './constants';
import { LogicType, FieldType } from './types';

/** Field types that should be emitted as unquoted numeric literals in SQL */
const NUMERIC_FIELD_TYPES = new Set<string>([
  FieldType.INTEGER, FieldType.BIGINT, FieldType.SMALLINT, FieldType.TINYINT,
  FieldType.DECIMAL, FieldType.NUMERIC, FieldType.REAL, FieldType.DOUBLE,
]);

/** Convert an edge joinType string to the SQL keyword used before JOIN */
function edgeJoinKeyword(joinType: string | undefined): string {
  switch ((joinType ?? '').toLowerCase()) {
    case 'inner': return 'INNER';
    case 'left':  return 'LEFT';
    case 'right': return 'RIGHT';
    case 'full':  return 'FULL OUTER';
    default:      return 'INNER';
  }
}

/**
 * Base Strategy Class
 * Provides common functionality for all strategies
 */
export abstract class BaseStrategy implements FlowStrategy {
  abstract readonly type: OperatorType;
  abstract readonly name: string;

  abstract getRequiredNodes(): FlowNodeType[];
  abstract postProcess(data: unknown): Promise<AnalysisResult>;

  /**
   * Sealed SQL assembly template.
   * Step 1: compute userWhere from condition nodes (unified, handles both CONDITION
   *         and CONDITION_GROUP_DEFINITION node types).
   * Step 2: delegate to buildOperatorSql, passing userWhere as a ready-to-use string.
   *
   * Subclasses must NOT override this method — implement buildOperatorSql instead.
   */
  buildSql(nodes: FlowNode[], edges: FlowEdge[], placeholderValues?: Record<string, unknown>): string {
    const userWhere = this.buildWhereClauseUnified(nodes, placeholderValues);
    return this.buildOperatorSql(nodes, edges, placeholderValues, userWhere);
  }

  /**
   * Operator SQL builder hook — all strategies must implement this.
   *
   * @param nodes             - Canvas nodes
   * @param edges             - Canvas edges
   * @param placeholderValues - Filled-in placeholder values (may be undefined)
   * @param userWhere         - Pre-computed WHERE clause string (e.g. "WHERE ...").
   *                           Empty string '' when no conditions are defined.
   *                           Strategies decide WHERE to inject this in their SQL
   *                           (append to parts[] for flat SELECT; inject into first
   *                           CTE FROM clause for CTE-based strategies).
   */
  protected abstract buildOperatorSql(
    nodes: FlowNode[],
    edges: FlowEdge[],
    placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string;

  /**
   * Unified WHERE clause builder.
   * Detects which condition node type is present and dispatches accordingly:
   *   - CONDITION_GROUP_DEFINITION nodes → buildWhereClauseWithPlaceholders (new style)
   *   - CONDITION nodes only            → buildWhereClause (legacy style)
   * Returns '' when no condition nodes are present.
   */
  protected buildWhereClauseUnified(
    nodes: FlowNode[],
    placeholderValues?: Record<string, unknown>
  ): string {
    const hasGroupDefs = nodes.some((n) => n.type === FlowNodeType.CONDITION_GROUP_DEFINITION);
    if (hasGroupDefs) {
      return this.buildWhereClauseWithPlaceholders(nodes, placeholderValues ?? {});
    }
    return this.buildWhereClause(nodes);
  }

  validate(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
    const nodeTypes = nodes.map((n) => n.type).join(', ');
    console.log(`[${this.name}.validate] nodes=[${nodeTypes}]`);

    const errors: ValidationError[] = [
      ...this._validateStructure(nodes, edges),
      ...this.validateOperatorSpecific(nodes, edges),
    ];

    if (errors.length > 0) {
      console.warn(`[${this.name}.validate] ${errors.length} error(s):`, errors.map((e) => e.message));
    } else {
      console.log(`[${this.name}.validate] OK — no errors`);
    }
    return errors;
  }

  /**
   * Template method: operator-specific validation hook.
   * Default validates SELECT node field selection; subclasses may override.
   */
  protected validateOperatorSpecific(nodes: FlowNode[], _edges: FlowEdge[]): ValidationError[] {
    return this._validateSelectNodes(nodes);
  }

  /** Validate structural requirements: required nodes, tables, joins */
  private _validateStructure(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for required nodes
    const requiredNodes = this.getRequiredNodes();
    requiredNodes.forEach((nodeType) => {
      const hasNode = nodes.some((n) => n.type === nodeType);
      if (!hasNode) {
        errors.push({
          nodeId: 'flow',
          nodeType: FlowNodeType.END,
          message: `缺少必需的节点类型: ${nodeType}`,
          severity: ValidationSeverity.ERROR,
        });
      }
    });

    // Validate table nodes
    const tableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);
    if (tableNodes.length === 0) {
      errors.push({
        nodeId: 'flow',
        nodeType: FlowNodeType.END,
        message: VALIDATION_MESSAGES.NO_TABLE,
        severity: ValidationSeverity.ERROR,
      });
    }

    // Validate join configuration if multiple tables.
    // Accepts either legacy JOIN nodes OR edge-based joins (from TableJoinBuildPanel).
    if (tableNodes.length > 1) {
      const joinNodes = nodes.filter((n) => n.type === FlowNodeType.JOIN);
      const joinEdges = edges.filter(
        (e) => e.type === 'join' && (e.data as JoinEdgeData | undefined)?.configured === true
      );

      if (joinNodes.length === 0 && joinEdges.length === 0) {
        errors.push({
          nodeId: 'flow',
          nodeType: FlowNodeType.END,
          message: VALIDATION_MESSAGES.NO_JOIN_FOR_MULTIPLE_TABLES,
          severity: ValidationSeverity.ERROR,
        });
      }

      // Validate legacy JOIN node conditions
      joinNodes.forEach((node) => {
        const joinData = node.data as JoinNodeData;
        if (joinData.conditions.length === 0) {
          errors.push({
            nodeId: node.id,
            nodeType: node.type,
            message: VALIDATION_MESSAGES.JOIN_CONDITION_EMPTY,
            severity: ValidationSeverity.ERROR,
          });
        }
      });

      // Validate edge-based join conditions
      joinEdges.forEach((edge) => {
        const joinData = edge.data as JoinEdgeData;
        if (!joinData.conditions || joinData.conditions.length === 0) {
          errors.push({
            nodeId: edge.id,
            nodeType: FlowNodeType.JOIN,
            message: VALIDATION_MESSAGES.JOIN_CONDITION_EMPTY,
            severity: ValidationSeverity.ERROR,
          });
        }
      });
    }

    return errors;
  }

  /** Validate SELECT nodes have at least one field selected */
  private _validateSelectNodes(nodes: FlowNode[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const selectNodes = nodes.filter(
      (n) => n.type === FlowNodeType.SELECT || n.type === FlowNodeType.SELECT_AGG
    );
    if (selectNodes.length === 0) {
      errors.push({
        nodeId: 'flow',
        nodeType: FlowNodeType.END,
        message: '缺少选择列节点',
        severity: ValidationSeverity.WARNING,
      });
    } else {
      selectNodes.forEach((node) => {
        const selectData = node.data as SelectNodeData | SelectAggNodeData;
        if (!('selectAll' in selectData) || (!selectData.selectAll && selectData.fields.length === 0)) {
          errors.push({
            nodeId: node.id,
            nodeType: node.type,
            message: VALIDATION_MESSAGES.SELECT_FIELD_EMPTY,
            severity: ValidationSeverity.ERROR,
          });
        }
      });
    }
    return errors;
  }

  /**
   * Helper: Build FROM clause
   */
  protected buildFromClause(nodes: FlowNode[]): string {
    const tableNodes = nodes.filter((n) => n.type === FlowNodeType.TABLE);
    if (tableNodes.length === 0) return '';

    const firstTable = tableNodes[0].data as { tableName: string };
    return `FROM "${firstTable.tableName}"`;
  }

  /**
   * Helper: Build FROM + JOIN clauses from edge-based join configuration.
   *
   * Uses actual table names (not aliases) so the result is compatible with
   * buildSelectClause / buildWhereClause which emit "tableName"."col" references.
   *
   * Returns '' when no configured join edges are found (caller should fall back
   * to buildFromClause + buildJoinClauses for legacy node-based joins).
   */
  protected buildEdgeJoinFromClause(edges: FlowEdge[]): string {
    const joinEdges = edges
      .filter((e) => e.type === 'join' && (e.data as JoinEdgeData | undefined)?.configured)
      .sort((a, b) => ((a.data as JoinEdgeData).order ?? 0) - ((b.data as JoinEdgeData).order ?? 0));

    if (joinEdges.length === 0) return '';

    // Derive ordered table list from the join chain
    const orderedTables: string[] = [];
    for (const edge of joinEdges) {
      const d = edge.data as JoinEdgeData;
      if (!orderedTables.includes(d.sourceTableName)) orderedTables.push(d.sourceTableName);
      if (!orderedTables.includes(d.targetTableName)) orderedTables.push(d.targetTableName);
    }

    const mainTable = orderedTables[0];
    let sql = `FROM "${mainTable.replace(/"/g, '""')}"`;

    for (const edge of joinEdges) {
      const d = edge.data as JoinEdgeData;
      const keyword = edgeJoinKeyword(d.joinType);
      const target = d.targetTableName.replace(/"/g, '""');
      const onClauses = (d.conditions ?? [])
        .map((c) => {
          const op = c.operator || '=';
          return `"${c.leftTable.replace(/"/g, '""')}"."${c.leftField.replace(/"/g, '""')}" ${op} "${c.rightTable.replace(/"/g, '""')}"."${c.rightField.replace(/"/g, '""')}"`;
        })
        .join(' AND ');
      sql += `\n${keyword} JOIN "${target}" ON ${onClauses || 'TRUE'}`;
    }

    return sql;
  }

  /**
   * Helper: Build JOIN clauses
   */
  protected buildJoinClauses(nodes: FlowNode[]): string {
    const joinNodes = nodes
      .filter((n) => n.type === FlowNodeType.JOIN)
      .sort((a, b) => {
        const aData = a.data as JoinNodeData;
        const bData = b.data as JoinNodeData;
        return aData.order - bData.order;
      });

    return joinNodes
      .map((node) => {
        const joinData = node.data as JoinNodeData;
        const conditions = joinData.conditions
          .map((cond) => `${cond.leftTable}.${cond.leftField} = ${cond.rightTable}.${cond.rightField}`)
          .join(' AND ');

        return `${joinData.joinType} JOIN ${joinData.rightTable} ON ${conditions}`;
      })
      .join('\n');
  }

  /**
   * Helper: Build WHERE clause
   */
  protected buildWhereClause(nodes: FlowNode[]): string {
    const conditionNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION);
    if (conditionNodes.length === 0) return '';

    const conditions = conditionNodes.map((node) => {
      const condData = node.data as ConditionNodeData;
      let condition = `"${condData.tableName}"."${condData.field}" ${condData.operator}`;

      if (!condData.operator.includes('NULL')) {
        if (Array.isArray(condData.value)) {
          condition += ` (${condData.value.map((v) => `'${v}'`).join(', ')})`;
        } else {
          condition += ` '${condData.value}'`;
        }
      }

      return condition;
    });

    return conditions.length > 0 ? `WHERE ${conditions.join(` ${conditionNodes[0].data.logicType} `)}` : '';
  }

  /**
   * Helper: Build SELECT clause
   */
  protected buildSelectClause(nodes: FlowNode[]): string {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT || n.type === FlowNodeType.SELECT_AGG);
    if (!selectNode) return 'SELECT *';

    const selectData = selectNode.data as SelectNodeData | SelectAggNodeData;

    if ('selectAll' in selectData && selectData.selectAll) {
      return 'SELECT *';
    }

    const fields = selectData.fields.map((field) => {
      let fieldExpr = `"${field.tableName}"."${field.fieldName}"`;

      if (field.aggregate) {
        fieldExpr = `${field.aggregate}(${fieldExpr})`;
      }

      if (field.alias) {
        fieldExpr += ` AS "${field.alias}"`;
      }

      return fieldExpr;
    });

    return `SELECT ${fields.join(', ')}`;
  }

  /**
   * Helper: Build GROUP BY clause
   */
  protected buildGroupByClause(nodes: FlowNode[]): string {
    const selectAggNode = nodes.find((n) => n.type === FlowNodeType.SELECT_AGG);
    if (!selectAggNode) return '';

    const aggData = selectAggNode.data as SelectAggNodeData;
    if (aggData.groupByFields.length === 0) return '';

    return `GROUP BY ${aggData.groupByFields.join(', ')}`;
  }

  /**
   * Helper: Build WHERE clause with placeholders (Q8)
   * Supports condition definition nodes with placeholder values
   */
  protected buildWhereClauseWithPlaceholders(
    nodes: FlowNode[],
    placeholderValues: Record<string, unknown>
  ): string {
    // Get condition definition nodes
    const conditionDefNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION_GROUP_DEFINITION);
    if (conditionDefNodes.length === 0) return '';

    // Get condition group nodes (relation nodes)
    const conditionGroupNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION_GROUP_RELATION);

    // If no relation nodes, combine all condition definitions with AND
    if (conditionGroupNodes.length === 0) {
      const allConditions = this.buildConditionDefinitionSql(
        conditionDefNodes,
        placeholderValues,
        LogicType.AND
      );
      return allConditions ? `WHERE ${allConditions}` : '';
    }

    // Use the first condition group node to determine logic
    const groupNode = conditionGroupNodes[0];
    const groupData = groupNode.data as ConditionGroupRelationNodeData;

    // Handle custom expression (Q9: string replacement approach)
    if (groupData.relationType === 'CUSTOM' && groupData.customExpression) {
      const sql = this.parseCustomExpression(
        groupData.customExpression,
        conditionDefNodes,
        placeholderValues
      );
      return sql ? `WHERE ${sql}` : '';
    }

    // Handle AND/OR mode
    const selectedConditionIds = groupData.conditionIds || [];
    const selectedNodes = conditionDefNodes.filter((n) => {
      const nodeData = n.data as ConditionGroupDefinitionNodeData;
      return selectedConditionIds.includes(nodeData.refId);
    });

    if (selectedNodes.length === 0) return '';

    const logicType = groupData.logicType || LogicType.AND;
    const conditions = this.buildConditionDefinitionSql(
      selectedNodes,
      placeholderValues,
      logicType
    );

    return conditions ? `WHERE ${conditions}` : '';
  }

  /**
   * Helper: Build SQL for condition definition nodes
   */
  private buildConditionDefinitionSql(
    nodes: FlowNode[],
    placeholderValues: Record<string, unknown>,
    logicType: LogicType
  ): string {
    const conditions: string[] = [];

    for (const node of nodes) {
      const nodeData = node.data as ConditionGroupDefinitionNodeData;
      if (!nodeData.tableName) continue;

      const nodeConditions = nodeData.conditions
        .map((cond) => this.buildSingleConditionSql(cond, placeholderValues, nodeData.tableName))
        .filter(Boolean);

      if (nodeConditions.length > 0) {
        // Use node's own logicType to join conditions within the same node
        const nodeLogicType = nodeData.logicType || LogicType.AND;
        const nodeConditionsSql = nodeConditions.join(` ${nodeLogicType} `);
        conditions.push(`(${nodeConditionsSql})`);
      }
    }

    // Use inter-node logicType to join between different nodes
    return conditions.join(` ${logicType} `);
  }

  /**
   * Helper: Build SQL for a single condition item.
   *
   * Operator-specific rules:
   *  - IS NULL / IS NOT NULL  → no value needed, always emits
   *  - IN / NOT IN            → value wrapped in (…); comma-separated strings are split
   *  - LIKE / NOT LIKE        → uses likeMode to position % wildcards (default: both sides)
   *  - STARTS WITH            → converted to LIKE 'value%' (DuckDB doesn't support STARTS WITH syntax)
   *  - ENDS WITH              → converted to LIKE '%value' (DuckDB doesn't support ENDS WITH syntax)
   *  - BETWEEN / NOT BETWEEN  → value parsed as "val1,val2"; emits col BETWEEN val1 AND val2
   *  - comparison operators   → scalar value
   */
  private buildSingleConditionSql(
    condition: ConditionItem,
    placeholderValues: Record<string, unknown>,
    tableName: string
  ): string {
    const op = condition.operator;
    const colRef = `"${tableName}"."${condition.field}"`;

    // IS NULL / IS NOT NULL — no placeholder value required
    if (op === 'IS NULL' || op === 'IS NOT NULL') {
      return `${colRef} ${op}`;
    }

    const value = placeholderValues[condition.placeholder];

    // Skip conditions whose placeholder has not been filled
    if (value === undefined || value === null || value === '') {
      return '';
    }

    // IN / NOT IN — must be wrapped in parentheses
    if (op === 'IN' || op === 'NOT IN') {
      if (Array.isArray(value)) {
        const items = value.map((v) => this.escapeSqlValue(v, condition.valueType)).join(', ');
        return `${colRef} ${op} (${items})`;
      }
      // Parse user input with common separators: comma, semicolon (full/half), Chinese enum comma, newline
      // e.g. "1, 2; 3" or "a\nb\nc" all normalise to ["1","2","3"]
      const MULTI_VALUE_SPLIT_RE = /[,，;；、\n\r]+/;
      const items = String(value)
        .split(MULTI_VALUE_SPLIT_RE)
        .map((v) => v.trim())
        .filter((v) => v !== '')
        .map((v) => this.escapeSqlValue(v, condition.valueType))
        .join(', ');
      return `${colRef} ${op} (${items})`;
    }

    // BETWEEN / NOT BETWEEN — parse "val1,val2" into range
    if (op === 'BETWEEN' || op === 'NOT BETWEEN') {
      const raw = String(Array.isArray(value) ? value[0] : value).trim();
      const BETWEEN_SPLIT_RE = /[,，;；]+/;
      const parts = raw.split(BETWEEN_SPLIT_RE).map((v) => v.trim()).filter((v) => v !== '');
      if (parts.length >= 2) {
        const v1 = this.escapeSqlValue(parts[0], condition.valueType);
        const v2 = this.escapeSqlValue(parts[1], condition.valueType);
        return `${colRef} ${op} ${v1} AND ${v2}`;
      }
      // Insufficient parts — skip this condition
      return '';
    }

    const strVal = String(Array.isArray(value) ? value[0] : value).trim();

    // STARTS WITH → DuckDB does not support this syntax; rewrite as LIKE 'val%'
    if (op === 'STARTS WITH') {
      const escaped = strVal.replace(/'/g, "''");
      return `${colRef} LIKE '${escaped}%'`;
    }

    // ENDS WITH → DuckDB does not support this syntax; rewrite as LIKE '%val'
    if (op === 'ENDS WITH') {
      const escaped = strVal.replace(/'/g, "''");
      return `${colRef} LIKE '%${escaped}'`;
    }

    // LIKE / NOT LIKE — apply wildcard pattern based on likeMode
    if (op === 'LIKE' || op === 'NOT LIKE') {
      const escaped = strVal.replace(/'/g, "''");
      const likeMode = condition.likeMode ?? 'both';
      let pattern: string;
      if (likeMode === 'left') {
        pattern = `%${escaped}`;
      } else if (likeMode === 'right') {
        pattern = `${escaped}%`;
      } else {
        // 'both' is the default
        pattern = `%${escaped}%`;
      }
      return `${colRef} ${op} '${pattern}'`;
    }

    // All other comparison operators — scalar value
    const sqlValue = Array.isArray(value)
      ? this.escapeSqlValue(value[0], condition.valueType)
      : this.escapeSqlValue(value, condition.valueType);

    return `${colRef} ${op} ${sqlValue}`;
  }

  /**
   * Helper: Escape a SQL literal value.
   * When fieldType is a numeric type, numeric strings are cast to numbers (no quotes).
   */
  private escapeSqlValue(value: unknown, fieldType?: string): string {
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value === null) return 'NULL';

    const str = String(value).trim();

    // Numeric field → try to cast string to number to avoid unnecessary quotes
    if (fieldType && NUMERIC_FIELD_TYPES.has(fieldType)) {
      const n = Number(str);
      if (!isNaN(n) && str !== '') return String(n);
    }

    return `'${str.replace(/'/g, "''")}'`;
  }

  /**
   * Helper: Parse custom expression (Q9: string replacement)
   * Replaces GC1, GC2, etc. with actual SQL conditions
   */
  private parseCustomExpression(
    expression: string,
    conditionDefNodes: FlowNode[],
    placeholderValues: Record<string, unknown>
  ): string {
    let sql = expression;

    // Replace Chinese operators with English
    sql = sql.replace(/并且/gi, 'AND');
    sql = sql.replace(/或者/gi, 'OR');

    // Replace each condition definition ref with its SQL
    for (const node of conditionDefNodes) {
      const nodeData = node.data as ConditionGroupDefinitionNodeData;
      const refId = nodeData.refId;

      // Build SQL for this condition group
      const nodeConditions = nodeData.conditions
        .map((cond) => this.buildSingleConditionSql(cond, placeholderValues, nodeData.tableName))
        .filter(Boolean);

      if (nodeConditions.length > 0) {
        const nodeSql = `(${nodeConditions.join(' AND ')})`;
        // Replace refId with SQL (word boundary to avoid partial matches)
        const refPattern = new RegExp(`\\b${refId}\\b`, 'gi');
        sql = sql.replace(refPattern, nodeSql);
      }
    }

    return sql;
  }
}
