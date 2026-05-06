/**
 * InventoryForecastStrategy
 *
 * Builds DuckDB aggregation SQL for fn_ecom_inventory_forecast (库存需求预测).
 * Calls predict_inventory_demand_batch() Wasm API in postProcess.
 *
 * Data flow:
 *   buildOperatorSql → DuckDB: GROUP BY skuCol + date_trunc(granularity, timeCol),
 *                               SUM(demandCol), ROW_NUMBER()-1 AS time_index
 *   postProcess      → Arrow IPC serialization → predict_inventory_demand_batch()
 *                    → parse results → TOP5 InsightItems + full detail table
 */

import init, { predict_inventory_demand_batch } from '../../../../wasm/fast_insight_engine.js';
import * as arrow from 'apache-arrow';
import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type OperatorInsightsData,
  type InventoryForecastConfig,
  type ValidationError,
} from '../types';

// ============================================================================
// Types
// ============================================================================

/** A single row of the aggregated DuckDB result */
interface AggRow {
  sku_id: string;
  time_index: number;
  demand: number;
}

/** A successfully predicted SKU row from Wasm */
interface ForecastSuccessRow {
  sku_id: string;
  step_index: number;
  prediction: number;
  error_code: null | string;
  error_message: null | string;
}

/** A failed SKU row from Wasm */
interface ForecastErrorRow {
  sku_id: string;
  step_index: number | null;
  prediction: number | null;
  error_code: string;
  error_message: string;
}

type ForecastRow = ForecastSuccessRow | ForecastErrorRow;

/** Per-SKU aggregated prediction metrics */
interface SkuForecastSummary {
  skuId: string;
  totalPrediction: number;
  predictSteps: number;
  avgPrediction: number;
  /** Ordered predictions per step (for trend calculation) */
  stepPredictions: number[];
}

// ============================================================================
// Arrow IPC helpers
// ============================================================================

/**
 * Serialize aggregated DuckDB rows into Arrow IPC format expected by Wasm.
 *
 * Arrow schema: sku_id (Utf8), time_index (Float64), demand (Float64)
 *
 * @param rows - Aggregated rows from DuckDB query
 * @returns Arrow IPC Stream bytes
 */
async function serializeToArrowIPC(rows: AggRow[]): Promise<Uint8Array> {
  const skuIds: string[] = [];
  const timeIndexes: number[] = [];
  const demands: number[] = [];

  for (const row of rows) {
    skuIds.push(String(row.sku_id ?? ''));
    timeIndexes.push(Number(row.time_index ?? 0));
    demands.push(Number(row.demand ?? 0));
  }

  const skuIdBuilder = new arrow.Utf8Builder({ type: new arrow.Utf8() });
  const timeIdxBuilder = new arrow.Float64Builder({ type: new arrow.Float64() });
  const demandBuilder = new arrow.Float64Builder({ type: new arrow.Float64() });

  for (let i = 0; i < rows.length; i++) {
    skuIdBuilder.append(skuIds[i]);
    timeIdxBuilder.append(timeIndexes[i]);
    demandBuilder.append(demands[i]);
  }

  const skuIdVec = skuIdBuilder.finish().toVector();
  const timeIdxVec = timeIdxBuilder.finish().toVector();
  const demandVec = demandBuilder.finish().toVector();

  const fields = [
    new arrow.Field('sku_id', new arrow.Utf8(), false),
    new arrow.Field('time_index', new arrow.Float64(), false),
    new arrow.Field('demand', new arrow.Float64(), false),
  ];
  const schema = new arrow.Schema(fields);

  const children = [
    skuIdVec.data[0],
    timeIdxVec.data[0],
    demandVec.data[0],
  ];
  const structData = new arrow.Data(
    new arrow.Struct(fields),
    0,
    rows.length,
    0,
    undefined,
    children
  );
  const recordBatch = new arrow.RecordBatch(schema, structData);

  const writer = arrow.RecordBatchStreamWriter.writeAll([recordBatch]);
  // toUint8Array() is async — must await to get actual bytes (not a Promise)
  return await writer.toUint8Array();
}

/**
 * Deserialize Arrow IPC bytes returned from predict_inventory_demand_batch.
 *
 * Expected output schema:
 *   sku_id (Utf8), step_index (Int32?), prediction (Float64?),
 *   error_code (Utf8?), error_message (Utf8?)
 *
 * @param bytes - Raw Wasm output in Arrow IPC format
 * @returns Array of ForecastRow (success + error rows mixed)
 */
