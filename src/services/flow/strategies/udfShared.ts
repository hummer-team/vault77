/**
 * Shared helpers for all UDF strategy implementations.
 *
 * These functions are pure utilities — they have no dependency on a specific
 * UDF type and can be reused across UdfReplaceColumnStrategy, UdfUpLowerStrategy,
 * UdfFormatNumberStrategy, UdfFlagSpecStrategy, and UdfFormatDateStrategy.
 */

import type { FlowEdge, JoinEdgeData, JoinConditionRow } from '../types';
import { resolveColumnConflicts } from './columnRenaming';

export { resolveColumnConflicts } from './columnRenaming';
export type { TableColumns } from './columnRenaming';

// ============================================================================
// SQL escaping
// ============================================================================

/**
 * Escape single quotes inside a SQL string literal.
 * Input value is embedded inside '…' — each ' becomes ''.
 */
export function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

// ============================================================================
// JOIN helpers
// ============================================================================

/**
 * Convert a JoinType string ('inner' | 'left' | 'right' | 'full') to the
 * corresponding SQL keyword used before JOIN.
 */
export function joinTypeToSql(joinType: string | undefined): string {
  switch ((joinType ?? '').toLowerCase()) {
    case 'inner': return 'INNER';
    case 'left':  return 'LEFT';
    case 'right': return 'RIGHT';
    case 'full':  return 'FULL OUTER';
    default:      return 'LEFT';
  }
}

/**
 * Build the ON condition string from an array of JoinConditionRow.
 * Each row is formatted as:  [AND|OR] `alias`.`field` op `alias`.`field`
 *
 * @param conditions - ordered list of condition rows
 * @param aliasOf    - map from table name → short alias (e.g. 't0', 't1')
 */
export function buildOnClause(conditions: JoinConditionRow[], aliasOf: Map<string, string>): string {
  return conditions
    .map((cond, idx) => {
      const la = aliasOf.get(cond.leftTable)  ?? `"${cond.leftTable}"`;
      const ra = aliasOf.get(cond.rightTable) ?? `"${cond.rightTable}"`;
      const lf = `"${cond.leftField.replace(/"/g, '""')}"`;
      const rf = `"${cond.rightField.replace(/"/g, '""')}"`;
      const op = cond.operator || '=';
      const logic = idx > 0 ? `${cond.logic ?? 'AND'} ` : '';
      return `${logic}${la}.${lf} ${op} ${ra}.${rf}`;
    })
    .join(' ');
}

export type JoinSubqueryResult = {
  /** The parenthesised subquery SQL string to use as the `tbl` argument */
  sql: string;
  /** Per-table alias map: table name → (original col → resolved alias used in the subquery) */
  columnAliasMap: Map<string, Map<string, string>>;
};

/**
 * Build a parenthesised JOIN subquery string for multi-table UDF calls.
 *
 * Two modes depending on whether `fullTableSchemas` is supplied:
 *
 * **Full-schema mode** (when `fullTableSchemas` is provided):
 * - Uses explicit column projection for ALL tables.
 * - Calls `resolveColumnConflicts` to detect shared column names.
 * - Shared columns are aliased as `"tbN.columnName"` (short prefix derived from table name).
 * - Unique columns keep their simple name.
 * - No `t0.*` — every column is listed explicitly, so there are no hidden duplicates.
 *
 * **Legacy mode** (when `fullTableSchemas` is absent or empty):
 * - Main table (t0): select all columns via `t0.*`.
 * - Secondary tables: select only the columns in `targetColsByTable` to avoid
 *   name conflicts with t0.* (explicit `alias."col" AS "col"` projection).
 *
 * Returns null when no join edges exist — the caller falls back to single-table.
 *
 * @param involvedTables    - list of table names referenced by the UDF config
 * @param edges             - all canvas edges
 * @param targetColsByTable - legacy: map from table → columns needed (secondary only)
 * @param fullTableSchemas  - optional: full column list per table for conflict resolution
 */
