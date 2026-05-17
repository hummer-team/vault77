/**
 * RFM Profile Strategy (fn_ecom_rfm_profile)
 *
 * Responsibility split:
 *   - DuckDB (buildOperatorSql): aggregate raw orders per user →
 *     (user_id, recency, frequency, monetary).
 *     - recency   = DATEDIFF('day', MAX(orderTime), CURRENT_DATE) — lower = more recent = better
 *     - frequency = COUNT(*)                                      — higher = more loyal
 *     - monetary  = SUM(amount)                                   — higher = more valuable
 *   - WASM (rfmClusteringService): K-Means on pre-computed RFM rows → (userId, clusterId)
 *   - postProcess: cluster → ranked business label → InsightItem cards + summary table
 *
 * Label ranking: composite = avgMonetary * avgFrequency / (avgRecency + 1)
 *   → rank 0 (highest) = 重要深耕客户, rank 4 (lowest) = 沉睡流失客户
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type RfmProfileConfig,
  type InsightItem,
  type OperatorInsightsData,
  type OperatorDisplayConfig,
} from '../types';
import { segmentRfmCustomers } from '../../rfm/rfmClusteringService';

// ============================================================================
// Business label definitions (5-tier fixed set)
// ============================================================================

interface RfmLabel {
  name: string;
  iconKey: InsightItem['iconKey'];
  color: string;
  suggestion: string;
}

const RFM_LABELS: RfmLabel[] = [
  {
    name: '重要深耕客户',
    iconKey: 'user',
    color: 'var(--vm-color-success)',
    suggestion: '高频高消费的核心用户，优先提供 VIP 权益与专属服务，增强忠诚度',
  },
  {
    name: '潜力成长客户',
    iconKey: 'insight',
    color: 'var(--vm-primary)',
    suggestion: '消费意愿较强但频次待提升，建议通过优惠券、积分活动引导复购',
  },
  {
    name: '一般维系客户',
    iconKey: 'rfm',
    color: 'var(--vm-color-info)',
    suggestion: '价值居中，适当推送新品推荐与促销信息，保持用户活跃',
  },
  {
    name: '流失预警客户',
    iconKey: 'warning',
    color: 'var(--vm-color-warning)',
    suggestion: '近期消费减少，需主动触达，发送个性化唤醒活动或降级优惠',
  },
  {
    name: '沉睡流失客户',
    iconKey: 'critical',
    color: 'var(--vm-color-error)',
    suggestion: '长期未活跃，评估召回成本后选择低频触达或清理，避免资源浪费',
  },
];

/** Map cluster rank (0=best, n-1=worst) → 5-tier business label */
function resolveLabel(rank: number, nClusters: number): RfmLabel {
  const idx = nClusters <= 1
    ? 0
    : Math.round((rank / (nClusters - 1)) * (RFM_LABELS.length - 1));
  return RFM_LABELS[Math.min(idx, RFM_LABELS.length - 1)];
}

// ============================================================================
// Internal types
// ============================================================================

interface RfmRow {
  user_id: string;
  recency: number;
  frequency: number;
  monetary: number;
}

interface ClusterSummary {
  clusterId: number;
  label: RfmLabel;
  count: number;
  avgRecency: number;
  avgFrequency: number;
  avgMonetary: number;
  compositeScore: number;
}

// ============================================================================
// Strategy
// ============================================================================

