/**
 * @file metrics.v1.ts
 * @description E-commerce industry-specific metrics (version 1).
 * These metrics are commonly used in e-commerce analytics.
 */

import type { MetricDefinition } from '../../skills/types';

/**
 * E-commerce system metrics (version 1).
 * These assume standard e-commerce field naming conventions.
 */
export const ecommerceMetricsV1: Record<string, MetricDefinition> = {
  /**
   * Gross Merchandise Value - total revenue from completed orders.
   * Assumes: amount column, status column with 'completed' value.
   */
  gmv: {
    label: 'GMV (Gross Merchandise Value)',
    aggregation: 'sum',
    column: 'amount', // Default column name, can be overridden by user
    where: [
      {
        column: 'status',
        op: 'in',
        value: ['completed', 'shipped', 'delivered'],
      },
    ],
  },

  /**
   * Average Order Value - average revenue per order.
   * Assumes: amount column.
   */
  aov: {
    label: 'AOV (Average Order Value)',
    aggregation: 'avg',
    column: 'amount',
  },

  /**
   * Total number of orders.
   */
  order_count: {
    label: 'Total Orders',
    aggregation: 'count',
  },

  /**
   * Number of completed orders.
   * Assumes: status column.
   */
  completed_order_count: {
    label: 'Completed Orders',
    aggregation: 'count',
    where: [
      {
        column: 'status',
        op: '=',
        value: 'completed',
      },
    ],
  },

  /**
   * Number of unique users/customers.
   * Assumes: user_id column.
   */
  unique_users: {
    label: 'Unique Users',
    aggregation: 'count_distinct',
    column: 'user_id',
  },

  /**
   * Number of unique products sold.
   * Assumes: product_id column.
   */
  unique_products: {
    label: 'Unique Products',
    aggregation: 'count_distinct',
    column: 'product_id',
  },

  /**
   * Total refund amount.
   * Assumes: amount column, status column with 'refunded' value.
   */
  refund_amount: {
    label: 'Total Refund Amount',
    aggregation: 'sum',
    column: 'amount',
    where: [
      {
        column: 'status',
        op: '=',
        value: 'refunded',
      },
    ],
  },

  /**
   * Refund rate (percentage of orders refunded).
   * Note: This is a simplified version. In practice, you might need
   * a more complex calculation (refunded_orders / total_orders * 100).
   * This version counts refunded orders.
   */
  refund_count: {
    label: 'Refunded Orders',
    aggregation: 'count',
    where: [
      {
        column: 'status',
        op: '=',
        value: 'refunded',
      },
    ],
  },

  /**
   * Cancelled order count.
   * Assumes: status column.
   */
  cancelled_order_count: {
    label: 'Cancelled Orders',
    aggregation: 'count',
    where: [
      {
        column: 'status',
        op: '=',
        value: 'cancelled',
      },
    ],
  },

  /**
   * Pending order count (orders not yet completed).
   * Assumes: status column.
   */
  pending_order_count: {
    label: 'Pending Orders',
    aggregation: 'count',
    where: [
      {
        column: 'status',
        op: 'in',
        value: ['pending', 'processing', 'payment_pending'],
      },
    ],
  },

  /**
   * Total quantity of items sold.
   * Assumes: quantity column.
   */
  total_quantity: {
    label: 'Total Quantity Sold',
    aggregation: 'sum',
    column: 'quantity',
  },

  /**
   * Average quantity per order.
   * Assumes: quantity column.
   */
  avg_quantity_per_order: {
    label: 'Average Quantity per Order',
    aggregation: 'avg',
    column: 'quantity',
  },
};

/**
 * Get e-commerce metric by name.
 * @param name Metric name
 * @returns MetricDefinition or undefined
 */
export function getEcommerceMetric(name: string): MetricDefinition | undefined {
  return ecommerceMetricsV1[name];
}

/**
 * List all available e-commerce metric names.
 * @returns Array of metric names
 */
export function listEcommerceMetrics(): string[] {
  return Object.keys(ecommerceMetricsV1);
}

/**
 * Get all e-commerce metrics.
 * @returns Record of all metrics
 */
export function getAllEcommerceMetrics(): Record<string, MetricDefinition> {
  return { ...ecommerceMetricsV1 };
}
