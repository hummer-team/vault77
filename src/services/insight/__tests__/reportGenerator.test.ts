/**
 * Unit tests for reportGenerator.ts
 */

import { describe, it, expect } from 'bun:test';
import { 
  generateMarkdownReport, 
  arrayToCSV, 
  type ReportGenerationInput 
} from '../reportGenerator';
import type { InsightActionOutput } from '../../../types/insight-action.types';

describe('reportGenerator', () => {
  const mockInsightOutput: InsightActionOutput = {
    diagnosis: 'Test diagnosis with detailed analysis of the anomaly patterns',
    keyPatterns: ['Pattern 1: High-value orders', 'Pattern 2: Unusual timing'],
    recommendations: [
      {
        action: 'Take action 1',
        priority: 'high',
        reason: 'Critical issue detected',
        estimatedImpact: 'High impact on business',
      },
      {
        action: 'Take action 2',
        priority: 'medium',
        reason: 'Moderate risk identified',
      },
      {
        action: 'Take action 3',
        priority: 'low',
        reason: 'Minor optimization opportunity',
        estimatedImpact: 'Low impact',
      },
    ],
    confidence: 'high',
    rawResponse: 'raw llm response',
    timestamp: '2026-02-07T12:00:00.000Z',
  };
  
  describe('generateMarkdownReport', () => {
    it('should generate valid Markdown report', () => {
      const input: ReportGenerationInput = {
        insightOutput: mockInsightOutput,
        anomalyData: [],
        tableName: 'test_orders_table',
        algorithmType: 'anomaly',
      };
      
      const md = generateMarkdownReport(input);
      
      expect(md).toContain('# 数据异常分析报告');
      expect(md).toContain('test_orders_table');
      expect(md).toContain('anomaly');
      expect(md).toContain('high');
      expect(md).toContain('Test diagnosis');
      expect(md).toContain('Pattern 1');
      expect(md).toContain('Take action 1');
    });
    
    it('should include all sections', () => {
      const input: ReportGenerationInput = {
        insightOutput: mockInsightOutput,
        anomalyData: [],
        tableName: 'test',
        algorithmType: 'anomaly',
      };
      
      const md = generateMarkdownReport(input);
      
      expect(md).toContain('## 🔍 问题诊断');
      expect(md).toContain('## 📊 关键模式');
      expect(md).toContain('## 💡 行动建议');
    });
    
    it('should format recommendations with priority icons', () => {
      const input: ReportGenerationInput = {
        insightOutput: mockInsightOutput,
        anomalyData: [],
        tableName: 'test',
        algorithmType: 'anomaly',
      };
      
      const md = generateMarkdownReport(input);
      
      expect(md).toContain('🔴'); // high priority
      expect(md).toContain('🟡'); // medium priority
      expect(md).toContain('🟢'); // low priority
    });
    
    it('should handle empty key patterns', () => {
      const input: ReportGenerationInput = {
        insightOutput: { ...mockInsightOutput, keyPatterns: [] },
        anomalyData: [],
        tableName: 'test',
        algorithmType: 'anomaly',
      };
      
      const md = generateMarkdownReport(input);
      
      expect(md).not.toContain('## 📊 关键模式');
    });
    
    it('should include estimated impact when present', () => {
      const input: ReportGenerationInput = {
        insightOutput: mockInsightOutput,
        anomalyData: [],
        tableName: 'test',
        algorithmType: 'anomaly',
      };
      
      const md = generateMarkdownReport(input);
      
      expect(md).toContain('**预期影响**: High impact on business');
    });
    
    it('should include disclaimer at bottom', () => {
      const input: ReportGenerationInput = {
        insightOutput: mockInsightOutput,
        anomalyData: [],
        tableName: 'test',
        algorithmType: 'anomaly',
      };
      
      const md = generateMarkdownReport(input);
      
      expect(md).toContain('*本报告由 AI 自动生成');
      expect(md).toContain('仅供参考');
    });
  });
  
  describe('arrayToCSV', () => {
    it('should convert array to CSV', () => {
      const data = [
        { id: 1, name: 'Alice', amount: 100 },
        { id: 2, name: 'Bob', amount: 200 },
      ];
      
      const csv = arrayToCSV(data);
      
      expect(csv).toContain('id,name,amount');
      expect(csv).toContain('1,Alice,100');
      expect(csv).toContain('2,Bob,200');
    });
    
    it('should escape values with commas', () => {
      const data = [{ name: 'Smith, John', address: 'New York, NY' }];
      
      const csv = arrayToCSV(data);
      
      expect(csv).toContain('"Smith, John"');
      expect(csv).toContain('"New York, NY"');
    });
    
    it('should escape values with quotes', () => {
      const data = [{ comment: 'He said "Hello"' }];
      
      const csv = arrayToCSV(data);
      
      expect(csv).toContain('"He said ""Hello"""');
    });
    
    it('should escape values with newlines', () => {
      const data = [{ text: 'Line 1\nLine 2' }];
      
      const csv = arrayToCSV(data);
      
      expect(csv).toContain('"Line 1\nLine 2"');
    });
    
    it('should handle null and undefined values', () => {
      const data = [{ a: null, b: undefined, c: 0 }];
      
      const csv = arrayToCSV(data);
      
      expect(csv).toContain('a,b,c');
      expect(csv).toContain(',,0');
    });
    
    it('should return empty string for empty array', () => {
      expect(arrayToCSV([])).toBe('');
    });
    
    it('should handle objects with different keys', () => {
      const data = [
        { a: 1, b: 2, c: 3 },
        { a: 4, b: 5, c: 6 },
      ];
      
      const csv = arrayToCSV(data);
      
      expect(csv.split('\n')).toHaveLength(3); // header + 2 rows
    });
    
    it('should preserve column order from first object', () => {
      const data = [
        { name: 'Alice', age: 30, city: 'NYC' },
        { name: 'Bob', age: 25, city: 'LA' },
      ];
      
      const csv = arrayToCSV(data);
      const lines = csv.split('\n');
      
      expect(lines[0]).toBe('name,age,city');
    });
    
    it('should handle numbers correctly', () => {
      const data = [{ int: 42, float: 3.14, bigInt: 999999999 }];
      
      const csv = arrayToCSV(data);
      
      expect(csv).toContain('42,3.14,999999999');
    });
    
    it('should handle boolean values', () => {
      const data = [{ flag1: true, flag2: false }];
      
      const csv = arrayToCSV(data);
      
      expect(csv).toContain('true,false');
    });
  });
});
