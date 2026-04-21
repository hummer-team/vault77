/**
 * UDF Up-Lower Strategy
 * Implements the strategy pattern for the "大小写转换" data-cleaning operator.
 * Builds a DuckDB SQL call to udf_up_lower_str().
 *
 * SQL shape:
 *   SELECT * FROM udf_up_lower_str(
 *     'table_name',
 *     cols      := ['col1', 'col2'],
 *     action    := 'upper',          -- 'upper' | 'lower'
 *     condition := 'col = ''value''' -- optional
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
} from '../types';
import { UdfBaseStrategy } from './udfBaseStrategy';
import { escapeSql, buildJoinSubquery } from './udfShared';

export class UdfUpLowerStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_UP_LOWER;
  readonly name = '大小写转换';

  // --------------------------------------------------------------------------
  // validate
  // --------------------------------------------------------------------------
  validate(nodes: FlowNode[], _edges: FlowEdge[]): ValidationError[] {
    const errors: ValidationError[] = [];

    const udfNode = this._findUdfNode(nodes);
    if (!udfNode) {
      errors.push({
        nodeId: 'flow',
        nodeType: FlowNodeType.END,
        message: '缺少 UDF 配置节点，请在画布中完成算子配置',
        severity: ValidationSeverity.ERROR,
      });
      return errors;
    }

    const cfg = (udfNode.data as UdfConfigNodeData).upLowerConfig;
    if (!cfg || cfg.cols.length === 0) {
      errors.push({
        nodeId: udfNode.id,
        nodeType: FlowNodeType.UDF_CONFIG,
        message: '请至少选择一个需要大小写转换的列',
        severity: ValidationSeverity.ERROR,
      });
    }

    return errors;
  }

  getRequiredNodes(): FlowNodeType[] {
    return [];
  }

  // --------------------------------------------------------------------------
  // buildSql
  // --------------------------------------------------------------------------
  buildSql(nodes: FlowNode[], edges: FlowEdge[], placeholderValues?: Record<string, unknown>): string {
    const udfNode = this._findUdfNode(nodes);
    if (!udfNode) throw new Error('UDF 配置节点未找到，无法构建 SQL');

    const nodeData = udfNode.data as UdfConfigNodeData;
    const cfg = nodeData.upLowerConfig;
    if (!cfg || cfg.cols.length === 0) throw new Error('大小写转换配置为空，无法构建 SQL');

    const tblParam = this._resolveTbl(nodeData, edges);

    // tbl is VARCHAR in the MACRO — always pass as a single-quoted string.
    const tblArg = `  '${escapeSql(tblParam)}'`;

    const colsJson = JSON.stringify(cfg.cols);
    const params: string[] = [
      tblArg,
      `  cols := ${colsJson}`,
      `  action := '${escapeSql(cfg.action ?? 'upper')}'`,
    ];

    const conditionSql = this.buildUdfConditionSql(nodes, placeholderValues, tblParam, cfg.condition);
    if (conditionSql) {
      params.push(`  condition := '${escapeSql(conditionSql)}'`);
    }

    const sql = `SELECT *\nFROM udf_up_lower_str(\n${params.join(',\n')}\n)`;
    console.log(`[${this.name}.buildSql] sql=\n${sql}`);
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
      insights: ['大小写转换执行成功'],
      visualizations: [{ type: 'table', config: { data: queryResult.data } }],
    };
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private _findUdfNode(nodes: FlowNode[]): FlowNode | undefined {
    return (
      nodes.find((n) => n.type === FlowNodeType.UDF_CONFIG) ??
      nodes.find(
        (n) =>
          n.type === FlowNodeType.SELECT &&
          (n.data as { udfFunctionName?: string }).udfFunctionName === 'udf_up_lower_str'
      ) ??
      nodes.find((n) => n.type === FlowNodeType.SELECT)
    );
  }

  /**
   * Resolve the `tbl` argument: single table name or multi-table JOIN subquery.
   * upLowerConfig does not carry table-level rules, so we derive the table list
   * from the JOIN edges and fall back to nodeData.kernelName context.
   */
  private _resolveTbl(nodeData: UdfConfigNodeData, edges: FlowEdge[]): string {
    const joinEdges = edges.filter((e) => e.type === 'join' && e.data);
    if (joinEdges.length > 0) {
      // Multi-table: collect all table names from join edges
      const tableSet = new Set<string>();
      for (const e of joinEdges) {
        const d = e.data as { sourceTableName?: string; targetTableName?: string };
        if (d.sourceTableName) tableSet.add(d.sourceTableName);
        if (d.targetTableName) tableSet.add(d.targetTableName);
      }
      const tables = [...tableSet];
      const colsByTable = new Map<string, string[]>(
        tables.map((t) => [t, nodeData.upLowerConfig?.cols ?? []])
      );
      const joinResult = buildJoinSubquery(tables, edges, colsByTable);
      if (joinResult) return joinResult.sql;
    }
    // Single-table: use udfFunctionName-related table name or fallback
    return (nodeData as unknown as { sourceTable?: string }).sourceTable ?? '__src';
  }
}

export default UdfUpLowerStrategy;
