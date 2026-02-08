/**
 * Data Aggregator for Insight Action
 * Aggregates anomaly data using AnomalyRecord.features
 * Aggregates clustering data with RFM statistics
 * Avoids re-querying database with hard-coded column names
 */

import type { AnomalyRecord } from '../../types/anomaly.types';
import type { ClusteringAnalysisOutput, CustomerClusterRecord } from '../../types/clustering.types';
import type { 
  AggregatedFeatures, 
  NumericFeatureStats,
  InsightContext,
} from '../../types/insight-action.types';
import { CLUSTER_SAMPLE_SIZE } from '../../constants/clustering.constants';

/**
 * Query execution function type
 * Compatible with DuckDBService.executeQuery signature
 */
export type QueryExecutor = (sql: string) => Promise<{ data: any[]; schema?: any[] }>;

/**
 * Maximum anomalies to analyze (avoid LLM token overflow)
 */
const MAX_ANALYSIS_SIZE = 500;

/**
 * Aggregate anomaly data for LLM analysis
 * Uses AnomalyRecord.features instead of re-querying database
 * @param executeQuery Query execution function (for global statistics only)
 * @param tableName DuckDB table name
 * @param anomalies List of anomalous records
 * @param context Insight context with feature definitions
 * @param orderIdColumn Order ID column name (unused, kept for API compatibility)
 * @returns Aggregated features with statistics
 */
