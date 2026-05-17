/**
 * RFM Clustering Service
 *
 * Wraps clustering.worker.ts to provide a clean async API for the
 * RfmStrategy postProcess step. Maintains its own Worker singleton,
 * separate from the InsightPage's clusteringService singleton, to
 * avoid message-routing conflicts between the two callers.
 *
 * Responsibility boundary:
 *   - Input:  pre-aggregated RFM rows (user_id, recency, frequency, monetary)
 *             produced by DuckDB in RfmStrategy.buildOperatorSql
 *   - Output: per-user cluster assignments (userId, clusterId)
 *   - Does NOT perform label mapping — that is RfmStrategy.postProcess's job
 */

import type {
  ClusteringRequest,
  ClusteringResult,
} from '../../types/clustering.types';
import { isClusteringSuccess, isClusteringError } from '../../types/clustering.types';

// ============================================================================
// Types
// ============================================================================

/** Pre-aggregated RFM row produced by DuckDB */
export interface RfmAggRow {
  userId: string;
  recency: number;    // Days since last order (lower = more recent = better)
  frequency: number;  // Total order count (higher = better)
  monetary: number;   // Total spend (higher = better)
}

/** Per-user cluster assignment returned by WASM K-Means */
export interface RfmSegmentResult {
  userId: string;
  clusterId: number;  // 0-based cluster index [0, nClusters)
}

// ============================================================================
// Worker singleton (scoped to this service)
// ============================================================================

/** Singleton worker for FlowCanvas RFM strategy path */
let workerInstance: Worker | null = null;

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/clustering.worker.ts', import.meta.url),
      { type: 'module' }
    );
    console.log('[RfmClusteringService] Worker instance created');
  }
  return workerInstance;
}

/**
 * Post a message to the worker and await its response.
 * Resolves with the ClusteringResult or rejects on timeout / error.
 */
function sendMessage(
  message: ClusteringRequest,
  timeoutMs: number = 120_000
): Promise<ClusteringResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();

    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`[RfmClusteringService] Worker timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (e: MessageEvent<ClusteringResult>) => {
      cleanup();
      resolve(e.data);
    };

    const onError = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(`[RfmClusteringService] Worker error: ${e.message}`));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage(message);
    console.log(`[RfmClusteringService] Sent CLUSTERING_SEGMENT: ${message.payload.customerIds.length} users, k=${message.payload.nClusters}`);
  });
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Segment pre-aggregated RFM rows into K clusters via WASM K-Means.
 *
 * @param rows         - Per-user aggregated RFM rows from DuckDB
 * @param nClusters    - Number of K-Means clusters (2–10)
 * @param scalingMode  - Feature scaling: 0=None, 1=MinMax, 2=Standard (recommended)
 * @returns Per-user cluster assignments
 *
 * @throws if WASM returns an error or the worker times out
 */
export async function segmentRfmCustomers(
  rows: RfmAggRow[],
  nClusters: number,
  scalingMode: 0 | 1 | 2
): Promise<RfmSegmentResult[]> {
  if (rows.length === 0) {
    return [];
  }

  const customerIds = rows.map((r) => r.userId);
  const features = rows.map((r) => [r.recency, r.frequency, r.monetary]);

  // Always use CPU for RFM segmentation: WebGPU device creation fails on many
  // environments (unsupported limits like maxInterStageShaderComponents).
  // CPU path is reliable and performant enough for typical RFM dataset sizes.
  const useGPU = false;

  const request: ClusteringRequest = {
    type: 'CLUSTERING_SEGMENT',
    payload: { customerIds, features, nClusters, scalingMode, useGPU },
  };

  const result = await sendMessage(request);

  if (isClusteringError(result)) {
    throw new Error(`[RfmClusteringService] Clustering failed: ${result.payload.error}`);
  }

  if (!isClusteringSuccess(result)) {
    throw new Error('[RfmClusteringService] Unexpected worker response type');
  }

  console.log(
    `[RfmClusteringService] Done — ${result.payload.customerIds.length} users, ` +
    `gpuUsed=${result.payload.gpuUsed}, ${result.payload.durationMs.toFixed(1)}ms`
  );

  return result.payload.customerIds.map((userId, i) => ({
    userId,
    clusterId: Number(result.payload.clusterIds[i]),
  }));
}
