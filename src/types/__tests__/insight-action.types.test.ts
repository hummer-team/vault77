/**
 * Unit tests for insight-action.types.ts
 * Tests type definitions and interfaces
 */

import { describe, it, expect } from 'bun:test';
import type {
  AlgorithmType,
  BusinessDomain,
  TableMetadata,
  InsightContext,
  NumericFeatureStats,
  AggregatedFeatures,
  InsightAction,
  InsightActionOutput,
  ReportFile,
  InsightReport,
  InsightActionSettings,
  ActionStrategy,
  AnomalyActionInput,
} from '../insight-action.types';

describe('insight-action.types', () => {
  describe('AlgorithmType', () => {
    it('should accept valid algorithm types', () => {
      const anomaly: AlgorithmType = 'anomaly';
      const clustering: AlgorithmType = 'clustering';
      const regression: AlgorithmType = 'regression';
      
      expect(anomaly).toBe('anomaly');
      expect(clustering).toBe('clustering');
      expect(regression).toBe('regression');
    });
  });

  describe('BusinessDomain', () => {
    it('should accept valid business domains', () => {
      const ecommerce: BusinessDomain = 'ecommerce';
      const finance: BusinessDomain = 'finance';
      const logistics: BusinessDomain = 'logistics';
      
      expect(ecommerce).toBe('ecommerce');
      expect(finance).toBe('finance');
      expect(logistics).toBe('logistics');
    });
  });

  describe('TableMetadata', () => {
    it('should create valid table metadata', () => {
      const metadata: TableMetadata = {
        tableName: 'test_orders',
        rowCount: 1000,
        columnCount: 10,
        columns: [
          { name: 'order_id', type: 'VARCHAR', nullable: false },
          { name: 'amount', type: 'DOUBLE', nullable: true },
        ],
      };
      
      expect(metadata.tableName).toBe('test_orders');
      expect(metadata.rowCount).toBe(1000);
      expect(metadata.columns).toHaveLength(2);
      expect(metadata.columns[0].name).toBe('order_id');
    });
  });

  describe('InsightContext', () => {
    it('should create valid insight context', () => {
      const context: InsightContext = {
        algorithmType: 'anomaly',
        tableMetadata: {
          tableName: 'orders',
          rowCount: 5000,
          columnCount: 8,
          columns: [],
        },
        featureDefinitions: {
          amount: '订单金额（单位：元）',
          quantity: '购买数量',
        },
        businessDomain: 'ecommerce',
      };
      
      expect(context.algorithmType).toBe('anomaly');
      expect(context.businessDomain).toBe('ecommerce');
      expect(context.featureDefinitions.amount).toBe('订单金额（单位：元）');
    });
  });

  describe('NumericFeatureStats', () => {
    it('should create valid numeric feature stats', () => {
      const stats: NumericFeatureStats = {
        avg: 150.5,
        min: 10,
        max: 1000,
        globalAvg: 120.3,
      };
      
      expect(stats.avg).toBe(150.5);
      expect(stats.globalAvg).toBe(120.3);
    });

    it('should work without globalAvg', () => {
      const stats: NumericFeatureStats = {
        avg: 200,
        min: 50,
        max: 500,
      };
      
      expect(stats.globalAvg).toBeUndefined();
    });
  });

  describe('AggregatedFeatures', () => {
    it('should create valid aggregated features', () => {
      const aggregated: AggregatedFeatures = {
        totalAnomalies: 25,
        averageScore: 0.85,
        numericFeatures: {
          amount: { avg: 500, min: 100, max: 2000, globalAvg: 300 },
        },
        topPatterns: {
          addresses: [
            { value: '广州市天河区', count: 10 },
            { value: '深圳市南山区', count: 8 },
          ],
          timeSlots: [
            { hour: 2, count: 15 },
            { hour: 3, count: 10 },
          ],
        },
        suspiciousPatterns: {
          midnightOrders: 18,
          sameIPMultiOrders: 5,
        },
      };
      
      expect(aggregated.totalAnomalies).toBe(25);
      expect(aggregated.averageScore).toBe(0.85);
      expect(aggregated.topPatterns.addresses).toHaveLength(2);
      expect(aggregated.suspiciousPatterns.midnightOrders).toBe(18);
    });
  });

  describe('InsightAction', () => {
    it('should create valid insight action', () => {
      const action: InsightAction = {
        diagnosis: '发现疑似职业刷单团伙活动',
        keyPatterns: [
          '同一IP地址下出现10个不同姓名的订单',
          '凌晨2-4点下单比例占60%',
        ],
        recommendations: [
          '立即拦截该IP下所有订单',
          '对未支付订单执行快速自动清理',
          '启用验证码防护',
        ],
        confidence: 0.85,
        generatedAt: '2026-02-07T13:43:00.000Z',
      };
      
      expect(action.keyPatterns).toHaveLength(2);
      expect(action.recommendations).toHaveLength(3);
      expect(action.confidence).toBeGreaterThanOrEqual(0);
      expect(action.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('InsightActionOutput', () => {
    it('should create valid insight action output', () => {
      const output: InsightActionOutput = {
        action: {
          diagnosis: '测试诊断',
          keyPatterns: ['模式1'],
          recommendations: ['建议1'],
          confidence: 0.8,
          generatedAt: new Date().toISOString(),
        },
        aggregatedFeatures: {
          totalAnomalies: 10,
          averageScore: 0.75,
          numericFeatures: {},
          topPatterns: {},
          suspiciousPatterns: {},
        },
        context: {
          algorithmType: 'anomaly',
          tableMetadata: {
            tableName: 'test',
            rowCount: 100,
            columnCount: 5,
            columns: [],
          },
          featureDefinitions: {},
          businessDomain: 'ecommerce',
        },
      };
      
      expect(output.action.diagnosis).toBe('测试诊断');
      expect(output.aggregatedFeatures.totalAnomalies).toBe(10);
      expect(output.context.algorithmType).toBe('anomaly');
    });
  });

  describe('InsightActionSettings', () => {
    it('should create valid settings with defaults', () => {
      const settings: InsightActionSettings = {
        autoGenerate: true,
        maxAnomaliesForAnalysis: 500,
      };
      
      expect(settings.autoGenerate).toBe(true);
      expect(settings.maxAnomaliesForAnalysis).toBe(500);
    });

    it('should allow custom settings', () => {
      const settings: InsightActionSettings = {
        autoGenerate: false,
        maxAnomaliesForAnalysis: 1000,
      };
      
      expect(settings.autoGenerate).toBe(false);
      expect(settings.maxAnomaliesForAnalysis).toBe(1000);
    });
  });

  describe('ReportFile', () => {
    it('should create report file with string content', () => {
      const file: ReportFile = {
        name: 'report.md',
        content: '# Test Report',
      };
      
      expect(file.name).toBe('report.md');
      expect(typeof file.content).toBe('string');
    });

    it('should create report file with Blob content', () => {
      const blob = new Blob(['test'], { type: 'text/csv' });
      const file: ReportFile = {
        name: 'data.csv',
        content: blob,
      };
      
      expect(file.name).toBe('data.csv');
      expect(file.content).toBeInstanceOf(Blob);
    });
  });

  describe('InsightReport', () => {
    it('should create valid insight report', () => {
      const report: InsightReport = {
        markdown: '# Analysis Report\n\nFindings...',
        csvData: [
          { order_id: '001', amount: 100 },
          { order_id: '002', amount: 200 },
        ],
        timestamp: '2026-02-07T13:43:00.000Z',
      };
      
      expect(report.markdown).toContain('Analysis Report');
      expect(report.csvData).toHaveLength(2);
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('AnomalyActionInput', () => {
    it('should create valid anomaly action input', () => {
      const input: AnomalyActionInput = {
        anomalies: [
          { 
            orderId: 'ORD001', 
            score: 0.95, 
            features: { amount: 5000, quantity: 100 } 
          },
        ],
        metadata: {
          featureColumns: ['amount', 'quantity'],
          totalProcessed: 1000,
          orderIdColumn: 'order_id',
        },
      };
      
      expect(input.anomalies).toHaveLength(1);
      expect(input.anomalies[0].score).toBe(0.95);
      expect(input.metadata.featureColumns).toContain('amount');
    });
  });

  describe('ActionStrategy interface', () => {
    it('should define correct method signature', () => {
      const mockStrategy: ActionStrategy = {
        execute: async (_analysisResult: any, _tableName: string, _executeQuery: any) => {
          return {
            action: {
              diagnosis: 'mock',
              keyPatterns: [],
              recommendations: [],
              confidence: 0.5,
              generatedAt: new Date().toISOString(),
            },
            aggregatedFeatures: {
              totalAnomalies: 0,
              averageScore: 0,
              numericFeatures: {},
              topPatterns: {},
              suspiciousPatterns: {},
            },
            context: {
              algorithmType: 'anomaly',
              tableMetadata: {
                tableName: 'test',
                rowCount: 0,
                columnCount: 0,
                columns: [],
              },
              featureDefinitions: {},
              businessDomain: 'ecommerce',
            },
          };
        },
      };
      
      expect(mockStrategy.execute).toBeDefined();
      expect(typeof mockStrategy.execute).toBe('function');
    });
  });
});
