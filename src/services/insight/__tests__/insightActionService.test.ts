/**
 * Unit tests for insightActionService.ts
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { InsightActionService } from '../insightActionService';
import type { InsightActionInput, InsightActionSettings } from '../../../types/insight-action.types';

// Mock DuckDB
const mockDB = {} as any;

// Mock LLM client
const mockLlmClient = {
  modelName: 'test-model',
  chatCompletions: mock(async () => ({
    choices: [{
      message: {
        content: JSON.stringify({
          diagnosis: 'Test diagnosis from LLM',
          keyPatterns: ['Pattern 1', 'Pattern 2'],
          recommendations: [
            { action: 'Take action 1', priority: 'high', reason: 'Critical issue detected' },
            { action: 'Take action 2', priority: 'medium', reason: 'Moderate risk identified' },
          ],
          confidence: 'high',
        }),
      },
    }],
  })),
};

describe('InsightActionService', () => {
  let service: InsightActionService;
  
  beforeEach(() => {
    service = new InsightActionService(mockDB);
    // Inject mock LLM client to skip initialization
    (service as any).llmClient = mockLlmClient;
  });
  
  describe('parseResponse', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        diagnosis: 'Test diagnosis',
        keyPatterns: ['Pattern 1', 'Pattern 2'],
        recommendations: [
          { action: 'Action 1', priority: 'high', reason: 'Reason 1' },
          { action: 'Action 2', priority: 'medium', reason: 'Reason 2' },
        ],
        confidence: 'high',
      });
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(result.diagnosis).toBe('Test diagnosis');
      expect(result.keyPatterns).toHaveLength(2);
      expect(result.keyPatterns[0]).toBe('Pattern 1');
      expect(result.recommendations).toHaveLength(2);
      expect(result.recommendations[0].action).toBe('Action 1');
      expect(result.recommendations[0].priority).toBe('high');
      expect(result.confidence).toBe('high');
      expect(result.rawResponse).toBe(response);
      expect(result.timestamp).toBeDefined();
    });
    
    it('should extract JSON from markdown code block', () => {
      const response = `
Here is the analysis:

\`\`\`json
{
  "diagnosis": "Test diagnosis from markdown",
  "keyPatterns": ["Pattern A"],
  "recommendations": [
    { "action": "Test action", "priority": "high", "reason": "Test reason" }
  ],
  "confidence": "medium"
}
\`\`\`

Hope this helps!
      `.trim();
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(result.diagnosis).toBe('Test diagnosis from markdown');
      expect(result.keyPatterns).toEqual(['Pattern A']);
      expect(result.recommendations).toHaveLength(1);
    });
    
    it('should extract JSON from generic code block', () => {
      const response = `
Some text before...

\`\`\`
{
  "diagnosis": "Test diagnosis",
  "recommendations": [{ "action": "Test", "priority": "high", "reason": "Test" }]
}
\`\`\`

Some text after...
      `.trim();
      
      const result = (service as any).parseResponse(response, 'anomaly');
      expect(result.diagnosis).toBe('Test diagnosis');
    });
    
    it('should handle missing optional fields gracefully', () => {
      const response = JSON.stringify({
        diagnosis: 'Test diagnosis',
        recommendations: [
          { action: 'Test action', priority: 'high', reason: 'Test reason' },
        ],
        // Missing: keyPatterns, confidence
      });
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(result.diagnosis).toBe('Test diagnosis');
      expect(result.keyPatterns).toEqual([]);
      expect(result.confidence).toBe('medium');
      expect(result.recommendations).toHaveLength(1);
    });
    
    it('should normalize single recommendation to array', () => {
      const response = JSON.stringify({
        diagnosis: 'Test diagnosis',
        recommendations: { action: 'Single action', priority: 'high', reason: 'Single reason' },
      });
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].action).toBe('Single action');
    });
    
    it('should return fallback for invalid JSON', () => {
      const response = 'This is not JSON at all, just plain text';
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(result.diagnosis).toContain('分析失败');
      expect(result.diagnosis).toContain('无法解析');
      expect(result.confidence).toBe('low');
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].priority).toBe('low');
      expect(result.rawResponse).toBe(response);
    });
    
    it('should return fallback for missing required field (diagnosis)', () => {
      const response = JSON.stringify({
        // Missing: diagnosis
        recommendations: [{ action: 'Test', priority: 'high', reason: 'Test' }],
      });
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(result.confidence).toBe('low');
      expect(result.diagnosis).toContain('分析失败');
    });
    
    it('should return fallback for missing required field (recommendations)', () => {
      const response = JSON.stringify({
        diagnosis: 'Test diagnosis',
        // Missing: recommendations
      });
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(result.confidence).toBe('low');
      expect(result.diagnosis).toContain('分析失败');
    });
    
    it('should validate recommendation structure', () => {
      const response = JSON.stringify({
        diagnosis: 'Test diagnosis',
        recommendations: [
          { action: 'Valid', priority: 'high', reason: 'Valid' },
          { action: 'Invalid', priority: 'high' }, // Missing: reason
        ],
      });
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      // Should fall back due to invalid recommendation
      expect(result.confidence).toBe('low');
    });
    
    it('should preserve timestamp in ISO format', () => {
      const response = JSON.stringify({
        diagnosis: 'Test',
        recommendations: [{ action: 'Test', priority: 'high', reason: 'Test' }],
      });
      
      const result = (service as any).parseResponse(response, 'anomaly');
      
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });
  
  describe('constructor', () => {
    it('should initialize with DuckDB instance', () => {
      const service = new InsightActionService(mockDB);
      expect(service).toBeInstanceOf(InsightActionService);
    });
  });
});
