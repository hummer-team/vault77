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
  type ConditionNodeData,
  type SelectNodeData,
  type SelectAggNodeData,
  type ConditionDefinitionNodeData,
  type ConditionGroupNodeData,
  type ConditionItem,
} from './types';
import { VALIDATION_MESSAGES } from './constants';
import { LogicType } from './types';

/**
 * Base Strategy Class
 * Provides common functionality for all strategies
 */
abstract class BaseStrategy implements FlowStrategy {
  abstract readonly type: OperatorType;
  abstract readonly name: string;

  abstract buildSql(nodes: FlowNode[], edges: FlowEdge[]): string;
  abstract getRequiredNodes(): FlowNodeType[];
  abstract postProcess(data: unknown): Promise<AnalysisResult>;

  validate(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
    const nodeTypes = nodes.map((n) => n.type).join(', ');
    console.log(`[${this.name}.validate] nodes=[${nodeTypes}]`);

    const errors: ValidationError[] = [
      ...this._validateStructure(nodes),
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
  private _validateStructure(nodes: FlowNode[]): ValidationError[] {
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

    // Validate join nodes if multiple tables
    if (tableNodes.length > 1) {
      const joinNodes = nodes.filter((n) => n.type === FlowNodeType.JOIN);
      if (joinNodes.length === 0) {
        errors.push({
          nodeId: 'flow',
          nodeType: FlowNodeType.END,
          message: VALIDATION_MESSAGES.NO_JOIN_FOR_MULTIPLE_TABLES,
          severity: ValidationSeverity.ERROR,
        });
      }

      // Validate join conditions
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
    const conditionDefNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION_DEFINITION);
    console.log('[buildWhereClauseWithPlaceholders] Condition definition nodes:', conditionDefNodes.length);
    if (conditionDefNodes.length === 0) return '';

    // Get condition group nodes (relation nodes)
    const conditionGroupNodes = nodes.filter((n) => n.type === FlowNodeType.CONDITION_GROUP);
    console.log('[buildWhereClauseWithPlaceholders] Condition group nodes:', conditionGroupNodes.length);

    // If no relation nodes, combine all condition definitions with AND
    if (conditionGroupNodes.length === 0) {
      console.log('[buildWhereClauseWithPlaceholders] No group nodes, using all conditions with AND');
      const allConditions = this.buildConditionDefinitionSql(
        conditionDefNodes,
        placeholderValues,
        LogicType.AND
      );
      return allConditions ? `WHERE ${allConditions}` : '';
    }

    // Use the first condition group node to determine logic
    const groupNode = conditionGroupNodes[0];
    const groupData = groupNode.data as ConditionGroupNodeData;
    console.log('[buildWhereClauseWithPlaceholders] Group data:', {
      relationType: groupData.relationType,
      logicType: groupData.logicType,
      conditionIds: groupData.conditionIds,
      customExpression: groupData.customExpression,
    });

    // Handle custom expression (Q9: string replacement approach)
    if (groupData.relationType === 'CUSTOM' && groupData.customExpression) {
      console.log('[buildWhereClauseWithPlaceholders] Using CUSTOM expression');
      const sql = this.parseCustomExpression(
        groupData.customExpression,
        conditionDefNodes,
        placeholderValues
      );
      return sql ? `WHERE ${sql}` : '';
    }

    // Handle AND/OR mode
    const selectedConditionIds = groupData.conditionIds || [];
    console.log('[buildWhereClauseWithPlaceholders] Selected condition IDs:', selectedConditionIds);
    
    const selectedNodes = conditionDefNodes.filter((n) => {
      const nodeData = n.data as ConditionDefinitionNodeData;
      return selectedConditionIds.includes(nodeData.refId);
    });
    console.log('[buildWhereClauseWithPlaceholders] Selected nodes:', selectedNodes.length);

    if (selectedNodes.length === 0) {
      console.log('[buildWhereClauseWithPlaceholders] No selected nodes, returning empty WHERE');
      return '';
    }

    const logicType = groupData.logicType || LogicType.AND;
    const conditions = this.buildConditionDefinitionSql(
      selectedNodes,
      placeholderValues,
      logicType
    );
    console.log('[buildWhereClauseWithPlaceholders] Generated conditions:', conditions);

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
      const nodeData = node.data as ConditionDefinitionNodeData;
      if (!nodeData.tableName) continue;

      const nodeConditions = nodeData.conditions
        .map((cond) => this.buildSingleConditionSql(cond, placeholderValues, nodeData.tableName))
        .filter(Boolean);

      if (nodeConditions.length > 0) {
        // Group conditions within the same node with AND
        conditions.push(`(${nodeConditions.join(' AND ')})`);
      }
    }

    return conditions.join(` ${logicType} `);
  }

  /**
   * Helper: Build SQL for a single condition item
   */
  private buildSingleConditionSql(
    condition: ConditionItem,
    placeholderValues: Record<string, unknown>,
    tableName: string
  ): string {
    const value = placeholderValues[condition.placeholder];

    // If value is not filled, skip this condition
    if (value === undefined || value === null) {
      return '';
    }

    let sqlValue: string;

    // Format value based on type
    if (Array.isArray(value)) {
      sqlValue = `(${value.map((v) => this.escapeSqlValue(v)).join(', ')})`;
    } else {
      sqlValue = this.escapeSqlValue(value);
    }

    // Use table-qualified field name to avoid ambiguity
    return `"${tableName}"."${condition.field}" ${condition.operator} ${sqlValue}`;
  }

  /**
   * Helper: Escape SQL value
   */
  private escapeSqlValue(value: unknown): string {
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value === null) {
      return 'NULL';
    }
    // Escape single quotes for string values
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  /**
   * Helper: Parse custom expression (Q9: string replacement)
   * Replaces CG1, CG2, etc. with actual SQL conditions
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
      const nodeData = node.data as ConditionDefinitionNodeData;
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

/**
 * Association Strategy
 * Multi-table association query
 */
export class AssociationStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.ASSOCIATION;
  readonly name = '关联查询';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  buildSql(nodes: FlowNode[], _edges: FlowEdge[], placeholderValues?: Record<string, unknown>): string {
    const parts: string[] = [];

    // SELECT
    parts.push(this.buildSelectClause(nodes));

    // FROM
    parts.push(this.buildFromClause(nodes));

    // JOIN
    const joinClause = this.buildJoinClauses(nodes);
    if (joinClause) {
      parts.push(joinClause);
    }

    // WHERE — use placeholder-aware version if values provided
    if (placeholderValues && Object.keys(placeholderValues).length > 0) {
      const whereClause = this.buildWhereClauseWithPlaceholders(nodes, placeholderValues);
      if (whereClause) {
        parts.push(whereClause);
      }
    } else {
      const whereClause = this.buildWhereClause(nodes);
      if (whereClause) {
        parts.push(whereClause);
      }
    }

    // GROUP BY
    const groupByClause = this.buildGroupByClause(nodes);
    if (groupByClause) {
      parts.push(groupByClause);
    }

    const sql = parts.join('\n');
    console.log(`[${this.name}.buildSql] sql=\n${sql}`);
    return sql;
  }

  async postProcess(queryResult: { data: any[]; schema: any[] }): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '', // Will be filled by EndNode
      data: queryResult.data,
      schema: queryResult.schema,
      insights: ['关联查询执行成功'],
      visualizations: [
        {
          type: 'table',
          config: { data: queryResult.data },
        },
      ],
    };
  }
}

