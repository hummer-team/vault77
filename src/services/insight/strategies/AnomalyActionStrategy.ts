/**
 * Strategy implementation for anomaly detection algorithm
 * Integrates contextBuilder, aggregator, and prompt template
 */

import type { 
  InsightContext, 
  AggregatedFeatures, 
  AlgorithmType 
} from '../../../types/insight-action.types';
import type { AnomalyAnalysisOutput } from '../../../types/anomaly.types';
import { ActionStrategy, type QueryExecutor } from './BaseActionStrategy';
import { buildInsightContext } from '../contextBuilder';
import { aggregateAnomalies } from '../aggregator';
import { buildAnomalyActionPrompt } from '../../../prompts/insight/anomaly-action';

/**
 * Anomaly detection strategy for insight generation
 * Implements the full pipeline: context → aggregate → prompt
 */
export class AnomalyActionStrategy implements ActionStrategy {
  readonly algorithmType: AlgorithmType = 'anomaly';
  
  /**
   * Build context from DuckDB table metadata
   */
  async buildContext(params: {
    executeQuery: QueryExecutor;
    tableName: string;
    analysisResult: AnomalyAnalysisOutput;
  }): Promise<InsightContext> {
    console.log('[AnomalyActionStrategy] Building context for table:', params.tableName);
    
    const context = await buildInsightContext(params.executeQuery, params.tableName);
    
    console.log('[AnomalyActionStrategy] Context built:', {
      domain: context.businessDomain,
      columns: context.tableMetadata.columnCount,
      features: Object.keys(context.featureDefinitions).length,
    });
    
    return context;
  }
  
  /**
   * Aggregate anomaly data with global baseline comparison
   */
  async aggregateData(params: {
    executeQuery: QueryExecutor;
    tableName: string;
    analysisResult: AnomalyAnalysisOutput;
    context: InsightContext;
  }): Promise<AggregatedFeatures> {
    console.log('[AnomalyActionStrategy] Aggregating anomaly data:', {
      totalAnomalies: params.analysisResult.anomalies.length,
      threshold: params.analysisResult.metadata.threshold,
    });
    
    const aggregated = await aggregateAnomalies(
      params.executeQuery,
      params.tableName,
      params.analysisResult.anomalies,
      params.context,
      params.analysisResult.metadata.orderIdColumn || 'order_id', // Use actual column name or fallback
    );
    
    console.log('[AnomalyActionStrategy] Data aggregated:', {
      totalAnomalies: aggregated.totalAnomalies,
      averageScore: aggregated.averageScore,
      numericFeatures: Object.keys(aggregated.numericFeatures || {}).length,
      hasPatterns: !!(aggregated.topPatterns && 
                      (aggregated.topPatterns.addresses?.length || 
                       aggregated.topPatterns.timeSlots?.length)),
    });
    
    return aggregated;
  }
  
  /**
   * Build LLM prompt with Few-Shot examples and structured output
   */
  buildPrompt(context: InsightContext, aggregated: AggregatedFeatures): string {
    console.log('[AnomalyActionStrategy] Building prompt...');
    
    const prompt = buildAnomalyActionPrompt(context, aggregated);
    
    console.log('[AnomalyActionStrategy] Prompt built:', {
      length: prompt.length,
      hasContext: prompt.includes('业务背景'),
      hasFewShot: prompt.includes('Few-Shot'),
      hasOutputSpec: prompt.includes('JSON'),
    });
    
    return prompt;
  }
}
