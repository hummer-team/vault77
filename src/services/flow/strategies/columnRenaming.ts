/**
 * Column Renaming Utility
 *
 * Resolves column name conflicts across multiple tables in a JOIN.
 * When a column appears in more than one table, it is aliased as "tbN.columnName"
 * where N is extracted from the trailing number in the table name (e.g. "main_table_2" → "tb2").
 * Columns that are unique across all tables keep their original simple name.
 *
 * This utility is reusable across all UDF strategy implementations and any other
 * operator that needs to build conflict-free column projections from multi-table JOINs.
 */

export interface TableColumns {
  /** Registered table name (e.g. "main_table_1") */
  name: string;
  /** All column names available in this table, in schema order */
  columns: string[];
}

/**
 * Derive a short display prefix from a table name.
 * Extracts a trailing numeric suffix: "main_table_2" → "tb2", "orders" → "orders".
 */
export function tableShortAlias(tableName: string): string {
  const m = tableName.match(/_(\d+)$/);
  return m ? `tb${m[1]}` : tableName;
}

/**
 * Compute the final output alias for every column in every table.
 *
 * Algorithm:
 * 1. Count how many tables each column name appears in.
 * 2. If a column appears in ≥ 2 tables → alias as "tbN.columnName" (short prefix).
 * 3. If a column appears in exactly 1 table → keep the simple column name.
 *
 * @param tables - Ordered list of `{name, columns}` for each table in the join chain.
 * @returns A nested map: table name → (original column name → resolved alias).
 *
 * @example
 * // Both tables share "id", "total_amount", "total_discount"
 * const renameMap = resolveColumnConflicts([
 *   { name: 'main_table_1', columns: ['id', 'total_amount', 'total_discount'] },
 *   { name: 'main_table_2', columns: ['id', 'total_amount', 'total_discount'] },
 * ]);
 * renameMap.get('main_table_1')?.get('total_amount')  // → 'tb1.total_amount'
 * renameMap.get('main_table_2')?.get('total_discount') // → 'tb2.total_discount'
 *
 * // Unique column stays simple
 * resolveColumnConflicts([
 *   { name: 'orders', columns: ['order_id', 'amount'] },
 *   { name: 'users',  columns: ['user_id',  'name']   },
 * ]);
 * // All columns are unique → aliases == original names
 */
export function resolveColumnConflicts(
  tables: TableColumns[]
): Map<string, Map<string, string>> {
  // Step 1: count how many tables each column name appears in
  const colTableCount = new Map<string, number>();
  for (const { columns } of tables) {
    for (const col of columns) {
      colTableCount.set(col, (colTableCount.get(col) ?? 0) + 1);
    }
  }

  // Step 2: build per-table rename maps using short alias prefix (tbN)
  const result = new Map<string, Map<string, string>>();
  for (const { name: tableName, columns } of tables) {
    const renameMap = new Map<string, string>();
    const prefix = tableShortAlias(tableName);
    for (const col of columns) {
      const sharedCount = colTableCount.get(col) ?? 1;
      renameMap.set(col, sharedCount > 1 ? `${prefix}.${col}` : col);
    }
    result.set(tableName, renameMap);
  }

  return result;
}
