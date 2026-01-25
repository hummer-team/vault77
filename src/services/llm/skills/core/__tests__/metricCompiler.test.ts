/**
 * @file metricCompiler.test.ts
 * @description Unit tests for metric compiler
 */

import { describe, it, expect } from 'bun:test';
import { compileMetric, compileMetrics } from '../metricCompiler';
import type { MetricDefinition, FilterExpr } from '../../types';

describe('MetricCompiler', () => {
  describe('compileMetric', () => {
    it('should compile count aggregation', () => {
      const metric: MetricDefinition = {
        label: 'Total Orders',
        aggregation: 'count',
      };
      const result = compileMetric(metric);
      expect(result).toBe('COUNT(*) AS total_orders');
    });

    it('should compile count_distinct aggregation', () => {
      const metric: MetricDefinition = {
        label: 'Unique Users',
        aggregation: 'count_distinct',
        column: 'user_id',
      };
      const result = compileMetric(metric);
      expect(result).toBe('COUNT(DISTINCT user_id) AS unique_users');
    });

    it('should compile sum aggregation', () => {
      const metric: MetricDefinition = {
        label: 'GMV',
        aggregation: 'sum',
        column: 'amount',
      };
      const result = compileMetric(metric);
      expect(result).toBe('SUM(amount) AS gmv');
    });

    it('should compile avg aggregation', () => {
      const metric: MetricDefinition = {
        label: 'Average Order Value',
        aggregation: 'avg',
        column: 'order_value',
      };
      const result = compileMetric(metric);
      expect(result).toBe('AVG(order_value) AS average_order_value');
    });

    it('should handle metric with WHERE clause', () => {
      const whereFilters: FilterExpr[] = [
        { column: 'status', op: '=', value: 'completed' },
      ];
      const metric: MetricDefinition = {
        label: 'Completed Orders',
        aggregation: 'count',
        where: whereFilters,
      };
      const result = compileMetric(metric);
      expect(result).toContain('COUNT(CASE WHEN');
      expect(result).toContain("status = 'completed'");
      expect(result).toContain('THEN 1 END)');
    });

    it('should handle sum with WHERE clause', () => {
      const whereFilters: FilterExpr[] = [
        { column: 'status', op: 'in', value: ['completed', 'shipped'] },
      ];
      const metric: MetricDefinition = {
        label: 'Confirmed GMV',
        aggregation: 'sum',
        column: 'amount',
        where: whereFilters,
      };
      const result = compileMetric(metric);
      expect(result).toContain('SUM(CASE WHEN');
      expect(result).toContain('THEN amount END)');
    });

    it('should throw error if column missing for non-count aggregation', () => {
      const metric: MetricDefinition = {
        label: 'Total Amount',
        aggregation: 'sum',
        // Missing column
      };
      expect(() => compileMetric(metric)).toThrow('Column is required');
    });

    it('should use custom alias', () => {
      const metric: MetricDefinition = {
        label: 'Total Orders',
        aggregation: 'count',
      };
      const result = compileMetric(metric, 'order_count');
      expect(result).toBe('COUNT(*) AS order_count');
    });

    it('should support Chinese column names', () => {
      const metric: MetricDefinition = {
        label: '总金额',
        aggregation: 'sum',
        column: '实付金额',
      };
      const result = compileMetric(metric);
      expect(result).toContain('SUM(实付金额)');
    });
  });

  describe('compileMetrics', () => {
    it('should compile multiple metrics', () => {
      const metrics: Record<string, MetricDefinition> = {
        order_count: {
          label: 'Order Count',
          aggregation: 'count',
        },
        total_revenue: {
          label: 'Total Revenue',
          aggregation: 'sum',
          column: 'revenue',
        },
      };
      const result = compileMetrics(metrics);
      expect(result).toContain('COUNT(*) AS order_count');
      expect(result).toContain('SUM(revenue) AS total_revenue');
      expect(result).toContain(', ');
    });

    it('should respect limit (Top-K)', () => {
      const metrics: Record<string, MetricDefinition> = {
        metric1: { label: 'M1', aggregation: 'count' },
        metric2: { label: 'M2', aggregation: 'count' },
        metric3: { label: 'M3', aggregation: 'count' },
      };
      const result = compileMetrics(metrics, 2);
      expect(result.split(',').length).toBe(2);
    });
  });
});
