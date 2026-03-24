/**
 * Unit tests for DuckDB UDF Service
 * Covers kernel mapping, UDF lookup, initialization lifecycle, and idempotency.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the ?raw SQL import before the module under test is loaded
vi.mock('../../../design/udf.sql?raw', () => ({
  default: [
    "CREATE OR REPLACE MACRO udf_replace_spec_column_value(t, swap_map := '{}', condition := '') AS TABLE SELECT * FROM t;",
    "CREATE OR REPLACE MACRO udf_up_lower_str(t, col := '', mode := 'upper') AS TABLE SELECT * FROM t;",
    "-- comment only line",
    "",
  ].join('\n'),
}));

import { duckDBUdfService, KERNEL_UDF_MAP } from '../duckDBUdfService';

describe('KERNEL_UDF_MAP', () => {
  it('should contain all 5 expected data-cleaning kernel mappings', () => {
    const expectedKernels = [
      'fn_ecom_data_clean_replace_spec_column_value',
      'fn_ecom_data_clean_up_lower',
      'fn_ecom_data_clean_number_precision_control',
      'fn_ecom_data_clean_data_flag',
      'fn_ecom_data_format_date',
    ];
    expectedKernels.forEach((kernel) => {
      expect(KERNEL_UDF_MAP).toHaveProperty(kernel);
    });
    expect(Object.keys(KERNEL_UDF_MAP)).toHaveLength(5);
  });

  it('should map each kernel to a non-empty UDF function name', () => {
    Object.entries(KERNEL_UDF_MAP).forEach(([, udfName]) => {
      expect(typeof udfName).toBe('string');
      expect(udfName.length).toBeGreaterThan(0);
    });
  });
});

describe('DuckDBUdfService.isDataCleanKernel', () => {
  it('should return true for known data-cleaning kernels', () => {
    expect(duckDBUdfService.isDataCleanKernel('fn_ecom_data_clean_replace_spec_column_value')).toBe(true);
    expect(duckDBUdfService.isDataCleanKernel('fn_ecom_data_clean_up_lower')).toBe(true);
    expect(duckDBUdfService.isDataCleanKernel('fn_ecom_data_clean_number_precision_control')).toBe(true);
    expect(duckDBUdfService.isDataCleanKernel('fn_ecom_data_clean_data_flag')).toBe(true);
    expect(duckDBUdfService.isDataCleanKernel('fn_ecom_data_format_date')).toBe(true);
  });

  it('should return false for unknown kernel names', () => {
    expect(duckDBUdfService.isDataCleanKernel('fn_ecom_association')).toBe(false);
    expect(duckDBUdfService.isDataCleanKernel('')).toBe(false);
    expect(duckDBUdfService.isDataCleanKernel('udf_replace_spec_column_value')).toBe(false);
  });
});

describe('DuckDBUdfService.getUdfFunctionName', () => {
  it('should return correct UDF name for replace kernel', () => {
    expect(
      duckDBUdfService.getUdfFunctionName('fn_ecom_data_clean_replace_spec_column_value')
    ).toBe('udf_replace_spec_column_value');
  });

  it('should return correct UDF names for all 5 kernels', () => {
    expect(duckDBUdfService.getUdfFunctionName('fn_ecom_data_clean_up_lower')).toBe('udf_up_lower_str');
    expect(duckDBUdfService.getUdfFunctionName('fn_ecom_data_clean_number_precision_control')).toBe('udf_format_number');
    expect(duckDBUdfService.getUdfFunctionName('fn_ecom_data_clean_data_flag')).toBe('udf_flag_spec_column');
    expect(duckDBUdfService.getUdfFunctionName('fn_ecom_data_format_date')).toBe('udf_format_date_time');
  });

  it('should return null for unknown kernel names', () => {
    expect(duckDBUdfService.getUdfFunctionName('fn_unknown')).toBeNull();
    expect(duckDBUdfService.getUdfFunctionName('')).toBeNull();
  });
});

describe('DuckDBUdfService.initializeUdfs', () => {
  beforeEach(() => {
    // Reset init state before each test so initialization runs fresh
    duckDBUdfService.resetInitState();
  });

  it('should call queryFn for each non-empty/non-comment SQL statement', async () => {
    const mockQueryFn = vi.fn().mockResolvedValue(undefined);
    await duckDBUdfService.initializeUdfs(mockQueryFn);
    // The mocked SQL has 2 real statements (comment-only lines are filtered out)
    expect(mockQueryFn).toHaveBeenCalledTimes(2);
  });

  it('should pass trimmed SQL strings to queryFn', async () => {
    const capturedSql: string[] = [];
    const mockQueryFn = vi.fn().mockImplementation(async (sql: string) => {
      capturedSql.push(sql);
    });
    await duckDBUdfService.initializeUdfs(mockQueryFn);
    capturedSql.forEach((sql) => {
      expect(sql.startsWith(' ')).toBe(false);
      expect(sql.endsWith(' ')).toBe(false);
      expect(sql.length).toBeGreaterThan(0);
    });
  });

  it('should be idempotent — second call does not re-execute queryFn', async () => {
    const mockQueryFn = vi.fn().mockResolvedValue(undefined);
    await duckDBUdfService.initializeUdfs(mockQueryFn);
    const firstCallCount = mockQueryFn.mock.calls.length;

    // Second call — should be a no-op
    await duckDBUdfService.initializeUdfs(mockQueryFn);
    expect(mockQueryFn.mock.calls.length).toBe(firstCallCount);
  });

  it('should mark UDFs as initialized after first call', async () => {
    expect(duckDBUdfService.isUdfInitialized()).toBe(false);
    await duckDBUdfService.initializeUdfs(vi.fn().mockResolvedValue(undefined));
    expect(duckDBUdfService.isUdfInitialized()).toBe(true);
  });

  it('should not throw if a single statement fails — continues with remaining', async () => {
    let callCount = 0;
    const mockQueryFn = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('DuckDB error');
    });
    await expect(duckDBUdfService.initializeUdfs(mockQueryFn)).resolves.not.toThrow();
    // Both statements attempted even though first failed
    expect(mockQueryFn).toHaveBeenCalledTimes(2);
    // Initialization still completes
    expect(duckDBUdfService.isUdfInitialized()).toBe(true);
  });

  it('should reset init state correctly via resetInitState()', async () => {
    const mockQueryFn = vi.fn().mockResolvedValue(undefined);
    await duckDBUdfService.initializeUdfs(mockQueryFn);
    expect(duckDBUdfService.isUdfInitialized()).toBe(true);

    duckDBUdfService.resetInitState();
    expect(duckDBUdfService.isUdfInitialized()).toBe(false);

    // Should run again after reset
    await duckDBUdfService.initializeUdfs(mockQueryFn);
    expect(mockQueryFn.mock.calls.length).toBeGreaterThan(2);
  });
});
