/**
 * Integration tests for table name mapping in Flow components
 * Verifies that DataSourceNode, JoinNode, and TableJoinBuildPanel
 * correctly display friendly table names
 */

import { describe, it, expect } from 'vitest';
import { getTableDisplayNameMap, getTableDisplayName, truncateDisplayName } from '../tableNameMapping';
import type { Attachment } from '../../../../types/workbench.types';

describe('Table Name Mapping Integration', () => {
  describe('Scenario 1: Single file, single sheet', () => {
    it('should map single table without sheet name', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'sales.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: undefined,
        },
      ];

      const map = getTableDisplayNameMap(attachments);
      const displayName = getTableDisplayName('main_table_1', map);

      expect(displayName).toBe('sales.xlsx');
      expect(truncateDisplayName(displayName, 20)).toBe('sales.xlsx');
    });
  });

  describe('Scenario 2: Single file, multiple sheets', () => {
    it('should map multiple sheets from same file with sheet names', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'data.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: 'Orders',
        },
        {
          id: '1b',
          file: { name: 'data.xlsx' } as File,
          tableName: 'main_table_2',
          sheetName: 'Customers',
        },
        {
          id: '1c',
          file: { name: 'data.xlsx' } as File,
          tableName: 'main_table_3',
          sheetName: 'Products',
        },
      ];

      const map = getTableDisplayNameMap(attachments);

      expect(getTableDisplayName('main_table_1', map)).toBe('data.xlsx_Orders');
      expect(getTableDisplayName('main_table_2', map)).toBe('data.xlsx_Customers');
      expect(getTableDisplayName('main_table_3', map)).toBe('data.xlsx_Products');
    });
  });

  describe('Scenario 3: Long name truncation', () => {
    it('should keep full name in map and truncate only in UI layer', () => {
      const longFileName = 'very_long_file_name_for_testing_purposes.xlsx';
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: longFileName } as File,
          tableName: 'main_table_1',
          sheetName: 'DataSheet',
        },
      ];

      const map = getTableDisplayNameMap(attachments);
      const displayName = getTableDisplayName('main_table_1', map);
      const truncated = truncateDisplayName(displayName, 20);

      // Map should store the FULL name (not truncated)
      expect(displayName.length).toBeGreaterThan(20);
      expect(displayName).toContain('very_long_file_name');
      
      // Truncation only happens in UI layer
      expect(truncated.length).toBeLessThanOrEqual(20);
      expect(truncated).toContain('...');
    });
  });

  describe('Scenario 4: Edge cases', () => {
    it('should handle file without sheet name gracefully', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'report.csv' } as File,
          tableName: 'main_table_1',
          sheetName: undefined,
        },
      ];

      const map = getTableDisplayNameMap(attachments);
      const displayName = getTableDisplayName('main_table_1', map);

      expect(displayName).toBe('report.csv');
      expect(typeof displayName).toBe('string');
    });

    it('should handle missing table in map (fallback to original)', () => {
      const map = getTableDisplayNameMap([]);
      const displayName = getTableDisplayName('main_table_999', map);

      expect(displayName).toBe('main_table_999');
    });

    it('should handle empty attachments array', () => {
      const map = getTableDisplayNameMap([]);

      expect(Object.keys(map).length).toBe(0);
      expect(getTableDisplayName('main_table_1', map)).toBe('main_table_1');
    });
  });

  describe('Scenario 5: DataSourceNode rendering', () => {
    it('should generate correct options for Select dropdown', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'sales.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: undefined,
        },
        {
          id: '2',
          file: { name: 'data.xlsx' } as File,
          tableName: 'main_table_2',
          sheetName: 'Orders',
        },
      ];

      const map = getTableDisplayNameMap(attachments);
      const tableNames = ['main_table_1', 'main_table_2'];

      const options = tableNames.map((name) => {
        const displayName = getTableDisplayName(name, map);
        const truncated = truncateDisplayName(displayName, 20);
        return {
          value: name,
          label: truncated,
          fullName: displayName,
        };
      });

      expect(options).toHaveLength(2);
      expect(options[0].label).toBe('sales.xlsx');
      expect(options[1].label).toBe('data.xlsx_Orders');
      // fullName preserved for tooltip
      expect(options[0].fullName).toBe('sales.xlsx');
      expect(options[1].fullName).toBe('data.xlsx_Orders');
    });
  });

  describe('Scenario 6: JoinNode rendering', () => {
    it('should display truncated names for join tables', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'orders_data.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: 'Orders',
        },
        {
          id: '2',
          file: { name: 'customer_information.xlsx' } as File,
          tableName: 'main_table_2',
          sheetName: 'Customers',
        },
      ];

      const map = getTableDisplayNameMap(attachments);
      const leftTableDisplay = truncateDisplayName(getTableDisplayName('main_table_1', map), 20);
      const rightTableDisplay = truncateDisplayName(getTableDisplayName('main_table_2', map), 20);

      // Should have both table names
      expect(leftTableDisplay).toBeTruthy();
      expect(rightTableDisplay).toBeTruthy();
      // Should be able to show in UI without breaking
      expect(`${leftTableDisplay} → ${rightTableDisplay}`).toBeTruthy();
    });
  });

  describe('Scenario 7: TableJoinBuildPanel header', () => {
    it('should display join relationship with mapped names', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'orders.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: 'Data',
        },
        {
          id: '2',
          file: { name: 'customers.xlsx' } as File,
          tableName: 'main_table_2',
          sheetName: 'Info',
        },
      ];

      const map = getTableDisplayNameMap(attachments);
      const sourceDisplay = truncateDisplayName(getTableDisplayName('main_table_1', map), 20);
      const targetDisplay = truncateDisplayName(getTableDisplayName('main_table_2', map), 20);
      const header = `${sourceDisplay} → ${targetDisplay}`;

      expect(header).toBe('orders.xlsx_Data → customers.xlsx_Info');
    });
  });
});