export class RfmStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.RFM_PROFILE;
  readonly name = 'RFM 用户画像';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  /**
   * Config saved by buildOperatorSql; read by postProcess to pass WASM params.
   * Follows the _lastConfig pattern (ref: InventoryForecastStrategy).
   */
  private _lastConfig: Pick<RfmProfileConfig, 'nClusters' | 'scalingMode'> | null = null;

  // --------------------------------------------------------------------------
  // SQL layer (DuckDB computes R/F/M aggregates)
  // --------------------------------------------------------------------------

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _ph: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { rfmProfileConfig?: RfmProfileConfig } | undefined)
      ?.rfmProfileConfig;

    if (!cfg || !tableName) {
      console.warn(`[${this.name}.buildOperatorSql] config or tableName missing — falling back`);
      return `SELECT * FROM "${tableName || 'tbl'}" LIMIT 0`;
    }

    // Save WASM params for postProcess (cannot be passed through SQL)
    this._lastConfig = { nClusters: cfg.nClusters, scalingMode: cfg.scalingMode };

    const { userIdColumn, orderTimeColumn, amountColumn } = cfg;
    // Strip leading WHERE keyword if buildWhereClauseUnified includes it
    const wherePart = userWhere
      ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '')}`
      : '';

    const sql = [
      'SELECT',
      `  "${userIdColumn}" AS user_id,`,
      `  DATEDIFF('day', MAX("${orderTimeColumn}"::TIMESTAMP), CURRENT_DATE) AS recency,`,
      `  COUNT(*) AS frequency,`,
      `  SUM("${amountColumn}") AS monetary`,
      `FROM "${tableName}"${wherePart}`,
      `GROUP BY "${userIdColumn}"`,
    ].join('\n');

    console.log(`[${this.name}.buildOperatorSql] tableName=${tableName} userIdCol=${userIdColumn}\n${sql}`);
    return sql;
  }

  // --------------------------------------------------------------------------
  // WASM + label mapping layer
  // --------------------------------------------------------------------------

  /**
   * Segments DuckDB-aggregated RFM rows via WASM K-Means, ranks clusters by
   * composite score, maps ranks to 5-tier business labels, and builds
   * InsightItem cards + per-cluster summary table.
   */
  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    const rawRows = queryResult.data as RfmRow[];

    if (rawRows.length === 0) {
      return this.buildEmptyResult(queryResult);
    }

    const { nClusters = 5, scalingMode = 2 } = this._lastConfig ?? {};

    // ---- Step 1: Call WASM K-Means via rfmClusteringService -----------------
    let segmentResults: { userId: string; clusterId: number }[];
    try {
      segmentResults = await segmentRfmCustomers(
        rawRows.map((r) => ({
          userId: r.user_id,
          recency: Number(r.recency),
          frequency: Number(r.frequency),
          monetary: Number(r.monetary),
        })),
        nClusters,
        scalingMode
      );
    } catch (err) {
      console.error(`[${this.name}.postProcess] WASM call failed`, err);
      return this.buildErrorResult(
        queryResult,
        err instanceof Error ? err.message : String(err)
      );
    }

    // ---- Step 2: Build userId → {recency,frequency,monetary} lookup ---------
    const rfmMap = new Map<string, RfmRow>();
    for (const row of rawRows) {
      rfmMap.set(row.user_id, row);
    }

    // ---- Step 3: Aggregate per cluster (avgR / avgF / avgM) -----------------
    const clusterAcc = new Map<
      number,
      { recency: number; frequency: number; monetary: number; count: number }
    >();

    for (const { userId, clusterId } of segmentResults) {
      const rfm = rfmMap.get(userId);
      if (!rfm) continue;
      const acc = clusterAcc.get(clusterId) ?? { recency: 0, frequency: 0, monetary: 0, count: 0 };
      acc.recency   += Number(rfm.recency);
      acc.frequency += Number(rfm.frequency);
      acc.monetary  += Number(rfm.monetary);
      acc.count     += 1;
      clusterAcc.set(clusterId, acc);
    }

    // ---- Step 4: Compute composite score, rank clusters, assign labels -------
    const clusterSummaries: ClusterSummary[] = Array.from(clusterAcc.entries()).map(
      ([clusterId, acc]) => {
        const avgR = acc.recency   / acc.count;
        const avgF = acc.frequency / acc.count;
        const avgM = acc.monetary  / acc.count;
        // Higher frequency × monetary, lower recency → better customers
        const compositeScore = (avgF * avgM) / (avgR + 1);
        return {
          clusterId,
          label: RFM_LABELS[0],  // placeholder; overwritten below after sort
          count: acc.count,
          avgRecency:   avgR,
          avgFrequency: avgF,
          avgMonetary:  avgM,
          compositeScore,
        };
      }
    );

    // Sort descending by score → rank 0 = best
    clusterSummaries.sort((a, b) => b.compositeScore - a.compositeScore);

    // Assign business label based on rank position
    const effectiveN = clusterSummaries.length;
    clusterSummaries.forEach((cs, rank) => {
      cs.label = resolveLabel(rank, effectiveN);
    });

    // ---- Step 5: Build InsightItems (one card per cluster, sorted best→worst)
    const insights: InsightItem[] = clusterSummaries.map((cs, idx) => ({
      id: `rfm-cluster-${idx + 1}`,
      cardType: 'custom' as const,
      iconKey: cs.label.iconKey,
      title: cs.label.name,
      sortOrder: idx + 1,
      description: `共 ${cs.count.toLocaleString()} 名用户 · 近${Math.round(cs.avgRecency)}天、购${Math.round(cs.avgFrequency)}次、消费¥${cs.avgMonetary.toFixed(0)}`,
      suggestion: cs.label.suggestion,
      metrics: [
        { label: '用户数', value: cs.count, unit: '人', highlight: idx === 0 },
        { label: '平均最近购买', value: Math.round(cs.avgRecency), unit: '天' },
        { label: '平均购买频次', value: Math.round(cs.avgFrequency * 10) / 10, unit: '次' },
        { label: '平均消费额', value: Math.round(cs.avgMonetary), unit: '元' },
      ],
      metadata: { customColor: cs.label.color },
    }));

    // ---- Step 6: Build InsightSummary ---------------------------------------
    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount:       rawRows.length,
        totalFilterRecordCount: segmentResults.length,
      },
      insights,
    };

    // ---- Step 7: Build per-cluster summary table ----------------------------
    // clusterId → label name map for joining individual user rows
    const clusterLabelMap = new Map<number, string>();
    for (const cs of clusterSummaries) {
      clusterLabelMap.set(cs.clusterId, cs.label.name);
    }

    const tableRows: Record<string, unknown>[] = clusterSummaries.map((cs) => ({
      cluster_label:  cs.label.name,
      user_count:     cs.count,
      avg_recency:    Math.round(cs.avgRecency),
      avg_frequency:  Math.round(cs.avgFrequency * 10) / 10,
      avg_monetary:   Math.round(cs.avgMonetary),
    }));

    const tableSchema: { name: string; type: string }[] = [
      { name: 'cluster_label',  type: 'VARCHAR'  },
      { name: 'user_count',     type: 'INTEGER'  },
      { name: 'avg_recency',    type: 'INTEGER'  },
      { name: 'avg_frequency',  type: 'DOUBLE'   },
      { name: 'avg_monetary',   type: 'INTEGER'  },
    ];

    const displayConfig: OperatorDisplayConfig = {
      defaultSort: { column: 'user_count', order: 'descend' },
      columnTooltips: {
        cluster_label:  '用户分群标签（按 RFM 综合分值自动排名）',
        user_count:     '该分群内用户数量',
        avg_recency:    '平均最近购买距今天数（越小说明越活跃）',
        avg_frequency:  '平均历史购买次数',
        avg_monetary:   '平均历史累计消费金额（元）',
      },
    };

    return {
      type: this.type,
      sql: '',
      data: tableRows,
      schema: tableSchema,
      insightsData,
      displayConfig,
    };
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private buildEmptyResult(queryResult: { data: unknown[]; schema: unknown[] }): AnalysisResult {
    return {
      type: this.type,
      sql: '',
      data: [],
      schema: queryResult.schema as { name: string; type: string }[],
      insightsData: {
        summary: { totalRecordCount: 0, totalFilterRecordCount: 0 },
        insights: [],
      },
    };
  }

  private buildErrorResult(
    queryResult: { data: unknown[]; schema: unknown[] },
    message: string
  ): AnalysisResult {
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema as { name: string; type: string }[],
      insightsData: {
        summary: { totalRecordCount: 0, totalFilterRecordCount: 0 },
        insights: [
          {
            id: 'rfm-error',
            cardType: 'custom' as const,
            iconKey: 'critical',
            title: '分群计算失败',
            sortOrder: 1,
            description: message,
            suggestion: '请检查数据质量或调整分群参数后重试',
            metrics: [],
          },
        ],
      },
    };
  }
}

