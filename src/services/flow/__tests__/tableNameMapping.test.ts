import { describe, it, expect } from 'vitest';
import {
  getTableDisplayNameMap,
  getTableDisplayName,
  truncateDisplayName,
  getFullTableDisplayName,
} from '../tableNameMapping';
import type { Attachment } from '../../../types/workbench.types';

describe('tableNameMapping', () => {
  describe('getTableDisplayNameMap', () => {
    it('should map single table without sheet name', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'data.csv' } as File,
          tableName: 'main_table_1',
          status: 'success',
        },
      ];
      const map = getTableDisplayNameMap(attachments);
      expect(map['main_table_1']).toBe('data.csv');
    });

    it('should map table with sheet name', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'sales.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: 'Sheet1',
          status: 'success',
        },
      ];
      const map = getTableDisplayNameMap(attachments);
      expect(map['main_table_1']).toBe('sales.xlsx_Sheet1');
    });

    it('should map multiple sheets from same file', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'data.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: 'Sheet1',
          status: 'success',
        },
        {
          id: '2',
          file: { name: 'data.xlsx' } as File,
          tableName: 'main_table_2',
          sheetName: 'Sheet2',
          status: 'success',
        },
      ];
      const map = getTableDisplayNameMap(attachments);
      expect(map['main_table_1']).toBe('data.xlsx_Sheet1');
      expect(map['main_table_2']).toBe('data.xlsx_Sheet2');
    });

    it('should keep long file names in full (truncation in UI layer)', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'this_is_a_very_long_file_name.xlsx' } as File,
          tableName: 'main_table_1',
          status: 'success',
        },
      ];
      const map = getTableDisplayNameMap(attachments);
      // Map stores full name, no truncation here
      expect(map['main_table_1']).toBe('this_is_a_very_long_file_name.xlsx');
      expect(map['main_table_1'].length).toBeGreaterThan(20);
    });

    it('should keep combined filename_sheet in full (truncation in UI layer)', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: 'very_long_name.xlsx' } as File,
          tableName: 'main_table_1',
          sheetName: 'LongSheetName',
          status: 'success',
        },
      ];
      const map = getTableDisplayNameMap(attachments);
      // Map stores full combined name, no truncation here
      const fullName = map['main_table_1'];
      expect(fullName).toBe('very_long_name.xlsx_LongSheetName');
      expect(fullName.length).toBeGreaterThan(20);
      // Truncation only happens when calling truncateDisplayName UI layer
      expect(truncateDisplayName(fullName, 20).length).toBeLessThanOrEqual(20);
      expect(truncateDisplayName(fullName, 20)).toContain('...');
    });

    it('should handle empty attachments', () => {
      const map = getTableDisplayNameMap([]);
      expect(map).toEqual({});
    });

    it('should handle attachment without file name', () => {
      const attachments: Attachment[] = [
        {
          id: '1',
          file: { name: '' } as File,
          tableName: 'main_table_1',
          status: 'success',
        },
      ];
      const map = getTableDisplayNameMap(attachments);
      expect(map['main_table_1']).toBe('unknown');
    });
  });

  describe('truncateDisplayName', () => {
    it('should not truncate names under limit', () => {
      const result = truncateDisplayName('short.xlsx');
      expect(result).toBe('short.xlsx');
    });

    it('should truncate names exceeding limit', () => {
      const result = truncateDisplayName('this_is_a_very_long_name.xlsx');
      expect(result).toBe('this_is_a_very_lo...');
      expect(result.length).toBe(20);
    });

    it('should respect custom max length', () => {
      const result = truncateDisplayName('this_is_long', 8);
      expect(result).toBe('this_...');
      expect(result.length).toBe(8);
    });

    it('should handle exact length boundary', () => {
      const name = 'x'.repeat(20);
      const result = truncateDisplayName(name);
      expect(result).toBe(name);
    });

    it('should handle name length 21 (just over limit)', () => {
      const name = 'x'.repeat(21);
      const result = truncateDisplayName(name);
      expect(result).toBe('x'.repeat(17) + '...');
      expect(result.length).toBe(20);
    });
  });

  describe('getTableDisplayName', () => {
    it('should return mapped display name', () => {
      const map = { 'main_table_1': 'data_Sheet1' };
      const result = getTableDisplayName('main_table_1', map);
      expect(result).toBe('data_Sheet1');
    });

    it('should return original table name if not in map', () => {
      const map = { 'main_table_1': 'data_Sheet1' };
      const result = getTableDisplayName('main_table_999', map);
      expect(result).toBe('main_table_999');
    });

    it('should return original table name if map is empty', () => {
      const result = getTableDisplayName('main_table_1', {});
      expect(result).toBe('main_table_1');
    });
  });

  describe('getFullTableDisplayName', () => {
    it('should return full untruncated name from map', () => {
      const map = { 'main_table_1': 'this_is_a_very_long_name_Sheet1' };
      const result = getFullTableDisplayName('main_table_1', map);
      expect(result).toBe('this_is_a_very_long_name_Sheet1');
    });

    it('should return original table name if not in map', () => {
      const result = getFullTableDisplayName('main_table_999', {});
      expect(result).toBe('main_table_999');
    });
  });
});
