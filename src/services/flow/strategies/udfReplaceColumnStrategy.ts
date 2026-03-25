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
  type FlowStrategy,
  type FlowNode,
  type FlowEdge,
  type ValidationError,
  type AnalysisResult,
  type UdfConfigNodeData,
  type SelectNodeData,
  type ReplaceRule,
} from '../types';

// ============================================================================
// Helper: escape a single-quoted SQL string literal
// ============================================================================
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

// ============================================================================
// UdfReplaceColumnStrategy
// ============================================================================

export class UdfReplaceColumnStrategy implements FlowStrategy {
  readonly type: OperatorType = OperatorType.UDF_REPLACE_COLUMN;
  readonly name = '替换特定列值';

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

  // --------------------------------------------------------------------------
  // buildSql
  // --------------------------------------------------------------------------
  /**
   * Build the UDF SQL call from the UDF_CONFIG node's replacement rules.
   *
   * Rules with conditionType 'replace_all' are routed to fill_map (unconditional overwrite).
   * All other rules are routed to swap_map (CASE WHEN matching).
   */
  buildSql(nodes: FlowNode[], _edges: FlowEdge[], _placeholderValues?: Record<string, unknown>): string {
    const nodeTypes = nodes.map((n) => n.type).join(', ');
    console.log(`[${this.name}.buildSql] nodes=[${nodeTypes}]`);

    const udfNode = this._findUdfConfigNode(nodes);
    if (!udfNode) {
      throw new Error('UDF 配置节点未找到，无法构建 SQL');
    }

    const nodeData = udfNode.data as UdfConfigNodeData | SelectNodeData;
    const rules = (nodeData.replacementRules as ReplaceRule[] | undefined) ?? [];

    if (rules.length === 0) {
      throw new Error('替换规则为空，无法构建 SQL');
    }

    // Group rules by sourceTable to detect the primary table
    const tableGroups = this._groupByTable(rules);

    if (tableGroups.size === 0) {
      throw new Error('无法确定数据源表名');
    }

    // Use the first table group (current implementation: single table per UDF call)
    const [tableName, tableRules] = [...tableGroups.entries()][0];
    const sql = this._buildUdfCall(tableName, tableRules);
    console.log(`[${this.name}.buildSql] table=${tableName}, rules=${tableRules.length}, sql=\n${sql}`);
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
    // Support both legacy UDF_CONFIG node type and the unified SelectNode with udfFunctionName
    return nodes.find(
      (n) =>
        n.type === FlowNodeType.UDF_CONFIG ||
        (n.type === FlowNodeType.SELECT &&
          (n.data as { udfFunctionName?: string }).udfFunctionName === 'udf_replace_spec_column_value')
    );
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
   * Build a single udf_replace_spec_column_value() SQL call for all rules on one table.
   *
   * fill_map JSON shape:  { "col": "new_value" }           — replace_all rules
   * swap_map JSON shape:  { "col": ["original", "target"] } — contains / all rules
   * condition: first rule's conditionValue (when conditionType = 'contains')
   */
  private _buildUdfCall(tableName: string, rules: ReplaceRule[]): string {
    const fillMapObj: Record<string, string> = {};
    const swapMapObj: Record<string, [string, string]> = {};

    for (const rule of rules) {
      for (const col of rule.targetColumn) {
        if (rule.conditionType === 'replace_all') {
          // Unconditional whole-column overwrite → fill_map
          fillMapObj[col] = rule.targetValue;
        } else {
          // Conditional CASE WHEN replacement → swap_map
          swapMapObj[col] = [rule.originalValue, rule.targetValue];
        }
      }
    }

    const params: string[] = [`  '${escapeSql(tableName)}'`];

    if (Object.keys(fillMapObj).length > 0) {
      params.push(`  fill_map := '${escapeSql(JSON.stringify(fillMapObj))}'`);
    }
    if (Object.keys(swapMapObj).length > 0) {
      params.push(`  swap_map := '${escapeSql(JSON.stringify(swapMapObj))}'`);
    }

    // Condition from the first 'contains' rule
    const conditionRule = rules.find((r) => r.conditionType === 'contains' && r.conditionValue);
    if (conditionRule) {
      params.push(`  condition := '${escapeSql(conditionRule.conditionValue ?? '')}'`);
    }

    return `SELECT *\nFROM udf_replace_spec_column_value(\n${params.join(',\n')}\n)`;
  }
}

export default UdfReplaceColumnStrategy;
