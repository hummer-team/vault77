/**
 * Anomaly Detection Worker
 * Executes isolation forest algorithm via WASM in a separate thread
 */

import init, { detect_order_anomalies } from '../../wasm/fast_insight_engine.js';
import * as arrow from 'apache-arrow';
import type {
  AnomalyDetectionRequest,
  AnomalyDetectionSuccess,
  AnomalyDetectionError,
} from '../types/anomaly.types';

// ============================================================================
// Worker State
// ============================================================================

let wasmInitialized = false;
let hasGPU = false;

// ============================================================================
// GPU Detection
// ============================================================================

/**
 * Check if WebGPU is supported in this environment
 * @returns true if GPU adapter is available
 */
async function checkWebGPUSupport(): Promise<boolean> {
  // Check if navigator.gpu exists (WebGPU API)
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    console.log('[AnomalyWorker] WebGPU not available (API missing)');
    return false;
  }

  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      console.log('[AnomalyWorker] WebGPU adapter not found (no compatible GPU)');
      return false;
    }

    console.log('[AnomalyWorker] WebGPU available, adapter:', adapter);
    return true;
  } catch (error) {
    console.error('[AnomalyWorker] WebGPU check failed:', error);
    return false;
  }
}

/**
 * Determine whether to use GPU based on strategy and row count
 * @param rowCount Number of rows to process
 * @param strategy GPU usage strategy: 'auto' | 'force' | 'disable'
 * @returns true if GPU should be used
 */
function shouldUseGPU(rowCount: number, strategy: string): boolean {
  if (strategy === 'disable') {
    console.log('[AnomalyWorker] GPU disabled by user setting');
    return false;
  }
  
  if (strategy === 'force') {
    console.log('[AnomalyWorker] GPU forced by user setting');
    return true; // May fail if GPU unavailable, WASM will fallback
  }

  // 'auto' strategy: Use GPU for >5k rows if available
  const useGPU = rowCount > 5000 && hasGPU;
  console.log(`[AnomalyWorker] Auto GPU decision: ${useGPU} (rows: ${rowCount}, GPU available: ${hasGPU})`);
  return useGPU;
}

// ============================================================================
// Arrow IPC Serialization
// ============================================================================

/**
 * Serialize data to Arrow IPC Stream format (CSP-safe using Builder API)
 * Uses Builder API which doesn't require eval()
 * @param orderIds Order ID array (String type)
 * @param features Feature matrix (2D number array)
 * @returns Uint8Array in Arrow IPC Stream format
 */
