/**
 * Unit tests for anomaly-action.ts
 */

import { describe, it, expect } from 'bun:test';
import { buildAnomalyActionPrompt, __testing__ } from '../anomaly-action';
import type { InsightContext, AggregatedFeatures } from '../../../types/insight-action.types';

const { formatNumericFeatures, formatTopPatterns, formatSuspiciousPatterns } = __testing__;

describe('anomaly-action prompt', () => {
  // Mock context
  const mockContext: InsightContext = {
    algorithmType: 'anomaly',
    tableMetadata: {
      tableName: 'test_orders',
      rowCount: 10000,
      columnCount: 5,
      columns: [
        { name: 'order_id', type: 'VARCHAR', nullable: false },
        { name: 'total_amount', type: 'DOUBLE', nullable: true },
      ],
    },
    featureDefinitions: {
      total_amount: '订单金额（单位：元）',
      order_qty: '购买数量',
    },
    businessDomain: 'ecommerce',
  };

  // Mock aggregated features
  const mockAggregated: AggregatedFeatures = {
    totalAnomalies: 150,
    averageScore: 0.85,
    numericFeatures: {
      total_amount: {
        avg: 500.5,
        min: 100,
        max: 2000,
        globalAvg: 300.2,
      },
      order_qty: {
        avg: 15,
        min: 5,
        max: 50,
        globalAvg: 10,
      },
    },
    topPatterns: {
      addresses: [
        { value: '广州市天河区', count: 20 },
        { value: '深圳市南山区', count: 15 },
      ],
      timeSlots: [
        { hour: 2, count: 30 },
        { hour: 3, count: 25 },
      ],
    },
    suspiciousPatterns: {
      midnightOrders: 45,
      sameIPMultiOrders: 8,
    },
  };

  describe('buildAnomalyActionPrompt', () => {
    it('should generate complete prompt', () => {
      const prompt = buildAnomalyActionPrompt(mockContext, mockAggregated);

      expect(prompt).toContain('角色定位');
      expect(prompt).toContain('资深的电商风控专家');
      expect(prompt).toContain('业务背景');
      expect(prompt).toContain('test_orders');
      expect(prompt).toContain('10,000');
      expect(prompt).toContain('150');
    });

    it('should include feature definitions', () => {
      const prompt = buildAnomalyActionPrompt(mockContext, mockAggregated);

      expect(prompt).toContain('total_amount');
      expect(prompt).toContain('订单金额（单位：元）');
      expect(prompt).toContain('order_qty');
      expect(prompt).toContain('购买数量');
    });

    it('should include Few-Shot examples', () => {
      const prompt = buildAnomalyActionPrompt(mockContext, mockAggregated);

      expect(prompt).toContain('Few-Shot 示例');
      expect(prompt).toContain('职业刷单团伙');
      expect(prompt).toContain('恶意占库存');
      expect(prompt).toContain('海外转运诈骗');
    });

    it('should include output format specification', () => {
      const prompt = buildAnomalyActionPrompt(mockContext, mockAggregated);

      expect(prompt).toContain('JSON 格式');
      expect(prompt).toContain('diagnosis');
      expect(prompt).toContain('keyPatterns');
      expect(prompt).toContain('recommendations');
      expect(prompt).toContain('confidence');
    });

    it('should calculate anomaly rate correctly', () => {
      const prompt = buildAnomalyActionPrompt(mockContext, mockAggregated);

      const expectedRate = ((150 / 10000) * 100).toFixed(2);
      expect(prompt).toContain(`异常率**: ${expectedRate}%`);
    });
  });

  describe('formatNumericFeatures', () => {
    it('should format numeric features with deviation', () => {
      const formatted = formatNumericFeatures({
        total_amount: {
          avg: 500.5,
          min: 100,
          max: 2000,
          globalAvg: 300.2,
        },
      });

      expect(formatted).toContain('total_amount');
      expect(formatted).toContain('500.50');
      expect(formatted).toContain('300.20');
      expect(formatted).toContain('↑');
    });

    it('should handle empty features', () => {
      const formatted = formatNumericFeatures({});

      expect(formatted).toContain('暂无数值特征对比数据');
    });
  });

  describe('formatTopPatterns', () => {
    it('should format top addresses', () => {
      const formatted = formatTopPatterns({
        addresses: [
          { value: '广州市天河区', count: 20 },
          { value: '深圳市南山区', count: 15 },
        ],
      });

      expect(formatted).toContain('Top 收货地址');
      expect(formatted).toContain('广州市天河区 (20笔)');
    });

    it('should handle empty patterns', () => {
      const formatted = formatTopPatterns({});

      expect(formatted).toContain('暂无明显模式');
    });
  });

  describe('formatSuspiciousPatterns', () => {
    it('should format midnight orders alert', () => {
      const formatted = formatSuspiciousPatterns({
        midnightOrders: 45,
      });

      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('凌晨订单');
      expect(formatted).toContain('45 笔订单');
    });

    it('should handle empty patterns', () => {
      const formatted = formatSuspiciousPatterns({});

      expect(formatted).toContain('暂无可疑特征');
    });
  });
});