export async function aggregateAnomalies(
  executeQuery: QueryExecutor,
  tableName: string,
  anomalies: AnomalyRecord[],
  context: InsightContext,
  _orderIdColumn: string = 'order_id', // Underscore prefix: kept for API compatibility
): Promise<AggregatedFeatures> {
  // Limit analysis size to avoid token overflow
  const sampleAnomalies = anomalies.slice(0, MAX_ANALYSIS_SIZE);
  
  // Extract feature columns from context
  const featureColumns = Object.keys(context.featureDefinitions);
  
  // Step 1: Basic statistics
  const totalAnomalies = anomalies.length;
  const averageScore = anomalies.reduce((sum, a) => sum + a.score, 0) / totalAnomalies;
  
  // Step 2: Numeric feature statistics (from AnomalyRecord.features + global comparison)
  const numericFeatures = await computeNumericStatsFromFeatures(
    tableName,
    featureColumns,
    sampleAnomalies,
    executeQuery
  );
  
  return {
    totalAnomalies,
    averageScore,
    numericFeatures,
    topPatterns: {}, // Removed: depends on non-existent columns (shipping_address, order_time)
    suspiciousPatterns: {}, // Removed: depends on non-existent columns (customer_ip, order_time)
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute numeric feature statistics from AnomalyRecord.features
 * Compares anomaly values (from features) against global averages (from DB)
 * Optimized: Single SQL query for all columns (instead of N queries)
 * @param tableName DuckDB table name
 * @param featureColumns Feature column names
 * @param anomalies Anomaly records with features
 * @param executeQuery Query executor
 * @returns Statistics for each feature
 */
async function computeNumericStatsFromFeatures(
  tableName: string,
  featureColumns: string[],
  anomalies: AnomalyRecord[],
  executeQuery: (sql: string) => Promise<{ data: any[] }>
): Promise<Record<string, NumericFeatureStats>> {
  const stats: Record<string, NumericFeatureStats> = {};
  
  if (anomalies.length === 0 || featureColumns.length === 0) {
    return stats;
  }
  
  // Step 1: Calculate anomaly statistics from AnomalyRecord.features (in-memory)
  const anomalyStats: Record<string, { avg: number; min: number; max: number }> = {};
  
  for (const col of featureColumns) {
    const anomalyValues = anomalies
      .map(a => a.features[col])
      .filter(v => typeof v === 'number' && !isNaN(v));
    
    if (anomalyValues.length === 0) {
      continue; // Skip if no valid values
    }
    
    const anomalyAvg = anomalyValues.reduce((sum, v) => sum + v, 0) / anomalyValues.length;
    const anomalyMin = Math.min(...anomalyValues);
    const anomalyMax = Math.max(...anomalyValues);
    
    anomalyStats[col] = { avg: anomalyAvg, min: anomalyMin, max: anomalyMax };
  }
  
  const validColumns = Object.keys(anomalyStats);
  if (validColumns.length === 0) {
    return stats;
  }
  
  // Step 2: Query global statistics from database (SINGLE SQL for ALL columns)
  try {
    // Build SELECT AVG("col1") as avg_col1, AVG("col2") as avg_col2, ...
    const avgSelects = validColumns.map(col => `AVG("${col}") as "avg_${col}"`).join(',\n  ');
    
    const globalQuery = `
      SELECT 
        ${avgSelects}
      FROM "${tableName}"
    `;
    
    console.log('[Aggregator] Batch querying global averages for', validColumns.length, 'columns');
    const globalResult = await executeQuery(globalQuery);
    
    if (globalResult.data.length === 0) {
      console.warn('[Aggregator] No global data returned');
      return stats;
    }
    
    const globalRow = globalResult.data[0];
    
    // Step 3: Combine anomaly stats with global stats
    for (const col of validColumns) {
      const globalAvg = globalRow[`avg_${col}`];
      const { avg, min, max } = anomalyStats[col];
      
      stats[col] = {
        avg,
        min,
        max,
        globalAvg: globalAvg ? Number(globalAvg) : undefined,
      };
      
      console.log(`[Aggregator] Stats for "${col}":`, {
        anomalyAvg: avg.toFixed(2),
        globalAvg: globalAvg ? Number(globalAvg).toFixed(2) : 'N/A',
        deviation: globalAvg ? ((avg - globalAvg) / globalAvg * 100).toFixed(1) + '%' : 'N/A'
      });
    }
  } catch (error) {
    console.error('[Aggregator] Failed to query global statistics:', error);
    // Fallback: return anomaly stats without global comparison
    for (const col of validColumns) {
      const { avg, min, max } = anomalyStats[col];
      stats[col] = { avg, min, max, globalAvg: undefined };
    }
  }
  
  return stats;
}

// ============================================================================
// Clustering Aggregation
// ============================================================================

/**
 * Aggregate clustering results for LLM analysis
 * Samples customers from each cluster and computes global RFM statistics
 * 
 * @param executeQuery Query execution function (unused for clustering, kept for API consistency)
 * @param tableName DuckDB table name (unused, kept for API consistency)
 * @param clusteringResult Clustering analysis result
 * @param context Insight context (unused, kept for API consistency)
 * @returns Aggregated features with cluster statistics and samples
 */
export async function aggregateClusters(
  _executeQuery: QueryExecutor,
  _tableName: string,
  clusteringResult: ClusteringAnalysisOutput,
  _context: InsightContext,
): Promise<AggregatedFeatures> {
  const { totalCustomers, clusters, customers } = clusteringResult;
  
  // Step 1: Compute global RFM statistics
  const totalRecency = customers.reduce((sum, c) => sum + c.recency, 0);
  const totalFrequency = customers.reduce((sum, c) => sum + c.frequency, 0);
  const totalMonetary = customers.reduce((sum, c) => sum + c.monetary, 0);
  
  const rfmStats = {
    globalAvgRecency: totalRecency / totalCustomers,
    globalAvgFrequency: totalFrequency / totalCustomers,
    globalAvgMonetary: totalMonetary / totalCustomers,
  };
  
  // Step 2: Compute total value for percentage calculation
  const totalValue = customers.reduce((sum, c) => sum + c.monetary, 0);
  
  // Step 3: Format cluster metadata with value share
  const formattedClusters = clusters.map(cluster => ({
    clusterId: cluster.clusterId,
    label: cluster.label,
    customerCount: cluster.customerCount,
    avgRecency: cluster.avgRecency,
    avgFrequency: cluster.avgFrequency,
    avgMonetary: cluster.avgMonetary,
    totalValue: cluster.totalValue,
    valueShare: totalValue > 0 ? (cluster.totalValue / totalValue) * 100 : 0,
  }));
  
  // Step 4: Sample customers from each cluster (stratified sampling)
  const sampleCustomers = sampleCustomersFromClusters(customers, clusters.length);
  
  console.log('[Aggregator] Clustered data aggregated:', {
    totalCustomers,
    numClusters: clusters.length,
    samplesPerCluster: CLUSTER_SAMPLE_SIZE,
    totalSamples: sampleCustomers.reduce((sum, s) => sum + s.customers.length, 0),
  });
  
  return {
    totalCustomers,
    clusters: formattedClusters,
    rfmStats,
    sampleCustomers,
  };
}

/**
 * Sample customers from each cluster for LLM context
 * Uses stratified sampling with high-value priority
 * 
 * @param customers All customer records
 * @param numClusters Number of clusters
 * @returns Sampled customers per cluster
 */
function sampleCustomersFromClusters(
  customers: CustomerClusterRecord[],
  numClusters: number
): Array<{
  clusterId: number;
  customers: Array<{
    customerId: string;
    recency: number;
    frequency: number;
    monetary: number;
  }>;
}> {
  const samples = [];
  
  for (let clusterId = 0; clusterId < numClusters; clusterId++) {
    // Get all customers in this cluster
    const clusterCustomers = customers.filter(c => c.clusterId === clusterId);
    
    if (clusterCustomers.length === 0) {
      samples.push({ clusterId, customers: [] });
      continue;
    }
    
    // Sort by monetary value (descending) for high-value priority
    const sortedCustomers = [...clusterCustomers].sort((a, b) => b.monetary - a.monetary);
    
    // Sample up to CLUSTER_SAMPLE_SIZE customers
    const sampleSize = Math.min(CLUSTER_SAMPLE_SIZE, sortedCustomers.length);
    const sampledCustomers = sortedCustomers.slice(0, sampleSize).map(c => ({
      customerId: c.customerId,
      recency: c.recency,
      frequency: c.frequency,
      monetary: c.monetary,
    }));
    
    samples.push({ clusterId, customers: sampledCustomers });
  }
  
  return samples;
}