function deserializeFromArrowIPC(bytes: Uint8Array): ForecastRow[] {
  const table = arrow.tableFromIPC(bytes);

  const skuIdCol = table.getChild('sku_id');
  const stepIdxCol = table.getChild('step_index');
  const predictionCol = table.getChild('prediction');
  const errorCodeCol = table.getChild('error_code');
  const errorMsgCol = table.getChild('error_message');

  if (!skuIdCol) {
    throw new Error('[InventoryForecastStrategy] Missing sku_id column in Wasm output');
  }

  const rowCount = table.numRows;
  const rows: ForecastRow[] = [];

  for (let i = 0; i < rowCount; i++) {
    const skuId = String(skuIdCol.get(i) ?? '');
    const stepIdx = stepIdxCol ? (stepIdxCol.get(i) as number | null) : null;
    const prediction = predictionCol ? (predictionCol.get(i) as number | null) : null;
    const errorCode = errorCodeCol ? (errorCodeCol.get(i) as string | null) : null;
    const errorMsg = errorMsgCol ? (errorMsgCol.get(i) as string | null) : null;

    rows.push({
      sku_id: skuId,
      step_index: stepIdx as number,
      prediction: prediction as number,
      error_code: errorCode as string,
      error_message: errorMsg as string,
    });
  }

  return rows;
}

// ============================================================================
// Strategy class
// ============================================================================

export class InventoryForecastStrategy extends BaseStrategy {
  readonly type = OperatorType.INVENTORY_FORECAST;
  readonly name = '库存需求预测';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  private wasmInitialized = false;

  /**
   * Validates operator-specific configuration: skuCol, timeCol, demandCol must
   * be non-empty and predictSteps must be ≥ 1.
   */
  protected override validateOperatorSpecific(nodes: FlowNode[], _edges: FlowEdge[]): ValidationError[] {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { inventoryForecastConfig?: InventoryForecastConfig } | undefined)
      ?.inventoryForecastConfig;

    if (!cfg) return [];

    const errors: ValidationError[] = [];
    const nodeId = selectNode?.id ?? 'select';

    if (!cfg.skuCol) {
      errors.push({ nodeId, nodeType: FlowNodeType.SELECT, severity: ValidationSeverity.ERROR, message: 'inventory forecast config: skuCol is required' });
    }
    if (!cfg.timeCol) {
      errors.push({ nodeId, nodeType: FlowNodeType.SELECT, severity: ValidationSeverity.ERROR, message: 'inventory forecast config: timeCol is required' });
    }
    if (!cfg.demandCol) {
      errors.push({ nodeId, nodeType: FlowNodeType.SELECT, severity: ValidationSeverity.ERROR, message: 'inventory forecast config: demandCol is required' });
    }
    if (cfg.predictSteps < 1) {
      errors.push({ nodeId, nodeType: FlowNodeType.SELECT, severity: ValidationSeverity.ERROR, message: 'inventory forecast config: predictSteps must be ≥ 1' });
    }

