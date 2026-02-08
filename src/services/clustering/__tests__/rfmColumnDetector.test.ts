/**
 * Unit tests for RFM Column Detector
 */

import { describe, it, expect } from 'bun:test';
import { detectRFMColumns, validateRFMColumns } from '../rfmColumnDetector';
import type { TableMetadata } from '../../../types/insight-action.types';

// Helper to create mock TableMetadata
function createTableMetadata(columnNames: string[]): TableMetadata {
  return {
    columns: columnNames.map(name => ({
      name,
      type: 'text',
      nullable: true,
    })),
  } as TableMetadata;
}

describe('rfmColumnDetector', () => {
  describe('detectRFMColumns - Pre-computed RFM', () => {
    it('should detect pre-computed RFM columns', () => {
      const metadata = createTableMetadata(['customer_id', 'recency', 'frequency', 'monetary']);
      const result = detectRFMColumns(metadata);

      expect(result.precomputedRFM?.recency).toBe('recency');
      expect(result.precomputedRFM?.frequency).toBe('frequency');
      expect(result.precomputedRFM?.monetary).toBe('monetary');
    });
  });

  describe('detectRFMColumns - Raw Orders', () => {
    it('should detect raw order columns', () => {
      const metadata = createTableMetadata(['customer_id', 'order_id', 'order_date', 'amount']);
      const result = detectRFMColumns(metadata);

      expect(result.customerId).toBe('customer_id');
      expect(result.orderId).toBe('order_id');
      expect(result.orderDate).toBe('order_date');
      expect(result.orderAmount).toBe('amount');
    });

    it('should detect order columns with alternative names', () => {
      const metadata = createTableMetadata(['user_id', 'transaction_id', 'created_at', 'total_amount']);
      const result = detectRFMColumns(metadata);

      expect(result.customerId).toBe('user_id');
      expect(result.orderId).toBe('transaction_id');
      expect(result.orderDate).toBe('created_at');
      expect(result.orderAmount).toBe('total_amount');
    });

    it('should work without order_id', () => {
      const metadata = createTableMetadata(['customer_id', 'order_date', 'amount']);
      const result = detectRFMColumns(metadata);

      expect(result.customerId).toBe('customer_id');
      expect(result.orderId).toBeNull();
      expect(result.orderDate).toBe('order_date');
      expect(result.orderAmount).toBe('amount');
    });
  });

  describe('validateRFMColumns', () => {
    it('should pass validation for pre-computed RFM', () => {
      const metadata = createTableMetadata(['customer_id', 'recency', 'frequency', 'monetary']);
      const result = detectRFMColumns(metadata);

      expect(() => validateRFMColumns(result)).not.toThrow();
    });

    it('should pass validation for complete raw order data', () => {
      const metadata = createTableMetadata(['customer_id', 'order_date', 'amount']);
      const result = detectRFMColumns(metadata);

      expect(() => validateRFMColumns(result)).not.toThrow();
    });

    it('should throw error when order_date is missing', () => {
      const metadata = createTableMetadata(['customer_id', 'order_id', 'amount']);
      const result = detectRFMColumns(metadata);

      expect(() => validateRFMColumns(result)).toThrow('Missing required columns');
    });

    it('should throw error when amount is missing', () => {
      const metadata = createTableMetadata(['customer_id', 'order_id', 'order_date']);
      const result = detectRFMColumns(metadata);

      expect(() => validateRFMColumns(result)).toThrow('Missing required columns');
    });
  });

  describe('detectRFMColumns - Edge Cases', () => {
    it('should handle case-insensitive matching', () => {
      const metadata = createTableMetadata(['CUSTOMER_ID', 'ORDER_DATE', 'AMOUNT']);
      const result = detectRFMColumns(metadata);

      expect(result.customerId).toBeDefined();
      expect(result.orderDate).toBeDefined();
      expect(result.orderAmount).toBeDefined();
    });

    it('should prefer pre-computed RFM when both formats present', () => {
      const metadata = createTableMetadata(['customer_id', 'order_date', 'amount', 'recency', 'frequency', 'monetary']);
      const result = detectRFMColumns(metadata);

      expect(result.precomputedRFM?.recency).toBe('recency');
      expect(result.precomputedRFM?.frequency).toBe('frequency');
      expect(result.precomputedRFM?.monetary).toBe('monetary');
    });
  });
});
