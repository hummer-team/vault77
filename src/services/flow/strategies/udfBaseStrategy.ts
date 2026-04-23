/**
 * UdfBaseStrategy
 * Shared abstract base for all 5 UDF strategies.
 *
 * Extends BaseStrategy and provides:
 *   - Abstract udfFunctionName for MACRO routing
 *   - findUdfNode(): canonical UDF node lookup
 *   - extractTableSchemas(): full column schema map from TABLE nodes
 *   - resolveTblParam(): single/multi-table tbl argument (full-schema mode, fixes legacy
 *     t0.* column conflict bug in legacy strategies)
 *   - validate() template method + abstract validateUdfConfig()
 *   - postProcess() shared implementation with getSuccessInsight() hook
 *   - buildUdfConditionSql(): MACRO-ready condition string with multi-table alias rewriting
 */

import {
  FlowNodeType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
  type ValidationError,
  type AnalysisResult,
  type TableNodeData,
} from '../types';
import { BaseStrategy } from '../strategies';
import { buildJoinSubquery } from './udfShared';
import { getCanvasJoinedTables } from '../flowService';

export abstract class UdfBaseStrategy extends BaseStrategy {
  /** DuckDB MACRO function name, e.g. 'udf_up_lower_str' */
  abstract readonly udfFunctionName: string;

  // ── Node lookup ──────────────────────────────────────────────────────────────

  /**
   * Find the UDF configuration node from canvas nodes.
   * Priority: UDF_CONFIG node > SELECT node with matching udfFunctionName > any SELECT node.
   */
  protected findUdfNode(nodes: FlowNode[], udfFnName?: string): FlowNode | undefined {
    return (
      nodes.find((n) => n.type === FlowNodeType.UDF_CONFIG) ??
      nodes.find(
        (n) =>
          n.type === FlowNodeType.SELECT &&
          (udfFnName
            ? (n.data as { udfFunctionName?: string }).udfFunctionName === udfFnName
            : !!(n.data as { udfFunctionName?: string }).udfFunctionName)
      ) ??
      nodes.find((n) => n.type === FlowNodeType.SELECT)
    );
  }

  // ── Schema extraction ────────────────────────────────────────────────────────

