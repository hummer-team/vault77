/**
 * Type definitions for Insight feature
 * Provides automatic data analysis and visualization
 */

// ============================================================
// Column Type Definitions
// ============================================================

/**
 * Basic column type inferred from DuckDB type and cardinality
 */
export type ColumnType = 'numeric' | 'categorical' | 'datetime' | 'text';

/**
 * Semantic type matched from column name patterns
 */
export type SemanticType = 'amount' | 'time' | 'status' | 'category' | 'id' | null;

/**
 * Complete column profile including type, statistics and semantic info
 */
export interface ColumnProfile {
  name: string;
  duckdbType: string;          // Original DuckDB type (e.g., 'INTEGER', 'VARCHAR')
  type: ColumnType;             // Inferred basic type
  semanticType: SemanticType;   // Matched semantic type from column name
  cardinality: number;          // Distinct value count (approx_count_distinct)
  nullRate: number;             // Percentage of null values (0-1)
  min?: number | string;        // Min value (numeric/datetime columns only)
  max?: number | string;        // Max value (numeric/datetime columns only)
  mean?: number;                // Mean value (numeric columns only)
  median?: number;              // Median value (numeric columns only)
  stddev?: number;              // Standard deviation (numeric columns only)
  p50?: number;                 // 50th percentile (numeric columns only)
  p80?: number;                 // 80th percentile (numeric columns only)
  p99?: number;                 // 99th percentile (numeric columns only)
}

// ============================================================
// Insight Configuration
// ============================================================

/**
 * Configuration for insight generation
 */
export interface InsightConfig {
  tableName: string;
  columns: ColumnProfile[];
  rowCount: number;
  enableSampling: boolean;      // Enable sampling if rowCount > 10000
  samplingRate: number;         // Fixed at 0.75 (75%)
  numericColumns: ColumnProfile[];     // Sorted by importance
  categoricalColumns: ColumnProfile[]; // Sorted by cardinality
  datetimeColumns: ColumnProfile[];
  statusColumns: ColumnProfile[];      // Semantic type = 'status'
  categoryColumns: ColumnProfile[];    // Semantic type = 'category'
}

// ============================================================
// Query Results
// ============================================================

/**
 * Global summary result (one row per column)
 */
export interface SummaryResult {
  columns: ColumnProfile[];
}

/**
 * Distribution result for a single numeric column (histogram)
 */
export interface DistributionBin {
  binStart: number;    // Bin lower bound
  binEnd: number;      // Bin upper bound
  binMid: number;      // Bin midpoint (for x-axis)
  count: number;       // Count of values in this bin
}

export interface DistributionResult {
  columnName: string;
  bins: DistributionBin[];
}

/**
 * Multi-line chart data (combines multiple distributions)
 */
export interface MultiLineChartData {
  xAxis: number[];                           // Unified bin midpoints
  series: Array<{
    columnName: string;
    data: number[];                          // Count values aligned with xAxis
  }>;
}

/**
 * Categorical result (pie/bar chart data)
 */
export interface CategoricalValue {
  value: string;
  count: number;
}

export interface CategoricalResult {
  columnName: string;
  values: CategoricalValue[];  // Sorted by count DESC
}

// ============================================================
// Cache Definitions
// ============================================================

/**
 * Cache entry stored in chrome.storage.session
 */
export interface CacheEntry {
  key: string;              // Format: "insight:{tableName}:{type}"
  data: unknown;            // Summary/Distribution/Categorical result
  createdAt: number;        // Timestamp (ms)
  lastAccessAt: number;     // Timestamp (ms)
  size: number;             // Estimated size in bytes
}

/**
 * Cache metadata for capacity tracking
 */
export interface CacheMetadata {
  totalSize: number;        // Total cache size in bytes
  maxSize: number;          // Max size limit (9MB = 9 * 1024 * 1024)
  entryCount: number;       // Number of cache entries
}

// ============================================================
// Template System (Reserved for Phase 4)
// ============================================================

/**
 * Template metadata for domain-specific insights
 */
export interface TemplateMetadata {
  id: string;               // Template ID (e.g., 'ecommerce', 'crm')
  name: string;             // Display name
  description: string;      // Template description
  columnMappings: Record<string, string>;  // Standard column -> actual column
  detectedConfidence: number;              // Confidence score (0-1)
}
