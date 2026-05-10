/**
 * OrderAbnormalAmountStrategy
 *
 * Detects abnormal order amounts using isolation forest (anomaly.worker.ts).
 * Builds a multi-CTE DuckDB SQL query that:
 *   1. Filters invalid records (amount <= 0) and applies user WHERE conditions
 *   2. Optionally applies BERNOULLI SAMPLE when row count > samplingThreshold
 *   3. Computes discount_rate and amount_z_score via DuckDB window functions
 *   4. Derives optional features when optional columns are mapped
 *
 * postProcess():
 *   Passes feature matrix to anomaly.worker → receives abnormal_score / isAbnormal →
 *   appends risk_level, Suggestion columns → builds InsightSummary + 5 InsightItems.
 *
 * Phase 2 will implement the full SQL and postProcess logic.
 * This stub satisfies Phase 1 type registration requirements.
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type AbnormalAmountConfig,
  type SelectNodeData,
} from '../types';

// ============================================================================
// Default configuration
// ============================================================================

export const DEFAULT_ABNORMAL_AMOUNT_CONFIG: Required<AbnormalAmountConfig> = {
  fieldMapping: {
    orderIdCol: '',
    amountCol: '',
    originalAmountCol: '',
  },
  anomalyThreshold: 0.8,
  scalingMode: 2,
  riskThresholds: { high: 0.9, medium: 0.7 },
  samplingRate: 0.75,
  samplingThreshold: 50_000,
  useGPU: 'auto',
};

// ============================================================================
// Strategy class (stub — Phase 2 will complete buildOperatorSql + postProcess)
// ============================================================================

export class OrderAbnormalAmountStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.ABNORMAL_AMOUNT;
  readonly name = '异常金额监控';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg: AbnormalAmountConfig = {
      ...DEFAULT_ABNORMAL_AMOUNT_CONFIG,
      ...((selectNode?.data as SelectNodeData | undefined)?.abnormalAmountConfig ?? {}),
    };
    this._lastConfig = { ...DEFAULT_ABNORMAL_AMOUNT_CONFIG, ...cfg };

    const tbl = this.buildFromClause(nodes).replace(/^FROM\s+/i, '').trim();
    const { fieldMapping, samplingRate, samplingThreshold } = this._lastConfig;
    const { orderIdCol, amountCol, originalAmountCol } = fieldMapping;

    const sampleClause = `/* sampling applied in postProcess when row count > ${samplingThreshold} */`;

    const whereClause = userWhere
      ? `\n  AND ${userWhere.replace(/^WHERE\s+/i, '')}`
      : '';

    return [
      `-- fn_ecom_abnormal_amount stub SQL (Phase 2 will replace this)`,
      `-- samplingRate=${samplingRate}`,
      sampleClause,
      `SELECT`,
      `  "${orderIdCol}"          AS order_id,`,
      `  "${amountCol}"           AS amount,`,
      `  "${originalAmountCol}"   AS original_amount,`,
      `  ROUND(1.0 - "${amountCol}" / NULLIF("${originalAmountCol}", 0), 4) AS discount_rate,`,
      `  ROUND(("${amountCol}" - AVG("${amountCol}") OVER())`,
      `        / NULLIF(STDDEV("${amountCol}") OVER(), 0), 4)               AS amount_z_score`,
      `FROM ${tbl}`,
      `WHERE "${amountCol}" > 0${whereClause}`,
    ].join('\n');
  }

  // Stores config between buildOperatorSql and postProcess (strategy-pattern-rules §三)
  private _lastConfig: Required<AbnormalAmountConfig> = { ...DEFAULT_ABNORMAL_AMOUNT_CONFIG };

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    // Phase 2 will implement full WASM call + InsightItem generation
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema,
    };
  }
}