    return errors;
  }

  /**
   * Ensure Wasm module is initialized (idempotent).
   */
  private async ensureWasm(): Promise<void> {
    if (!this.wasmInitialized) {
      await init();
      this.wasmInitialized = true;
    }
  }

  /**
   * Build DuckDB aggregation SQL.
   *
   * Groups raw data by SKU + time period, sums demand, and assigns sequential
   * time_index values (0, 1, 2, …) within each SKU partition.
   *
   * @param nodes   - All canvas nodes
   * @param _edges  - Canvas edges (unused)
   * @param _ph     - Placeholder values (unused)
   * @param userWhere - Optional WHERE clause injected from condition nodes
   * @returns DuckDB SQL string
   */
  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _ph: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { inventoryForecastConfig?: InventoryForecastConfig } | undefined)
      ?.inventoryForecastConfig;

    if (!cfg || !tableName) {
      console.warn(`[${this.name}.buildOperatorSql] config missing — falling back to SELECT *`);
      return `SELECT *\nFROM "${tableName}"`;
    }

    const { skuCol, timeCol, demandCol, granularity } = cfg;
    const wherePart = userWhere ? `\n  WHERE ${userWhere.replace(/^WHERE\s+/i, '')}` : '';
    const timeTrunc = `date_trunc('${granularity}', "${timeCol}"::TIMESTAMP)`;

    const sql = [
      `SELECT`,
      `  "${skuCol}" AS sku_id,`,
      `  (ROW_NUMBER() OVER (`,
      `    PARTITION BY "${skuCol}"`,
      `    ORDER BY ${timeTrunc}`,
      `  ) - 1)::DOUBLE AS time_index,`,
      `  SUM("${demandCol}")::DOUBLE AS demand`,
      `FROM "${tableName}"${wherePart}`,
      `GROUP BY "${skuCol}", ${timeTrunc}`,
      `ORDER BY "${skuCol}", ${timeTrunc}`,
    ].join('\n');

    console.log(`[${this.name}.buildOperatorSql] granularity=${granularity} sql=\n${sql}`);
    return sql;
  }

  /**
   * Call Wasm prediction API and build AnalysisResult.
   *
   * Steps:
   *   1. Serialize DuckDB rows to Arrow IPC
   *   2. Call predict_inventory_demand_batch()
   *   3. Parse results → success rows + error rows
   *   4. Aggregate by SKU: score = SUM(prediction)
   *   5. Build TOP5 InsightItems (by score DESC)
   *   6. Build InsightSummary
   *   7. Return AnalysisResult
   *
   * @param queryResult - Raw DuckDB query result
   * @returns AnalysisResult with insightsData and full forecast detail table
   */
  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    const rawRows = (queryResult.data as AggRow[]) ?? [];

    // Trend: compare avg of first half vs second half of step predictions (8% threshold)
    const calcTrend = (steps: number[]): '↑ 上升' | '→ 平稳' | '↓ 下降' => {
      if (steps.length < 2) return '→ 平稳';
      const mid = Math.floor(steps.length / 2);
      const firstAvg = steps.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
      const secondAvg = steps.slice(mid).reduce((s, v) => s + v, 0) / (steps.length - mid);
      const rate = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
      if (rate > 0.08) return '↑ 上升';
      if (rate < -0.08) return '↓ 下降';
      return '→ 平稳';
    };

    // ---- Early-exit: no data -----------------------------------------------
    if (rawRows.length === 0) {
      return this.buildEmptyResult(queryResult);
    }

    // ---- Step 1: Serialize → Wasm ------------------------------------------
    let forecastRows: ForecastRow[];
    try {
      await this.ensureWasm();

      const inputBytes = await serializeToArrowIPC(rawRows);
      console.log(`[${this.name}.postProcess] Calling predict_inventory_demand_batch: rows=${rawRows.length}`);

      const { predictSteps, predictionMode } = this._lastConfig ?? {
        predictSteps: 7,
        predictionMode: 'ensemble' as const,
      };

      const resultBytes = await predict_inventory_demand_batch(
        inputBytes,
        predictSteps,
        predictionMode,
        'standard',
        0.0
      );

      forecastRows = deserializeFromArrowIPC(resultBytes);
      console.log(`[${this.name}.postProcess] Wasm returned ${forecastRows.length} rows`);
    } catch (err) {
      console.error(`[${this.name}.postProcess] Wasm call failed`, err);
      return this.buildErrorResult(queryResult, err instanceof Error ? err.message : String(err));
    }

    // ---- Step 2: Separate success / error rows ------------------------------
    const successRows = forecastRows.filter((r) => !r.error_code);
    const errorRows = forecastRows.filter((r) => !!r.error_code);

    // ---- Step 3: Per-SKU aggregation ----------------------------------------
    const skuMap = new Map<string, { total: number; steps: Map<number, number> }>();
    for (const row of successRows) {
      const cur = skuMap.get(row.sku_id) ?? { total: 0, steps: new Map<number, number>() };
      cur.total += row.prediction ?? 0;
      cur.steps.set(row.step_index ?? cur.steps.size, row.prediction ?? 0);
      skuMap.set(row.sku_id, cur);
    }

    const skuSummaries: SkuForecastSummary[] = Array.from(skuMap.entries())
      .map(([skuId, { total, steps }]) => {
        const ordered = Array.from(steps.entries())
          .sort(([a], [b]) => a - b)
          .map(([, v]) => v);
        return {
          skuId,
          totalPrediction: total,
          predictSteps: ordered.length,
          avgPrediction: ordered.length > 0 ? total / ordered.length : 0,
          stepPredictions: ordered,
        };
      })
      .sort((a, b) => b.totalPrediction - a.totalPrediction);

    const top5 = skuSummaries.slice(0, 5);
    const peakSku = skuSummaries[0]?.skuId ?? null;
    const failedSkuIds = new Set(errorRows.map((r) => r.sku_id));

    // ---- Step 4: Build InsightItems -----------------------------------------
    let insights: OperatorInsightsData['insights'];

    if (successRows.length === 0 && errorRows.length > 0) {
      // All SKUs failed — surface diagnostic cards instead of silent empty state
      const uniqueErrors = Array.from(
        new Map(errorRows.map((r) => [r.error_code, r.error_message])).entries()
      );
      insights = uniqueErrors.map(([code, msg], idx) => {
        const affectedCount = errorRows.filter((r) => r.error_code === code).length;
        return {
          id: `forecast-error-${idx + 1}`,
          cardType: 'custom' as const,
          iconKey: 'warning' as const,
          title: `预测失败：${code}`,
          sortOrder: idx + 1,
          description: `${msg ?? '未知错误'}。${
            code === 'ValidationError' && msg?.includes('at least 2 data points')
              ? '请确保每个 SKU 在所选粒度下有 ≥ 2 个时间点（如选"月"需至少 2 个月的数据）'
              : '请检查数据质量或调整预测参数后重试'
          }（影响 ${affectedCount} 个 SKU）`,
          metrics: [
            { label: '失败 SKU 数', value: affectedCount, unit: '个', highlight: true },
          ],
        };
      });
    } else {
      // Granularity-aware period label for average demand display
      const granularity = this._lastConfig?.granularity;
      const periodLabel = granularity === 'month' ? '月' : granularity === 'week' ? '周' : '日';

      insights = top5.map((sku, idx) => {
        const trendLabel = calcTrend(sku.stepPredictions);
        // Safety stock: recommended procurement = total + 20% buffer
        const safetyStock = Math.ceil(sku.totalPrediction * 1.2);

        return {
          id: `forecast-sku-${idx + 1}`,
          cardType: 'custom' as const,
          iconKey: 'order' as const,
          title: sku.skuId,
          sortOrder: idx + 1,
          description: `未来 ${sku.predictSteps} 个${periodLabel}预测，${periodLabel}均需求 ${Math.round(sku.avgPrediction)} 件，趋势 ${trendLabel}`,
          metrics: [
            { label: `${periodLabel}均需求`, value: Math.round(sku.avgPrediction), unit: '件', highlight: idx === 0 },
            { label: '预测总需求', value: Math.round(sku.totalPrediction), unit: '件' },
            { label: '建议备货量', value: safetyStock, unit: '件' },
          ],
        };
      });
    }

    // ---- Step 5: Build summary ----------------------------------------------
    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: forecastRows.length,
        totalFilterRecordCount: successRows.length,
        forecastSkuCount: skuMap.size + failedSkuIds.size,
        failedSkuCount: failedSkuIds.size,
        peakForecastSku: peakSku ?? undefined,
      },
      insights,
    };

    // ---- Step 6: Build business-friendly table rows (per-SKU summary) --------
    const granularity = this._lastConfig?.granularity;
    const periodLabel = granularity === 'month' ? '月' : granularity === 'week' ? '周' : '日';

    // Success SKU rows
    const successTableRows: Record<string, unknown>[] = skuSummaries.map((sku) => ({
      商品编号: sku.skuId,
      [`预测期数(${periodLabel})`]: sku.predictSteps,
      [`${periodLabel}均需求(件)`]: Math.round(sku.avgPrediction),
      预测总需求: Math.round(sku.totalPrediction),
      建议备货量: Math.ceil(sku.totalPrediction * 1.2),
      需求趋势: calcTrend(sku.stepPredictions),
      状态: '✓ 预测成功',
    }));

    // Failed SKU rows — one row per unique SKU, reason from first occurrence
    const failedTableRows: Record<string, unknown>[] = Array.from(
      new Map(errorRows.map((r) => [r.sku_id, r])).values()
    ).map((r) => ({
      商品编号: r.sku_id,
      [`预测期数(${periodLabel})`]: 0,
      [`${periodLabel}均需求(件)`]: 0,
      预测总需求: 0,
      建议备货量: 0,
      需求趋势: '— 无法预测',
      状态: `✗ ${r.error_message ?? r.error_code ?? '预测失败'}`,
    }));

    const businessRows = [...successTableRows, ...failedTableRows];

    const businessSchema: { name: string; type: string }[] = [
      { name: '商品编号', type: 'VARCHAR' },
      { name: `预测期数(${periodLabel})`, type: 'INTEGER' },
      { name: `${periodLabel}均需求(件)`, type: 'INTEGER' },
      { name: '预测总需求', type: 'INTEGER' },
      { name: '建议备货量', type: 'INTEGER' },
      { name: '需求趋势', type: 'VARCHAR' },
      { name: '状态', type: 'VARCHAR' },
    ];

    const displayConfig: import('../types').OperatorDisplayConfig = {
      defaultSort: { column: '预测总需求', order: 'descend' },
      columnTooltips: {
        商品编号: 'SKU / 产品编号',
        [`预测期数(${periodLabel})`]: `预测覆盖的${periodLabel}数`,
        [`${periodLabel}均需求(件)`]: `每${periodLabel}平均预测需求量`,
        预测总需求: '全部预测期的需求总量（件）',
        建议备货量: '预测总需求 × 1.2 安全系数，建议采购数量',
        需求趋势: '比较前后半段均值：↑ 上升 / → 平稳 / ↓ 下降（变化率 > 8%）',
        状态: '✓ 预测成功 / ✗ 失败原因',
      },
      rowColorizer: {
        field: '需求趋势',
        colorMap: {
          '↑ 上升': { bg: 'rgba(82,196,26,0.08)', badgeColor: '#52c41a' },
          '→ 平稳': { bg: 'rgba(250,173,20,0.08)', badgeColor: '#faad14' },
          '↓ 下降': { bg: 'rgba(255,77,79,0.08)', badgeColor: '#ff4d4f' },
          '— 无法预测': { bg: 'rgba(140,140,140,0.08)', badgeColor: '#8c8c8c' },
        },
      },
    };

    return {
      type: this.type,
      sql: '',
      data: businessRows,
      schema: businessSchema,
      insightsData,
      displayConfig,
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Stores the config from the most recent buildOperatorSql call so postProcess
   * can access predictSteps and predictionMode without the strategy interface
   * needing to change.
   */
  private _lastConfig: Pick<InventoryForecastConfig, 'predictSteps' | 'predictionMode' | 'granularity'> | null = null;

  /** @override Intercept buildSql to capture the config before delegating. */
  override buildSql(
    nodes: FlowNode[],
    edges: FlowEdge[],
    placeholderValues?: Record<string, unknown>
  ): string {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const cfg = (selectNode?.data as { inventoryForecastConfig?: InventoryForecastConfig } | undefined)
      ?.inventoryForecastConfig;
    if (cfg) {
      this._lastConfig = {
        predictSteps: cfg.predictSteps,
        predictionMode: cfg.predictionMode,
        granularity: cfg.granularity,
      };
    }
    return super.buildSql(nodes, edges, placeholderValues);
  }

  private buildEmptyResult(queryResult: { data: unknown[]; schema: unknown[] }): AnalysisResult {
    return {
      type: this.type,
      sql: '',
      data: [],
      schema: queryResult.schema as { name: string; type: string }[],
      insightsData: {
        summary: {
          totalRecordCount: 0,
          totalFilterRecordCount: 0,
          forecastSkuCount: 0,
          failedSkuCount: 0,
        },
        insights: [{
          id: 'forecast-empty',
          cardType: 'custom' as const,
          iconKey: 'order' as const,
          title: '暂无数据',
          sortOrder: 1,
          description: '未找到符合条件的历史需求记录，请检查数据和字段配置',
          metrics: [],
        }],
      },
    };
  }

  private buildErrorResult(
    queryResult: { data: unknown[]; schema: unknown[] },
    errorMsg: string
  ): AnalysisResult {
    return {
      type: this.type,
      sql: '',
      data: [],
      schema: queryResult.schema as { name: string; type: string }[],
      insightsData: {
        summary: {
          totalRecordCount: 0,
          totalFilterRecordCount: 0,
          forecastSkuCount: 0,
          failedSkuCount: 0,
        },
        insights: [{
          id: 'forecast-error',
          cardType: 'custom' as const,
          iconKey: 'order' as const,
          title: '预测执行失败',
          sortOrder: 1,
          description: `Wasm 调用失败：${errorMsg}`,
          metrics: [],
        }],
      },
    };
  }
}
