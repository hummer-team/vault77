/**
 * OrderAbnormalAmountStrategy
 *
 * Detects abnormal order amounts using Rust isolation forest via anomaly.worker.ts.
 *
 * SQL CTE pipeline:
 *   src     → filter amount > 0 + userWhere injection
 *   sampled → optional BERNOULLI sampling when user samplingRate < 1.0
 *   base    → discount_rate, amount_z_score (window fns), optional derived features
 *
 * postProcess():
 *   1. Extract feature matrix (dynamic dim selection from {2,5,7,10,11,13,15,16})
 *   2. Call anomaly.worker → abnormal_score / isAbnormal per order
 *   3. Enrich rows: risk_level (高/中/低), Suggestion column (3-tier text)
 *   4. Build InsightSummary + 5 InsightItems (max 7)
 *   5. Return AnalysisResult (data=all rows, filteredData subset in insightsData.metadata)
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type OperatorInsightsData,
  type InsightItem,
  type AbnormalAmountConfig,
  type SelectNodeData,
  type ValidationError,
} from '../types';
import type {
  AnomalyDetectionRequest,
  AnomalyDetectionResult,
} from '../../../types/anomaly.types';
import {
  isAnomalyDetectionSuccess,
  isAnomalyDetectionError,
} from '../../../types/anomaly.types';

// ============================================================================
// Supported feature dimensions for detect_order_anomalies Rust WASM
// ============================================================================

const SUPPORTED_DIMS = [2, 5, 7, 10, 11, 13, 15, 16] as const;

/**
 * Find the largest supported dimension that is <= actualDim.
 * Falls back to 2 (minimum) if actualDim < 2.
 */
function resolveDimension(actualDim: number): number {
  const valid = (SUPPORTED_DIMS as readonly number[]).filter((d) => d <= actualDim);
  return valid.length > 0 ? valid[valid.length - 1] : 2;
}

// ============================================================================
// Anomaly worker singleton (module-scoped, lazy-initialized)
// ============================================================================

let _anomalyWorker: Worker | null = null;

function getAnomalyWorker(): Worker {
  if (!_anomalyWorker) {
    _anomalyWorker = new Worker(
      new URL('../../../workers/anomaly.worker.ts', import.meta.url),
      { type: 'module' }
    );
    console.log('[OrderAbnormalAmountStrategy] Anomaly worker created');
  }
  return _anomalyWorker;
}

/**
 * Send detection request to worker and await response with timeout.
 */
