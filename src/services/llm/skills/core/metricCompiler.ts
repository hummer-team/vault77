/**
 * @file metricCompiler.ts
 * @description Compiles MetricDefinition to SQL SELECT expressions.
 * Supports restricted aggregation types with optional WHERE clause.
 */

import type { MetricDefinition } from '../types';
import { compileFilters } from './filterCompiler';

/**
 * Validate column name to prevent SQL injection.
 * @param column Column name
 * @throws Error if column name is invalid
 */
function validateColumnName(column: string): void {
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
}

/**
 * Compile MetricDefinition to SQL SELECT expression.
 * @param metric Metric definition
 * @param alias Optional alias for the metric (default: metric label)
 * @returns SQL SELECT expression
 * @throws Error if metric is invalid
 */
export function compileMetric(metric: MetricDefinition, alias?: string): string {
  const { aggregation, column, where, label } = metric;
  
  // Determine aggregation expression
  let aggExpr: string;
  
  if (aggregation === 'count') {
    aggExpr = 'COUNT(*)';
  } else if (aggregation === 'count_distinct') {
    if (!column) {
      throw new Error('Column is required for count_distinct aggregation');
    }
    validateColumnName(column);
    aggExpr = `COUNT(DISTINCT ${column})`;
  } else {
    // sum, avg, min, max
    if (!column) {
      throw new Error(`Column is required for ${aggregation} aggregation`);
    }
    validateColumnName(column);
    aggExpr = `${aggregation.toUpperCase()}(${column})`;
  }
  
  // Handle WHERE clause within aggregation (CASE WHEN pattern)
  if (where && where.length > 0) {
    const whereClause = compileFilters(where, 'AND');
    
    // Wrap with CASE WHEN for conditional aggregation
    if (aggregation === 'count') {
      aggExpr = `COUNT(CASE WHEN ${whereClause} THEN 1 END)`;
    } else if (aggregation === 'count_distinct') {
      aggExpr = `COUNT(DISTINCT CASE WHEN ${whereClause} THEN ${column} END)`;
    } else {
      // sum, avg, min, max
      aggExpr = `${aggregation.toUpperCase()}(CASE WHEN ${whereClause} THEN ${column} END)`;
    }
  }
  
  // Add alias
  const finalAlias = alias || label.replace(/\s+/g, '_').toLowerCase();
  return `${aggExpr} AS ${finalAlias}`;
}

/**
 * Compile multiple metrics to SQL SELECT clause.
 * @param metrics Record of metric definitions (key: metric name)
 * @param limit Optional limit on number of metrics to compile (for Top-K)
 * @returns SQL SELECT expressions (without SELECT keyword)
 */
export function compileMetrics(
  metrics: Record<string, MetricDefinition>,
  limit?: number
): string {
  const entries = Object.entries(metrics);
  
  // Apply limit if specified (Top-K)
  const limitedEntries = limit ? entries.slice(0, limit) : entries;
  
  const expressions = limitedEntries.map(([name, metric]) => {
    try {
      return compileMetric(metric, name);
    } catch (error) {
      console.error(`[MetricCompiler] Failed to compile metric "${name}":`, metric, error);
      throw error;
    }
  });
  
  return expressions.join(', ');
}

/**
 * Check if a metric name exists in system or user metrics.
 * Used for override detection.
 * @param metricName Metric name to check
 * @param systemMetrics System metrics
 * @param userMetrics User-defined metrics
 * @returns { isOverride: boolean, source: 'system' | 'user' | 'none' }
 */
export function checkMetricOverride(
  metricName: string,
  systemMetrics: Record<string, MetricDefinition>,
  userMetrics: Record<string, MetricDefinition>
): { isOverride: boolean; source: 'system' | 'user' | 'none' } {
  const inUser = metricName in userMetrics;
  const inSystem = metricName in systemMetrics;
  
  if (inUser && inSystem) {
    return { isOverride: true, source: 'user' };
  }
  
  if (inUser) {
    return { isOverride: false, source: 'user' };
  }
  
  if (inSystem) {
    return { isOverride: false, source: 'system' };
  }
  
  return { isOverride: false, source: 'none' };
}
