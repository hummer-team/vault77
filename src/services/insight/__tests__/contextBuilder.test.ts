/**
 * Unit tests for contextBuilder.ts
 */

import { describe, it, expect, mock } from 'bun:test';
import { buildInsightContext, __testing__, COLUMN_PATTERNS } from '../contextBuilder';

const { mapFeatureDefinitions, matchSemanticType } = __testing__;

describe('contextBuilder', () => {
  describe('COLUMN_PATTERNS', () => {
    it('should export column patterns', () => {
      expect(COLUMN_PATTERNS).toBeDefined();
      expect(COLUMN_PATTERNS.amount).toBeDefined();
      expect(COLUMN_PATTERNS.quantity).toBeDefined();
      expect(COLUMN_PATTERNS.time).toBeDefined();
    });
  });

  describe('matchSemanticType', () => {
    it('should match amount patterns', () => {
      expect(matchSemanticType('total_amount')).toBe('amount');
      expect(matchSemanticType('order_price')).toBe('amount');
      expect(matchSemanticType('金额')).toBe('amount');
      expect(matchSemanticType('价格')).toBe('amount');
    });

    it('should match quantity patterns', () => {
      expect(matchSemanticType('quantity')).toBe('quantity');
      expect(matchSemanticType('order_qty')).toBe('quantity');
      expect(matchSemanticType('数量')).toBe('quantity');
      expect(matchSemanticType('item_count')).toBe('quantity');
    });

    it('should match time patterns', () => {
      expect(matchSemanticType('created_at')).toBe('time');
      expect(matchSemanticType('order_date')).toBe('time');
      expect(matchSemanticType('timestamp')).toBe('time');
      expect(matchSemanticType('创建时间')).toBe('time');
    });

    it('should match status patterns', () => {
      expect(matchSemanticType('order_status')).toBe('status');
      expect(matchSemanticType('state')).toBe('status');
      expect(matchSemanticType('状态')).toBe('status');
    });

    it('should match category patterns', () => {
      expect(matchSemanticType('product_category')).toBe('category');
      expect(matchSemanticType('region')).toBe('category');
      expect(matchSemanticType('类别')).toBe('category');
    });

    it('should match customer patterns', () => {
      expect(matchSemanticType('customer_id')).toBe('customer');
      expect(matchSemanticType('user_name')).toBe('customer');
      expect(matchSemanticType('客户')).toBe('customer');
    });

    it('should match product patterns', () => {
      expect(matchSemanticType('product_id')).toBe('product');
      expect(matchSemanticType('sku')).toBe('product');
      expect(matchSemanticType('商品')).toBe('product');
    });

    it('should match address patterns', () => {
      expect(matchSemanticType('shipping_address')).toBe('address');
      expect(matchSemanticType('city')).toBe('address');
      expect(matchSemanticType('地址')).toBe('address');
    });

    it('should match id patterns', () => {
      expect(matchSemanticType('order_id')).toBe('id');
      expect(matchSemanticType('uuid')).toBe('id');
      expect(matchSemanticType('编号')).toBe('id');
    });

    it('should return null for unmatched columns', () => {
      expect(matchSemanticType('unknown_column')).toBeNull();
      expect(matchSemanticType('random_field')).toBeNull();
    });
  });

  describe('mapFeatureDefinitions', () => {
    it('should map feature columns to descriptions', () => {
      const features = ['total_amount', 'order_qty', 'order_status'];
      const definitions = mapFeatureDefinitions(features);

      expect(definitions['total_amount']).toBe('金额相关字段（单位：元）');
      expect(definitions['order_qty']).toBe('数量相关字段');
      expect(definitions['order_status']).toBe('状态标识字段');
    });

    it('should use fallback for unmatched columns', () => {
      const features = ['unknown_field'];
      const definitions = mapFeatureDefinitions(features);

      expect(definitions['unknown_field']).toBe('数值特征: unknown_field');
    });

    it('should handle mixed matched and unmatched columns', () => {
      const features = ['total_amount', 'mystery_column', '数量'];
      const definitions = mapFeatureDefinitions(features);

      expect(definitions['total_amount']).toBe('金额相关字段（单位：元）');
      expect(definitions['mystery_column']).toBe('数值特征: mystery_column');
      expect(definitions['数量']).toBe('数量相关字段');
    });

    it('should handle empty array', () => {
      const definitions = mapFeatureDefinitions([]);
      expect(definitions).toEqual({});
    });

    it('should handle Chinese column names', () => {
      const features = ['金额', '数量', '状态'];
      const definitions = mapFeatureDefinitions(features);

      expect(definitions['金额']).toBe('金额相关字段（单位：元）');
      expect(definitions['数量']).toBe('数量相关字段');
      expect(definitions['状态']).toBe('状态标识字段');
    });
  });

  describe('buildInsightContext', () => {
    it('should build complete insight context', async () => {
      // Mock DuckDB
      const mockDB = {
        connect: async () => ({
          query: async (sql: string) => ({
            toArray: () => {
              if (sql.includes('COUNT(*)')) {
                return [{ toJSON: () => ({ row_count: 1000 }) }];
              }
              if (sql.includes('information_schema.columns')) {
                return [
                  { toJSON: () => ({ column_name: 'total_amount', data_type: 'DOUBLE', is_nullable: 'NO' }) },
                  { toJSON: () => ({ column_name: 'order_qty', data_type: 'INTEGER', is_nullable: 'NO' }) },
                ];
              }
              return [];
            },
          }),
          close: async () => {},
        }),
      } as any;

      const context = await buildInsightContext(mockDB, 'test_orders');

      expect(context.algorithmType).toBe('anomaly');
      expect(context.businessDomain).toBe('ecommerce');
      expect(context.tableMetadata.tableName).toBe('test_orders');
      expect(context.tableMetadata.rowCount).toBe(1000);
      expect(context.tableMetadata.columnCount).toBe(2);
      expect(Object.keys(context.featureDefinitions).length).toBeGreaterThan(0);
    });

    it('should handle empty table', async () => {
      const mockDB = {
        connect: async () => ({
          query: async (sql: string) => ({
            toArray: () => {
              if (sql.includes('COUNT(*)')) {
                return [{ toJSON: () => ({ row_count: 0 }) }];
              }
              return [{ toJSON: () => ({ column_name: 'id', data_type: 'INTEGER', is_nullable: 'NO' }) }];
            },
          }),
          close: async () => {},
        }),
      } as any;

      const context = await buildInsightContext(mockDB, 'empty_table');

      expect(context.tableMetadata.rowCount).toBe(0);
    });

    it('should correctly map column metadata', async () => {
      const mockDB = {
        connect: async () => ({
          query: async (sql: string) => ({
            toArray: () => {
              if (sql.includes('COUNT(*)')) {
                return [{ toJSON: () => ({ row_count: 500 }) }];
              }
              return [
                { toJSON: () => ({ column_name: 'order_id', data_type: 'VARCHAR', is_nullable: 'NO' }) },
                { toJSON: () => ({ column_name: 'total_amount', data_type: 'DOUBLE', is_nullable: 'YES' }) },
              ];
            },
          }),
          close: async () => {},
        }),
      } as any;

      const context = await buildInsightContext(mockDB, 'test_table');

      expect(context.tableMetadata.columns).toHaveLength(2);
      expect(context.tableMetadata.columns[0].name).toBe('order_id');
      expect(context.tableMetadata.columns[0].type).toBe('VARCHAR');
      expect(context.tableMetadata.columns[1].nullable).toBe(true);
    });

    it('should handle query errors gracefully', async () => {
      const mockDB = {
        connect: async () => ({
          query: async () => {
            throw new Error('Query failed');
          },
          close: async () => {},
        }),
      } as any;

      await expect(buildInsightContext(mockDB, 'bad_table')).rejects.toThrow();
    });
  });
        'orders',
        ['amount'],
        mockExecuteQuery
      );

      expect(context.tableMetadata.columns[0]).toEqual({
        name: 'id',
        type: 'BIGINT',
        nullable: false,
      });
      expect(context.tableMetadata.columns[1]).toEqual({
        name: 'amount',
        type: 'DECIMAL',
        nullable: true,
      });
    });

    it('should handle query errors gracefully', async () => {
      const mockExecuteQuery = mock(async (sql: string) => {
        if (sql.includes('COUNT(*)')) {
          return { data: [] }; // Missing row_count
        }
        if (sql.includes('information_schema')) {
          return { data: [] };
        }
        return { data: [] };
      });

      const context = await buildInsightContext(
        'test_table',
        ['col1'],
        mockExecuteQuery
      );

      expect(context.tableMetadata.rowCount).toBe(0); // Should default to 0
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in column names', () => {
      const features = ['col_with_underscore', 'col-with-dash', 'col.with.dot'];
      const definitions = mapFeatureDefinitions(features);

      expect(definitions).toBeDefined();
      expect(Object.keys(definitions)).toHaveLength(3);
    });

    it('should handle very long column names', () => {
      const longName = 'a'.repeat(200);
      const definitions = mapFeatureDefinitions([longName]);

      expect(definitions[longName]).toBeDefined();
    });

    it('should handle unicode characters', () => {
      const features = ['订单金额', '产品数量', 'état'];
      const definitions = mapFeatureDefinitions(features);

      expect(definitions['订单金额']).toBe('金额相关字段（单位：元）');
      expect(definitions['产品数量']).toBe('数量相关字段');
    });
  });
});
