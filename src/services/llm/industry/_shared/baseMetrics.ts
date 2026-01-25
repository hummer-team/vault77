/**
 * @file baseMetrics.ts
 * @description Base metrics shared across all industries.
 * These are fundamental aggregation patterns that apply universally.
 */

import type { MetricDefinition } from '../../skills/types';

/**
 * Base metrics available in all industries.
 * These provide fundamental statistical aggregations.
 */
export const baseMetrics: Record<string, MetricDefinition> = {
  /**
   * Count total number of records.
   */
  count_all: {
    label: 'Total Count',
    aggregation: 'count',
  },

  /**
   * Count distinct values in a column.
   * Note: Requires column to be specified by user.
   */
  count_distinct_template: {
    label: 'Distinct Count',
    aggregation: 'count_distinct',
    column: 'COLUMN_PLACEHOLDER', // User must specify
  },

  /**
   * Sum of numeric column.
   * Note: Requires column to be specified by user.
   */
  sum_template: {
    label: 'Sum',
    aggregation: 'sum',
    column: 'COLUMN_PLACEHOLDER', // User must specify
  },

  /**
   * Average of numeric column.
   * Note: Requires column to be specified by user.
   */
  avg_template: {
    label: 'Average',
    aggregation: 'avg',
    column: 'COLUMN_PLACEHOLDER', // User must specify
  },

  /**
   * Minimum value of numeric column.
   * Note: Requires column to be specified by user.
   */
  min_template: {
    label: 'Minimum',
    aggregation: 'min',
    column: 'COLUMN_PLACEHOLDER', // User must specify
  },

  /**
   * Maximum value of numeric column.
   * Note: Requires column to be specified by user.
   */
  max_template: {
    label: 'Maximum',
    aggregation: 'max',
    column: 'COLUMN_PLACEHOLDER', // User must specify
  },
};

/**
 * Get base metric by name.
 * @param name Metric name
 * @returns MetricDefinition or undefined
 */
export function getBaseMetric(name: string): MetricDefinition | undefined {
  return baseMetrics[name];
}

/**
 * List all available base metric names.
 * @returns Array of metric names
 */
export function listBaseMetrics(): string[] {
  return Object.keys(baseMetrics);
}
