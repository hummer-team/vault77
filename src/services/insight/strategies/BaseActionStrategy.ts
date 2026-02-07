/**
 * Base strategy interface for different algorithm types
 * Enables extensibility for anomaly, clustering, regression algorithms
 */

import type { 
  AlgorithmType, 
  InsightContext, 
  AggregatedFeatures 
} from '../../../types/insight-action.types';

/**
 * Query execution function type
 * Compatible with DuckDBService.executeQuery signature
 */
export type QueryExecutor = (sql: string) => Promise<{ data: any[]; schema?: any[] }>;

/**
 * Strategy interface for algorithm-specific insight generation
 * Each algorithm (anomaly/clustering/regression) implements this interface
 */
export interface ActionStrategy {
  /** Algorithm type identifier */
  readonly algorithmType: AlgorithmType;
  
  /**
   * Build semantic context from database metadata
   * @param params - Query executor, table name, and analysis result
   * @returns Insight context with table metadata and feature definitions
   */
  buildContext(params: {
    executeQuery: QueryExecutor;
    tableName: string;
    analysisResult: any; // AnomalyAnalysisOutput | ClusteringResult | RegressionResult
  }): Promise<InsightContext>;
  
  /**
   * Aggregate analysis results for LLM consumption
   * Pre-aggregates data to reduce token usage and improve LLM focus
   * @param params - Query executor, table, analysis result, and context
   * @returns Aggregated features with statistics and patterns
   */
  aggregateData(params: {
    executeQuery: QueryExecutor;
    tableName: string;
    analysisResult: any;
    context: InsightContext;
  }): Promise<AggregatedFeatures>;
  
  /**
   * Build LLM prompt from context and aggregated data
   * Uses Few-Shot learning and structured output specification
   * @param context - Semantic context with metadata
   * @param aggregated - Pre-aggregated features and patterns
   * @returns Complete LLM prompt string
   */
  buildPrompt(context: InsightContext, aggregated: AggregatedFeatures): string;
}
