import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
} from '../types';

/**
 * AssociationStrategy
 * Builds a direct SQL JOIN query from edge-based join configuration.
 * Does NOT use DuckDB MACRO — inherits buildEdgeJoinFromClause from BaseStrategy.
 */
export class AssociationStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.ASSOCIATION;
  readonly name = '关联查询';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  protected buildOperatorSql(
    nodes: FlowNode[],
    edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const parts: string[] = [];

    // SELECT
    parts.push(this.buildSelectClause(nodes));

    // FROM + JOINs — prefer edge-based joins (ASSOCIATION), fall back to legacy JOIN nodes
    const edgeFromJoin = this.buildEdgeJoinFromClause(edges);
    if (edgeFromJoin) {
      parts.push(edgeFromJoin);
    } else {
      parts.push(this.buildFromClause(nodes));
      const legacyJoin = this.buildJoinClauses(nodes);
      if (legacyJoin) parts.push(legacyJoin);
    }

    // WHERE — provided by BaseStrategy.buildSql template
    if (userWhere) parts.push(userWhere);

    // GROUP BY
    const groupByClause = this.buildGroupByClause(nodes);
    if (groupByClause) parts.push(groupByClause);

    const sql = parts.join('\n');
    console.log(`[${this.name}.buildOperatorSql] sql=\n${sql}`);
    return sql;
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
