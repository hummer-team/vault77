/**
 * Main service for generating LLM-powered insights and recommendations
 * Coordinates context building, data aggregation, prompt generation, and LLM calls
 */

import type { 
  InsightActionInput, 
  InsightActionOutput, 
  InsightActionSettings,
  AlgorithmType,
} from '../../types/insight-action.types';
import { getStrategy, type QueryExecutor } from './strategies';
import { LlmClient } from '../llm/llmClient';
import { resolveActiveLlmConfig } from '../llm/runtimeLlmConfig';

/**
 * Service for generating actionable insights from analysis results
 * Uses LLM to diagnose issues and recommend actions
 */
export class InsightActionService {
  private executeQuery: QueryExecutor;
  private llmClient: LlmClient | null = null;
  
  /**
   * @param executeQuery Query execution function from DuckDBService
   */
  constructor(executeQuery: QueryExecutor) {
    this.executeQuery = executeQuery;
  }
  
  /**
   * Generate insight and recommendations for analysis results
   * @param input - Algorithm type, table name, and analysis result
   * @param settings - Configuration for insight generation
   * @returns Structured insight output with diagnosis and recommendations
   */
  async generateInsight(
    input: InsightActionInput,
    settings: InsightActionSettings,
  ): Promise<InsightActionOutput> {
    console.log('[InsightActionService] Starting insight generation:', {
      algorithm: input.algorithmType,
      table: input.tableName,
      autoGenerate: settings.autoGenerate,
    });
    
    const startTime = performance.now();
    
    try {
      // Step 1: Get strategy for algorithm
      const strategy = getStrategy(input.algorithmType);
      console.log('[InsightActionService] Strategy selected:', strategy.algorithmType);
      
      // Step 2: Build semantic context
      const context = await strategy.buildContext({
        executeQuery: this.executeQuery,
        tableName: input.tableName,
        analysisResult: input.analysisResult,
      });
      console.log('[InsightActionService] Context built:', {
        domain: context.businessDomain,
        features: Object.keys(context.featureDefinitions).length,
        rows: context.tableMetadata.rowCount,
      });
      
      // Step 3: Aggregate data for LLM consumption
      const aggregated = await strategy.aggregateData({
        executeQuery: this.executeQuery,
        tableName: input.tableName,
        analysisResult: input.analysisResult,
        context,
      });
      console.log('[InsightActionService] Data aggregated:', {
        totalAnomalies: aggregated.totalAnomalies,
        averageScore: aggregated.averageScore?.toFixed(3),
        numericFeatures: Object.keys(aggregated.numericFeatures || {}).length,
      });
      
      // Step 4: Build LLM prompt
      const prompt = strategy.buildPrompt(context, aggregated);
      console.log('[InsightActionService] Prompt built, length:', prompt.length, 'chars');
      
      // Step 5: Call LLM
      const llmResponse = await this.callLLM(prompt);
      console.log('[InsightActionService] LLM response received, length:', llmResponse.length, 'chars');
      
      // Step 6: Parse and validate response
      const parsedOutput = this.parseResponse(llmResponse, input.algorithmType);
      
      const duration = performance.now() - startTime;
      console.log('[InsightActionService] ✅ Insight generated successfully in', 
        duration.toFixed(0), 'ms');
      
      return parsedOutput;
      
    } catch (error) {
      const duration = performance.now() - startTime;
      console.error('[InsightActionService] ❌ Failed to generate insight after', 
        duration.toFixed(0), 'ms:', error);
      throw new Error(`Insight generation failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Call LLM with configuration from runtime settings
   * Initializes LLM client on first call
   * @param prompt - Complete prompt text
   * @returns LLM response text
   */
  private async callLLM(prompt: string): Promise<string> {
    // Lazy initialization of LLM client
    if (!this.llmClient) {
      console.log('[InsightActionService] Initializing LLM client...');
      const { config, isReady } = await resolveActiveLlmConfig();
      
      if (!config || !isReady) {
        throw new Error('LLM configuration not available. Please configure LLM settings first.');
      }
      
      this.llmClient = new LlmClient(config);
      console.log('[InsightActionService] LLM client initialized:', {
        provider: config.provider,
        model: config.modelName,
      });
    }
    
    try {
      console.log('[InsightActionService] Calling LLM API...');
      const startTime = performance.now();
      
      const response = await this.llmClient.chatCompletions({
        model: this.llmClient.modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000,
      });
      
      const duration = performance.now() - startTime;
      console.log('[InsightActionService] LLM API call completed in', duration.toFixed(0), 'ms');
      
      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }
      
      return content;
      
    } catch (error) {
      console.error('[InsightActionService] LLM call failed:', error);
      throw new Error(`LLM call failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Parse LLM response and extract structured output
   * Supports both plain JSON and markdown code blocks
   * Falls back gracefully on parse errors
   * @param response - Raw LLM response text
   * @param algorithmType - Algorithm type for logging
   * @returns Structured insight output
   */
  private parseResponse(
    response: string, 
    _algorithmType: AlgorithmType, // Prefixed with _ to indicate intentionally unused
  ): InsightActionOutput {
    try {
      // Try to find JSON block in response
      // Supports markdown code blocks: ```json ... ```
      // Also supports plain JSON: { ... }
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                        response.match(/```\s*([\s\S]*?)\s*```/) ||
                        response.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }
      
      // Extract JSON string (from capture group or full match)
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      
      // Validate required fields
      if (!parsed.diagnosis) {
        throw new Error('Missing required field: diagnosis');
      }
      if (!parsed.recommendations) {
        throw new Error('Missing required field: recommendations');
      }
      
      // Normalize recommendations to array
      const recommendations = Array.isArray(parsed.recommendations)
        ? parsed.recommendations
        : [parsed.recommendations];
      
      // Validate recommendation structure
      for (const rec of recommendations) {
        if (!rec.action || !rec.priority || !rec.reason) {
          throw new Error('Invalid recommendation structure: missing action, priority, or reason');
        }
      }
      
      console.log('[InsightActionService] Response parsed successfully:', {
        diagnosis: parsed.diagnosis.substring(0, 50) + '...',
        keyPatterns: parsed.keyPatterns?.length || 0,
        recommendations: recommendations.length,
        confidence: parsed.confidence || 'medium',
      });
      
      return {
        diagnosis: parsed.diagnosis,
        keyPatterns: parsed.keyPatterns || [],
        recommendations,
        confidence: parsed.confidence || 'medium',
        rawResponse: response,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      console.error('[InsightActionService] Failed to parse LLM response:', error);
      console.error('[InsightActionService] Response preview:', response.substring(0, 500));
      
      // Fallback: return graceful degradation with low confidence
      return {
        diagnosis: '分析失败：无法解析 LLM 响应格式。响应可能不符合预期的 JSON 结构。',
        keyPatterns: [],
        recommendations: [
          {
            action: '请检查数据质量或重新尝试分析',
            priority: 'low',
            reason: `响应格式错误: ${(error as Error).message}`,
          },
        ],
        confidence: 'low',
        rawResponse: response,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

/**
 * Factory function for easy initialization
 * @param executeQuery Query execution function from DuckDBService
 * @returns Configured InsightActionService
 */
export function createInsightActionService(executeQuery: QueryExecutor): InsightActionService {
  return new InsightActionService(executeQuery);
}
