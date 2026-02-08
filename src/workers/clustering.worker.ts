/**
 * Customer Clustering Worker
 * Executes K-Means clustering via WASM in a separate thread
 */

import init, { segment_customer_orders } from '../../wasm/fast_insight_engine.js';
import { 
  serializeToArrowIPC, 
  deserializeClusteringResult,
  WASM_COLUMN_MAPPING 
} from '../services/utils/arrowUtils';
import type {
  ClusteringRequest,
  ClusteringSuccess,
  ClusteringError,
} from '../types/clustering.types';

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
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    console.log('[ClusteringWorker] WebGPU not available (API missing)');
    return false;
  }

  try {
    const adapter = await (navigator as any).gpu.requestAdapter();
    if (!adapter) {
      console.log('[ClusteringWorker] WebGPU adapter not found (no compatible GPU)');
      return false;
    }

    console.log('[ClusteringWorker] WebGPU available, adapter:', adapter);
    return true;
  } catch (error) {
    console.error('[ClusteringWorker] WebGPU check failed:', error);
    return false;
  }
}

/**
 * Determine whether to use GPU based on row count and user preference
 * @param rowCount Number of customers to process
 * @param useGPU User preference (true = attempt GPU, false = CPU only)
 * @returns true if GPU should be used
 */
function shouldUseGPU(rowCount: number, useGPU: boolean): boolean {
  if (!useGPU) {
    console.log('[ClusteringWorker] GPU disabled by user preference');
    return false;
  }

  // Auto strategy: Use GPU for >5k customers if available
  const shouldUse = rowCount > 5000 && hasGPU;
  console.log(`[ClusteringWorker] GPU decision: ${shouldUse} (rows: ${rowCount}, GPU available: ${hasGPU})`);
  return shouldUse;
}

// ============================================================================
// Message Handler
// ============================================================================

/**
 * Handle incoming messages from main thread
 */
self.onmessage = async (e: MessageEvent<ClusteringRequest>) => {
  const startTime = performance.now();

  try {
    // Initialize WASM module (once)
    if (!wasmInitialized) {
      console.log('[ClusteringWorker] Initializing WASM module...');
      await init();
      wasmInitialized = true;
      console.log('[ClusteringWorker] WASM initialized successfully');

      // Check GPU availability (once)
      hasGPU = await checkWebGPUSupport();
    }

    // Validate message format
    if (e.data.type !== 'CLUSTERING_SEGMENT') {
      throw new Error(`Unknown message type: ${e.data.type}`);
    }

    const { customerIds, features, nClusters, scalingMode, useGPU: gpuPreference } = e.data.payload;

    // Validate payload
    if (!Array.isArray(customerIds) || customerIds.length === 0) {
      throw new Error('Invalid customerIds: must be non-empty array');
    }
    if (!Array.isArray(features) || features.length === 0) {
      throw new Error('Invalid features: must be non-empty array');
    }
    if (customerIds.length !== features.length) {
      throw new Error(`Length mismatch: ${customerIds.length} customers vs ${features.length} feature rows`);
    }
    if (nClusters < 2 || nClusters > 10) {
      throw new Error(`Invalid K value: ${nClusters} (must be 2-10)`);
    }

    // Determine GPU usage
    const useGPU = shouldUseGPU(customerIds.length, gpuPreference);

    // Serialize to Arrow IPC with Wasm-expected column name
    // Use WASM_COLUMN_MAPPING to handle the naming inconsistency:
    // - TypeScript: 'customer_id' (semantic)
    // - Wasm expects: 'order_id' (hardcoded)
    console.log(`[ClusteringWorker] Serializing ${customerIds.length} customers with ${features[0].length} features...`);
    const arrowData = await serializeToArrowIPC(
      customerIds, 
      WASM_COLUMN_MAPPING.clustering.idColumn,  // 'order_id'
      features
    );

    // Call WASM function
    console.log(`[ClusteringWorker] Calling segment_customer_orders (K=${nClusters}, GPU=${useGPU}, scalingMode=${scalingMode})`);
    const wasmStart = performance.now();
    const arrowResult = await segment_customer_orders(
      arrowData,
      nClusters,
      scalingMode,
      useGPU
    );
    const wasmDuration = performance.now() - wasmStart;
    console.log(`[ClusteringWorker] WASM execution completed in ${wasmDuration.toFixed(2)}ms`);

    // Deserialize result
    const { customerIds: resultIds, clusterIds } = deserializeClusteringResult(arrowResult);

    // Validate result length
    if (resultIds.length !== customerIds.length) {
      throw new Error(`Result length mismatch: expected ${customerIds.length}, got ${resultIds.length}`);
    }

    // Build success response
    const totalDuration = performance.now() - startTime;
    const response: ClusteringSuccess = {
      type: 'CLUSTERING_SEGMENT_SUCCESS',
      payload: {
        customerIds: resultIds,
        clusterIds,
        gpuUsed: useGPU,
        durationMs: totalDuration,
      },
    };

    console.log(`[ClusteringWorker] Success: ${resultIds.length} customers clustered into ${nClusters} groups (${totalDuration.toFixed(2)}ms)`);
    self.postMessage(response);
  } catch (error) {
    console.error('[ClusteringWorker] Error:', error);

    const response: ClusteringError = {
      type: 'CLUSTERING_SEGMENT_ERROR',
      payload: {
        error: error instanceof Error ? error.message : 'Unknown error',
        code: 'CLUSTERING_FAILED',
      },
    };

    self.postMessage(response);
  }
};

// Log worker initialization
console.log('[ClusteringWorker] Worker initialized');