/**
 * Anomaly Strategy
 * Anomaly detection based on isolation forest
 */
export class AnomalyStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.ANOMALY;
  readonly name = '异常洞察';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  buildSql(nodes: FlowNode[], _edges: FlowEdge[]): string {
    // For anomaly detection, we need numerical fields
    const parts: string[] = [];

    parts.push(this.buildSelectClause(nodes));
    parts.push(this.buildFromClause(nodes));

    const joinClause = this.buildJoinClauses(nodes);
    if (joinClause) {
      parts.push(joinClause);
    }

    const whereClause = this.buildWhereClause(nodes);
    if (whereClause) {
      parts.push(whereClause);
    }

    return parts.join('\n');
  }

  async postProcess(queryResult: { data: any[]; schema: any[] }): Promise<AnalysisResult> {
    // In real implementation, this would call the anomaly detection algorithm
    return {
      type: this.type,
      sql: '', // Will be filled by EndNode
      data: queryResult.data,
      schema: queryResult.schema,
      insights: [
        '基于孤立森林算法的异常检测',
        '已标记异常数据点',
      ],
      visualizations: [
        {
          type: 'scatter',
          config: { data: queryResult.data, anomalyField: 'is_anomaly' },
        },
      ],
    };
  }
}

/**
 * Clustering Strategy
 * User clustering based on K-Means
 */
export class ClusteringStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.CLUSTERING;
  readonly name = '用户聚类';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  buildSql(nodes: FlowNode[], _edges: FlowEdge[]): string {
    const parts: string[] = [];

    parts.push(this.buildSelectClause(nodes));
    parts.push(this.buildFromClause(nodes));

    const joinClause = this.buildJoinClauses(nodes);
    if (joinClause) {
      parts.push(joinClause);
    }

    const whereClause = this.buildWhereClause(nodes);
    if (whereClause) {
      parts.push(whereClause);
    }

    const groupByClause = this.buildGroupByClause(nodes);
    if (groupByClause) {
      parts.push(groupByClause);
    }

    return parts.join('\n');
  }

  async postProcess(queryResult: { data: any[]; schema: any[] }): Promise<AnalysisResult> {
    // In real implementation, this would call the K-Means clustering algorithm
    return {
      type: this.type,
      sql: '', // Will be filled by EndNode
      data: queryResult.data,
      schema: queryResult.schema,
      insights: [
        '基于K-Means的用户分群',
        '已识别用户群组特征',
      ],
      visualizations: [
        {
          type: 'radar',
          config: { data: queryResult.data, clusterField: 'cluster_id' },
        },
      ],
    };
  }
}
