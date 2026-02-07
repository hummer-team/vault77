/**
 * Anomaly Detection Types
 * Defines interfaces for WASM-based isolation forest anomaly detection
 */

// ============================================================================
// Worker Message Protocol
// ============================================================================

/**
 * Request message to anomaly worker for detection
 */
export interface AnomalyDetectionRequest {
  type: 'ANOMALY_DETECT';
  payload: {
    orderIds: string[];        // Order IDs (String type, UTF8 encoding)
    features: number[][];      // Feature matrix: [[amount, qty, discount], ...]
    threshold: number;         // Anomaly threshold [0, 1], default 0.8
    scalingMode: 0 | 1 | 2;    // 0=None, 1=MinMax, 2=Standard
    useGPU: boolean;           // Whether to attempt GPU acceleration
  };
}

/**
 * Success response from anomaly worker
 */
export interface AnomalyDetectionSuccess {
  type: 'ANOMALY_DETECT_SUCCESS';
  payload: {
    orderIds: string[];        // Order IDs from input (String type)
    abnormalScores: number[];  // Anomaly scores [0, 1]
    isAbnormal: boolean[];     // Boolean flags (score >= threshold)
    gpuUsed: boolean;          // Whether GPU was actually used
    durationMs: number;        // Execution time in milliseconds
  };
}

/**
 * Error response from anomaly worker
 */
export interface AnomalyDetectionError {
  type: 'ANOMALY_DETECT_ERROR';
  payload: {
    error: string;             // Error message
    code?: string;             // Optional error code
  };
}

/**
 * Union type for all worker responses
 */
export type AnomalyDetectionResult = AnomalyDetectionSuccess | AnomalyDetectionError;

// ============================================================================
// Service Layer Interfaces
// ============================================================================

/**
 * Input parameters for anomaly analysis service
 */
export interface AnomalyAnalysisInput {
  tableName: string;           // DuckDB table name to analyze
  orderIdColumn: string;       // Column name for order ID
  featureColumns: string[];    // Column names for features (amount, qty, etc.)
  samplingRate?: number;       // Sampling rate [0, 1], default 1.0
  threshold?: number;          // Anomaly threshold, default 0.8
  useGPU?: 'auto' | 'force' | 'disable';  // GPU strategy, default 'auto'
}

/**
 * Single anomaly record with enriched data
 */
export interface AnomalyRecord {
  orderId: string;             // Order ID (String type)
  score: number;               // Anomaly score [0, 1]
  isAbnormal: boolean;         // Whether flagged as anomaly
  features: Record<string, number>;  // Feature values (e.g., {amount: 100, qty: 2})
  rank?: number;               // Rank by score (1 = highest)
}

/**
 * Metadata about the anomaly detection execution
 */
export interface AnomalyMetadata {
  gpuUsed: boolean;            // Whether GPU was used
  samplingRate: number;        // Actual sampling rate applied
  samplingThreshold: number;   // Row count threshold for sampling
  rowsProcessed: number;       // Number of rows actually processed
  rowsTotal: number;           // Total rows in table
  durationMs: number;          // Total execution time
  threshold: number;           // Anomaly threshold used
  featureColumns: string[];    // Feature columns analyzed
  orderIdColumn?: string;      // Order ID column name (for querying original data)
}

/**
 * Complete output from anomaly analysis service
 */
export interface AnomalyAnalysisOutput {
  anomalyCount: number;        // Number of anomalies detected
  totalProcessed: number;      // Total orders processed
  anomalyRate: number;         // Anomaly rate [0, 1] (anomalyCount / totalProcessed)
  anomalies: AnomalyRecord[];  // List of anomalous orders (sorted by score desc)
  metadata: AnomalyMetadata;   // Execution metadata
  decision?: import('./insight-action.types').InsightActionOutput; // Optional LLM decision output
}

// ============================================================================
// UI Component Props
// ============================================================================

/**
 * Props for scatter plot chart component
 */
export interface AnomalyScatterChartProps {
  data: AnomalyRecord[];       // Anomaly records to visualize
  xAxisFeature: string;        // Feature name for X axis (e.g., 'amount')
  yAxisLabel?: string;         // Custom Y axis label, default 'Anomaly Score'
  height?: number;             // Chart height in pixels, default 400
  onPointClick?: (record: AnomalyRecord) => void;  // Click handler
}

/**
 * Props for heatmap chart component
 */
export interface AnomalyHeatmapChartProps {
  data: AnomalyRecord[];       // Anomaly records to analyze
  feature1: string;            // First feature name (X axis)
  feature2: string;            // Second feature name (Y axis)
  bins?: number;               // Number of bins per axis, default 10
  height?: number;             // Chart height in pixels, default 400
}

/**
 * Props for anomaly detection tab component
 */
export interface AnomalyDetectionTabProps {
  result: AnomalyAnalysisOutput | null;  // Analysis result
  loading: boolean;            // Whether analysis is in progress
  error: string | null;        // Error message if any
  onThresholdChange?: (threshold: number) => void;  // Threshold adjustment
  onRefresh?: () => void;      // Refresh analysis
}

// ============================================================================
// Settings Types
// ============================================================================

/**
 * Anomaly detection settings stored in settings service
 */
export interface AnomalyDetectionSettings {
  autoRun: boolean;            // Auto-run on data upload, default true
  threshold: number;           // Default anomaly threshold, default 0.8
  samplingRate: number;        // Sampling rate for large datasets, default 0.75
  samplingThreshold: number;   // Row count to trigger sampling, default 50000
  useGPU: 'auto' | 'force' | 'disable';  // GPU acceleration strategy, default 'auto'
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for success response
 */
export function isAnomalyDetectionSuccess(
  result: AnomalyDetectionResult
): result is AnomalyDetectionSuccess {
  return result.type === 'ANOMALY_DETECT_SUCCESS';
}

/**
 * Type guard for error response
 */
export function isAnomalyDetectionError(
  result: AnomalyDetectionResult
): result is AnomalyDetectionError {
  return result.type === 'ANOMALY_DETECT_ERROR';
}
