/**
 * Type definitions for Insight Action Module
 * Provides LLM-powered decision-making and recommendations based on data analysis results
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Supported algorithm types (extensible)
 */
export type AlgorithmType = 'anomaly' | 'clustering' | 'regression';

/**
 * Business domain context
 */
export type BusinessDomain = 'ecommerce' | 'finance' | 'logistics';

// ============================================================================
// Context Types
// ============================================================================

/**
 * Table metadata from DuckDB
 */
export interface TableMetadata {
  tableName: string;
  rowCount: number;
  columnCount: number;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
  }>;
}

/**
 * Insight context passed to LLM
 */
export interface InsightContext {
  algorithmType: AlgorithmType;
  tableMetadata: TableMetadata;
  featureDefinitions: Record<string, string>; // columnName -> business description
  businessDomain: BusinessDomain;
}

// ============================================================================
// Aggregated Features
// ============================================================================

/**
 * Numeric feature statistics
 */
export interface NumericFeatureStats {
  avg: number;
  min: number;
  max: number;
  globalAvg?: number; // Comparison baseline
}

/**
 * Pattern analysis results
 */
export interface TopPatterns {
  addresses?: Array<{ value: string; count: number }>;
  timeSlots?: Array<{ hour: number; count: number }>;
  categories?: Array<{ value: string; count: number }>;
}

/**
 * Suspicious pattern detection results
 */
export interface SuspiciousPatterns {
  sameIPMultiOrders?: number;
  midnightOrders?: number;
  warehouseAddresses?: number;
}

/**
 * Aggregated features from data analysis
 */
export interface AggregatedFeatures {
  // Anomaly-specific fields
  totalAnomalies?: number;
  averageScore?: number;
  numericFeatures?: Record<string, NumericFeatureStats>;
  topPatterns?: TopPatterns;
  suspiciousPatterns?: SuspiciousPatterns;
  
  // Clustering-specific fields
  totalCustomers?: number;
  clusters?: Array<{
    clusterId: number;
    label?: string;
    customerCount: number;
    avgRecency: number;
    avgFrequency: number;
    avgMonetary: number;
    totalValue: number;
    valueShare: number;  // Percentage of total value
  }>;
  rfmStats?: {
    globalAvgRecency: number;
    globalAvgFrequency: number;
    globalAvgMonetary: number;
  };
  sampleCustomers?: Array<{
    clusterId: number;
    customers: Array<{
      customerId: string;
      recency: number;
      frequency: number;
      monetary: number;
    }>;
  }>;
}

// ============================================================================
// LLM Decision Output
// ============================================================================

/**
 * Actionable recommendation from LLM
 */
export interface InsightRecommendation {
  action: string;               // What to do
  priority: 'low' | 'medium' | 'high'; // Priority level
  reason: string;               // Why this is needed
  estimatedImpact?: string;     // Expected impact (optional)
}

/**
 * Structured LLM decision output
 */
export interface InsightAction {
  diagnosis: string;             // Core problem diagnosis
  keyPatterns: string[];        // 2-3 key anomaly patterns
  recommendations: InsightRecommendation[]; // Actionable recommendations
  confidence: 'low' | 'medium' | 'high'; // Confidence level
  rawResponse: string;          // Raw LLM response for debugging
  markdown?: string;            // Markdown formatted report (optional, for download)
  timestamp: string;            // ISO timestamp
}

/**
 * Complete insight action output (alias for backwards compatibility)
 */
export type InsightActionOutput = InsightAction;

/**
 * Input for generating insight actions
 */
export interface InsightActionInput {
  algorithmType: AlgorithmType;
  tableName: string;
  analysisResult: any; // AnomalyAnalysisOutput | ClusteringResult | RegressionResult
}

// ============================================================================
// Report Generation
// ============================================================================

/**
 * Report file metadata
 */
export interface ReportFile {
  name: string;
  content: string | Blob;
}

/**
 * Complete downloadable report
 */
export interface InsightReport {
  markdown: string;
  csvData: any[];
  timestamp: string;
}

// ============================================================================
// Service Configuration
// ============================================================================

/**
 * Insight action generation settings
 */
export interface InsightActionSettings {
  autoGenerate: boolean;           // Auto-generate after analysis (default: true)
  maxAnomaliesForAnalysis: number; // Max anomalies to analyze (default: 500)
}

// ============================================================================
// Strategy Pattern Interfaces
// ============================================================================

/**
 * Base strategy interface for different algorithm types
 */
export interface ActionStrategy {
  execute(
    analysisResult: any,
    tableName: string,
    executeQuery: (sql: string) => Promise<{ data: any[]; schema?: any[] }>
  ): Promise<InsightActionOutput>;
}

/**
 * Strategy input for anomaly detection
 * @deprecated Use InsightActionInput instead
 */
export interface AnomalyActionInput {
  anomalies: Array<{ orderId: string; score: number; features: Record<string, number> }>;
  metadata: {
    featureColumns: string[];
    totalProcessed: number;
    orderIdColumn?: string;
  };
}
