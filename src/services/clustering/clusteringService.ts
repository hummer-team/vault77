/**
 * Customer Clustering Service
 * Handles RFM preprocessing, worker communication, and result enrichment
 */

import { detectRFMColumns, validateRFMColumns } from './rfmColumnDetector';
import { generateRFMSql, generateCustomerCountSql, validateCustomerCount } from './rfmSqlGenerator';
import { buildInsightContext } from '../insight/contextBuilder';
import type { TableMetadata } from '../../types/insight-action.types';
import type {
  ClusteringAnalysisInput,
  ClusteringAnalysisOutput,
  CustomerClusterRecord,
  ClusterMetadata,
  RFMFeatures,
  ClusteringRequest,
  ClusteringResult,
} from '../../types/clustering.types';
import { isClusteringSuccess, isClusteringError } from '../../types/clustering.types';
import {
  MIN_CUSTOMER_COUNT,
  DEFAULT_K_VALUE,
  MIN_K_VALUE_FOR_SMALL_DATASET,
  GPU_AUTO_THRESHOLD,
} from '../../constants/clustering.constants';

// ============================================================================
// Worker Management
// ============================================================================

let workerInstance: Worker | null = null;

/**
 * Get or create clustering worker instance (singleton pattern)
 */
function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(
      new URL('../../workers/clustering.worker.ts', import.meta.url),
      { type: 'module' }
    );
    console.log('[ClusteringService] Worker instance created');
  }
  return workerInstance;
}

/**
 * Send message to worker and wait for response with timeout
 */
function sendMessageToWorker(
  message: ClusteringRequest,
  timeoutMs: number = 120000  // 2 minutes for large datasets
): Promise<ClusteringResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    
    const cleanup = () => {
      clearTimeout(timeoutId);
      worker.removeEventListener('message', handleMessage);
      worker.removeEventListener('error', handleError);
    };
    
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Worker timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const handleMessage = (e: MessageEvent<ClusteringResult>) => {
      cleanup();
      resolve(e.data);
    };

    const handleError = (error: ErrorEvent) => {
      cleanup();
      reject(new Error(`Worker error: ${error.message}`));
    };

    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', handleError);
    
    worker.postMessage(message);
    console.log('[ClusteringService] Posted message to worker');
  });
}

// ============================================================================
// RFM Data Fetching
// ============================================================================

/**
 * Fetch RFM features from DuckDB
 */
