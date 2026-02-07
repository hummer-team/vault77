/**
 * Anomaly Detection Service
 * Handles data preprocessing, worker communication, and result enrichment
 */

import { identifyAnomalyColumns, validateColumnIdentification } from './columnIdentifier';
import { settingsService } from '../settingsService';
import type {
  AnomalyAnalysisInput,
  AnomalyAnalysisOutput,
  AnomalyRecord,
  AnomalyMetadata,
  AnomalyDetectionRequest,
  AnomalyDetectionResult,
} from '../../types/anomaly.types';
import { isAnomalyDetectionSuccess, isAnomalyDetectionError } from '../../types/anomaly.types';

// ============================================================================
// Worker Management
// ============================================================================

let workerInstance: Worker | null = null;

/**
 * Get or create anomaly worker instance (singleton pattern)
 */
function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/anomaly.worker.ts', import.meta.url),
      { type: 'module' }
    );
    console.log('[AnomalyService] Worker instance created');
  }
  return workerInstance;
}

/**
 * Send message to worker and wait for response with timeout
 */
function sendMessageToWorker(
  message: AnomalyDetectionRequest,
  timeoutMs: number = 60000
): Promise<AnomalyDetectionResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    
    // Cleanup function to prevent listener leaks
    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      cleanup();  // FIX 1.2: Clean up listeners on timeout
      reject(new Error(`Worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // Listen for response
    const handleMessage = (e: MessageEvent<AnomalyDetectionResult>) => {
      cleanup();
      resolve(e.data);
    };

    const handleError = (error: ErrorEvent) => {
      cleanup();
      reject(new Error(`Worker error: ${error.message}`));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    
    // FIX 1.1: Transfer ArrayBuffer ownership to worker (zero-copy)
    // Note: Our worker doesn't use ArrayBuffer transfer (data is in orderIds/features)
    // But we still avoid unnecessary copies by using structured clone
    worker.postMessage(message);
    console.log('[AnomalyService] Posted message to worker');
  });
}

// ============================================================================
// Data Preprocessing
// ============================================================================

/**
 * Get row count from table
 */
async function getRowCount(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[] }>
): Promise<number> {
  const result = await executeQuery(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
  return result.data[0]?.cnt || 0;
}

/**
 * Infer feature columns from table schema using dedicated column identifier
 */
async function inferFeatureColumns(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<{
  orderIdColumn: string | null;
  featureColumns: string[];
}> {
  try {
    const result = await identifyAnomalyColumns(tableName, executeQuery);
    validateColumnIdentification(result);

    console.log('[AnomalyService] Column identification complete:', {
      orderIdColumn: result.orderIdColumn,
      featureCount: result.featureColumns.length,
      featureColumns: result.featureColumns.slice(0, 5),  // Show first 5
    });

    return {
      orderIdColumn: result.orderIdColumn,
      featureColumns: result.featureColumns,
    };
  } catch (error) {
    console.error('[AnomalyService] Column identification failed:', error);
    throw error;  // Re-throw with original error message
  }
}

/**
 * Fetch and sample data from DuckDB
 */
async function fetchData(
  tableName: string,
  orderIdColumn: string,
  featureColumns: string[],
  samplingRate: number,
  executeQuery: (sql: string) => Promise<{ data: any[] }>
): Promise<{
  orderIds: string[];
  features: number[][];
  actualSamplingRate: number;
}> {
  try {
    // Build SQL query with sampling
    // Use DuckDB official SAMPLE syntax (without REPEATABLE which is not supported)
    const shouldSample = samplingRate < 1.0;
    const samplingClause = shouldSample 
      ? `USING SAMPLE ${(samplingRate * 100).toFixed(2)} PERCENT (bernoulli)`
      : '';
    
    const featureColumnsSQL = featureColumns
      .map(col => `"${col}"`)
      .join(', ');
    
    const sql = `
      SELECT 
        "${orderIdColumn}" as order_id,
        ${featureColumnsSQL}
      FROM "${tableName}"
      ${samplingClause}
    `.trim();

    console.log(`[AnomalyService] Sampling: ${shouldSample ? 'YES' : 'NO'}, clause: "${samplingClause}"`);
    console.log('[AnomalyService] Executing query:', sql);
    const result = await executeQuery(sql);

    if (!result.data || result.data.length === 0) {
      throw new Error('No data returned from query');
    }

    // Extract order IDs and features
    const orderIds: string[] = [];
    const features: number[][] = [];

    for (const row of result.data) {
      // Convert order_id to String (handle various types)
      let orderId: string;
      if (typeof row.order_id === 'string') {
        orderId = row.order_id;
      } else if (typeof row.order_id === 'number') {
        orderId = String(row.order_id);
      } else if (typeof row.order_id === 'bigint') {
        orderId = row.order_id.toString();
      } else {
        console.warn('[AnomalyService] Invalid order_id type:', typeof row.order_id, row.order_id);
        continue; // Skip invalid rows
      }

      // Extract feature values
      const featureValues = featureColumns.map(col => {
        const value = row[col];
        return typeof value === 'number' ? value : 0; // Default to 0 for non-numeric
      });

      orderIds.push(orderId);
      features.push(featureValues);
    }

    console.log(`[AnomalyService] Fetched ${orderIds.length} orders with ${featureColumns.length} features`);

    return {
      orderIds,
      features,
      actualSamplingRate: samplingRate,
    };
  } catch (error) {
    console.error('[AnomalyService] Data fetch failed:', error);
    throw new Error(`Data fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Perform anomaly detection on a DuckDB table
 */
export async function analyzeAnomalies(
  input: AnomalyAnalysisInput,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<AnomalyAnalysisOutput> {
  const startTime = performance.now();

  try {
    console.log('[AnomalyService] Starting anomaly analysis:', input);

    // Step 1: Load settings
    const settings = await settingsService.getAnomalyDetectionSettings();
    const threshold = input.threshold ?? settings.threshold;
    const useGPUSetting = input.useGPU ?? settings.useGPU;

    // Step 2: Get row count
    const rowsTotal = await getRowCount(input.tableName, executeQuery);
    console.log(`[AnomalyService] Total rows: ${rowsTotal}`);

    if (rowsTotal === 0) {
      throw new Error('Table is empty');
    }

    // Step 3: Determine sampling rate with adaptive strategy
    // FIX 2.1: Adaptive sampling to prevent WASM memory overflow
    const TARGET_MAX_ROWS = 80000;  // WASM safe limit (prevents 32MB overflow)
    const shouldSample = rowsTotal > settings.samplingThreshold;
    
    let samplingRate: number;
    if (shouldSample) {
      const configuredRate = input.samplingRate ?? settings.samplingRate;
      // Adaptive: Never exceed TARGET_MAX_ROWS
      samplingRate = Math.min(configuredRate, TARGET_MAX_ROWS / rowsTotal);
    } else {
      samplingRate = 1.0;
    }

    const estimatedRows = Math.floor(rowsTotal * samplingRate);
    console.log(
      `[AnomalyService] Sampling: ${shouldSample ? 'YES' : 'NO'}, ` +
      `rate: ${(samplingRate * 100).toFixed(1)}%, ` +
      `target rows: ${estimatedRows} (from ${rowsTotal})`
    );

    // Step 4: Infer or validate columns
    let orderIdColumn = input.orderIdColumn;
    let featureColumns = input.featureColumns;

    if (!orderIdColumn || featureColumns.length === 0) {
      console.log('[AnomalyService] Columns not provided, inferring...');
      const inferred = await inferFeatureColumns(input.tableName, executeQuery);
      
      if (!inferred.orderIdColumn) {
        throw new Error('Unable to identify order ID column. Please specify manually.');
      }
      if (inferred.featureColumns.length === 0) {
        throw new Error('No numeric feature columns found. Please specify manually.');
      }

      orderIdColumn = inferred.orderIdColumn;
      featureColumns = inferred.featureColumns;
    }

    // Step 5: Fetch and sample data
    const { orderIds, features, actualSamplingRate } = await fetchData(
      input.tableName,
      orderIdColumn,
      featureColumns,
      samplingRate,
      executeQuery
    );

    const rowsProcessed = orderIds.length;
    console.log(`[AnomalyService] Processing ${rowsProcessed} rows (sampled from ${rowsTotal}, rate: ${actualSamplingRate})`);

    // FIX 2.3: Memory pre-flight check to prevent large allocations
    const featureCount = featureColumns.length;
    const estimatedMemoryMB = (rowsProcessed * featureCount * 8) / (1024 * 1024);
    const MEMORY_LIMIT_MB = 25;  // 25 MB safe limit for Arrow IPC serialization

    console.log(
      `[AnomalyService] Memory estimate: ${estimatedMemoryMB.toFixed(1)} MB ` +
      `(${rowsProcessed} rows × ${featureCount} features × 8 bytes)`
    );

    if (estimatedMemoryMB > MEMORY_LIMIT_MB) {
      throw new Error(
        `Dataset too large for anomaly detection: ${estimatedMemoryMB.toFixed(1)} MB ` +
        `(limit: ${MEMORY_LIMIT_MB} MB, ${rowsProcessed} rows). ` +
        `Please increase sampling rate or reduce dataset size.`
      );
    }

    // Step 6: Call worker
    const workerRequest: AnomalyDetectionRequest = {
      type: 'ANOMALY_DETECT',
      payload: {
        orderIds,
        features,
        threshold,
        scalingMode: 2, // Standard scaling (recommended)
        useGPU: useGPUSetting === 'auto' || useGPUSetting === 'force',
      },
    };

    const workerTimeout = useGPUSetting === 'force' ? 30000 : 60000; // 30s for GPU, 60s for CPU
    const workerResult = await sendMessageToWorker(workerRequest, workerTimeout);

    // NOTE: orderIds and features are transferred to worker via structured clone
    // They will be garbage collected after this scope ends naturally
    // No need for explicit nullification of const variables

    // Step 7: Handle worker response
    if (isAnomalyDetectionError(workerResult)) {
      throw new Error(`Worker error: ${workerResult.payload.error}`);
    }

    if (!isAnomalyDetectionSuccess(workerResult)) {
      throw new Error('Invalid worker response type');
    }

    const { abnormalScores, isAbnormal, gpuUsed } = workerResult.payload;

    // Step 8: Build anomaly records
    const anomalies: AnomalyRecord[] = [];
    for (let i = 0; i < orderIds.length; i++) {
      if (isAbnormal[i]) {
        const featureValues: Record<string, number> = {};
        for (let j = 0; j < featureColumns.length; j++) {
          featureValues[featureColumns[j]] = features[i][j];
        }

        anomalies.push({
          orderId: orderIds[i],
          score: abnormalScores[i],
          isAbnormal: true,
          features: featureValues,
        });
      }
    }

    // Sort by score (descending)
    anomalies.sort((a, b) => b.score - a.score);

    // Add rank
    anomalies.forEach((record, index) => {
      record.rank = index + 1;
    });

    // Performance warning for large result sets
    if (anomalies.length > 5000) {
      console.warn('[AnomalyService] Large anomaly count detected:', {
        anomalyCount: anomalies.length,
        recommendation: 'Consider increasing threshold or enabling sampling',
      });
    }

    // Step 9: Build metadata
    const totalDuration = performance.now() - startTime;
    const metadata: AnomalyMetadata = {
      gpuUsed,
      samplingRate: actualSamplingRate,
      samplingThreshold: settings.samplingThreshold,
      rowsProcessed,
      rowsTotal,
      durationMs: totalDuration,
      threshold,
      featureColumns,
      orderIdColumn,  // NEW: Record order ID column name for querying
    };

    // Step 10: Return result
    const output: AnomalyAnalysisOutput = {
      anomalyCount: anomalies.length,
      totalProcessed: rowsProcessed,
      anomalyRate: rowsProcessed > 0 ? anomalies.length / rowsProcessed : 0,
      anomalies,
      metadata,
    };

    console.log('[AnomalyService] Analysis complete:', {
      anomalyCount: output.anomalyCount,
      anomalyRate: (output.anomalyRate * 100).toFixed(2) + '%',
      gpuUsed,
      durationMs: totalDuration.toFixed(2),
    });

    return output;
  } catch (error) {
    console.error('[AnomalyService] Analysis failed:', error);
    
    // FIX 2.2: Reset worker after error to prevent memory leak
    // Worker may be in bad state after WASM crash, terminate and recreate
    resetWorker();
    
    throw error; // Re-throw for caller to handle
  }
}

/**
 * Reset worker instance (recreate after crash)
 * FIX 2.2: Prevents memory accumulation after WASM crashes
 */
export function resetWorker(): void {
  if (workerInstance) {
    try {
      workerInstance.terminate();
      console.log('[AnomalyService] Worker terminated');
    } catch (e) {
      console.warn('[AnomalyService] Worker termination failed:', e);
    }
    workerInstance = null;
  }
  console.log('[AnomalyService] Worker reset complete');
}

/**
 * Cleanup worker instance (call on unmount)
 */
export function cleanup(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
    console.log('[AnomalyService] Worker terminated');
  }
}