async function serializeToArrowIPC(
  orderIds: string[],
  features: number[][]
): Promise<Uint8Array> {
  try {
    // Validate input
    if (orderIds.length === 0) {
      throw new Error('Empty orderIds array');
    }
    if (features.length !== orderIds.length) {
      throw new Error(`Feature count mismatch: ${features.length} vs ${orderIds.length} orders`);
    }

    const featureCount = features[0]?.length || 0;
    if (featureCount === 0) {
      throw new Error('No features provided');
    }

    const rowCount = orderIds.length;

    // Build vectors using Builder API (no eval needed)
    // 1. Order ID column using Utf8Builder
    const orderIdBuilder = new arrow.Utf8Builder({ type: new arrow.Utf8() });
    for (const orderId of orderIds) {
      orderIdBuilder.append(orderId);
    }
    const orderIdVector = orderIdBuilder.finish().toVector();

    // 2. Feature columns using Float64Builder
    const featureVectors = [];
    for (let i = 0; i < featureCount; i++) {
      const featureBuilder = new arrow.Float64Builder({ type: new arrow.Float64() });
      for (let j = 0; j < rowCount; j++) {
        featureBuilder.append(features[j][i]);
      }
      featureVectors.push(featureBuilder.finish().toVector());
    }

    // 3. Build schema
    const fields = [
      new arrow.Field('order_id', new arrow.Utf8(), false),
      ...Array.from({ length: featureCount }, (_, i) =>
        new arrow.Field(`feature_${i}`, new arrow.Float64(), false)
      ),
    ];
    const schema = new arrow.Schema(fields);

    // 4. Create RecordBatch from vectors
    const children = [orderIdVector.data[0], ...featureVectors.map(v => v.data[0])];
    const structData = new arrow.Data(
      new arrow.Struct(fields),
      0,
      rowCount,
      0,
      undefined,
      children
    );
    const recordBatch = new arrow.RecordBatch(schema, structData);

    // 5. Serialize to IPC Stream format
    const writer = arrow.RecordBatchStreamWriter.writeAll([recordBatch]);
    const arrowData = await writer.toUint8Array();

    console.log(`[AnomalyWorker] Serialized ${orderIds.length} orders x ${featureCount} features (${arrowData.byteLength} bytes)`);
    return new Uint8Array(arrowData);
  } catch (error) {
    console.error('[AnomalyWorker] Arrow IPC serialization failed:', error);
    throw new Error(`Arrow serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Deserialize Arrow IPC result from WASM
 * @param arrowResult Uint8Array from WASM in Arrow IPC format
 * @returns Parsed result with order IDs, scores, and flags
 */
function deserializeFromArrowIPC(arrowResult: Uint8Array): {
  orderIds: string[];
  abnormalScores: number[];
  isAbnormal: boolean[];
} {
  try {
    // Parse Arrow Table from IPC
    const table = arrow.tableFromIPC(arrowResult);

    // Extract columns
    const orderIdColumn = table.getChild('order_id');
    const scoreColumn = table.getChild('abnormal_score');
    const flagColumn = table.getChild('is_abnormal');

    if (!orderIdColumn || !scoreColumn || !flagColumn) {
      throw new Error('Missing required columns in WASM result');
    }

    // Convert to JavaScript arrays
    // order_id is Utf8Vector → string[]
    const orderIds = Array.from(orderIdColumn.toArray()) as string[];
    const abnormalScores = Array.from(scoreColumn.toArray()) as number[];
    const isAbnormal = Array.from(flagColumn.toArray()) as boolean[];

    console.log(`[AnomalyWorker] Deserialized ${orderIds.length} results`);
    return { orderIds, abnormalScores, isAbnormal };
  } catch (error) {
    console.error('[AnomalyWorker] Arrow IPC deserialization failed:', error);
    throw new Error(`Arrow deserialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async (e: MessageEvent<AnomalyDetectionRequest>) => {
  const startTime = performance.now();

  try {
    // Initialize WASM module (once)
    if (!wasmInitialized) {
      console.log('[AnomalyWorker] Initializing WASM module...');
      await init();
      wasmInitialized = true;
      console.log('[AnomalyWorker] WASM initialized successfully');

      // Check GPU availability (once)
      hasGPU = await checkWebGPUSupport();
    }

    // Validate message format
    if (e.data.type !== 'ANOMALY_DETECT') {
      throw new Error(`Unknown message type: ${e.data.type}`);
    }

    const { orderIds, features, threshold, scalingMode, useGPU: gpuStrategy } = e.data.payload;

    // Validate payload
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      throw new Error('Invalid orderIds: must be non-empty array');
    }
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error('Invalid features: must be non-empty array');
    }

    // Determine GPU usage
    const useGPU = shouldUseGPU(orderIds.length, gpuStrategy ? 'auto' : 'disable');

    // Serialize to Arrow IPC
    const arrowData = await serializeToArrowIPC(orderIds, features);
    
    // NOTE: orderIds and features are const parameters, cannot be reassigned
    // They will be garbage collected after function scope ends
    // Arrow IPC serialization already copied the data

    // Call WASM function
    console.log(`[AnomalyWorker] Calling detect_order_anomalies (GPU: ${useGPU}, threshold: ${threshold}, scalingMode: ${scalingMode})`);
    const wasmStart = performance.now();
    const arrowResult = await detect_order_anomalies(
      arrowData,
      threshold,
      scalingMode,
      useGPU
    );
    const wasmDuration = performance.now() - wasmStart;
    console.log(`[AnomalyWorker] WASM execution completed in ${wasmDuration.toFixed(2)}ms`);

    // NOTE: arrowData is const, will be GC'd after scope ends
    // WASM has already consumed the buffer

    // Deserialize result
    const result = deserializeFromArrowIPC(arrowResult);

    // Calculate total duration
    const totalDuration = performance.now() - startTime;

    // Send success response
    const response: AnomalyDetectionSuccess = {
      type: 'ANOMALY_DETECT_SUCCESS',
      payload: {
        orderIds: result.orderIds,
        abnormalScores: result.abnormalScores,
        isAbnormal: result.isAbnormal,
        gpuUsed: useGPU,
        durationMs: totalDuration,
      },
    };

    self.postMessage(response);
    console.log(`[AnomalyWorker] Success response sent (total: ${totalDuration.toFixed(2)}ms)`);
  } catch (error) {
    console.error('[AnomalyWorker] Error during anomaly detection:', error);

    // Send error response
    const errorResponse: AnomalyDetectionError = {
      type: 'ANOMALY_DETECT_ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        code: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      },
    };

    self.postMessage(errorResponse);
  }
};

// ============================================================================
// Worker Ready Signal
// ============================================================================

console.log('[AnomalyWorker] Worker script loaded, waiting for messages...');
