/**
 * Pure function to generate SQL for reading CSV files into DuckDB tables.
 * Supports tab-delimited and other formats via DuckDB's native delimiter sniffing.
 * @param tableName - Target table name (already escaped as identifier)
 * @param fileName - Source CSV file path (already escaped as string literal)
 * @returns SQL string for CREATE TABLE AS SELECT from read_csv_auto
 */
export function buildCsvReadSql(tableName: string, fileName: string): string {
  return `CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto(${fileName}, header=true, sample_size=100, null_padding=true)`;
}
