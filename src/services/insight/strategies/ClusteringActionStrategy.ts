/**
 * Strategy implementation for customer clustering algorithm
 * Integrates contextBuilder, aggregator, and prompt template
 */

import type { 
  InsightContext, 
  AggregatedFeatures, 
  AlgorithmType 
} from '../../../types/insight-action.types';
import type { ClusteringAnalysisOutput } from '../../../types/clustering.types';
import { ActionStrategy, type QueryExecutor } from './BaseActionStrategy';
import { buildInsightContext } from '../contextBuilder';
import { aggregateClusters } from '../aggregator';
import { buildClusteringActionPrompt } from '../../../prompts/insight/clustering-action';

/**
 * Customer clustering strategy for insight generation
 * Implements the full pipeline: context → aggregate → prompt
 */
export class ClusteringActionStrategy implements ActionStrategy {
  readonly algorithmType: AlgorithmType = 'clustering';
  
  /**
   * Build context from DuckDB table metadata
   */
  async buildContext(params: {
    executeQuery: QueryExecutor;
    tableName: string;
    analysisResult: ClusteringAnalysisOutput;
  }): Promise<InsightContext> {
    console.log('[ClusteringActionStrategy] Building context for table:', params.tableName);
    
    const context = await buildInsightContext(params.executeQuery, params.tableName);
    
    // Override algorithm type to clustering
    const clusteringContext: InsightContext = {
      ...context,
      algorithmType: 'clustering',
    };
    
    console.log('[ClusteringActionStrategy] Context built:', {
      domain: clusteringContext.businessDomain,
      columns: clusteringContext.tableMetadata.columnCount,
      totalCustomers: params.analysisResult.totalCustomers,
      numClusters: params.analysisResult.clusters.length,
    });
    
    return clusteringContext;
  }
  
  /**
   * Aggregate cluster data with RFM statistics
   */
  async aggregateData(params: {
    executeQuery: QueryExecutor;
    tableName: string;
    analysisResult: ClusteringAnalysisOutput;
    context: InsightContext;
  }): Promise<AggregatedFeatures> {
    console.log('[ClusteringActionStrategy] Aggregating cluster data:', {
      totalCustomers: params.analysisResult.totalCustomers,
      numClusters: params.analysisResult.clusters.length,
      gpuUsed: params.analysisResult.metadata.gpuUsed,
    });
    
    const aggregated = await aggregateClusters(
      params.executeQuery,
      params.tableName,
      params.analysisResult,
      params.context,
    );
    
    console.log('[ClusteringActionStrategy] Data aggregated:', {
      totalCustomers: aggregated.totalCustomers,
      numClusters: aggregated.clusters?.length || 0,
      hasRFMStats: !!(aggregated.rfmStats),
    });
    
    return aggregated;
  }
  
  /**
   * Build LLM prompt with Few-Shot examples and structured output
   */
  buildPrompt(context: InsightContext, aggregated: AggregatedFeatures): string {
    console.log('[ClusteringActionStrategy] Building prompt...');
    
    const prompt = buildClusteringActionPrompt(context, aggregated);
    
    console.log('[ClusteringActionStrategy] Prompt built:', {
      length: prompt.length,
      hasContext: prompt.includes('业务背景'),
      hasFewShot: prompt.includes('Few-Shot'),
      hasOutputSpec: prompt.includes('JSON'),
    });
    
    return prompt;
  }
}
