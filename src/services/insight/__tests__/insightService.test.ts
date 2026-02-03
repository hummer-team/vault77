/**
 * @file insightService.test.ts
 * @description Unit tests for InsightService - Configuration and filtering
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { InsightService } from '../insightService';
import type { ColumnProfile } from '../../../types/insight.types';

describe('InsightService', () => {
  let insightService: InsightService;

  beforeEach(() => {
    insightService = InsightService.getInstance();
  });

  describe('buildConfig - column filtering', () => {
    test('should return null when no valid columns found', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: '""', column_type: 'VARCHAR' },
              { column_name: '   ', column_type: 'TEXT' },
            ],
            schema: [],
          };
        }
        return { data: [{ total: 1000 }], schema: [] };
      };

      const config = await insightService.buildConfig('test_table', mockExecuteQuery);

      expect(config).toBeNull();
    });

    test('should return null when no amount/status/category columns found', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: 'description', column_type: 'VARCHAR' },
              { column_name: 'notes', column_type: 'TEXT' },
              { column_name: 'user_id', column_type: 'BIGINT' },
            ],
            schema: [],
          };
        }
        if (sql.includes('COUNT(*)')) {
          return { data: [{ total: 1000 }], schema: [] };
        }
        // Cardinality, stats, null rate
        return { 
          data: [{ 
            'description_card': 950, 
            'notes_card': 980, 
            'user_id_card': 1000,
            'description_null': 0,
            'notes_null': 0,
            'user_id_null': 0,
          }], 
          schema: [] 
        };
      };

      const config = await insightService.buildConfig('test_table', mockExecuteQuery);

      // Should return null because no amount/status/category columns
      expect(config).toBeNull();
    });

    test('should return valid config when amount columns exist', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: 'total_amount', column_type: 'DOUBLE' },
              { column_name: 'price', column_type: 'DECIMAL' },
              { column_name: 'description', column_type: 'VARCHAR' },
            ],
            schema: [],
          };
        }
        if (sql.includes('COUNT(*)')) {
          return { data: [{ total: 5000 }], schema: [] };
        }
        if (sql.includes('MIN(')) {
          return {
            data: [{
              'total_amount_min': 10,
              'total_amount_max': 10000,
              'total_amount_mean': 500,
              'total_amount_median': 450,
              'total_amount_stddev': 200,
              'total_amount_p50': 450,
              'total_amount_p80': 800,
              'total_amount_p99': 5000,
              'price_min': 5,
              'price_max': 2000,
              'price_mean': 100,
              'price_median': 80,
              'price_stddev': 50,
              'price_p50': 80,
              'price_p80': 150,
              'price_p99': 500,
            }],
            schema: [],
          };
        }
        // Cardinality and null rate
        return {
          data: [{
            'total_amount_card': 1000,
            'price_card': 800,
            'description_card': 950,
            'total_amount_null': 0.05,
            'price_null': 0.02,
            'description_null': 0.1,
          }],
          schema: [],
        };
      };

      const config = await insightService.buildConfig('test_table', mockExecuteQuery);

      expect(config).not.toBeNull();
      expect(config?.numericColumns.length).toBeGreaterThan(0);
      expect(config?.rowCount).toBe(5000);
      expect(config?.enableSampling).toBe(false); // 5000 < 10000
    });

    test('should return valid config when status columns exist', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: 'order_status', column_type: 'VARCHAR' },
              { column_name: 'payment_state', column_type: 'VARCHAR' },
            ],
            schema: [],
          };
        }
        if (sql.includes('COUNT(*)')) {
          return { data: [{ total: 2000 }], schema: [] };
        }
        return {
          data: [{
            'order_status_card': 5,
            'payment_state_card': 3,
            'order_status_null': 0,
            'payment_state_null': 0,
          }],
          schema: [],
        };
      };

      const config = await insightService.buildConfig('test_table', mockExecuteQuery);

      expect(config).not.toBeNull();
      expect(config?.statusColumns.length).toBeGreaterThan(0);
    });

    test('should return valid config when category columns exist', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: 'product_category', column_type: 'VARCHAR' },
              { column_name: 'region', column_type: 'VARCHAR' },
              { column_name: '来源', column_type: 'VARCHAR' },
              { column_name: '渠道', column_type: 'VARCHAR' },
            ],
            schema: [],
          };
        }
        if (sql.includes('COUNT(*)')) {
          return { data: [{ total: 3000 }], schema: [] };
        }
        return {
          data: [{
            'product_category_card': 20,
            'region_card': 15,
            '来源_card': 10,
            '渠道_card': 8,
            'product_category_null': 0,
            'region_null': 0,
            '来源_null': 0,
            '渠道_null': 0,
          }],
          schema: [],
        };
      };

      const config = await insightService.buildConfig('test_table', mockExecuteQuery);

      expect(config).not.toBeNull();
      expect(config?.categoryColumns.length).toBeGreaterThan(0);
      // Should match source and channel columns
      const categoryNames = config?.categoryColumns.map(c => c.name) || [];
      expect(categoryNames).toContain('来源');
      expect(categoryNames).toContain('渠道');
    });

    test('should enable sampling for large datasets', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: 'amount', column_type: 'DOUBLE' },
            ],
            schema: [],
          };
        }
        if (sql.includes('COUNT(*)')) {
          return { data: [{ total: 50000 }], schema: [] };
        }
        if (sql.includes('MIN(')) {
          return {
            data: [{
              'amount_min': 1,
              'amount_max': 10000,
              'amount_mean': 500,
              'amount_median': 400,
              'amount_stddev': 300,
              'amount_p50': 400,
              'amount_p80': 800,
              'amount_p99': 5000,
            }],
            schema: [],
          };
        }
        return {
          data: [{
            'amount_card': 5000,
            'amount_null': 0.01,
          }],
          schema: [],
        };
      };

      const config = await insightService.buildConfig('test_table', mockExecuteQuery);

      expect(config).not.toBeNull();
      expect(config?.enableSampling).toBe(true);
      expect(config?.samplingRate).toBe(0.75);
    });
  });

  describe('transformSummaryResult - filtering', () => {
    test('should filter out text and datetime columns', () => {
      const columns: ColumnProfile[] = [
        { name: 'amount', duckdbType: 'DOUBLE', type: 'numeric', semanticType: 'amount', cardinality: 1000, nullRate: 0 },
        { name: 'description', duckdbType: 'VARCHAR', type: 'text', semanticType: null, cardinality: 950, nullRate: 0 },
        { name: 'created_at', duckdbType: 'TIMESTAMP', type: 'datetime', semanticType: 'time', cardinality: 5000, nullRate: 0 },
        { name: 'price', duckdbType: 'DECIMAL', type: 'numeric', semanticType: 'amount', cardinality: 800, nullRate: 0 },
      ];

      const result = insightService.transformSummaryResult(columns);

      // Should only have numeric amount columns
      expect(result.columns.length).toBe(2);
      expect(result.columns[0].name).toBe('amount');
      expect(result.columns[1].name).toBe('price');
    });

    test('should filter out columns with exclude keywords', () => {
      const columns: ColumnProfile[] = [
        { name: 'total_amount', duckdbType: 'DOUBLE', type: 'numeric', semanticType: 'amount', cardinality: 1000, nullRate: 0 },
        { name: 'isActive', duckdbType: 'INTEGER', type: 'numeric', semanticType: null, cardinality: 2, nullRate: 0 },
        { name: '是否有效', duckdbType: 'INTEGER', type: 'numeric', semanticType: null, cardinality: 2, nullRate: 0 },
        { name: '用户手机号', duckdbType: 'BIGINT', type: 'numeric', semanticType: null, cardinality: 5000, nullRate: 0 },
        { name: 'order_status', duckdbType: 'VARCHAR', type: 'categorical', semanticType: 'status', cardinality: 5, nullRate: 0 },
        { name: 'tax_rate', duckdbType: 'DOUBLE', type: 'numeric', semanticType: 'amount', cardinality: 50, nullRate: 0 },
      ];

      const result = insightService.transformSummaryResult(columns);

      // Should only have amount columns, excluding isActive, 是否有效, phone, status
      expect(result.columns.length).toBe(2);
      expect(result.columns[0].name).toBe('total_amount');
      expect(result.columns[1].name).toBe('tax_rate');
    });

    test('should return empty array when no valid amount columns', () => {
      const columns: ColumnProfile[] = [
        { name: 'user_id', duckdbType: 'BIGINT', type: 'numeric', semanticType: 'id', cardinality: 10000, nullRate: 0 },
        { name: 'description', duckdbType: 'VARCHAR', type: 'text', semanticType: null, cardinality: 950, nullRate: 0 },
        { name: 'order_status', duckdbType: 'VARCHAR', type: 'categorical', semanticType: 'status', cardinality: 5, nullRate: 0 },
      ];

      const result = insightService.transformSummaryResult(columns);

      expect(result.columns.length).toBe(0);
    });
  });
});
