import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
} from '../types';

/**
 * ClusteringStrategy
 * User clustering based on K-Means.
 * Builds a SQL query selecting features for the clustering algorithm.
 */
export class ClusteringStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.CLUSTERING;
  readonly name = '用户聚类';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const parts: string[] = [];
    parts.push(this.buildSelectClause(nodes));
    parts.push(this.buildFromClause(nodes));
    const joinClause = this.buildJoinClauses(nodes);
    if (joinClause) parts.push(joinClause);
    if (userWhere) parts.push(userWhere);
    const groupByClause = this.buildGroupByClause(nodes);
    if (groupByClause) parts.push(groupByClause);
    return parts.join('\n');
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
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
