/**
 * RFM SQL Generator
 * Generates DuckDB SQL for RFM (Recency, Frequency, Monetary) calculation
 */

import {
  MIN_CUSTOMER_COUNT,
  LARGE_DATASET_THRESHOLD,
  MAX_CUSTOMER_SAMPLE_SIZE,
} from '../../constants/clustering.constants';
import type { RFMColumns } from './rfmColumnDetector';

/**
 * Standard RFM output columns after CTE normalization
 * 
 * These column names are standardized in the rfm_base CTE where we convert
 * the actual column names (e.g., "会员等级", "订单金额") to standard names.
 * 
 * CTE Flow:
 * 1. rfm_base: Convert actual columns → standard names (customer_id, frequency, monetary)
 * 2. rfm_computed: Calculate recency from dates
 * 3. rfm_cleaned: Filter out anomalies
 * 4. Final SELECT: Use these standard names
 */
const STANDARD_RFM_COLUMNS = {
  customerId: 'customer_id',
  recency: 'recency',
  frequency: 'frequency',
  monetary: 'monetary',
} as const;

/**
 * RFM SQL generation options
 */
export interface RFMSqlOptions {
  tableName: string;           // DuckDB table name
  rfmColumns: RFMColumns;      // Detected column names
  sampleSize?: number;         // Optional: override default sampling size
  baselineDate?: string;       // Optional: override time baseline (ISO 8601 date)
}

/**
 * RFM SQL generation result
 */
export interface RFMSqlResult {
  sql: string;                 // Generated SQL
  isPrecomputed: boolean;      // Whether RFM was pre-computed
  isSampled: boolean;          // Whether data was sampled
  sampleSize: number;          // Actual sample size used
  estimatedRowCount?: number;  // Estimated customer count (for sampling)
}

/**
 * Generate SQL to compute or retrieve RFM features
 * @param options SQL generation options
 * @returns SQL query and metadata
 */
export function generateRFMSql(options: RFMSqlOptions): RFMSqlResult {
  const { tableName, rfmColumns, sampleSize, baselineDate } = options;
  
  // Case 1: Pre-computed RFM columns exist
  if (rfmColumns.precomputedRFM.recency && 
      rfmColumns.precomputedRFM.frequency && 
      rfmColumns.precomputedRFM.monetary) {
    return generatePrecomputedRFMSql(tableName, rfmColumns);
  }
  
  // Case 2: Compute RFM from raw order data
  return generateComputedRFMSql(tableName, rfmColumns, sampleSize, baselineDate);
}

/**
 * Generate SQL for pre-computed RFM data
 */
function generatePrecomputedRFMSql(
  tableName: string,
  rfmColumns: RFMColumns
): RFMSqlResult {
  const { customerId, precomputedRFM } = rfmColumns;
  
  // Validate customer ID column exists
  if (!customerId) {
    throw new Error('Customer ID column not detected');
  }
  
  const sql = `
    SELECT 
      "${customerId}" AS customer_id,
      CAST("${precomputedRFM.recency}" AS DOUBLE) AS recency,
      CAST("${precomputedRFM.frequency}" AS DOUBLE) AS frequency,
      CAST("${precomputedRFM.monetary}" AS DOUBLE) AS monetary
    FROM "${tableName}"
    WHERE "${precomputedRFM.recency}" IS NOT NULL
      AND "${precomputedRFM.frequency}" IS NOT NULL
      AND "${precomputedRFM.monetary}" IS NOT NULL
      AND "${precomputedRFM.recency}" >= 0
      AND "${precomputedRFM.monetary}" >= 0
    ORDER BY "${customerId}"
  `.trim();
  
  return {
    sql,
    isPrecomputed: true,
    isSampled: false,
    sampleSize: 0,
  };
}

/**
 * Generate SQL to compute RFM from raw order data
 */
