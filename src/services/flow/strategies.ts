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
} from './types';
import { VALIDATION_MESSAGES } from './constants';

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

  validate(nodes: FlowNode[], _edges: FlowEdge[]): ValidationError[] {
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

    // Validate select nodes
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

    const firstTable = tableNodes[0].data as { tableName: string; alias?: string };
    return `FROM ${firstTable.tableName}${firstTable.alias ? ` AS ${firstTable.alias}` : ''}`;
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
      let condition = `${condData.tableName}.${condData.field} ${condData.operator}`;

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
      let fieldExpr = `${field.tableName}.${field.fieldName}`;

      if (field.aggregate) {
        fieldExpr = `${field.aggregate}(${fieldExpr})`;
      }

      if (field.alias) {
        fieldExpr += ` AS ${field.alias}`;
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

  buildSql(nodes: FlowNode[], _edges: FlowEdge[]): string {
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

    // WHERE
    const whereClause = this.buildWhereClause(nodes);
    if (whereClause) {
      parts.push(whereClause);
    }

    // GROUP BY
    const groupByClause = this.buildGroupByClause(nodes);
    if (groupByClause) {
      parts.push(groupByClause);
    }

    return parts.join('\n');
  }

  async postProcess(data: unknown): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '', // Will be filled by EndNode
      data,
      insights: ['关联查询执行成功'],
      visualizations: [
        {
          type: 'table',
          config: { data },
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

  async postProcess(data: unknown): Promise<AnalysisResult> {
    // In real implementation, this would call the anomaly detection algorithm
    return {
      type: this.type,
      sql: '', // Will be filled by EndNode
      data,
      insights: [
        '基于孤立森林算法的异常检测',
        '已标记异常数据点',
      ],
      visualizations: [
        {
          type: 'scatter',
          config: { data, anomalyField: 'is_anomaly' },
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

  async postProcess(data: unknown): Promise<AnalysisResult> {
    // In real implementation, this would call the K-Means clustering algorithm
    return {
      type: this.type,
      sql: '', // Will be filled by EndNode
      data,
      insights: [
        '基于K-Means的用户分群',
        '已识别用户群组特征',
      ],
      visualizations: [
        {
          type: 'radar',
          config: { data, clusterField: 'cluster_id' },
        },
      ],
    };
  }
}
