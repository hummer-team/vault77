import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
} from '../types';

/**
 * AnomalyStrategy
 * Anomaly detection based on isolation forest.
 * Builds a SQL query selecting numerical fields for the detection algorithm.
 */
export class AnomalyStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.ANOMALY;
  readonly name = '异常洞察';

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
    return parts.join('\n');
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema,
    };
  }
}