function callAnomalyWorker(
  request: AnomalyDetectionRequest,
  timeoutMs = 60_000
): Promise<AnomalyDetectionResult> {
  return new Promise((resolve, reject) => {
    const worker = getAnomalyWorker();

    const cleanup = () => {
      clearTimeout(tid);
      worker.removeEventListener('message', onMsg as EventListener);
      worker.removeEventListener('error', onErr);
    };

    const tid = setTimeout(() => {
      cleanup();
      reject(new Error(`[OrderAbnormalAmountStrategy] Worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMsg = (e: MessageEvent<AnomalyDetectionResult>) => {
      cleanup();
      resolve(e.data);
    };

    const onErr = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(`Anomaly worker error: ${e.message}`));
    };

    worker.addEventListener('message', onMsg as EventListener);
    worker.addEventListener('error', onErr);
    worker.postMessage(request);
  });
}

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
// Suggestion text mapping (3-tier, fixed copy)
// ============================================================================

function buildSuggestion(score: number, highThresh: number, mediumThresh: number): string {
  if (score >= highThresh) return '高度疑似刷单或价格录入错误，建议人工复核并暂缓结算';
  if (score >= mediumThresh) return '金额偏离明显，建议核查优惠叠加规则或促销配置是否异常';
  return '轻微偏离正常区间，可纳入定期批量抽查';
}

// ============================================================================
// Strategy class
// ============================================================================

export class OrderAbnormalAmountStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.ABNORMAL_AMOUNT;
  readonly name = '异常金额监控';

  // Stores config between buildOperatorSql and postProcess (strategy-pattern-rules §三)
  private _lastConfig: Required<AbnormalAmountConfig> = { ...DEFAULT_ABNORMAL_AMOUNT_CONFIG };

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE, FlowNodeType.SELECT];
  }

  // ============================================================================
  // Validation — require orderIdCol, amountCol, originalAmountCol
  // ============================================================================

  protected override validateOperatorSpecific(
    nodes: FlowNode[],
    _edges: FlowEdge[]
  ): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as SelectNodeData | undefined)?.abnormalAmountConfig;
    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';
    const fm = cfg.fieldMapping;

    if (!fm?.orderIdCol) {
      errors.push({
        nodeId,
        nodeType: FlowNodeType.SELECT,
        severity: ValidationSeverity.ERROR,
        message: 'abnormal_amount: orderIdCol is required',
      });
    }
    if (!fm?.amountCol) {
      errors.push({
        nodeId,
        nodeType: FlowNodeType.SELECT,
        severity: ValidationSeverity.ERROR,
        message: 'abnormal_amount: amountCol is required',
      });
    }
    if (!fm?.originalAmountCol) {
      errors.push({
        nodeId,
        nodeType: FlowNodeType.SELECT,
        severity: ValidationSeverity.ERROR,
        message: 'abnormal_amount: originalAmountCol is required',
      });
    }

    return errors;
  }

  // ============================================================================
  // SQL builder — DuckDB CTE pipeline
  // ============================================================================

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    // Resolve and cache config
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const rawCfg = (selectNode?.data as SelectNodeData | undefined)?.abnormalAmountConfig;
    const cfg: Required<AbnormalAmountConfig> = {
      ...DEFAULT_ABNORMAL_AMOUNT_CONFIG,
      ...rawCfg,
      fieldMapping: {
        ...DEFAULT_ABNORMAL_AMOUNT_CONFIG.fieldMapping,
        ...rawCfg?.fieldMapping,
      },
      riskThresholds: {
        ...DEFAULT_ABNORMAL_AMOUNT_CONFIG.riskThresholds,
        ...rawCfg?.riskThresholds,
      },
    };
    this._lastConfig = cfg;

    const tbl = this.buildFromClause(nodes).replace(/^FROM\s+/i, '').trim();
    const { fieldMapping, samplingRate } = cfg;
    const {
      orderIdCol,
      amountCol,
      originalAmountCol,
      orderTimeCol,
      userIdCol,
      skuIdCol,
      categoryIdCol,
    } = fieldMapping;

    // Inject userWhere into src CTE
    const userWhereClause = userWhere
      ? `\n  AND (${userWhere.replace(/^WHERE\s+/i, '')})`
      : '';

    // BERNOULLI SAMPLE clause — only when samplingRate < 1.0
    const sampleClause =
      samplingRate < 1.0
        ? `\n  USING SAMPLE ${Math.round(samplingRate * 100)} PERCENT (bernoulli, 42)`
        : '';

    // Optional context columns (pass-through, non-numeric)
    const optionalContextCols: string[] = [];
    if (orderTimeCol) optionalContextCols.push(`    "${orderTimeCol}" AS order_time`);
    if (userIdCol)    optionalContextCols.push(`    "${userIdCol}" AS user_id`);
    if (skuIdCol)     optionalContextCols.push(`    "${skuIdCol}" AS sku_id`);
    if (categoryIdCol) optionalContextCols.push(`    "${categoryIdCol}" AS category_id`);

    // Optional derived numeric features (used in feature matrix for algo)
    const optionalFeatureCols: string[] = [];
    if (orderTimeCol) {
      optionalFeatureCols.push(
        `    COALESCE(PERCENT_RANK() OVER (` +
          `PARTITION BY DATE(TRY_CAST("${orderTimeCol}" AS TIMESTAMP)) ` +
          `ORDER BY "${amountCol}"), 0.0) AS daily_amount_pct_rank`
      );
    }
    if (orderTimeCol && userIdCol) {
      optionalFeatureCols.push(
        `    COUNT(*) OVER (` +
          `PARTITION BY "${userIdCol}", DATE(TRY_CAST("${orderTimeCol}" AS TIMESTAMP))` +
          `) AS user_daily_order_count`
      );
    }

    const allExtraCols = [...optionalContextCols, ...optionalFeatureCols];
    const extraColsClause =
      allExtraCols.length > 0 ? ',\n' + allExtraCols.join(',\n') : '';

    return [
      `-- fn_ecom_abnormal_amount: isolation forest anomaly detection`,
      `WITH src AS (`,
      `  SELECT *`,
      `  FROM ${tbl}`,
      `  WHERE "${amountCol}" > 0${userWhereClause}`,
      `),`,
      `sampled AS (`,
      `  SELECT * FROM src${sampleClause}`,
      `),`,
      `base AS (`,
      `  SELECT`,
      `    "${orderIdCol}"  AS order_id,`,
      `    "${amountCol}"   AS amount,`,
      `    "${originalAmountCol}" AS original_amount,`,
      `    ROUND(1.0 - "${amountCol}" / NULLIF("${originalAmountCol}", 0), 4) AS discount_rate,`,
      `    ROUND(("${amountCol}" - AVG("${amountCol}") OVER())`,
      `          / NULLIF(STDDEV("${amountCol}") OVER(), 0), 4) AS amount_z_score${extraColsClause}`,
      `  FROM sampled`,
      `)`,
      `SELECT * FROM base`,
    ].join('\n');
  }

  // ============================================================================
  // postProcess — WASM detection + result enrichment
  // ============================================================================

  async postProcess(queryResult: {
    data: unknown[];
    schema: unknown[];
  }): Promise<AnalysisResult> {
    const cfg = this._lastConfig ?? DEFAULT_ABNORMAL_AMOUNT_CONFIG;
    const rows = Array.isArray(queryResult?.data)
      ? (queryResult.data as Record<string, unknown>[])
      : [];
    const schema = Array.isArray(queryResult?.schema) ? queryResult.schema : [];

    if (rows.length === 0) {
      return this._buildEmptyResult(schema);
    }

    const { fieldMapping, anomalyThreshold, scalingMode, riskThresholds, useGPU } = cfg;
    const { orderTimeCol, userIdCol } = fieldMapping;

    // --- Step 1: Build feature key list (ordered, matches SQL output) ---
    const featureKeys: string[] = ['amount', 'discount_rate', 'amount_z_score'];
    if (orderTimeCol) featureKeys.push('daily_amount_pct_rank');
    if (orderTimeCol && userIdCol) featureKeys.push('user_daily_order_count');

    const actualDim = featureKeys.length;
    const usedDim = resolveDimension(actualDim);
    const usedKeys = featureKeys.slice(0, usedDim);

    console.log(
      `[OrderAbnormalAmountStrategy] Feature dim: ${actualDim} available → ${usedDim} used (${usedKeys.join(', ')})`
    );

    const orderIds: string[] = rows.map((r) => String(r['order_id'] ?? ''));
    const features: number[][] = rows.map((r) =>
      usedKeys.map((k) => {
        const v = r[k];
        const n = typeof v === 'number' ? v : Number(v ?? 0);
        return isFinite(n) ? n : 0;
      })
    );

    // --- Step 2: Call anomaly worker ---
    let abnormalScores: number[];
    let isAbnormal: boolean[];

    try {
      const request: AnomalyDetectionRequest = {
        type: 'ANOMALY_DETECT',
        payload: {
          orderIds,
          features,
          threshold: anomalyThreshold,
          scalingMode,
          useGPU: useGPU !== 'disable',
        },
      };
      const timeoutMs = useGPU === 'force' ? 30_000 : 60_000;
      const result = await callAnomalyWorker(request, timeoutMs);

      if (isAnomalyDetectionError(result)) {
        throw new Error(`Worker error: ${result.payload.error}`);
      }
      if (!isAnomalyDetectionSuccess(result)) {
        throw new Error('Unexpected anomaly worker response');
      }
      abnormalScores = result.payload.abnormalScores;
      isAbnormal = result.payload.isAbnormal;
    } catch (err) {
      // Fallback: use |amount_z_score| normalized as proxy for anomaly score
      console.error(
        '[OrderAbnormalAmountStrategy] Worker failed, falling back to z_score ranking:',
        err
      );
      const zScores = rows.map((r) => Math.abs(Number(r['amount_z_score'] ?? 0)));
      const maxZ = Math.max(...zScores, 1);
      abnormalScores = zScores.map((z) => Math.min(z / (maxZ * 1.5), 1));
      isAbnormal = abnormalScores.map((s) => s >= anomalyThreshold);
    }

    // --- Step 3: Enrich rows with detection results ---
    const { high: highThresh, medium: mediumThresh } = riskThresholds;

    const enrichedRows: Record<string, unknown>[] = rows.map((r, i) => {
      const score = abnormalScores[i] ?? 0;
      const abnormal = isAbnormal[i] ?? false;
      const riskLevel = score >= highThresh ? '高' : score >= mediumThresh ? '中' : '低';
      return {
        ...r,
        abnormal_score: Math.round(score * 10_000) / 10_000,
        is_abnormal: abnormal,
        risk_level: riskLevel,
        Suggestion: buildSuggestion(score, highThresh, mediumThresh),
      };
    });

    // Sort by abnormal_score descending
    enrichedRows.sort(
      (a, b) => (b['abnormal_score'] as number) - (a['abnormal_score'] as number)
    );

    // --- Step 4: Compute aggregate stats ---
    const totalCount = enrichedRows.length;
    const abnormalRows = enrichedRows.filter((r) => r['is_abnormal'] === true);
    const abnormalCount = abnormalRows.length;
    const highRiskRows = enrichedRows.filter((r) => r['risk_level'] === '高');
    const mediumRiskRows = enrichedRows.filter((r) => r['risk_level'] === '中');
    const lowRiskRows = enrichedRows.filter((r) => r['risk_level'] === '低');

    const maxScore = abnormalScores.length > 0 ? Math.max(...abnormalScores) : 0;

    const abnormalAmounts = abnormalRows.map((r) => Number(r['amount'] ?? 0));
    const avgAbnormalAmount =
      abnormalAmounts.length > 0
        ? abnormalAmounts.reduce((a, b) => a + b, 0) / abnormalAmounts.length
        : 0;

    const maxDeviation = abnormalRows.reduce((max, r) => {
      const orig = r['original_amount'];
      if (orig === null || orig === undefined) return max;
      const dev = Math.abs(Number(orig) - Number(r['amount'] ?? 0));
      return dev > max ? dev : max;
    }, 0);

    const peakZScore = rows.reduce((max, r) => {
      const z = Math.abs(Number(r['amount_z_score'] ?? 0));
      return z > max ? z : max;
    }, 0);

    const highDiscountAbnormal = abnormalRows.filter(
      (r) => Number(r['discount_rate'] ?? 0) > 0.6
    ).length;
    const highDiscountPct =
      abnormalCount > 0 ? (highDiscountAbnormal / abnormalCount) * 100 : 0;

    // estimatedLoss: SUM(original_amount - amount) for HIGH risk, original_amount IS NOT NULL
    const estimatedLoss = highRiskRows.reduce((acc, r) => {
      const orig = r['original_amount'];
      if (orig === null || orig === undefined) return acc;
      const loss = Number(orig) - Number(r['amount'] ?? 0);
      return isFinite(loss) && loss > 0 ? acc + loss : acc;
    }, 0);

    // --- Step 5: Build InsightItems (5 cards, max 7) ---
    const insightItems: InsightItem[] = [
      {
        id: 'abnormal-alert',
        cardType: 'standard',
        iconKey: 'critical',
        title: '高风险订单警报',
        description:
          abnormalCount > 0
            ? `共发现 ${abnormalCount} 笔异常订单，占总量 ${((abnormalCount / Math.max(totalCount, 1)) * 100).toFixed(1)}%，最高异常分 ${maxScore.toFixed(3)}`
            : '本次分析未发现异常订单',
        sortOrder: 1,
        metrics: [
          { label: '异常订单数', value: abnormalCount, unit: '单', highlight: abnormalCount > 0 },
          {
            label: '异常率',
            value: Math.round((abnormalCount / Math.max(totalCount, 1)) * 1000) / 10,
            unit: '%',
            highlight: abnormalCount > 0,
          },
          { label: '最高异常分', value: Math.round(maxScore * 1000) / 1000, unit: '' },
        ],
      },
      {
        id: 'amount-deviation',
        cardType: 'standard',
        iconKey: 'warning',
        title: '金额偏离统计',
        description:
          abnormalCount > 0
            ? `异常订单均值金额 ${avgAbnormalAmount.toFixed(2)} 元，最大偏离原价 ${maxDeviation.toFixed(2)} 元`
            : '暂无异常订单金额偏离数据',
        sortOrder: 2,
        metrics: [
          { label: '异常均值金额', value: Math.round(avgAbnormalAmount * 100) / 100, unit: '元' },
          {
            label: '最大偏离金额',
            value: Math.round(maxDeviation * 100) / 100,
            unit: '元',
            highlight: maxDeviation > 0,
          },
          { label: 'z-score 峰值', value: Math.round(peakZScore * 100) / 100, unit: '' },
        ],
      },
      {
        id: 'discount-anomaly',
        cardType: 'standard',
        iconKey: 'insight',
        title: '折扣异常集中度',
        description:
          highDiscountAbnormal > 0
            ? `折扣率 >60% 的异常订单 ${highDiscountAbnormal} 单，占全部异常订单 ${highDiscountPct.toFixed(1)}%`
            : '无高折扣率异常订单',
        sortOrder: 3,
        metrics: [
          {
            label: '高折扣异常单',
            value: highDiscountAbnormal,
            unit: '单',
            highlight: highDiscountAbnormal > 0,
          },
          { label: '占全部异常', value: Math.round(highDiscountPct * 10) / 10, unit: '%' },
        ],
      },
      {
        id: 'risk-distribution',
        cardType: 'standard',
        iconKey: 'order',
        title: '风险等级分布',
        sortOrder: 4,
        metrics: [
          { label: '高风险', value: highRiskRows.length, unit: '单', highlight: highRiskRows.length > 0 },
          {
            label: '中风险',
            value: mediumRiskRows.length,
            unit: '单',
            highlight: mediumRiskRows.length > 0,
          },
          { label: '低风险', value: lowRiskRows.length, unit: '单' },
        ],
      },
      {
        id: 'data-quality',
        cardType: 'standard',
        iconKey: 'safe',
        title: '数据质量',
        description: '已自动排除实付金额为 0 的订单（如全额优惠券核销订单）',
        sortOrder: 5,
        metrics: [
          { label: '总订单数', value: totalCount, unit: '单' },
          { label: '有效分析数', value: totalCount, unit: '单' },
        ],
      },
    ];

    // --- Step 6: Build insightsData ---
    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: totalCount,
        totalFilterRecordCount: abnormalCount,
        riskRecordCount: highRiskRows.length + mediumRiskRows.length,
        criticalRecordCount: highRiskRows.length,
        estimatedLoss: estimatedLoss > 0 ? estimatedLoss : undefined,
      },
      insights: insightItems,
    };

    // --- Step 7: Enrich schema ---
    const enrichedSchema = [
      ...schema,
      { name: 'abnormal_score', type: 'DOUBLE' },
      { name: 'is_abnormal', type: 'BOOLEAN' },
      { name: 'risk_level', type: 'VARCHAR' },
      { name: 'Suggestion', type: 'VARCHAR' },
    ];

    // --- Step 8: displayConfig ---
    const displayConfig = {
      defaultSort: { column: 'abnormal_score', order: 'descend' as const },
      rowColorizer: {
        field: 'risk_level',
        colorMap: {
          '高': { bg: 'rgba(255,77,79,0.12)', badgeColor: '#ff4d4f' },
          '中': { bg: 'rgba(250,140,22,0.10)', badgeColor: '#fa8c16' },
          '低': { bg: '', badgeColor: '#52c41a' },
        },
      },
      columnFormatters: {
        discount_rate: { type: 'ratio_to_fold' as const, precision: 1 },
        risk_level: { type: 'risk_badge' as const },
      },
      columnTooltips: {
        abnormal_score: '异常分（0~1），越高越异常；超过检测阈值即判定为异常订单',
        amount_z_score: '金额 z-score：相对过滤后订单均值的标准差偏离倍数，>2 通常值得关注',
        discount_rate: '折扣率：1 - 实付/原价；0 表示无折扣，0.5 表示五折',
        risk_level: '风险等级：高（异常分 ≥ 0.9）/ 中（0.7~0.9）/ 低（< 0.7）',
        is_abnormal: '是否异常：true = 异常分超过检测阈值',
        Suggestion: '业务建议：基于异常分档位给出的具体处理建议',
      },
    };

    return {
      type: this.type,
      sql: '',
      data: enrichedRows,
      schema: enrichedSchema as any[],
      insightsData,
      displayConfig,
    };
  }

  // ============================================================================
  // Empty result fallback
  // ============================================================================

  private _buildEmptyResult(schema: unknown[]): AnalysisResult {
    return {
      type: this.type,
      sql: '',
      data: [],
      schema: schema as any[],
      insightsData: {
        summary: { totalRecordCount: 0, totalFilterRecordCount: 0 },
        insights: [
          {
            id: 'empty-result',
            cardType: 'standard',
            iconKey: 'safe',
            title: '无数据',
            description:
              '当前过滤条件下没有有效订单数据，请检查字段映射或放宽过滤条件',
            sortOrder: 1,
          },
        ],
      },
    };
  }
}
