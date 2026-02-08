/**
 * Customer Clustering Types
 * Defines interfaces for WASM-based K-Means clustering with RFM analysis
 */

// ============================================================================
// Worker Message Protocol
// ============================================================================

/**
 * Request message to clustering worker for segmentation
 */
export interface ClusteringRequest {
  type: 'CLUSTERING_SEGMENT';
  payload: {
    customerIds: string[];     // Customer IDs (String type, UTF8 encoding)
    features: number[][];      // RFM feature matrix: [[recency, frequency, monetary], ...]
    nClusters: number;         // Number of clusters (K value), range 2-10
    scalingMode: 0 | 1 | 2;    // 0=None, 1=MinMax, 2=Standard
    useGPU: boolean;           // Whether to attempt GPU acceleration
  };
}

/**
 * Success response from clustering worker
 */
export interface ClusteringSuccess {
  type: 'CLUSTERING_SEGMENT_SUCCESS';
  payload: {
    customerIds: string[];     // Customer IDs from input (String type)
    clusterIds: number[];      // Cluster assignments [0, k-1]
    gpuUsed: boolean;          // Whether GPU was actually used
    durationMs: number;        // Execution time in milliseconds
  };
}

/**
 * Error response from clustering worker
 */
export interface ClusteringError {
  type: 'CLUSTERING_SEGMENT_ERROR';
  payload: {
    error: string;             // Error message
    code?: string;             // Optional error code
  };
}

/**
 * Union type for all worker responses
 */
export type ClusteringResult = ClusteringSuccess | ClusteringError;

// ============================================================================
// Type Guards
// ============================================================================

export function isClusteringSuccess(result: ClusteringResult): result is ClusteringSuccess {
  return result.type === 'CLUSTERING_SEGMENT_SUCCESS';
}

export function isClusteringError(result: ClusteringResult): result is ClusteringError {
  return result.type === 'CLUSTERING_SEGMENT_ERROR';
}

// ============================================================================
// Service Layer Interfaces
// ============================================================================

/**
 * RFM (Recency, Frequency, Monetary) features for a single customer
 */
export interface RFMFeatures {
  customerId: string;          // Customer identifier
  recency: number;             // Days since last purchase (lower is better)
  frequency: number;           // Number of purchases
  monetary: number;            // Total spending amount
}

/**
 * Input parameters for clustering analysis service
 */
export interface ClusteringAnalysisInput {
  tableName: string;           // DuckDB table name to analyze
  customerIdColumn: string;    // Column name for customer ID
  orderDateColumn: string;     // Column name for order date
  orderAmountColumn: string;   // Column name for order amount
  orderIdColumn?: string;      // Optional: Column name for order ID (for frequency calculation)
  samplingRate?: number;       // Sampling rate [0, 1], default 1.0
  nClusters?: number;          // Number of clusters, default 5
  useGPU?: 'auto' | 'force' | 'disable';  // GPU strategy, default 'auto'
}

/**
 * Single customer record with cluster assignment and RFM data
 */
export interface CustomerClusterRecord {
  customerId: string;          // Customer ID (String type)
  clusterId: number;           // Cluster assignment [0, k-1]
  recency: number;             // Days since last purchase
  frequency: number;           // Number of purchases
  monetary: number;            // Total spending
  aov?: number;                // Average Order Value (monetary / frequency)
  discountSensitivity?: number;  // Discount sensitivity [0, 1] (optional)
  churnRisk?: number;          // Churn risk [0, 1] (based on recency)
}

/**
 * Radar chart dimension definition
 */
export interface RadarDimension {
  name: string;                // Dimension name (e.g., 'Recency')
  key: keyof CustomerClusterRecord;  // Field key in CustomerClusterRecord
  description: string;         // Human-readable description
  inverted?: boolean;          // If true, lower values are better (e.g., Recency)
  optional?: boolean;          // If true, dimension can be missing
}

/**
 * Aggregated statistics for a single cluster
 */
export interface ClusterMetadata {
  clusterId: number;           // Cluster ID [0, k-1]
  label?: string;              // LLM-generated label (e.g., "Champions", "At Risk")
  customerCount: number;       // Number of customers in cluster
  avgRecency: number;          // Average recency (days)
  avgFrequency: number;        // Average frequency (purchases)
  avgMonetary: number;         // Average monetary (spending)
  totalValue: number;          // Total cluster value (sum of monetary)
  avgAOV?: number;             // Average Order Value
  avgDiscountSensitivity?: number;  // Average discount sensitivity
  avgChurnRisk?: number;       // Average churn risk
  radarValues: Record<string, number>;  // Normalized values [0, 1] for radar chart
}

/**
 * Metadata about the clustering execution
 */
export interface ClusteringMetadata {
  gpuUsed: boolean;            // Whether GPU was used
  samplingRate: number;        // Actual sampling rate applied
  samplingThreshold: number;   // Row count threshold for sampling
  rowsProcessed: number;       // Number of customers actually processed
  rowsTotal: number;           // Total customers in table
  durationMs: number;          // Total execution time
  nClusters: number;           // Number of clusters used
  customerIdColumn?: string;   // Customer ID column name
  rfmComputed: boolean;        // Whether RFM was computed or reused
}

/**
 * Complete output from clustering analysis service
 */
export interface ClusteringAnalysisOutput {
  totalCustomers: number;      // Total customers processed
  clusters: ClusterMetadata[]; // Cluster statistics (sorted by totalValue desc)
  customers: CustomerClusterRecord[];  // Customer records with cluster assignments
  metadata: ClusteringMetadata;  // Execution metadata
  decision?: import('./insight-action.types').InsightActionOutput; // Optional LLM decision output
}

// ============================================================================
// UI Component Props
// ============================================================================

/**
 * Props for clustering scatter plot chart component
 */
export interface ClusteringScatterChartProps {
  data: CustomerClusterRecord[];  // Customer records to visualize
  clusters: ClusterMetadata[];    // Cluster metadata for coloring
  xAxis: 'recency' | 'frequency';  // X axis feature (default: recency)
  yAxis: 'monetary' | 'frequency';  // Y axis feature (default: monetary)
  sizeBy?: 'frequency' | 'monetary';  // Point size feature (default: frequency)
  height?: number;                // Chart height in pixels, default 400
  onClusterClick?: (clusterId: number) => void;  // Cluster click handler
  selectedCluster?: number | null;  // Currently selected cluster ID
}

/**
 * Props for clustering radar chart component
 */
export interface ClusteringRadarChartProps {
  cluster: ClusterMetadata;    // Cluster to visualize
  dimensions: RadarDimension[];  // Dimensions to display (max 8)
  height?: number;             // Chart height in pixels, default 400
}

/**
 * Props for clustering analysis tab component
 */
export interface ClusteringAnalysisTabProps {
  result: ClusteringAnalysisOutput | null;  // Analysis result
  loading: boolean;            // Whether analysis is in progress
  error: string | null;        // Error message if any
  onKValueChange?: (k: number) => void;  // K value adjustment
  onExport?: (format: 'csv' | 'json') => void;  // Export handler
  onRefresh?: () => void;      // Refresh analysis
}

// ============================================================================
// Settings Types
// ============================================================================

/**
 * Clustering detection settings stored in settings service
 */
export interface ClusteringSettings {
  defaultNClusters: number;    // Default K value, default 5
  gpuStrategy: 'auto' | 'force' | 'disable';  // GPU usage strategy
  samplingThreshold: number;   // Row count threshold for sampling, default 1_000_000
  maxSampleSize: number;       // Max customers to sample, default 10_000
  clusterSampleSize: number;   // Samples per cluster for LLM, default 75
}
