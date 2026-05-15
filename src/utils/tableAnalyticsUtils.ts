/**
 * tableAnalyticsUtils.ts
 * Pure computation utilities for table column aggregation.
 * No React / DOM dependencies — safe to import in workers and tests.
 */

/** Aggregate statistics for a single column */
export interface ColAggregates {
  sum: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Number of non-null numeric values */
  count: number;
  nullCount: number;
}

/** Supported aggregate metric types for UI activation */
export type ColStatMetric = 'sum' | 'avg' | 'min' | 'max' | 'count';

/** Map of column name → activated metrics */
export type ActiveColStats = Record<string, ColStatMetric[]>;

/** Map of column name → computed aggregates */
export type ColStatsMap = Record<string, ColAggregates>;

/**
 * Synchronously compute aggregate statistics for a column in a row dataset.
 * Skips null / undefined / non-numeric values.
 *
 * @param rows - Array of data row objects
 * @param colName - Column key to aggregate
 * @returns ColAggregates
 */
export function computeColumnAggregates(
  rows: Record<string, unknown>[],
  colName: string,
): ColAggregates {
  if (rows.length === 0) {
    return { sum: 0, avg: null, min: null, max: null, count: 0, nullCount: 0 };
  }

  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;
  let count = 0;
  let nullCount = 0;

  for (const row of rows) {
    const raw = row[colName];
    const val = raw === null || raw === undefined || raw === '' ? null : Number(raw);

    if (val === null || isNaN(val)) {
      nullCount++;
      continue;
    }

    sum += val;
    count++;
    if (min === null || val < min) min = val;
    if (max === null || val > max) max = val;
  }

  const avg = count > 0 ? sum / count : null;
  return { sum, avg, min, max, count, nullCount };
}

/**
 * Non-blocking async wrapper using requestIdleCallback.
 * Falls back to setTimeout when requestIdleCallback is unavailable (SSR / legacy browsers).
 *
 * @param rows - Array of data row objects
 * @param colName - Column key to aggregate
 * @param callback - Called with the result when computation completes
 */
export function computeColumnAggregatesAsync(
  rows: Record<string, unknown>[],
  colName: string,
  callback: (result: ColAggregates) => void,
): void {
  const compute = () => {
    const result = computeColumnAggregates(rows, colName);
    callback(result);
  };

  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(compute);
  } else {
    setTimeout(compute, 0);
  }
}

/**
 * Format a numeric aggregate value for display (e.g. in summary footer).
 * Returns '-' for null / undefined.
 *
 * @param value - The numeric value
 * @param decimals - Decimal places (default 2)
 */
export function formatAggValue(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value === null || value === undefined) return '-';
  if (Number.isInteger(value)) return value.toLocaleString();
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}