export function buildJoinSubquery(
  involvedTables: string[],
  edges: FlowEdge[],
  targetColsByTable: Map<string, string[]>,
  fullTableSchemas?: Map<string, string[]>
): JoinSubqueryResult | null {
  // Collect and sort join edges by order
  const joinEdges = edges
    .filter((e) => e.type === 'join' && e.data)
    .map((e) => ({ edge: e, data: e.data as JoinEdgeData }))
    .sort((a, b) => (a.data.order ?? 0) - (b.data.order ?? 0));

  if (joinEdges.length === 0) return null;

  // Build an ordered table list from the join chain
  const orderedTables: string[] = [];
  for (const { data } of joinEdges) {
    if (!orderedTables.includes(data.sourceTableName)) orderedTables.push(data.sourceTableName);
    if (!orderedTables.includes(data.targetTableName)) orderedTables.push(data.targetTableName);
  }
  // Append any tables in involvedTables that were not part of the join chain (safety net)
  for (const t of involvedTables) {
    if (!orderedTables.includes(t)) orderedTables.push(t);
  }

  // Alias map: table name → short alias (t0, t1, …) — used in the FROM/JOIN clause
  const aliasOf = new Map<string, string>(orderedTables.map((t, i) => [t, `t${i}`]));
  const mainTable = orderedTables[0];
  const mainAlias = aliasOf.get(mainTable)!;

  // Build SELECT clause
  let selectParts: string[];
  let columnAliasMap = new Map<string, Map<string, string>>();

  if (fullTableSchemas && fullTableSchemas.size > 0) {
    // Full-schema mode: explicit projection with conflict resolution
    const tableColumnsList = orderedTables
      .filter((t) => fullTableSchemas.has(t))
      .map((t) => ({ name: t, columns: fullTableSchemas.get(t)! }));

    columnAliasMap = resolveColumnConflicts(tableColumnsList);
    selectParts = [];

    for (const tbl of orderedTables) {
      const alias = aliasOf.get(tbl);
      if (!alias) continue;
      const columns = fullTableSchemas.get(tbl);
      if (!columns) {
        // No schema for this table — fall back to t0.* for main, skip secondary
        if (tbl === mainTable) selectParts.push(`${alias}.*`);
        continue;
      }
      const renameMap = columnAliasMap.get(tbl) ?? new Map<string, string>();
      for (const col of columns) {
        const qCol = `"${col.replace(/"/g, '""')}"`;
        const resolvedAlias = renameMap.get(col) ?? col;
        const qAlias = `"${resolvedAlias.replace(/"/g, '""')}"`;
        selectParts.push(
          qCol === qAlias
            ? `${alias}.${qCol}`
            : `${alias}.${qCol} AS ${qAlias}`
        );
      }
    }
  } else {
    // Legacy mode: t0.* + secondary explicit cols (no conflict resolution)
    selectParts = [`${mainAlias}.*`];
    for (const [tbl, cols] of targetColsByTable) {
      if (tbl === mainTable) continue; // main table already covered by t0.*
      const alias = aliasOf.get(tbl);
      if (!alias) continue;
      for (const col of cols) {
        const qCol = `"${col.replace(/"/g, '""')}"`;
        selectParts.push(`${alias}.${qCol} AS ${qCol}`);
      }
    }
  }

  // Build FROM + JOIN clauses
  const quotedMain = `"${mainTable.replace(/"/g, '""')}"`;
  let fromClause = `FROM ${quotedMain} ${mainAlias}`;

  for (const { data } of joinEdges) {
    const joinKeyword = joinTypeToSql(data.joinType);
    const targetAlias = aliasOf.get(data.targetTableName) ?? data.targetTableName;
    const quotedTarget = `"${data.targetTableName.replace(/"/g, '""')}"`;

    const onClauses = buildOnClause(data.conditions ?? [], aliasOf);
    const onStr = onClauses.length > 0 ? `ON ${onClauses}` : 'ON TRUE';

    fromClause += `\n    ${joinKeyword} JOIN ${quotedTarget} ${targetAlias} ${onStr}`;
  }

  return {
    sql: `(SELECT ${selectParts.join(', ')}\n    ${fromClause})`,
    columnAliasMap,
  };
}
