/**
 * @file columnInferService.test.ts
 * @description Unit tests for ColumnInferService - Column type inference
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { ColumnInferService } from '../columnInferService';
import { DuckDBService } from '../../duckDBService';
import type { ColumnProfile } from '../../../types/insight.types';

describe('ColumnInferService', () => {
  let columnInferService: ColumnInferService;

  beforeEach(() => {
    columnInferService = ColumnInferService.getInstance();
    // Ensure DuckDB service is initialized
    DuckDBService.getInstance();
  });

  describe('inferType', () => {
    test('should identify datetime columns', () => {
      const service = columnInferService as any;

      expect(service.inferType('TIMESTAMP', 100, 1000)).toBe('datetime');
      expect(service.inferType('DATE', 100, 1000)).toBe('datetime');
      expect(service.inferType('TIMESTAMP WITH TIME ZONE', 100, 1000)).toBe('datetime');
    });

    test('should identify numeric columns', () => {
      const service = columnInferService as any;

      expect(service.inferType('INTEGER', 1000, 1000)).toBe('numeric');
      expect(service.inferType('DOUBLE', 800, 1000)).toBe('numeric');
      expect(service.inferType('BIGINT', 500, 1000)).toBe('numeric');
    });

    test('should identify low-cardinality numeric as categorical', () => {
      const service = columnInferService as any;

      // Low absolute cardinality
      expect(service.inferType('INTEGER', 15, 10000)).toBe('categorical');

      // Low cardinality ratio (< 5%)
      expect(service.inferType('INTEGER', 30, 1000)).toBe('categorical');
    });

    test('should identify categorical string columns', () => {
      const service = columnInferService as any;

      expect(service.inferType('VARCHAR', 50, 1000)).toBe('categorical');
      expect(service.inferType('TEXT', 20, 1000)).toBe('categorical');
    });

    test('should identify text columns (high cardinality)', () => {
      const service = columnInferService as any;

      // High cardinality ratio (> 90%)
      expect(service.inferType('VARCHAR', 950, 1000)).toBe('text');
      expect(service.inferType('TEXT', 995, 1000)).toBe('text');
    });

    test('should default to text for unknown types', () => {
      const service = columnInferService as any;

      expect(service.inferType('BLOB', 100, 1000)).toBe('text');
      expect(service.inferType('UNKNOWN_TYPE', 50, 1000)).toBe('text');
    });
  });

  describe('matchSemanticType', () => {
    test('should match amount columns', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('amount')).toBe('amount');
      expect(service.matchSemanticType('total_price')).toBe('amount');
      expect(service.matchSemanticType('revenue')).toBe('amount');
      expect(service.matchSemanticType('sales')).toBe('amount');
      expect(service.matchSemanticType('金额')).toBe('amount');
      expect(service.matchSemanticType('价格')).toBe('amount');
    });

    test('should match time columns', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('created_at')).toBe('time');
      expect(service.matchSemanticType('updated_time')).toBe('time');
      expect(service.matchSemanticType('timestamp')).toBe('time');
      expect(service.matchSemanticType('日期')).toBe('time');
      expect(service.matchSemanticType('创建时间')).toBe('time');
    });

    test('should match status columns', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('status')).toBe('status');
      expect(service.matchSemanticType('order_state')).toBe('status');
      expect(service.matchSemanticType('stage')).toBe('status');
      expect(service.matchSemanticType('状态')).toBe('status');
    });

    test('should match category columns', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('category')).toBe('category');
      expect(service.matchSemanticType('product_group')).toBe('category');
      expect(service.matchSemanticType('department')).toBe('category');
      expect(service.matchSemanticType('region')).toBe('category');
      expect(service.matchSemanticType('分类')).toBe('category');
    });

    test('should match id columns', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('id')).toBe('id');
      expect(service.matchSemanticType('user_id')).toBe('id');
      expect(service.matchSemanticType('order_id')).toBe('id');
      expect(service.matchSemanticType('uuid')).toBe('id');
      expect(service.matchSemanticType('order_number')).toBe('id');
      expect(service.matchSemanticType('编号')).toBe('id');
    });

    test('should return null for non-matching columns', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('description')).toBeNull();
      expect(service.matchSemanticType('notes')).toBeNull();
      expect(service.matchSemanticType('random_column')).toBeNull();
    });

    test('should be case-insensitive for English patterns', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('AMOUNT')).toBe('amount');
      expect(service.matchSemanticType('Status')).toBe('status');
      expect(service.matchSemanticType('Category')).toBe('category');
    });
  });

  describe('sortColumnsByImportance', () => {
    test('should prioritize columns with semantic types', () => {
      const columns: ColumnProfile[] = [
        { name: 'col1', duckdbType: 'INTEGER', type: 'numeric', semanticType: null, cardinality: 1000, nullRate: 0 },
        { name: 'col2', duckdbType: 'VARCHAR', type: 'categorical', semanticType: 'status', cardinality: 5, nullRate: 0 },
        { name: 'col3', duckdbType: 'DOUBLE', type: 'numeric', semanticType: 'amount', cardinality: 800, nullRate: 0 },
      ];

      const sorted = columnInferService.sortColumnsByImportance(columns);

      // Semantic type columns should come first
      expect(sorted[0].semanticType).not.toBeNull();
      expect(sorted[1].semanticType).not.toBeNull();
      expect(sorted[2].semanticType).toBeNull();
    });

    test('should sort by cardinality within same semantic priority', () => {
      const columns: ColumnProfile[] = [
        { name: 'col1', duckdbType: 'DOUBLE', type: 'numeric', semanticType: 'amount', cardinality: 500, nullRate: 0 },
        { name: 'col2', duckdbType: 'DOUBLE', type: 'numeric', semanticType: 'amount', cardinality: 1000, nullRate: 0 },
        { name: 'col3', duckdbType: 'DOUBLE', type: 'numeric', semanticType: 'amount', cardinality: 200, nullRate: 0 },
      ];

      const sorted = columnInferService.sortColumnsByImportance(columns);

      // Higher cardinality = more important
      expect(sorted[0].cardinality).toBe(1000);
      expect(sorted[1].cardinality).toBe(500);
      expect(sorted[2].cardinality).toBe(200);
    });

    test('should not mutate original array', () => {
      const columns: ColumnProfile[] = [
        { name: 'col1', duckdbType: 'INTEGER', type: 'numeric', semanticType: null, cardinality: 100, nullRate: 0 },
        { name: 'col2', duckdbType: 'VARCHAR', type: 'categorical', semanticType: 'status', cardinality: 5, nullRate: 0 },
      ];

      const original = [...columns];
      columnInferService.sortColumnsByImportance(columns);

      expect(columns).toEqual(original);
    });
  });

  describe('buildCardinalityQuery', () => {
    test('should generate correct SQL for multiple columns', () => {
      const service = columnInferService as any;
      const columns = [
        { column_name: 'col1' },
        { column_name: 'col2' },
        { column_name: 'col3' },
      ];

      const sql = service.buildCardinalityQuery('test_table', columns);

      expect(sql).toContain('approx_count_distinct("col1")');
      expect(sql).toContain('approx_count_distinct("col2")');
      expect(sql).toContain('approx_count_distinct("col3")');
      expect(sql).toContain('FROM test_table');
    });

    test('should use aliases for result columns', () => {
      const service = columnInferService as any;
      const columns = [{ column_name: 'test_col' }];

      const sql = service.buildCardinalityQuery('test_table', columns);

      expect(sql).toContain('as "test_col_card"');
    });
  });

  describe('buildStatsQuery', () => {
    test('should generate statistics for numeric columns', () => {
      const service = columnInferService as any;
      const numericColumns = [
        { column_name: 'amount' },
        { column_name: 'price' },
      ];

      const sql = service.buildStatsQuery('test_table', numericColumns);

      expect(sql).toContain('MIN("amount")');
      expect(sql).toContain('MAX("amount")');
      expect(sql).toContain('AVG("amount")');
      expect(sql).toContain('MEDIAN("amount")');
      expect(sql).toContain('STDDEV("amount")');
      expect(sql).toContain('MIN("price")');
    });

    test('should return dummy query when no numeric columns', () => {
      const service = columnInferService as any;
      const sql = service.buildStatsQuery('test_table', []);

      expect(sql).toBe('SELECT 1');
    });
  });

  describe('buildNullRateQuery', () => {
    test('should generate null rate query for all columns', () => {
      const service = columnInferService as any;
      const columns = [
        { column_name: 'col1' },
        { column_name: 'col2' },
      ];

      const sql = service.buildNullRateQuery('test_table', columns);

      expect(sql).toContain('COUNT(*)');
      expect(sql).toContain('COUNT("col1")');
      expect(sql).toContain('COUNT("col2")');
      expect(sql).toContain('as "col1_null"');
      expect(sql).toContain('as "col2_null"');
    });
  });

  describe('isNumericType', () => {
    test('should identify all numeric DuckDB types', () => {
      const service = columnInferService as any;

      expect(service.isNumericType('INTEGER')).toBe(true);
      expect(service.isNumericType('BIGINT')).toBe(true);
      expect(service.isNumericType('SMALLINT')).toBe(true);
      expect(service.isNumericType('TINYINT')).toBe(true);
      expect(service.isNumericType('DOUBLE')).toBe(true);
      expect(service.isNumericType('FLOAT')).toBe(true);
      expect(service.isNumericType('DECIMAL')).toBe(true);
      expect(service.isNumericType('NUMERIC')).toBe(true);
      expect(service.isNumericType('REAL')).toBe(true);
      expect(service.isNumericType('HUGEINT')).toBe(true);
    });

    test('should reject non-numeric types', () => {
      const service = columnInferService as any;

      expect(service.isNumericType('VARCHAR')).toBe(false);
      expect(service.isNumericType('TEXT')).toBe(false);
      expect(service.isNumericType('DATE')).toBe(false);
      expect(service.isNumericType('TIMESTAMP')).toBe(false);
      expect(service.isNumericType('BOOLEAN')).toBe(false);
    });

    test('should be case-insensitive', () => {
      const service = columnInferService as any;

      expect(service.isNumericType('integer')).toBe(true);
      expect(service.isNumericType('Double')).toBe(true);
      expect(service.isNumericType('BIGINT')).toBe(true);
    });
  });

  describe('isValidColumnName', () => {
    test('should reject column names with double quotes', () => {
      const service = columnInferService as any;
      
      expect(service.isValidColumnName('"Today State"')).toBe(false);
      expect(service.isValidColumnName('Column with " quote')).toBe(false);
      expect(service.isValidColumnName('""')).toBe(false);
    });
    
    test('should reject column names with only whitespace', () => {
      const service = columnInferService as any;
      
      expect(service.isValidColumnName('   ')).toBe(false);
      expect(service.isValidColumnName('\t\n')).toBe(false);
      expect(service.isValidColumnName('')).toBe(false);
    });
    
    test('should reject column names with control characters', () => {
      const service = columnInferService as any;
      
      expect(service.isValidColumnName('column\x00name')).toBe(false);
      expect(service.isValidColumnName('column\x1Fname')).toBe(false);
    });
    
    test('should accept valid column names', () => {
      const service = columnInferService as any;
      
      expect(service.isValidColumnName('order_amount')).toBe(true);
      expect(service.isValidColumnName('订单金额')).toBe(true);
      expect(service.isValidColumnName('Order Amount (USD)')).toBe(true);
      expect(service.isValidColumnName('Column with spaces')).toBe(true);
    });
  });

  describe('sanitizeColumnName', () => {
    test('should remove double quotes from column names', () => {
      const service = columnInferService as any;

      expect(service.sanitizeColumnName('"column_name"')).toBe('column_name');
      expect(service.sanitizeColumnName('""double_quotes""')).toBe('double_quotes');
      expect(service.sanitizeColumnName('Today State" (Requires...)')).toBe('Today State (Requires...)');
    });

    test('should normalize multiple spaces to single space', () => {
      const service = columnInferService as any;

      expect(service.sanitizeColumnName('column   name')).toBe('column name');
      expect(service.sanitizeColumnName('test    column    name')).toBe('test column name');
      expect(service.sanitizeColumnName('a  b  c')).toBe('a b c');
    });

    test('should trim leading and trailing spaces', () => {
      const service = columnInferService as any;

      expect(service.sanitizeColumnName('  column_name  ')).toBe('column_name');
      expect(service.sanitizeColumnName('\tcolumn_name\t')).toBe('column_name');
      expect(service.sanitizeColumnName(' test ')).toBe('test');
    });

    test('should handle complex special character combinations', () => {
      const service = columnInferService as any;

      const complexName = 'Capability Status Today (Y/N) （Requies Local Team Validation）';
      expect(service.sanitizeColumnName(complexName)).toBe(complexName);

      const withQuotes = '"Today State To Be Expanded " （Requires Local Team Input）';
      // Note: Multiple spaces normalized to single space
      expect(service.sanitizeColumnName(withQuotes)).toBe('Today State To Be Expanded （Requires Local Team Input）');
    });

    test('should return empty string for invalid inputs', () => {
      const service = columnInferService as any;

      expect(service.sanitizeColumnName('""')).toBe('');
      expect(service.sanitizeColumnName('   ')).toBe('');
      expect(service.sanitizeColumnName('\t\n')).toBe('');
    });
  });

  describe('inferType - phone number filtering', () => {
    test('should filter out phone number columns as text', () => {
      const service = columnInferService as any;

      // English patterns
      expect(service.inferType('BIGINT', 1000, 10000, 'phone')).toBe('text');
      expect(service.inferType('VARCHAR', 500, 1000, 'mobile')).toBe('text');
      expect(service.inferType('INTEGER', 800, 1000, 'telephone')).toBe('text');
      expect(service.inferType('BIGINT', 1200, 5000, 'user_phone')).toBe('text');

      // Chinese patterns
      expect(service.inferType('BIGINT', 1000, 10000, '用户手机号')).toBe('text');
      expect(service.inferType('VARCHAR', 500, 1000, '联系电话')).toBe('text');
      expect(service.inferType('INTEGER', 800, 1000, '收货人手机')).toBe('text');
      expect(service.inferType('VARCHAR', 300, 1000, '联系方式')).toBe('text');
    });

    test('should filter out ID columns as text', () => {
      const service = columnInferService as any;

      // English patterns
      expect(service.inferType('BIGINT', 10000, 10000, 'user_id')).toBe('text');
      expect(service.inferType('INTEGER', 5000, 5000, 'order_id')).toBe('text');
      expect(service.inferType('BIGINT', 8000, 10000, 'customer_id')).toBe('text');
      expect(service.inferType('VARCHAR', 1000, 1000, 'uuid')).toBe('text');

      // Chinese patterns
      expect(service.inferType('BIGINT', 10000, 10000, '用户ID')).toBe('text');
      expect(service.inferType('INTEGER', 5000, 5000, '会员ID')).toBe('text');
      expect(service.inferType('VARCHAR', 3000, 5000, '订单编号')).toBe('text');
    });

    test('should allow normal numeric columns', () => {
      const service = columnInferService as any;

      // Amount columns should remain numeric
      expect(service.inferType('DOUBLE', 1000, 10000, 'amount')).toBe('numeric');
      expect(service.inferType('DECIMAL', 800, 5000, '实付金额')).toBe('numeric');
      expect(service.inferType('INTEGER', 500, 2000, 'quantity')).toBe('numeric');
    });
  });

  describe('matchSemanticType - new patterns', () => {
    test('should match source and channel columns', () => {
      const service = columnInferService as any;

      // Source patterns
      expect(service.matchSemanticType('source')).toBe('category');
      expect(service.matchSemanticType('traffic_source')).toBe('category');
      expect(service.matchSemanticType('order_origin')).toBe('category');
      expect(service.matchSemanticType('来源')).toBe('category');
      expect(service.matchSemanticType('订单来源')).toBe('category');

      // Channel patterns
      expect(service.matchSemanticType('channel')).toBe('category');
      // Note: 'sales_channel' matches both 'sales' (amount) and 'channel' (category)
      // With priority order (status > category > amount), category wins
      expect(service.matchSemanticType('sales_channel')).toBe('category');
      expect(service.matchSemanticType('marketing_channel')).toBe('category');
      expect(service.matchSemanticType('渠道')).toBe('category');
      expect(service.matchSemanticType('推广渠道')).toBe('category');

      // Platform patterns
      expect(service.matchSemanticType('platform')).toBe('category');
      expect(service.matchSemanticType('平台')).toBe('category');
    });

    test('should match rate and ratio in amount semantic type', () => {
      const service = columnInferService as any;

      expect(service.matchSemanticType('exchange_rate')).toBe('amount');
      expect(service.matchSemanticType('tax_rate')).toBe('amount');
      expect(service.matchSemanticType('conversion_ratio')).toBe('amount');
      expect(service.matchSemanticType('percent')).toBe('amount');
      expect(service.matchSemanticType('汇率')).toBe('amount');
      expect(service.matchSemanticType('税率')).toBe('amount');
      expect(service.matchSemanticType('利率')).toBe('amount');
      expect(service.matchSemanticType('比率')).toBe('amount');
    });
  });

  describe('buildCardinalityQuery - sanitization', () => {
    test('should sanitize column names in aliases', () => {
      const service = columnInferService as any;
      const columns = [
        { column_name: '"Today State"' },
        { column_name: 'Normal Column  ' },
      ];

      const sql = service.buildCardinalityQuery('test_table', columns);

      // Original column names in queries
      expect(sql).toContain('approx_count_distinct(""Today State"")');
      expect(sql).toContain('approx_count_distinct("Normal Column  ")');
      
      // Sanitized names in aliases
      expect(sql).toContain('as "Today State_card"');
      expect(sql).toContain('as "Normal Column_card"');
    });
  });

  describe('buildStatsQuery - sanitization', () => {
    test('should sanitize column names in result aliases', () => {
      const service = columnInferService as any;
      const numericColumns = [
        { column_name: '"Amount Value"' },
        { column_name: 'Price   Total' },
      ];

      const sql = service.buildStatsQuery('test_table', numericColumns);

      // Sanitized aliases
      expect(sql).toContain('as "Amount Value_min"');
      expect(sql).toContain('as "Amount Value_max"');
      expect(sql).toContain('as "Price Total_min"');
      expect(sql).toContain('as "Price Total_max"');
    });

    test('should include percentile calculations', () => {
      const service = columnInferService as any;
      const numericColumns = [{ column_name: 'amount' }];

      const sql = service.buildStatsQuery('test_table', numericColumns);

      expect(sql).toContain('APPROX_QUANTILE("amount", 0.5)');
      expect(sql).toContain('APPROX_QUANTILE("amount", 0.8)');
      expect(sql).toContain('APPROX_QUANTILE("amount", 0.99)');
      expect(sql).toContain('as "amount_p50"');
      expect(sql).toContain('as "amount_p80"');
      expect(sql).toContain('as "amount_p99"');
    });
  });

  describe('inferColumns - column filtering', () => {
    test('should filter out columns with invalid characters and no semantic type', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: 'order_amount', column_type: 'DOUBLE' },                    // Valid
              { column_name: '"Today State"', column_type: 'VARCHAR' },                  // Invalid: has quotes
              { column_name: 'Status with " quote', column_type: 'VARCHAR' },            // Invalid: has quotes
              { column_name: 'order_status', column_type: 'VARCHAR' },                   // Valid
              { column_name: 'random_column', column_type: 'INTEGER' },                  // Invalid: no semantic type
            ],
            schema: [],
          };
        }
        // Return dummy data for other queries
        return { data: [{}], schema: [] };
      };

      const profiles = await columnInferService.inferColumns('test_table', mockExecuteQuery);

      // Should only have 2 valid columns (no quotes + has semantic type)
      expect(profiles.length).toBe(2);
      expect(profiles[0].name).toBe('order_amount');
      expect(profiles[1].name).toBe('order_status');
    });
    
    test('should return empty array when all columns have invalid characters', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: '"Column1"', column_type: 'INTEGER' },
              { column_name: 'Column with " quote', column_type: 'VARCHAR' },
              { column_name: '   ', column_type: 'TEXT' },
            ],
            schema: [],
          };
        }
        return { data: [{}], schema: [] };
      };

      const profiles = await columnInferService.inferColumns('test_table', mockExecuteQuery);

      expect(profiles.length).toBe(0);
    });
    
    test('should return empty array when no columns have semantic types', async () => {
      const mockExecuteQuery = async (sql: string) => {
        if (sql.startsWith('DESCRIBE')) {
          return {
            data: [
              { column_name: 'col1', column_type: 'INTEGER' },
              { column_name: 'col2', column_type: 'VARCHAR' },
            ],
            schema: [],
          };
        }
        return { data: [{}], schema: [] };
      };

      const profiles = await columnInferService.inferColumns('test_table', mockExecuteQuery);

      expect(profiles.length).toBe(0);
    });
  });
});