  /**
   * Extract full column schemas from all TABLE nodes in the canvas.
   * Used by resolveTblParam for full-schema mode JOIN subquery generation.
   */
  protected extractTableSchemas(nodes: FlowNode[]): Map<string, string[]> {
    const schemas = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.type === FlowNodeType.TABLE) {
        const data = node.data as TableNodeData;
        schemas.set(data.tableName, data.fields.map((f) => f.name));
      }
    }
    return schemas;
  }

  // ── Table param resolution ───────────────────────────────────────────────────

  /**
   * Resolve the `tbl` argument for the DuckDB MACRO.
   *
   * Single-table: returns the table name string directly.
   * Multi-table:  uses full-schema mode with resolveColumnConflicts — same as
   *               UdfReplaceColumnStrategy. This fixes the legacy t0.* column
   *               conflict bug present in the 4 legacy strategies.
   *
   * @returns { tblParam, columnAliasMap } — tblParam is a table name or parenthesised
   *          subquery; columnAliasMap is empty for single-table.
   */
  protected resolveTblParam(
    nodes: FlowNode[],
    edges: FlowEdge[]
  ): { tblParam: string; columnAliasMap: Map<string, Map<string, string>> } {
    const canvasJoinedTables = getCanvasJoinedTables(edges);
    if (canvasJoinedTables.length < 2) {
      const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
      const tableName = (tableNode?.data as TableNodeData | undefined)?.tableName ?? '__src';
      return { tblParam: tableName, columnAliasMap: new Map() };
    }

    // Multi-table: full-schema mode with explicit projection and conflict resolution
    const fullTableSchemas = this.extractTableSchemas(nodes);
    const joinResult = buildJoinSubquery(canvasJoinedTables, edges, new Map(), fullTableSchemas);
    if (joinResult) {
      return { tblParam: joinResult.sql, columnAliasMap: joinResult.columnAliasMap };
    }

    // Fallback: join edges not fully configured
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as TableNodeData | undefined)?.tableName ?? '__src';
    return { tblParam: tableName, columnAliasMap: new Map() };
  }

  /**
   * Remap a config key that may be in `"tableName.colName"` format to the
   * aliased `"tbN.colName"` format used inside multi-table subqueries.
   *
   * When columnAliasMap is empty (single-table mode) the key is returned unchanged.
   *
   * @example
   *   // columnAliasMap: main_table_1 → { total_amount → "tb1.total_amount" }
   *   remapColumnKey("main_table_1.total_amount", map) // → "tb1.total_amount"
   *   remapColumnKey("total_amount", map)              // → "total_amount" (no dot)
   */
  protected remapColumnKey(
    key: string,
    columnAliasMap: Map<string, Map<string, string>>
  ): string {
    if (!columnAliasMap.size) return key;
    const dotIdx = key.indexOf('.');
    if (dotIdx <= 0) return key;
    const tableName = key.slice(0, dotIdx);
    const colName = key.slice(dotIdx + 1);
    return columnAliasMap.get(tableName)?.get(colName) ?? key;
  }

  // ── Validate template ────────────────────────────────────────────────────────

  /**
   * Template method: locate UDF node → if missing return error, else delegate
   * to validateUdfConfig for operator-specific checks.
   */
  validate(nodes: FlowNode[], edges: FlowEdge[]): ValidationError[] {
    const udfNode = this.findUdfNode(nodes, this.udfFunctionName);
    if (!udfNode) {
      return [
        {
          nodeId: 'flow',
          nodeType: FlowNodeType.END,
          message: '缺少 UDF 配置节点，请在画布中完成算子配置',
          severity: ValidationSeverity.ERROR,
        },
      ];
    }
    return this.validateUdfConfig(nodes, edges, udfNode);
  }

  /**
   * Operator-specific validation hook. Called by validate() after confirming the UDF
   * node exists. Subclasses implement this instead of overriding validate() directly.
   */
  protected abstract validateUdfConfig(
    nodes: FlowNode[],
    edges: FlowEdge[],
    udfNode: FlowNode
  ): ValidationError[];

  // ── postProcess ──────────────────────────────────────────────────────────────

  /**
   * Default postProcess shared by all UDF strategies.
   * Subclasses may override getSuccessInsight() for a custom success message.
   */
  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema,
      insights: [this.getSuccessInsight()],
      visualizations: [{ type: 'table', config: { data: queryResult.data } }],
    };
  }

  /** Override in subclasses for a custom success message. */
  protected getSuccessInsight(): string {
    return `${this.name}执行成功`;
  }

  /**
   * Build the SELECT clause for a UDF MACRO query.
   *
   * When outputColumns is non-empty, remaps each column key using columnAliasMap
   * (single-table: no-op; multi-table: "tableName.col" → "tbN.col") and produces
   * `SELECT "col1", "col2", ...`. Falls back to `SELECT *` when empty.
   */
  protected buildUdfSelectClause(
    outputColumns: string[],
    columnAliasMap: Map<string, Map<string, string>>
  ): string {
    if (outputColumns.length === 0) return 'SELECT *';
    const remapped = outputColumns.map((c) => `"${this.remapColumnKey(c, columnAliasMap)}"`);
    return `SELECT ${remapped.join(', ')}`;
  }

  // ── buildUdfConditionSql (pre-existing, unchanged) ───────────────────────────
  /**
   * Build the condition SQL string to pass as `condition := '...'` to a UDF MACRO.
   *
   * Priority:
   *   1. Canvas condition-definition nodes filled with placeholderValues
   *   2. Static fallbackCondition (e.g. cfg.condition from UDF config)
   *
   * When tblParam is a subquery (starts with '('), columns inside the MACRO are
   * referenced as single aliased names (e.g. `tb1.id`) — not as
   * table-qualified `"main_table_1"."id"`. This method rewrites the generated
   * WHERE clause using columnAliasMap when available, otherwise falls back to
   * the naive `"tableName.field"` concatenation.
   *
   * @param nodes              - Canvas nodes (used to find condition-definition nodes)
   * @param placeholderValues  - Filled-in placeholder values from EndNode
   * @param tblParam           - The resolved table/subquery string passed to the MACRO
   * @param fallbackCondition  - Static condition from the UDF config (used when no
   *                             canvas condition is present)
   * @param columnAliasMap     - Optional: tableName → (rawCol → resolvedAlias) from
   *                             resolveColumnConflicts(). When provided, rewrites
   *                             `"tableName"."col"` → `"resolvedAlias"` (e.g. `"tb1.id"`).
   * @returns Raw SQL expression string (no leading WHERE), or '' if none.
   */
  protected buildUdfConditionSql(
    nodes: FlowNode[],
    placeholderValues: Record<string, unknown> | undefined,
    tblParam: string,
    fallbackCondition?: string,
    columnAliasMap?: Map<string, Map<string, string>>
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
    // but inside __src the columns are aliased by the subquery projection (e.g. "tb1.id").
    // Rewrite `"tableName"."field"` → the resolved alias from columnAliasMap when available,
    // otherwise fall back to the naive `"tableName.field"` concatenation.
    if (tblParam.trimStart().startsWith('(') && conditionSql) {
      conditionSql = conditionSql.replace(/"([^"]+)"\."([^"]+)"/g, (_, tableName, colName) => {
        if (columnAliasMap) {
          const resolved = columnAliasMap.get(tableName)?.get(colName);
          if (resolved) return `"${resolved}"`;
        }
        // Fallback: concatenate as "tableName.colName"
        return `"${tableName}.${colName}"`;
      });
    }

    return conditionSql;
  }
}