function generateComputedRFMSql(
  tableName: string,
  rfmColumns: RFMColumns,
  sampleSize?: number,
  baselineDate?: string
): RFMSqlResult {
  const { customerId, orderId, orderDate, orderAmount } = rfmColumns;
  
  // Validate required columns
  if (!customerId || !orderDate || !orderAmount) {
    throw new Error('Missing required columns for RFM computation');
  }
  
  // Determine time baseline: user-provided or MAX(order_date)
  const baselineDateExpr = baselineDate 
    ? `DATE '${baselineDate}'`
    : `(SELECT MAX(CAST("${orderDate}" AS DATE)) FROM "${tableName}")`;
  
  // Frequency calculation: COUNT(DISTINCT order_id) if available, else COUNT(*)
  const frequencyExpr = orderId 
    ? `COUNT(DISTINCT "${orderId}")`
    : 'COUNT(*)';
  
  // Build main RFM CTE
  const rfmCTE = `
    WITH rfm_base AS (
      SELECT 
        "${customerId}" AS customer_id,
        MAX(CAST("${orderDate}" AS DATE)) AS last_order_date,
        ${frequencyExpr} AS frequency,
        SUM(CAST("${orderAmount}" AS DOUBLE)) AS monetary
      FROM "${tableName}"
      WHERE "${customerId}" IS NOT NULL
        AND "${orderDate}" IS NOT NULL
        AND "${orderAmount}" IS NOT NULL
        AND CAST("${orderAmount}" AS DOUBLE) >= 0
      GROUP BY "${customerId}"
    ),
    rfm_computed AS (
      SELECT 
        customer_id,
        CAST(${baselineDateExpr} - last_order_date AS INTEGER) AS recency,
        CAST(frequency AS DOUBLE) AS frequency,
        CAST(monetary AS DOUBLE) AS monetary
      FROM rfm_base
      WHERE last_order_date IS NOT NULL
    ),
    rfm_cleaned AS (
      SELECT *
      FROM rfm_computed
      WHERE recency >= 0
        AND monetary >= 0
    )
  `.trim();
  
  // Determine if sampling is needed
  const needsSampling = !sampleSize; // Auto-detect if not specified
  const actualSampleSize = sampleSize || MAX_CUSTOMER_SAMPLE_SIZE;
  
  // Build SELECT clause (common for both sampled and non-sampled queries)
  const selectColumns = Object.values(STANDARD_RFM_COLUMNS).join(',\n    ');
  
  // Build SQL incrementally to avoid duplication
  let sql = rfmCTE;
  
  // Add sampling CTE if needed
  if (needsSampling) {
    sql += `,
    customer_count AS (
      SELECT COUNT(*) AS total_customers FROM rfm_cleaned
    )`;
  }
  
  // Add main SELECT clause (same for both branches)
  sql += `
    SELECT 
      ${selectColumns}
    FROM rfm_cleaned`;
  
  // Add WHERE clause for sampling (only if needed)
  if (needsSampling) {
    sql += `
    WHERE (SELECT total_customers FROM customer_count) <= ${LARGE_DATASET_THRESHOLD}
       OR ${STANDARD_RFM_COLUMNS.customerId} IN (
         SELECT ${STANDARD_RFM_COLUMNS.customerId}
         FROM rfm_cleaned 
         ORDER BY RANDOM() 
         LIMIT ${actualSampleSize}
       )`;
  }
  
  // Add ORDER BY clause (common for both branches)
  sql += `
    ORDER BY ${STANDARD_RFM_COLUMNS.customerId}`;
  
  return {
    sql: sql.trim(),
    isPrecomputed: false,
    isSampled: needsSampling,
    sampleSize: actualSampleSize,
  };
}

/**
 * Generate SQL to count customers (for validation)
 * @param tableName DuckDB table name
 * @param rfmColumns Detected RFM columns
 * @returns SQL to count unique customers
 */
export function generateCustomerCountSql(
  tableName: string,
  rfmColumns: RFMColumns
): string {
  // If pre-computed RFM exists, count from base table
  if (rfmColumns.precomputedRFM.recency) {
    return `
      SELECT COUNT(*) AS customer_count
      FROM "${tableName}"
      WHERE "${rfmColumns.precomputedRFM.recency}" IS NOT NULL
    `.trim();
  }
  
  // Otherwise, count distinct customer IDs
  const customerId = rfmColumns.customerId;
  if (!customerId) {
    throw new Error('Customer ID column not detected');
  }
  
  return `
    SELECT COUNT(DISTINCT "${customerId}") AS customer_count
    FROM "${tableName}"
    WHERE "${customerId}" IS NOT NULL
  `.trim();
}

/**
 * Validate RFM data meets minimum requirements
 * @param customerCount Number of customers
 * @throws Error if insufficient data
 */
export function validateCustomerCount(customerCount: number): void {
  if (customerCount < MIN_CUSTOMER_COUNT) {
    throw new Error(
      `Insufficient data for clustering (min ${MIN_CUSTOMER_COUNT} customers required, found ${customerCount})`
    );
  }
}
