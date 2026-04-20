/**
 * UDF Flag Spec Strategy
 * Implements the strategy pattern for the "数据标记/打标" data-cleaning operator.
 * Builds a DuckDB SQL call to udf_flag_spec_column().
 *
 * SQL shape:
 *   SELECT * FROM udf_flag_spec_column(
 *     'table_name',
 *     flags_config := '{"status_label": {"cases": [["status=1","Active"]], "else": "Inactive"}}',
 *     condition    := ''  -- optional
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

export class UdfFlagSpecStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_FLAG_SPEC;
  readonly name = '数据标记';

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

    const cfg = (udfNode.data as UdfConfigNodeData).flagSpecConfig;
    if (!cfg || Object.keys(cfg.flagsConfig).length === 0) {
      errors.push({
        nodeId: udfNode.id,
        nodeType: FlowNodeType.UDF_CONFIG,
        message: '请至少配置一列的标记规则',
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
    const cfg = nodeData.flagSpecConfig;
    if (!cfg || Object.keys(cfg.flagsConfig).length === 0) {
      throw new Error('数据标记配置为空，无法构建 SQL');
    }

    const tblParam = this._resolveTbl(nodeData, edges, cfg.flagsConfig);

    // tbl is VARCHAR in the MACRO — always pass as a single-quoted string.
    const tblArg = `  '${escapeSql(tblParam)}'`;

    const params: string[] = [
      tblArg,
      `  flags_config := '${escapeSql(JSON.stringify(cfg.flagsConfig))}'`,
    ];

    const conditionSql = this.buildUdfConditionSql(nodes, placeholderValues, tblParam, cfg.condition);
    if (conditionSql) {
      params.push(`  condition := '${escapeSql(conditionSql)}'`);
    }

    const sql = `SELECT *\nFROM udf_flag_spec_column(\n${params.join(',\n')}\n)`;
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
      insights: ['数据标记执行成功'],
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
          (n.data as { udfFunctionName?: string }).udfFunctionName === 'udf_flag_spec_column'
      ) ??
      nodes.find((n) => n.type === FlowNodeType.SELECT)
    );
  }

  private _resolveTbl(
    nodeData: UdfConfigNodeData,
    edges: FlowEdge[],
    flagsConfig: Record<string, unknown>
  ): string {
    const joinEdges = edges.filter((e) => e.type === 'join' && e.data);
    if (joinEdges.length > 0) {
      const tableSet = new Set<string>();
      for (const e of joinEdges) {
        const d = e.data as { sourceTableName?: string; targetTableName?: string };
        if (d.sourceTableName) tableSet.add(d.sourceTableName);
        if (d.targetTableName) tableSet.add(d.targetTableName);
      }
      const tables = [...tableSet];
      const cols = Object.keys(flagsConfig);
      const colsByTable = new Map<string, string[]>(tables.map((t) => [t, cols]));
      const subquery = buildJoinSubquery(tables, edges, colsByTable);
      if (subquery) return subquery;
    }
    return (nodeData as unknown as { sourceTable?: string }).sourceTable ?? '__src';
  }
}

export default UdfFlagSpecStrategy;
