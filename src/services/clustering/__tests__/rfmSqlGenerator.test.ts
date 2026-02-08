/**
 * Unit tests for RFM SQL Generator
 */

import { describe, it, expect } from 'bun:test';
import {
  generateRFMSql,
  generateCustomerCountSql,
  validateCustomerCount,
} from '../rfmSqlGenerator';
import type { RFMColumns } from '../rfmColumnDetector';

describe('rfmSqlGenerator', () => {
  describe('generateRFMSql', () => {
    it('should generate SQL for pre-computed RFM data', () => {
      const rfmColumns: RFMColumns = {
        customerId: 'customer_id',
        orderId: null,
        orderDate: null,
        orderAmount: null,
        confidence: {
          customerId: 1.0,
          orderId: 0,
          orderDate: 0,
          orderAmount: 0,
        },
        precomputedRFM: {
          recency: 'recency',
          frequency: 'frequency',
          monetary: 'monetary',
        },
      };

      const result = generateRFMSql({
        tableName: 'customers',
        rfmColumns,
      });

      expect(result.isPrecomputed).toBe(true);
      expect(result.isSampled).toBe(false);
      expect(result.sql).toContain('SELECT');
      expect(result.sql).toContain('customer_id');
      expect(result.sql).toContain('recency');
      expect(result.sql).toContain('frequency');
      expect(result.sql).toContain('monetary');
      expect(result.sql).toContain('WHERE');
      expect(result.sql).toContain('>= 0'); // Validation for non-negative values
    });

    it('should generate SQL for computed RFM from raw orders', () => {
      const rfmColumns: RFMColumns = {
        customerId: 'customer_id',
        orderId: 'order_id',
        orderDate: 'order_date',
        orderAmount: 'amount',
        confidence: {
          customerId: 1.0,
          orderId: 1.0,
          orderDate: 1.0,
          orderAmount: 1.0,
        },
        precomputedRFM: {
          recency: null,
          frequency: null,
          monetary: null,
        },
      };

      const result = generateRFMSql({
        tableName: 'orders',
        rfmColumns,
      });

      expect(result.isPrecomputed).toBe(false);
      expect(result.isSampled).toBe(true);
      expect(result.sql).toContain('WITH rfm_base AS');
      expect(result.sql).toContain('MAX(CAST("order_date" AS DATE))');
      expect(result.sql).toContain('COUNT(DISTINCT "order_id")');
      expect(result.sql).toContain('SUM(CAST("amount" AS DOUBLE))');
      expect(result.sql).toContain('GROUP BY "customer_id"');
    });

    it('should use COUNT(*) when order_id is not available', () => {
      const rfmColumns: RFMColumns = {
        customerId: 'customer_id',
        orderId: null,
        orderDate: 'order_date',
        orderAmount: 'amount',
        confidence: {
          customerId: 1.0,
          orderId: 0,
          orderDate: 1.0,
          orderAmount: 1.0,
        },
        precomputedRFM: {
          recency: null,
          frequency: null,
          monetary: null,
        },
      };

      const result = generateRFMSql({
        tableName: 'orders',
        rfmColumns,
      });

      expect(result.sql).toContain('COUNT(*)');
      expect(result.sql).not.toContain('COUNT(DISTINCT');
    });

    it('should filter out negative recency and monetary values', () => {
      const rfmColumns: RFMColumns = {
        customerId: 'customer_id',
        orderId: 'order_id',
        orderDate: 'order_date',
        orderAmount: 'amount',
        confidence: {
          customerId: 1.0,
          orderId: 1.0,
          orderDate: 1.0,
          orderAmount: 1.0,
        },
        precomputedRFM: {
          recency: null,
          frequency: null,
          monetary: null,
        },
      };

      const result = generateRFMSql({
        tableName: 'orders',
        rfmColumns,
      });

      expect(result.sql).toContain('recency >= 0');
      expect(result.sql).toContain('monetary >= 0');
    });
  });

  describe('generateCustomerCountSql', () => {
    it('should generate count SQL for pre-computed RFM', () => {
      const rfmColumns: RFMColumns = {
        customerId: 'customer_id',
        orderId: null,
        orderDate: null,
        orderAmount: null,
        confidence: {
          customerId: 1.0,
          orderId: 0,
          orderDate: 0,
          orderAmount: 0,
        },
        precomputedRFM: {
          recency: 'recency',
          frequency: 'frequency',
          monetary: 'monetary',
        },
      };

      const sql = generateCustomerCountSql('customers', rfmColumns);

      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('FROM "customers"');
      expect(sql).toContain('WHERE "recency" IS NOT NULL');
    });

    it('should generate count SQL for raw orders', () => {
      const rfmColumns: RFMColumns = {
        customerId: 'customer_id',
        orderId: 'order_id',
        orderDate: 'order_date',
        orderAmount: 'amount',
        confidence: {
          customerId: 1.0,
          orderId: 1.0,
          orderDate: 1.0,
          orderAmount: 1.0,
        },
        precomputedRFM: {
          recency: null,
          frequency: null,
          monetary: null,
        },
      };

      const sql = generateCustomerCountSql('orders', rfmColumns);

      expect(sql).toContain('COUNT(DISTINCT "customer_id")');
      expect(sql).toContain('FROM "orders"');
      expect(sql).toContain('WHERE "customer_id" IS NOT NULL');
    });
  });

  describe('validateCustomerCount', () => {
    it('should pass validation for sufficient customers', () => {
      expect(() => validateCustomerCount(10)).not.toThrow();
      expect(() => validateCustomerCount(100)).not.toThrow();
      expect(() => validateCustomerCount(1000)).not.toThrow();
    });

    it('should throw error for insufficient customers', () => {
      expect(() => validateCustomerCount(0)).toThrow('Insufficient data');
      expect(() => validateCustomerCount(5)).toThrow('Insufficient data');
      expect(() => validateCustomerCount(9)).toThrow('Insufficient data');
    });

    it('should include actual count in error message', () => {
      try {
        validateCustomerCount(7);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error instanceof Error).toBe(true);
        expect((error as Error).message).toContain('7');
        expect((error as Error).message).toContain('10');
      }
    });
  });
});
