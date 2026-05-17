/**
 * RFM Profile Strategy (fn_ecom_rfm_profile)
 *
 * Responsibility split:
 *   - DuckDB (buildOperatorSql): filter rows via userWhere, then aggregate
 *     per user → (user_id, recency, frequency, monetary)
 *   - WASM clustering.worker.ts: receive pre-computed RFM rows, run K-Means
 *     via segment_customer_orders, return (user_id, cluster_id)
 *   - postProcess: map cluster_id → ranked business labels, build InsightItem cards
 *
 * NOTE: Phase 1 skeleton — buildOperatorSql and postProcess are stubs.
 *       Full implementation in Phase 2.
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
} from '../types';

export class RfmStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.RFM_PROFILE;
  readonly name = 'RFM 用户画像';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    _userWhere: string
  ): string {
    // Phase 2: implement RFM aggregation SQL
    // SELECT {userIdCol} AS user_id,
    //        DATEDIFF('day', MAX({orderTimeCol}), CURRENT_DATE) AS recency,
    //        COUNT(*) AS frequency,
    //        SUM({amountCol}) AS monetary
    // FROM {tbl} {WHERE userWhere} GROUP BY {userIdCol}
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tbl = (tableNode?.data as { tableName?: string })?.tableName ?? 'tbl';
    return `SELECT * FROM "${tbl}" LIMIT 0`;
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    // Phase 2: serialize to Arrow IPC → call rfmClusteringService → map labels → InsightItems
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema,
    };
  }
}
