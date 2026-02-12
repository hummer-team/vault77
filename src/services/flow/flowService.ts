/**
 * Flow Service
 * Integration with DuckDB for analysis flow data operations
 */

import type { Field, FieldType, TableSchema } from './types';

/**
 * Get list of available tables from DuckDB
 * Filters tables with 'main_table_' prefix
 * @param executeQuery DuckDB query executor function
 */
export async function getAvailableTables(
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<string[]> {
  try {
    // Query information_schema for tables
    const result = await executeQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'main' 
      AND table_name LIKE 'main_table_%'
      ORDER BY table_name
    `);

    return result.data.map((row: { table_name: string }) => row.table_name);
  } catch (error) {
    console.error('[FlowService] Failed to get tables from information_schema:', error);
    // Fallback: try to get all tables using SHOW TABLES
    try {
      const result = await executeQuery(`SHOW TABLES`);
      console.log('[FlowService] SHOW TABLES result:', result);
      // Handle different possible column names
      return result.data.map((row: any) => {
        return row.name || row.table_name || row.table || row[Object.keys(row)[0]];
      }).filter((name: string) => name && name.includes('main_table_'));
    } catch (fallbackError) {
      console.error('[FlowService] Fallback also failed:', fallbackError);
      return [];
    }
  }
}

/**
 * Get table schema (fields) from DuckDB
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 */
export async function getTableSchema(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<TableSchema> {
  try {
    const result = await executeQuery(`DESCRIBE "${tableName}"`);

    // Map DuckDB schema to Field type
    const fields: Field[] = result.data.map((row: any) => ({
      name: row.column_name || row.Column || row.col_name || row.column || 'unknown',
      type: mapDuckDBTypeToFieldType(row.column_type || row.Type || row.col_type || row.type || 'UNKNOWN'),
      nullable: row.null !== 'NO' && row.null !== false,
    }));

    return {
      tableName,
      fields,
    };
  } catch (error) {
    console.error(`[FlowService] Failed to get schema for ${tableName}:`, error);
    return {
      tableName,
      fields: [],
    };
  }
}

/**
 * Map DuckDB type to FieldType enum
 */
function mapDuckDBTypeToFieldType(duckdbType: string): FieldType {
  const type = duckdbType.toUpperCase();

  // Integer types
  if (type.includes('INTEGER') || type === 'INT') return 'INTEGER' as FieldType;
  if (type.includes('BIGINT')) return 'BIGINT' as FieldType;
  if (type.includes('SMALLINT')) return 'SMALLINT' as FieldType;
  if (type.includes('TINYINT')) return 'TINYINT' as FieldType;

  // Decimal types
  if (type.includes('DECIMAL') || type.includes('NUMERIC')) return 'DECIMAL' as FieldType;
  if (type.includes('REAL')) return 'REAL' as FieldType;
  if (type.includes('DOUBLE') || type.includes('FLOAT')) return 'DOUBLE' as FieldType;

  // String types
  if (type.includes('VARCHAR')) return 'VARCHAR' as FieldType;
  if (type.includes('TEXT')) return 'TEXT' as FieldType;
  if (type.includes('CHAR')) return 'CHAR' as FieldType;

  // Date/Time types
  if (type.includes('TIMESTAMP')) return 'TIMESTAMP' as FieldType;
  if (type.includes('DATE')) return 'DATE' as FieldType;
  if (type.includes('TIME')) return 'TIME' as FieldType;

  // Other types
  if (type.includes('BOOLEAN') || type === 'BOOL') return 'BOOLEAN' as FieldType;
  if (type.includes('BLOB') || type.includes('BYTEA')) return 'BLOB' as FieldType;
  if (type.includes('JSON')) return 'JSON' as FieldType;
  if (type.includes('UUID')) return 'UUID' as FieldType;
  if (type.includes('ARRAY') || type.includes('LIST')) return 'ARRAY' as FieldType;

  return 'UNKNOWN' as FieldType;
}

/**
 * Check if a table exists in DuckDB
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 */
export async function tableExists(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<boolean> {
  try {
    const result = await executeQuery(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'main' 
      AND table_name = '${tableName}'
    `);

    return result.data[0]?.count > 0;
  } catch (error) {
    console.error(`[FlowService] Failed to check if table exists: ${tableName}`, error);
    return false;
  }
}

/**
 * Get sample data from a table (for preview)
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 * @param limit Number of rows to return
 */
export async function getTableSample(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>,
  limit: number = 5
): Promise<{ data: any[]; schema: any[] }> {
  try {
    return await executeQuery(`
      SELECT * FROM "${tableName}" LIMIT ${limit}
    `);
  } catch (error) {
    console.error(`[FlowService] Failed to get sample from ${tableName}:`, error);
    return { data: [], schema: [] };
  }
}

/**
 * Get row count for a table
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 */
export async function getTableRowCount(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<number> {
  try {
    const result = await executeQuery(`
      SELECT COUNT(*) as count FROM "${tableName}"
    `);
    return result.data[0]?.count || 0;
  } catch (error) {
    console.error(`[FlowService] Failed to get row count for ${tableName}:`, error);
    return 0;
  }
}
