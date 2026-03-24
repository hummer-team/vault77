/**
 * UDF Replace Column Strategy
 * Implements the strategy pattern for the "替换特定列值" data-cleaning operator.
 * Builds a DuckDB SQL call to udf_replace_spec_column_value().
 *
 * SQL shape:
 *   SELECT * FROM udf_replace_spec_column_value(
 *     'table_name',
 *     swap_map  := '{"col": ["from_val", "to_val"]}',
 *     condition := 'col = ''value'''   -- optional
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
    const errors: ValidationError[] = [];

    const udfNode = this._findUdfConfigNode(nodes);
    if (!udfNode) {
      errors.push({
        nodeId: 'flow',
        nodeType: FlowNodeType.END,
        message: '缺少 UDF 配置节点，请在画布中完成算子配置',
        severity: ValidationSeverity.ERROR,
      });
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

    const incompleteRules = nodeData.replacementRules?.filter(
      (r) => !r.sourceTable || !r.targetColumn || r.originalValue === '' || r.targetValue === ''
    );
    if (incompleteRules && incompleteRules.length > 0) {
      errors.push({
        nodeId: udfNode.id,
        nodeType: FlowNodeType.UDF_CONFIG,
        message: `存在 ${incompleteRules.length} 条不完整的替换规则，请填写数据源、目标列、原值和目标值`,
        severity: ValidationSeverity.ERROR,
      });
    }

    return errors;
  }

  // --------------------------------------------------------------------------
  // getRequiredNodes
  // --------------------------------------------------------------------------
  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.UDF_CONFIG];
  }

  // --------------------------------------------------------------------------
  // buildSql
  // --------------------------------------------------------------------------
  /**
   * Build the UDF SQL call from the UDF_CONFIG node's replacement rules.
   *
   * Groups rules by (sourceTable, conditionType, conditionValue) so that
   * multiple columns on the same table+condition can share one UDF call.
   */
  buildSql(nodes: FlowNode[], _edges: FlowEdge[], _placeholderValues?: Record<string, unknown>): string {
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

    return this._buildUdfCall(tableName, tableRules);
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
   * swap_map JSON shape: { "col": ["original", "target"] }
   * condition: first rule's condition expression (same table assumed to share condition)
   */
  private _buildUdfCall(tableName: string, rules: ReplaceRule[]): string {
    // Build swap_map: { "col1": ["from1", "to1"], "col2": ["from2", "to2"] }
    const swapMapObj: Record<string, [string, string]> = {};
    for (const rule of rules) {
      swapMapObj[rule.targetColumn] = [rule.originalValue, rule.targetValue];
    }
    const swapMapJson = JSON.stringify(swapMapObj);

    // Build condition from first rule that has conditionType 'contains'
    const conditionRule = rules.find((r) => r.conditionType === 'contains' && r.conditionValue);
    const conditionPart = conditionRule
      ? `, condition := '${escapeSql(conditionRule.conditionValue ?? '')}'`
      : '';

    return (
      `SELECT * FROM udf_replace_spec_column_value(\n` +
      `  '${escapeSql(tableName)}',\n` +
      `  swap_map := '${escapeSql(swapMapJson)}'` +
      conditionPart +
      `\n)`
    );
  }
}

export default UdfReplaceColumnStrategy;
