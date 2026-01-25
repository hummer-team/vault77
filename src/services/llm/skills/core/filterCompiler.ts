/**
 * @file filterCompiler.ts
 * @description Compiles FilterExpr to SQL WHERE clause fragments.
 * Supports literal values and relative time expressions with UTC timezone.
 */

import type { FilterExpr, RelativeTimeValue, LiteralValue } from '../types';

/**
 * Check if value is a relative time expression.
 */
function isRelativeTimeValue(value: unknown): value is RelativeTimeValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value as RelativeTimeValue).kind === 'relative_time'
  );
}

/**
 * Compile relative time value to SQL INTERVAL expression.
 * @param column Column name to apply time filter
 * @param value Relative time value
 * @param op Comparison operator
 * @returns SQL WHERE clause fragment
 */
function compileRelativeTime(
  column: string,
  value: RelativeTimeValue,
  op: FilterExpr['op']
): string {
  const { unit, amount, direction } = value;
  
  // Validate operator for time comparisons
  if (!['>', '>=', '<', '<=', '=', '!='].includes(op)) {
    throw new Error(`Invalid operator "${op}" for relative time comparison`);
  }

  // Build INTERVAL expression
  const intervalExpr = `INTERVAL '${amount} ${unit}'`;
  
  // Force CAST to TIMESTAMP to avoid DuckDB binder error with TIMESTAMPTZ
  const castColumn = `CAST(${column} AS TIMESTAMP)`;
  
  // Build comparison based on direction
  if (direction === 'past') {
    // Past: column >= CURRENT_TIMESTAMP - INTERVAL
    // Adjust operator: >= becomes >=, > becomes >, etc.
    return `${castColumn} >= CURRENT_TIMESTAMP - ${intervalExpr}`;
  } else {
    // Future: column <= CURRENT_TIMESTAMP + INTERVAL
    return `${castColumn} <= CURRENT_TIMESTAMP + ${intervalExpr}`;
  }
}

/**
 * Escape SQL string literal to prevent injection.
 * @param str String to escape
 * @returns Escaped SQL string literal
 */
function escapeSqlString(str: string): string {
  // Double single quotes to escape them in SQL
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Compile literal value to SQL expression.
 * @param value Literal value (string, number, boolean, or array)
 * @returns SQL expression string
 */
function compileLiteralValue(value: LiteralValue): string {
  if (typeof value === 'string') {
    return escapeSqlString(value);
  }
  
  if (typeof value === 'number') {
    return String(value);
  }
  
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      typeof item === 'string' ? escapeSqlString(item) : String(item)
    );
    return `(${items.join(', ')})`;
  }
  
  throw new Error(`Unsupported literal value type: ${typeof value}`);
}

/**
 * Compile FilterExpr to SQL WHERE clause fragment.
 * @param filter Filter expression
 * @returns SQL WHERE clause fragment
 * @throws Error if filter is invalid
 */
export function compileFilter(filter: FilterExpr): string {
  const { column, op, value } = filter;
  
  // Validate column name to prevent SQL injection
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(column)) {
    throw new Error(`Invalid column name: ${column}`);
  }
  
  // Handle relative time
  if (isRelativeTimeValue(value)) {
    return compileRelativeTime(column, value, op);
  }
  
  // Handle literal values
  const literalValue = value as LiteralValue;
  
  if (op === 'in' || op === 'not_in') {
    // IN/NOT IN requires array value
    if (!Array.isArray(literalValue)) {
      throw new Error(`Operator "${op}" requires array value`);
    }
    const listExpr = compileLiteralValue(literalValue);
    return op === 'in' ? `${column} IN ${listExpr}` : `${column} NOT IN ${listExpr}`;
  }
  
  if (op === 'contains') {
    // CONTAINS operator for string search
    if (typeof literalValue !== 'string') {
      throw new Error('Operator "contains" requires string value');
    }
    const escapedValue = escapeSqlString(`%${literalValue}%`);
    return `${column} LIKE ${escapedValue}`;
  }
  
  // Standard comparison operators: =, !=, >, >=, <, <=
  const compiledValue = compileLiteralValue(literalValue);
  return `${column} ${op} ${compiledValue}`;
}

/**
 * Compile array of FilterExpr to SQL WHERE clause.
 * @param filters Array of filter expressions
 * @param combinator Logical combinator ('AND' or 'OR')
 * @returns SQL WHERE clause (without WHERE keyword)
 */
export function compileFilters(
  filters: FilterExpr[],
  combinator: 'AND' | 'OR' = 'AND'
): string {
  if (filters.length === 0) {
    return '';
  }
  
  const clauses = filters.map((filter) => {
    try {
      return compileFilter(filter);
    } catch (error) {
      console.error('[FilterCompiler] Failed to compile filter:', filter, error);
      throw error;
    }
  });
  
  return clauses.join(` ${combinator} `);
}

/**
 * Compile filters and wrap with WHERE keyword if non-empty.
 * @param filters Array of filter expressions
 * @param combinator Logical combinator
 * @returns SQL WHERE clause with WHERE keyword, or empty string
 */
export function compileWhereClause(
  filters: FilterExpr[],
  combinator: 'AND' | 'OR' = 'AND'
): string {
  const compiled = compileFilters(filters, combinator);
  return compiled ? `WHERE ${compiled}` : '';
}
