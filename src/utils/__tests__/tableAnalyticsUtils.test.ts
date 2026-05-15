import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  computeColumnAggregates,
  computeColumnAggregatesAsync,
  type ColAggregates,
} from '../tableAnalyticsUtils';

const numericRows = [
  { price: 100, qty: 5 },
  { price: 200, qty: 3 },
  { price: null, qty: 8 },
  { price: 300, qty: undefined },
];

describe('computeColumnAggregates', () => {
  it('computes sum, avg, min, max for numeric column', () => {
    const result = computeColumnAggregates(numericRows, 'price');
    expect(result.sum).toBe(600);
    expect(result.avg).toBeCloseTo(200);
    expect(result.min).toBe(100);
    expect(result.max).toBe(300);
    expect(result.count).toBe(3); // non-null values
    expect(result.nullCount).toBe(1);
  });

  it('handles all nulls gracefully', () => {
    const rows = [{ val: null }, { val: undefined }, { val: '' }];
    const result = computeColumnAggregates(rows, 'val');
    expect(result.sum).toBe(0);
    expect(result.avg).toBeNull();
    expect(result.min).toBeNull();
    expect(result.max).toBeNull();
    expect(result.count).toBe(0);
    expect(result.nullCount).toBe(3);
  });

  it('handles empty rows array', () => {
    const result = computeColumnAggregates([], 'price');
    expect(result.sum).toBe(0);
    expect(result.count).toBe(0);
    expect(result.avg).toBeNull();
    expect(result.min).toBeNull();
    expect(result.max).toBeNull();
    expect(result.nullCount).toBe(0);
  });

  it('counts rows in count column', () => {
    const result = computeColumnAggregates(numericRows, 'qty');
    expect(result.sum).toBe(16); // 5+3+8
    expect(result.count).toBe(3);
    expect(result.nullCount).toBe(1);
  });
});

describe('computeColumnAggregatesAsync', () => {
  let originalRIC: typeof requestIdleCallback | undefined;

  beforeEach(() => {
    // Polyfill requestIdleCallback to run synchronously in tests
    originalRIC = (globalThis as Record<string, unknown>).requestIdleCallback as typeof requestIdleCallback | undefined;
    (globalThis as Record<string, unknown>).requestIdleCallback = (cb: IdleRequestCallback) => {
      cb({ timeRemaining: () => 50, didTimeout: false } as IdleDeadline);
      return 1;
    };
  });

  afterEach(() => {
    if (originalRIC !== undefined) {
      (globalThis as Record<string, unknown>).requestIdleCallback = originalRIC;
    } else {
      delete (globalThis as Record<string, unknown>).requestIdleCallback;
    }
  });

  it('returns aggregates via callback without blocking', async () => {
    const result = await new Promise<ColAggregates>((resolve) => {
      computeColumnAggregatesAsync(numericRows, 'price', resolve);
    });
    expect(result.sum).toBe(600);
    expect(result.avg).toBeCloseTo(200);
  });
});
