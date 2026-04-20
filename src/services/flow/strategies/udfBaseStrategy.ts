/**
 * UdfBaseStrategy
 * Shared abstract base for all 5 UDF strategies.
 *
 * Extends BaseStrategy (which provides buildWhereClauseWithPlaceholders) and adds:
 *   - buildUdfConditionSql(): builds a MACRO-ready condition string from canvas
 *     condition-definition nodes + placeholder values, with multi-table subquery
 *     column-reference rewriting ("table"."col" → "table.col").
 */

import { type FlowNode } from '../types';
import { BaseStrategy } from '../strategies';

export abstract class UdfBaseStrategy extends BaseStrategy {
  /**
   * Build the condition SQL string to pass as `condition := '...'` to a UDF MACRO.
   *
   * Priority:
   *   1. Canvas condition-definition nodes filled with placeholderValues
   *   2. Static fallbackCondition (e.g. cfg.condition from UDF config)
   *
   * When tblParam is a subquery (starts with '('), columns inside the MACRO are
   * referenced as single aliased names like `main_table_1.id` — not as
   * table-qualified `"main_table_1"."id"`. This method rewrites the generated
   * WHERE clause accordingly.
   *
   * @param nodes              - Canvas nodes (used to find condition-definition nodes)
   * @param placeholderValues  - Filled-in placeholder values from EndNode
   * @param tblParam           - The resolved table/subquery string passed to the MACRO
   * @param fallbackCondition  - Static condition from the UDF config (used when no
   *                             canvas condition is present)
   * @returns Raw SQL expression string (no leading WHERE), or '' if none.
   */
  protected buildUdfConditionSql(
    nodes: FlowNode[],
    placeholderValues: Record<string, unknown> | undefined,
    tblParam: string,
    fallbackCondition?: string
  ): string {
    // Build WHERE clause from canvas condition nodes + placeholder values
    const whereClause = placeholderValues
      ? this.buildWhereClauseWithPlaceholders(nodes, placeholderValues)
      : this.buildWhereClause(nodes);

    // Strip 'WHERE ' prefix — MACRO expects a raw SQL expression
    let conditionSql = whereClause.replace(/^WHERE\s+/i, '').trim();

    // Fall back to static cfg.condition when no canvas condition was produced
    if (!conditionSql && fallbackCondition) {
      conditionSql = fallbackCondition;
    }

    // In multi-table (subquery) mode the MACRO wraps the subquery as __src.
    // buildWhereClauseWithPlaceholders emits `"tableName"."field"` (table-qualified),
    // but inside __src the columns are aliased as `tableName.field` (dot in alias).
    // Rewrite: `"tableName"."field"` → `"tableName.field"`.
    if (tblParam.trimStart().startsWith('(') && conditionSql) {
      conditionSql = conditionSql.replace(/"([^"]+)"\."([^"]+)"/g, '"$1.$2"');
    }

    return conditionSql;
  }
}
