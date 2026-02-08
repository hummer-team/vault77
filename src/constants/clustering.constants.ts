/**
 * Customer Clustering Constants
 * Configuration values for K-Means clustering analysis
 */

// ============================================================================
// K-Means Clustering Parameters
// ============================================================================

/**
 * Range for K value (number of clusters)
 * User can adjust K within this range via slider
 */
export const K_VALUE_RANGE = {
  min: 2,    // Minimum clusters
  max: 10,   // Maximum clusters
} as const;

/**
 * Default K value when analysis starts
 * Balances between granularity and interpretability
 */
export const DEFAULT_K_VALUE = 5;

/**
 * Minimum K value for small datasets
 * When customer count < K, auto-adjust to this value
 */
export const MIN_K_VALUE_FOR_SMALL_DATASET = 3;

// ============================================================================
// Data Size Thresholds
// ============================================================================

/**
 * Minimum customer count required for clustering
 * Below this threshold, clustering is not statistically meaningful
 * Note: Lowered to 3 to support testing and small datasets
 */
export const MIN_CUSTOMER_COUNT = 3;

/**
 * Large dataset threshold for random sampling
 * When customer count exceeds this, sample to MAX_CUSTOMER_SAMPLE_SIZE
 */
export const LARGE_DATASET_THRESHOLD = 1_000_000;

/**
 * Maximum customers to sample for large datasets
 * Keeps computation under 5 seconds while maintaining statistical validity
 */
export const MAX_CUSTOMER_SAMPLE_SIZE = 10_000;

/**
 * Warning threshold for dataset size
 * UI shows performance warning when count exceeds this value
 */
export const DATASET_SIZE_WARNING_THRESHOLD = 500_000;

// ============================================================================
// LLM Report Configuration
// ============================================================================

/**
 * Number of customers to sample per cluster for LLM analysis
 * Balances between context richness and token cost
 */
export const CLUSTER_SAMPLE_SIZE = 75;

/**
 * Sampling strategy for LLM report
 * Prioritizes high-value customers and ensures diversity
 */
export const CLUSTER_SAMPLING_STRATEGY = 'stratified-high-value' as const;

// ============================================================================
// Radar Chart Dimensions
// ============================================================================

/**
 * Radar chart dimension configuration
 * Defines 6 dimensions for cluster visualization
 */
export const RADAR_DIMENSIONS = [
  {
    name: 'Recency',
    key: 'avgRecency',
    description: 'Days since last purchase (lower is better)',
    inverted: true,      // Lower values are better
    required: true,      // Must always be present
    weight: 1.0,         // Equal weight in normalization
  },
  {
    name: 'Frequency',
    key: 'avgFrequency',
    description: 'Number of purchases (higher is better)',
    inverted: false,
    required: true,
    weight: 1.0,
  },
  {
    name: 'Monetary',
    key: 'avgMonetary',
    description: 'Total spending amount (higher is better)',
    inverted: false,
    required: true,
    weight: 1.0,
  },
  {
    name: 'AOV',
    key: 'avgAOV',
    description: 'Average Order Value (higher is better)',
    inverted: false,
    required: false,     // Optional, computed from Monetary/Frequency
    weight: 0.8,
  },
  {
    name: 'Discount',
    key: 'avgDiscountSensitivity',
    description: 'Discount sensitivity [0-1] (context-dependent)',
    inverted: false,
    required: false,     // Optional, needs discount data
    weight: 0.6,
  },
  {
    name: 'Churn Risk',
    key: 'avgChurnRisk',
    description: 'Churn risk [0-1] based on recency (lower is better)',
    inverted: true,
    required: false,     // Optional, computed from Recency
    weight: 0.7,
  },
] as const;

/**
 * Minimum dimensions required for radar chart
 * Falls back to RFM-only mode if optional dimensions are missing
 */
export const MIN_RADAR_DIMENSIONS = 3;

// ============================================================================
// Visualization Limits
// ============================================================================

/**
 * Maximum customers to render in scatter plot
 * Prevents browser freeze with large datasets
 */
export const MAX_CUSTOMERS_FOR_SCATTER_PLOT = 50_000;

/**
 * Maximum customers to export in CSV
 * Larger exports should be done in batches
 */
export const MAX_CUSTOMERS_FOR_EXPORT = 100_000;

// ============================================================================
// Performance Tuning
// ============================================================================

/**
 * Debounce delay for K value slider (milliseconds)
 * Prevents excessive re-clustering when user drags slider
 */
export const K_SLIDER_DEBOUNCE_MS = 500;

/**
 * Cache expiration time (milliseconds)
 * Cached clustering results expire after this duration
 */
export const CACHE_EXPIRATION_MS = 30 * 60 * 1000; // 30 minutes

/**
 * GPU row count threshold for auto GPU mode
 * Use GPU if customer count >= this value (in 'auto' mode)
 */
export const GPU_AUTO_THRESHOLD = 5_000;

// ============================================================================
// Error Messages
// ============================================================================

export const ERROR_MESSAGES = {
  INSUFFICIENT_DATA: 'Insufficient data for clustering (min 10 customers required)',
  MISSING_COLUMNS: 'Missing required columns: ',
  INVALID_K_VALUE: 'Invalid K value: must be between 2 and 10',
  WASM_INIT_FAILED: 'Failed to initialize WASM module',
  GPU_NOT_SUPPORTED: 'GPU acceleration not available, falling back to CPU',
  SAMPLING_FAILED: 'Failed to sample large dataset',
  CLUSTERING_TIMEOUT: 'Clustering operation timed out',
} as const;

// ============================================================================
// UI Labels
// ============================================================================

export const UI_LABELS = {
  SAMPLING_WARNING: 'Large dataset detected. Analyzing {count} sampled customers.',
  K_VALUE_ADJUSTED: 'K value adjusted to {k} due to small dataset',
  GPU_ACCELERATION: 'GPU acceleration enabled',
  CPU_FALLBACK: 'Using CPU (GPU unavailable)',
  CLUSTERING_IN_PROGRESS: 'Clustering customers...',
  GENERATING_REPORT: 'Generating insights report...',
} as const;
