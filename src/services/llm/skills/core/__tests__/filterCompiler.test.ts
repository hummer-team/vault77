/**
 * @file filterCompiler.test.ts
 * @description Unit tests for filter compiler
 */

import { describe, it, expect } from 'bun:test';
import { compileFilter, compileFilters, compileWhereClause } from '../filterCompiler';
import type { FilterExpr, RelativeTimeValue } from '../../types';

describe('FilterCompiler', () => {
  describe('compileFilter - literal values', () => {
    it('should compile string equality filter', () => {
      const filter: FilterExpr = {
        column: 'status',
        op: '=',
        value: 'completed',
      };
      const result = compileFilter(filter);
      expect(result).toBe("status = 'completed'");
    });

    it('should compile numeric comparison filter', () => {
      const filter: FilterExpr = {
        column: 'amount',
        op: '>',
        value: 100,
      };
      const result = compileFilter(filter);
      expect(result).toBe('amount > 100');
    });

    it('should compile IN filter with array', () => {
      const filter: FilterExpr = {
        column: 'category',
        op: 'in',
        value: ['electronics', 'clothing'],
      };
      const result = compileFilter(filter);
      expect(result).toBe("category IN ('electronics', 'clothing')");
    });

    it('should compile NOT IN filter', () => {
      const filter: FilterExpr = {
        column: 'status',
        op: 'not_in',
        value: ['cancelled', 'refunded'],
      };
      const result = compileFilter(filter);
      expect(result).toBe("status NOT IN ('cancelled', 'refunded')");
    });

    it('should compile CONTAINS filter', () => {
      const filter: FilterExpr = {
        column: 'product_name',
        op: 'contains',
        value: 'iPhone',
      };
      const result = compileFilter(filter);
      expect(result).toBe("product_name LIKE '%iPhone%'");
    });

    it('should escape single quotes in strings', () => {
      const filter: FilterExpr = {
        column: 'description',
        op: '=',
        value: "It's amazing",
      };
      const result = compileFilter(filter);
      expect(result).toBe("description = 'It''s amazing'");
    });

    it('should reject invalid column names', () => {
      const filter: FilterExpr = {
        column: 'col; DROP TABLE users;--',
        op: '=',
        value: 'test',
      };
      expect(() => compileFilter(filter)).toThrow('Invalid column name');
    });
  });

  describe('compileFilter - relative time', () => {
    it('should compile past relative time (last 30 days)', () => {
      const relativeTime: RelativeTimeValue = {
        kind: 'relative_time',
        unit: 'day',
        amount: 30,
        direction: 'past',
      };
      const filter: FilterExpr = {
        column: 'order_date',
        op: '>=',
        value: relativeTime,
      };
      const result = compileFilter(filter);
      expect(result).toContain('CAST(order_date AS TIMESTAMP)');
      expect(result).toContain('date_add(CURRENT_TIMESTAMP, -INTERVAL');
      expect(result).toContain("'30 day'");
    });

    it('should compile future relative time', () => {
      const relativeTime: RelativeTimeValue = {
        kind: 'relative_time',
        unit: 'week',
        amount: 2,
        direction: 'future',
      };
      const filter: FilterExpr = {
        column: 'expiry_date',
        op: '<=',
        value: relativeTime,
      };
      const result = compileFilter(filter);
      expect(result).toContain('CAST(expiry_date AS TIMESTAMP)');
      expect(result).toContain('date_add(CURRENT_TIMESTAMP, INTERVAL');
      expect(result).toContain("'2 week'");
    });

    it('should support Chinese column names', () => {
      const filter: FilterExpr = {
        column: '下单时间',
        op: '>=',
        value: {
          kind: 'relative_time',
          unit: 'day',
          amount: 7,
          direction: 'past',
        },
      };
      const result = compileFilter(filter);
      expect(result).toContain('CAST(下单时间 AS TIMESTAMP)');
    });
  });

  describe('compileFilters', () => {
    it('should compile multiple filters with AND', () => {
      const filters: FilterExpr[] = [
        { column: 'status', op: '=', value: 'completed' },
        { column: 'amount', op: '>', value: 100 },
      ];
      const result = compileFilters(filters, 'AND');
      expect(result).toBe("status = 'completed' AND amount > 100");
    });

    it('should compile multiple filters with OR', () => {
      const filters: FilterExpr[] = [
        { column: 'category', op: '=', value: 'electronics' },
        { column: 'category', op: '=', value: 'clothing' },
      ];
      const result = compileFilters(filters, 'OR');
      expect(result).toBe("category = 'electronics' OR category = 'clothing'");
    });

    it('should return empty string for empty array', () => {
      const result = compileFilters([]);
      expect(result).toBe('');
    });
  });

  describe('compileWhereClause', () => {
    it('should add WHERE keyword', () => {
      const filters: FilterExpr[] = [
        { column: 'status', op: '=', value: 'active' },
      ];
      const result = compileWhereClause(filters);
      expect(result).toBe("WHERE status = 'active'");
    });

    it('should return empty string for no filters', () => {
      const result = compileWhereClause([]);
      expect(result).toBe('');
    });
  });
});
