import { describe, it, expect } from 'bun:test';
import { buildCsvReadSql } from '../duckdbCsvReadSql';

describe('buildCsvReadSql', () => {
  it('should generate SQL with null_padding=true for tab-delimited CSV support', () => {
    const tableName = '"test_table"';
    const fileName = "'test.csv'";
    const sql = buildCsvReadSql(tableName, fileName);

    expect(sql).toContain('null_padding=true');
    expect(sql).toContain('header=true');
    expect(sql).toContain('sample_size=100');
    expect(sql).toContain('read_csv_auto');
    expect(sql).toContain(tableName);
    expect(sql).toContain(fileName);
  });

  it('should NOT include delim or sep parameters (DuckDB native sniffing handles all delimiters)', () => {
    const tableName = '"test_table"';
    const fileName = "'test.tsv'";
    const sql = buildCsvReadSql(tableName, fileName);

    expect(sql).not.toContain('delim=');
    expect(sql).not.toContain('sep=');
  });

  it('should preserve CREATE OR REPLACE TABLE syntax', () => {
    const tableName = '"my_table"';
    const fileName = "'data.csv'";
    const sql = buildCsvReadSql(tableName, fileName);

    expect(sql).toContain('CREATE OR REPLACE TABLE');
    expect(sql).toContain('SELECT * FROM read_csv_auto');
  });
});
