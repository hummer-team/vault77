/**
 * Unit tests for aggregator.ts
 */

import { describe, it, expect, mock } from 'bun:test';
import { aggregateAnomalies, __testing__ } from '../aggregator';
import type { AnomalyRecord } from '../../../types/anomaly.types';

const { computeNumericStats, analyzeTopPatterns, detectSuspiciousPatterns, MAX_ANALYSIS_SIZE } = __testing__;

describe('aggregator', () => {
  // Mock anomaly records
  const mockAnomalies: AnomalyRecord[] = [
    { orderId: 'ORD001', score: 0.95, features: {} },
    { orderId: 'ORD002', score: 0.92, features: {} },
    { orderId: 'ORD003', score: 0.88, features: {} },
    { orderId: 'ORD004', score: 0.85, features: {} },
    { orderId: 'ORD005', score: 0.82, features: {} },
  ];

  describe('aggregateAnomalies', () => {
    it('should aggregate anomaly data successfully', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('AVG') && sql.includes('MIN') && sql.includes('MAX')) {
          // Numeric stats query
          return { data: [{ avg: 150.5, min: 50, max: 500 }] };
        }
        if (sql.includes('AVG') && !sql.includes('MIN')) {
          // Global average query
          return { data: [{ global_avg: 120.3 }] };
        }
        return { data: [] };
      });

      const result = await aggregateAnomalies(
        mockAnomalies,
        'test_orders',
        ['total_amount'],
        mockExecuteQuery
      );

      expect(result.totalAnomalies).toBe(5);
      expect(result.averageScore).toBeCloseTo(0.884, 2);
      expect(result.numericFeatures).toBeDefined();
      expect(result.topPatterns).toBeDefined();
      expect(result.suspiciousPatterns).toBeDefined();
    });

    it('should handle empty anomalies array', async () => {
      const mockExecuteQuery = mock(async () => ({ data: [] }));

      const result = await aggregateAnomalies(
        [],
        'test_orders',
        ['total_amount'],
        mockExecuteQuery
      );

      expect(result.totalAnomalies).toBe(0);
      expect(result.numericFeatures).toEqual({});
      expect(result.topPatterns).toEqual({});
      expect(result.suspiciousPatterns).toEqual({});
    });

    it('should limit analysis to MAX_ANALYSIS_SIZE', async () => {
      const largeAnomalies = Array.from({ length: 1000 }, (_, i) => ({
        orderId: `ORD${i.toString().padStart(4, '0')}`,
        score: 0.9,
        features: {},
      }));

      const mockExecuteQuery = mock(async (sql: string) => {
        // Count how many order IDs are in the query
        const matches = sql.match(/ORD\d{4}/g);
        expect(matches).toBeDefined();
        if (matches) {
          expect(matches.length).toBeLessThanOrEqual(MAX_ANALYSIS_SIZE);
        }
        return { data: [] };
      });

      await aggregateAnomalies(
        largeAnomalies,
        'test_orders',
        [],
        mockExecuteQuery
      );

      expect(mockExecuteQuery).toHaveBeenCalled();
    });
  });

  describe('computeNumericStats', () => {
    it('should compute statistics for feature columns', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('AVG') && sql.includes('MIN') && sql.includes('MAX')) {
          return { data: [{ avg: 200.5, min: 100, max: 500 }] };
        }
        if (sql.includes('AVG') && !sql.includes('MIN')) {
          return { data: [{ global_avg: 180.3 }] };
        }
        return { data: [] };
      });

      const stats = await computeNumericStats(
        'orders',
        ['amount', 'quantity'],
        ['ORD001', 'ORD002'],
        mockExecuteQuery
      );

      expect(stats['amount']).toBeDefined();
      expect(stats['amount'].avg).toBe(200.5);
      expect(stats['amount'].min).toBe(100);
      expect(stats['amount'].max).toBe(500);
      expect(stats['amount'].globalAvg).toBe(180.3);
    });

    it('should handle SQL injection in order IDs', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        // Verify single quotes are properly escaped
        expect(sql).not.toContain("''; DROP TABLE");
        expect(sql).toContain("''''; DROP TABLE'");
        return { data: [{ avg: 100, min: 50, max: 200 }] };
      });

      await computeNumericStats(
        'orders',
        ['amount'],
        ["ORD'; DROP TABLE orders--"],
        mockExecuteQuery
      );

      expect(mockExecuteQuery).toHaveBeenCalled();
    });

    it('should skip columns with null values', async () => {
      const mockExecuteQuery = mock(async () => {
        return { data: [{ avg: null, min: null, max: null }] };
      });

      const stats = await computeNumericStats(
        'orders',
        ['bad_column'],
        ['ORD001'],
        mockExecuteQuery
      );

      expect(stats['bad_column']).toBeUndefined();
    });

    it('should handle query errors gracefully', async () => {
      const mockExecuteQuery = mock(async () => {
        throw new Error('Column not found');
      });

      const stats = await computeNumericStats(
        'orders',
        ['nonexistent_col'],
        ['ORD001'],
        mockExecuteQuery
      );

      expect(stats).toEqual({});
    });

    it('should return empty stats for empty order IDs', async () => {
      const mockExecuteQuery = mock(async () => ({ data: [] }));

      const stats = await computeNumericStats(
        'orders',
        ['amount'],
        [],
        mockExecuteQuery
      );

      expect(stats).toEqual({});
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });
  });

  describe('analyzeTopPatterns', () => {
    it('should analyze top addresses', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('shipping_address')) {
          return {
            data: [
              { value: '广州市天河区', count: 10 },
              { value: '深圳市南山区', count: 8 },
              { value: '北京市朝阳区', count: 5 },
            ],
          };
        }
        return { data: [] };
      });

      const patterns = await analyzeTopPatterns(
        'orders',
        ['ORD001', 'ORD002'],
        mockExecuteQuery
      );

      expect(patterns.addresses).toBeDefined();
      expect(patterns.addresses).toHaveLength(3);
      expect(patterns.addresses![0].value).toBe('广州市天河区');
      expect(patterns.addresses![0].count).toBe(10);
    });

    it('should analyze time slot distribution', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('HOUR') && sql.includes('order_time')) {
          return {
            data: [
              { hour: 2, count: 15 },
              { hour: 3, count: 12 },
              { hour: 14, count: 8 },
            ],
          };
        }
        return { data: [] };
      });

      const patterns = await analyzeTopPatterns(
        'orders',
        ['ORD001', 'ORD002'],
        mockExecuteQuery
      );

      expect(patterns.timeSlots).toBeDefined();
      expect(patterns.timeSlots).toHaveLength(3);
      expect(patterns.timeSlots![0].hour).toBe(2);
      expect(patterns.timeSlots![0].count).toBe(15);
    });

    it('should analyze product categories', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('product_category')) {
          return {
            data: [
              { value: '电子产品', count: 20 },
              { value: '服装鞋帽', count: 15 },
            ],
          };
        }
        return { data: [] };
      });

      const patterns = await analyzeTopPatterns(
        'orders',
        ['ORD001', 'ORD002'],
        mockExecuteQuery
      );

      expect(patterns.categories).toBeDefined();
      expect(patterns.categories).toHaveLength(2);
      expect(patterns.categories![0].value).toBe('电子产品');
    });

    it('should handle missing columns gracefully', async () => {
      const mockExecuteQuery = mock(async () => {
        throw new Error('Column not found');
      });

      const patterns = await analyzeTopPatterns(
        'orders',
        ['ORD001'],
        mockExecuteQuery
      );

      expect(patterns).toEqual({});
    });

    it('should return empty patterns for empty order IDs', async () => {
      const mockExecuteQuery = mock(async () => ({ data: [] }));

      const patterns = await analyzeTopPatterns(
        'orders',
        [],
        mockExecuteQuery
      );

      expect(patterns).toEqual({});
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });
  });

  describe('detectSuspiciousPatterns', () => {
    it('should detect midnight orders', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('HOUR') && sql.includes('BETWEEN 2 AND 4')) {
          return { data: [{ count: 18 }] };
        }
        return { data: [] };
      });

      const patterns = await detectSuspiciousPatterns(
        'orders',
        ['ORD001', 'ORD002'],
        mockExecuteQuery
      );

      expect(patterns.midnightOrders).toBe(18);
    });

    it('should detect same IP multiple orders', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('customer_ip') && sql.includes('GROUP BY')) {
          return {
            data: [
              { order_count: 5 },
              { order_count: 3 },
              { order_count: 2 },
            ],
          };
        }
        return { data: [] };
      });

      const patterns = await detectSuspiciousPatterns(
        'orders',
        ['ORD001', 'ORD002'],
        mockExecuteQuery
      );

      expect(patterns.sameIPMultiOrders).toBe(3);
    });

    it('should detect warehouse addresses', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('仓库') || sql.includes('warehouse')) {
          return { data: [{ count: 12 }] };
        }
        return { data: [] };
      });

      const patterns = await detectSuspiciousPatterns(
        'orders',
        ['ORD001', 'ORD002'],
        mockExecuteQuery
      );

      expect(patterns.warehouseAddresses).toBe(12);
    });

    it('should handle missing columns gracefully', async () => {
      const mockExecuteQuery = mock(async () => {
        throw new Error('Column not found');
      });

      const patterns = await detectSuspiciousPatterns(
        'orders',
        ['ORD001'],
        mockExecuteQuery
      );

      expect(patterns).toEqual({});
    });

    it('should return empty patterns for empty order IDs', async () => {
      const mockExecuteQuery = mock(async () => ({ data: [] }));

      const patterns = await detectSuspiciousPatterns(
        'orders',
        [],
        mockExecuteQuery
      );

      expect(patterns).toEqual({});
      expect(mockExecuteQuery).not.toHaveBeenCalled();
    });

    it('should handle zero counts', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('HOUR')) {
          return { data: [{ count: 0 }] };
        }
        return { data: [] };
      });

      const patterns = await detectSuspiciousPatterns(
        'orders',
        ['ORD001'],
        mockExecuteQuery
      );

      expect(patterns.midnightOrders).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in order IDs', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        // Verify special characters are escaped
        expect(sql).toContain("''");
        return { data: [] };
      });

      await aggregateAnomalies(
        [{ orderId: "ORD'123", score: 0.9, features: {} }],
        'orders',
        [],
        mockExecuteQuery
      );
    });

    it('should handle very high anomaly scores', async () => {
      const mockExecuteQuery = mock(async () => ({ data: [] }));

      const result = await aggregateAnomalies(
        [{ orderId: 'ORD001', score: 1.0, features: {} }],
        'orders',
        [],
        mockExecuteQuery
      );

      expect(result.averageScore).toBe(1.0);
    });

    it('should handle very low anomaly scores', async () => {
      const mockExecuteQuery = mock(async () => ({ data: [] }));

      const result = await aggregateAnomalies(
        [{ orderId: 'ORD001', score: 0.0, features: {} }],
        'orders',
        [],
        mockExecuteQuery
      );

      expect(result.averageScore).toBe(0.0);
    });
  });
});