async function fetchRFMFeatures(
  tableName: string,
  tableMetadata: TableMetadata,
  executeQuery: (sql: string) => Promise<{ data: any[] }>
): Promise<{ rfmFeatures: RFMFeatures[]; isSampled: boolean; sampleSize: number }> {
  try {
    // Step 1: Detect RFM columns
    console.log('[ClusteringService] Detecting RFM columns from metadata...');
    console.log('[ClusteringService] Available columns:', tableMetadata.columns.map(c => c.name).join(', '));
    
    const rfmColumns = detectRFMColumns(tableMetadata);
    console.log('[ClusteringService] Detected columns:', {
      customerId: rfmColumns.customerId,
      orderDate: rfmColumns.orderDate,
      orderAmount: rfmColumns.orderAmount,
      orderId: rfmColumns.orderId,
      precomputedRFM: rfmColumns.precomputedRFM,
    });
    
    validateRFMColumns(rfmColumns);

    // Step 2: Check customer count
    const countSql = generateCustomerCountSql(tableName, rfmColumns);
    const countResult = await executeQuery(countSql);
    const customerCount = countResult.data[0]?.customer_count || 0;
    console.log(`[ClusteringService] Total customers: ${customerCount}`);

    validateCustomerCount(customerCount);

    // Step 3: Generate and execute RFM SQL
    const rfmSqlResult = generateRFMSql({ tableName, rfmColumns });
    console.log(`[ClusteringService] RFM SQL (precomputed: ${rfmSqlResult.isPrecomputed}, sampled: ${rfmSqlResult.isSampled})`);
    
    const rfmResult = await executeQuery(rfmSqlResult.sql);

    if (!rfmResult.data || rfmResult.data.length === 0) {
      throw new Error('No RFM data returned from query');
    }

    // Step 4: Parse RFM features
    const rfmFeatures: RFMFeatures[] = [];
    for (const row of rfmResult.data) {
      const customerId = String(row.customer_id);
      const recency = Number(row.recency);
      const frequency = Number(row.frequency);
      const monetary = Number(row.monetary);

      // Validate values
      if (isNaN(recency) || isNaN(frequency) || isNaN(monetary)) {
        console.warn(`[ClusteringService] Invalid RFM values for customer ${customerId}, skipping`);
        continue;
      }

      rfmFeatures.push({ customerId, recency, frequency, monetary });
    }

    console.log(`[ClusteringService] Fetched ${rfmFeatures.length} valid RFM records`);

    return {
      rfmFeatures,
      isSampled: rfmSqlResult.isSampled,
      sampleSize: rfmSqlResult.sampleSize,
    };
  } catch (error) {
    console.error('[ClusteringService] RFM fetch failed:', error);
    throw new Error(`RFM fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Cluster Metadata Computation
// ============================================================================

/**
 * Compute cluster metadata (averages, totals, radar values)
 */
function computeClusterMetadata(
  customers: CustomerClusterRecord[],
  nClusters: number
): ClusterMetadata[] {
  const clusters: ClusterMetadata[] = [];

  for (let clusterId = 0; clusterId < nClusters; clusterId++) {
    const clusterCustomers = customers.filter(c => c.clusterId === clusterId);
    
    if (clusterCustomers.length === 0) {
      // Empty cluster (can happen with small datasets)
      clusters.push({
        clusterId,
        customerCount: 0,
        avgRecency: 0,
        avgFrequency: 0,
        avgMonetary: 0,
        totalValue: 0,
        radarValues: {},
      });
      continue;
    }

    const count = clusterCustomers.length;
    const sumRecency = clusterCustomers.reduce((sum, c) => sum + c.recency, 0);
    const sumFrequency = clusterCustomers.reduce((sum, c) => sum + c.frequency, 0);
    const sumMonetary = clusterCustomers.reduce((sum, c) => sum + c.monetary, 0);

    const avgRecency = sumRecency / count;
    const avgFrequency = sumFrequency / count;
    const avgMonetary = sumMonetary / count;
    const avgAOV = avgMonetary / avgFrequency;

    // Compute churn risk based on recency (higher recency = higher risk)
    // Simple heuristic: normalize recency to [0, 1] range
    const maxRecency = Math.max(...customers.map(c => c.recency));
    const avgChurnRisk = maxRecency > 0 ? avgRecency / maxRecency : 0;

    clusters.push({
      clusterId,
      customerCount: count,
      avgRecency,
      avgFrequency,
      avgMonetary,
      totalValue: sumMonetary,
      avgAOV,
      avgChurnRisk,
      radarValues: {
        recency: avgRecency,
        frequency: avgFrequency,
        monetary: avgMonetary,
        aov: avgAOV,
        churnRisk: avgChurnRisk,
      },
    });
  }

  // Sort clusters by total value (descending)
  clusters.sort((a, b) => b.totalValue - a.totalValue);

  return clusters;
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Perform customer clustering analysis on a DuckDB table
 */
export async function analyzeCustomerClustering(
  input: ClusteringAnalysisInput,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema?: any[] }>
): Promise<ClusteringAnalysisOutput> {
  const startTime = performance.now();

  try {
    console.log('[ClusteringService] Starting clustering analysis:', input);

    // Step 1: Build table context
    const context = await buildInsightContext(executeQuery, input.tableName);
    const tableMetadata = context.tableMetadata;
    
    // Debug: Log table columns
    console.log('[ClusteringService] Table columns:', tableMetadata.columns.map(c => c.name).join(', '));

    // Step 2: Fetch RFM features
    const { rfmFeatures, isSampled, sampleSize } = await fetchRFMFeatures(
      input.tableName,
      tableMetadata,
      executeQuery
    );

    if (rfmFeatures.length < MIN_CUSTOMER_COUNT) {
      throw new Error(`Insufficient customers: ${rfmFeatures.length} (min ${MIN_CUSTOMER_COUNT} required)`);
    }

    // Step 3: Adjust K value if needed
    let nClusters = input.nClusters ?? DEFAULT_K_VALUE;
    if (rfmFeatures.length < nClusters) {
      nClusters = Math.max(MIN_K_VALUE_FOR_SMALL_DATASET, Math.floor(rfmFeatures.length / 3));
      console.log(`[ClusteringService] Adjusted K to ${nClusters} due to small dataset (${rfmFeatures.length} customers)`);
    }

    // Step 4: Prepare data for WASM
    const customerIds = rfmFeatures.map(f => f.customerId);
    const features = rfmFeatures.map(f => [f.recency, f.frequency, f.monetary]);

    // Step 5: Determine GPU strategy
    const gpuStrategy = input.useGPU ?? 'auto';
    const useGPU = gpuStrategy === 'force' || 
                   (gpuStrategy === 'auto' && rfmFeatures.length >= GPU_AUTO_THRESHOLD);

    // Step 6: Call WASM via worker
    const request: ClusteringRequest = {
      type: 'CLUSTERING_SEGMENT',
      payload: {
        customerIds,
        features,
        nClusters,
        scalingMode: 2,  // Standard scaling (recommended for K-Means)
        useGPU,
      },
    };

    const result = await sendMessageToWorker(request);

    if (isClusteringError(result)) {
      throw new Error(result.payload.error);
    }

    if (!isClusteringSuccess(result)) {
      throw new Error('Invalid worker response');
    }

    // Step 7: Build customer records with cluster assignments
    const customerRecords: CustomerClusterRecord[] = result.payload.customerIds.map((id, idx) => {
      const rfm = rfmFeatures[idx];
      return {
        customerId: id,
        clusterId: result.payload.clusterIds[idx],
        recency: rfm.recency,
        frequency: rfm.frequency,
        monetary: rfm.monetary,
        aov: rfm.monetary / rfm.frequency,
        churnRisk: 0,  // Will be computed in metadata
      };
    });

    // Step 8: Compute cluster metadata
    const clusterMetadata = computeClusterMetadata(customerRecords, nClusters);

    // Step 9: Build output
    const totalDuration = performance.now() - startTime;
    const output: ClusteringAnalysisOutput = {
      totalCustomers: rfmFeatures.length,
      clusters: clusterMetadata,
      customers: customerRecords,
      metadata: {
        gpuUsed: result.payload.gpuUsed,
        samplingRate: isSampled ? sampleSize / tableMetadata.rowCount : 1.0,
        samplingThreshold: tableMetadata.rowCount,
        rowsProcessed: rfmFeatures.length,
        rowsTotal: tableMetadata.rowCount,
        durationMs: totalDuration,
        nClusters,
        rfmComputed: !isSampled,  // Simplified flag
      },
    };

    console.log(`[ClusteringService] Analysis complete: ${output.totalCustomers} customers in ${nClusters} clusters (${totalDuration.toFixed(2)}ms)`);
    return output;
  } catch (error) {
    console.error('[ClusteringService] Analysis failed:', error);
    throw new Error(`Clustering analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
