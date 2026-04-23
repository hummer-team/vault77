/**
 * UDF Replace Column Strategy
 * Implements the strategy pattern for the "替换特定列值" data-cleaning operator.
 * Builds a DuckDB SQL call to udf_replace_spec_column_value().
 *
 * SQL shape (swap):
 *   SELECT * FROM udf_replace_spec_column_value(
 *     'table_name',
 *     swap_map  := '{"col": ["from_val", "to_val"]}',
 *     condition := 'col = ''value'''   -- optional
 *   )
 *
 * SQL shape (fill — whole-column overwrite):
 *   SELECT * FROM udf_replace_spec_column_value(
 *     'table_name',
 *     fill_map := '{"col": "new_value"}'
 *   )
 */

import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
  type ValidationError,
  type AnalysisResult,
  type UdfConfigNodeData,
  type SelectNodeData,
  type ReplaceRule,
  type TableNodeData,
} from '../types';
import { UdfBaseStrategy } from './udfBaseStrategy';
import { escapeSql, buildJoinSubquery } from './udfShared';
import { getCanvasJoinedTables } from '../flowService';

// ============================================================================
// UdfReplaceColumnStrategy
// ============================================================================

export class UdfReplaceColumnStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_REPLACE_COLUMN;
  readonly name = '替换特定列值';
  readonly udfFunctionName = 'udf_replace_spec_column_value';

  // --------------------------------------------------------------------------
  // validate
  // --------------------------------------------------------------------------
  validate(nodes: FlowNode[], _edges: FlowEdge[]): ValidationError[] {
    const nodeTypes = nodes.map((n) => n.type).join(', ');
    console.log(`[${this.name}.validate] nodes=[${nodeTypes}]`);

    const errors: ValidationError[] = [];

    const udfNode = this._findUdfConfigNode(nodes);
    if (!udfNode) {
      const msg = '缺少 UDF 配置节点，请在画布中完成算子配置';
      errors.push({ nodeId: 'flow', nodeType: FlowNodeType.END, message: msg, severity: ValidationSeverity.ERROR });
      console.warn(`[${this.name}.validate] ${msg}`);
      return errors;
    }

    const nodeData = udfNode.data as UdfConfigNodeData | SelectNodeData;
    if (!nodeData.replacementRules || nodeData.replacementRules.length === 0) {
      errors.push({
        nodeId: udfNode.id,
        nodeType: FlowNodeType.UDF_CONFIG,
        message: '替换规则不能为空，请至少配置一条替换规则',
        severity: ValidationSeverity.ERROR,
      });
    }

    // originalValue is required unless conditionType is 'replace_all' (fill_map path)
    const incompleteRules = nodeData.replacementRules?.filter(
      (r) =>
        !r.sourceTable ||
        !r.targetColumn ||
        r.targetColumn.length === 0 ||
        r.targetValue === '' ||
        (r.conditionType !== 'replace_all' && r.originalValue === '')
    );
    if (incompleteRules && incompleteRules.length > 0) {
      errors.push({
        nodeId: udfNode.id,
        nodeType: FlowNodeType.UDF_CONFIG,
        message: `存在 ${incompleteRules.length} 条不完整的替换规则，请填写数据源、目标列、原值和目标值`,
        severity: ValidationSeverity.ERROR,
      });
    }

    if (errors.length > 0) {
      console.warn(`[${this.name}.validate] ${errors.length} error(s):`, errors.map((e) => e.message));
    } else {
      console.log(`[${this.name}.validate] OK — node=${udfNode.id}, rules=${nodeData.replacementRules?.length ?? 0}`);
    }
    return errors;
  }

  // --------------------------------------------------------------------------
  // getRequiredNodes
  // --------------------------------------------------------------------------
  /**
   * No static required node types — _findUdfConfigNode() accepts both
   * FlowNodeType.UDF_CONFIG (legacy) and FlowNodeType.SELECT with udfFunctionName.
   */
  getRequiredNodes(): FlowNodeType[] {
    return [];
  }

  /**
   * validateUdfConfig stub — this class overrides validate() fully, so this
   * abstract method will never be called via the base class template.
   */
  protected validateUdfConfig(_nodes: FlowNode[], _edges: FlowEdge[], _udfNode: FlowNode): ValidationError[] {
    return [];
  }

  // --------------------------------------------------------------------------
  // buildSql
  // --------------------------------------------------------------------------
  /**
   * Build the UDF SQL call from the UDF_CONFIG node's replacement rules.
   *
   * Single-table path: passes the table name directly (existing behaviour, fully compatible).
   * Multi-table path:  reads JOIN topology from canvas edges (type='join'), builds a subquery,
   *                    and passes it as the `tbl` argument so the MACRO expands it via CASE WHEN.
   *
   * Rules with conditionType 'replace_all' are routed to fill_map (unconditional overwrite).
   * All other rules are routed to swap_map (CASE WHEN matching).
   */
  buildSql(nodes: FlowNode[], edges: FlowEdge[], placeholderValues?: Record<string, unknown>): string {
    const nodeTypes = nodes.map((n) => n.type).join(', ');
    console.log(`[${this.name}.buildSql] nodes=[${nodeTypes}]`);

    const udfNode = this._findUdfConfigNode(nodes);
    if (!udfNode) {
      throw new Error('UDF 配置节点未找到，无法构建 SQL');
    }

    const nodeData = udfNode.data as UdfConfigNodeData | SelectNodeData;
    const rules = (nodeData.replacementRules as ReplaceRule[] | undefined) ?? [];
    const outputColumns = (nodeData as SelectNodeData).outputColumns ?? [];

    if (rules.length === 0) {
      throw new Error('替换规则为空，无法构建 SQL');
    }

    // Extract full column schemas from TABLE nodes (needed for conflict resolution)
    const fullTableSchemas = this._extractTableSchemas(nodes);

    // Group rules by sourceTable (used for fill_map / swap_map keys)
    const tableGroups = this._groupByTable(rules);

    if (tableGroups.size === 0) {
      throw new Error('无法确定数据源表名');
    }

    let tblParam: string;
    let conflictMap = new Map<string, Map<string, string>>();

    // Use canvas join topology (not rule coverage) to decide single vs multi-table.
    // Even when rules only touch one table, if the canvas has configured join edges
    // the SQL must include the full JOIN subquery to respect the user's join setup.
    const canvasJoinedTables = getCanvasJoinedTables(edges);
    const isMultiTable = canvasJoinedTables.length >= 2;

    if (!isMultiTable) {
      // Genuine single-table: no join edges configured on canvas
      const [tableName] = [...tableGroups.keys()];
      tblParam = tableName;
    } else {
      // Multi-table path: always use all canvas-joined tables, regardless of how
      // many tables the rules happen to reference.  This preserves the full JOIN
      // subquery even when rules only operate on one table's columns.
      const allTables = canvasJoinedTables;
      const targetColsByTable = new Map<string, string[]>();
      for (const rule of rules) {
        const existing = targetColsByTable.get(rule.sourceTable) ?? [];
        for (const col of rule.targetColumn) {
          if (!existing.includes(col)) existing.push(col);
        }
        targetColsByTable.set(rule.sourceTable, existing);
      }
      const joinResult = buildJoinSubquery(allTables, edges, targetColsByTable, fullTableSchemas);
      if (joinResult) {
        tblParam = joinResult.sql;
        conflictMap = joinResult.columnAliasMap;
      } else {
        // Fallback: join edges not fully configured — use the first rule table
        const [tableName] = [...tableGroups.keys()];
        tblParam = tableName;
      }
    }

    // Build condition SQL via shared UDF helper.
    // Pass conflictMap so multi-table column refs are rewritten using the actual
    // subquery aliases (e.g. "main_table_1"."id" → "tb1.id") instead of the naive
    // "tableName.field" concatenation which DuckDB cannot resolve.
    const conditionSql = this.buildUdfConditionSql(nodes, placeholderValues, tblParam, undefined, conflictMap);

    // In single-table mode the UDF output rows carry plain column names (e.g. "total_amount").
    // The drawer UI always computes display names against all canvas-joined tables, so
    // outputColumns may contain "tb1.total_amount" even when only one table is active.
    // Strip the tbN. prefix so DuckDB can resolve them correctly.
    const normalizedOutputColumns = tblParam.startsWith('(')
      ? outputColumns
      : outputColumns.map((c) => c.replace(/^tb\d+\./, ''));

    const sql = this._buildUdfCall(tblParam, rules, conflictMap, conditionSql, normalizedOutputColumns);
    return sql;
  }

  // --------------------------------------------------------------------------
  // postProcess
  // --------------------------------------------------------------------------
  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema,
      insights: ['替换特定列值执行成功'],
      visualizations: [
        {
          type: 'table',
          config: { data: queryResult.data },
        },
      ],
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private _findUdfConfigNode(nodes: FlowNode[]): FlowNode | undefined {
    // First: dedicated UDF_CONFIG node (legacy)
    const legacyNode = nodes.find((n) => n.type === FlowNodeType.UDF_CONFIG);
    if (legacyNode) return legacyNode;

    // Second: SELECT node with explicit UDF function name (standard UDF flow)
    const udfSelectNode = nodes.find(
      (n) =>
        n.type === FlowNodeType.SELECT &&
        (n.data as { udfFunctionName?: string }).udfFunctionName === 'udf_replace_spec_column_value'
    );
    if (udfSelectNode) return udfSelectNode;

    // Fallback: any SELECT node — handles the case where udfFunctionName was not yet synced
    // (e.g., kernel pre-selected without triggering handleKernelChange).
    // Subsequent replacementRules validation will guide the user to configure it.
    return nodes.find((n) => n.type === FlowNodeType.SELECT);
  }

  /**
   * Extract full column schema for each TABLE node on the canvas.
   * Returns Map<tableName, columnNames[]> for conflict resolution.
   */
  private _extractTableSchemas(nodes: FlowNode[]): Map<string, string[]> {
    const schemas = new Map<string, string[]>();
    for (const node of nodes) {
      if (node.type === FlowNodeType.TABLE) {
        const data = node.data as TableNodeData;
        schemas.set(data.tableName, data.fields.map((f) => f.name));
      }
    }
    return schemas;
  }

  /**
   * Group replacement rules by source table name.
   */
  private _groupByTable(rules: ReplaceRule[]): Map<string, ReplaceRule[]> {
    const groups = new Map<string, ReplaceRule[]>();
    for (const rule of rules) {
      const existing = groups.get(rule.sourceTable) ?? [];
      existing.push(rule);
      groups.set(rule.sourceTable, existing);
    }
    return groups;
  }

  /**
   * Build a single udf_replace_spec_column_value() SQL call.
   *
   * @param tblOrSubquery  - Either a plain table name or a parenthesised subquery string.
   *   Both are always passed as a single-quoted VARCHAR string to the MACRO.
   *   The MACRO's CASE WHEN left(trim(tbl),1)='(' detects and expands sub-queries internally.
   * @param rules          - Replacement rules from the UDF config node.
   * @param columnAliasMap - Optional: tableName → (originalCol → resolvedAlias) from
   *   resolveColumnConflicts(). When present, fill_map / swap_map keys use the resolved alias
   *   so that they match the actual column names produced by the multi-table subquery.
   *
   * fill_map JSON shape:  { "col": "new_value" }           — replace_all rules
   * swap_map JSON shape:  { "col": ["original", "target"] } — contains / all rules
   * condition: from canvas condition-definition nodes (placeholderValues), or first rule's conditionValue
   */
  private _buildUdfCall(
    tblOrSubquery: string,
    rules: ReplaceRule[],
    columnAliasMap?: Map<string, Map<string, string>>,
    conditionSql?: string,
    outputColumns?: string[]
  ): string {
    const fillMapObj: Record<string, string> = {};
    const swapMapObj: Record<string, [string, string]> = {};

    for (const rule of rules) {
      const renames = columnAliasMap?.get(rule.sourceTable);
      for (const col of rule.targetColumn) {
        // Use the conflict-resolved alias as the fill/swap map key so it matches
        // the actual column name produced by the subquery projection.
        const renamedCol = renames?.get(col) ?? col;
        if (rule.conditionType === 'replace_all') {
          fillMapObj[renamedCol] = rule.targetValue;
        } else {
          swapMapObj[renamedCol] = [rule.originalValue, rule.targetValue];
        }
      }
    }

    // tbl is VARCHAR in the MACRO — always pass as a single-quoted string.
    // The MACRO internally uses CASE WHEN left(trim(tbl), 1) = '(' to detect and expand sub-queries.
    const tblArg = `  '${escapeSql(tblOrSubquery)}'`;

    const params: string[] = [tblArg];

    if (Object.keys(fillMapObj).length > 0) {
      params.push(`  fill_map := '${escapeSql(JSON.stringify(fillMapObj))}'`);
    }
    if (Object.keys(swapMapObj).length > 0) {
      params.push(`  swap_map := '${escapeSql(JSON.stringify(swapMapObj))}'`);
    }

    // Condition priority: canvas placeholder values > rule-level conditionValue
    const effectiveCondition =
      conditionSql && conditionSql.length > 0
        ? conditionSql
        : (rules.find((r) => r.conditionType === 'contains' && r.conditionValue)?.conditionValue ?? '');

    if (effectiveCondition) {
      params.push(`  condition := '${escapeSql(effectiveCondition)}'`);
    }

    // SELECT clause: use specific columns when user has configured output columns
    const selectClause =
      outputColumns && outputColumns.length > 0
        ? outputColumns.map((c) => `"${c}"`).join(', ')
        : '*';

    return `SELECT ${selectClause}\nFROM udf_replace_spec_column_value(\n${params.join(',\n')}\n)`;
  }
}

export default UdfReplaceColumnStrategy;
