/**
 * UDF Format Date Strategy
 * Implements the strategy pattern for the "日期时间格式化" data-cleaning operator.
 * Builds a DuckDB SQL call to udf_format_date_time().
 *
 * SQL shape:
 *   SELECT * FROM udf_format_date_time(
 *     'table_name',
 *     col_config_json := '{"created_at": {"src_fmt": "auto", "src_tz": "UTC", "dst_tz": "Asia/Shanghai", "dst_fmt": "datetime"}}',
 *     condition       := ''  -- optional
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
  type FormatDateConfig,
} from '../types';
import { UdfBaseStrategy } from './udfBaseStrategy';
import { escapeSql, buildJoinSubquery } from './udfShared';

export class UdfFormatDateStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_FORMAT_DATE;
  readonly name = '日期时间格式化';

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

    const cfg = (udfNode.data as UdfConfigNodeData).formatDateConfig;
    if (!cfg || Object.keys(cfg.colConfigJson).length === 0) {
      errors.push({
        nodeId: udfNode.id,
        nodeType: FlowNodeType.UDF_CONFIG,
        message: '请至少配置一列的日期格式转换规则',
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
    const cfg = nodeData.formatDateConfig;
    if (!cfg || Object.keys(cfg.colConfigJson).length === 0) {
      throw new Error('日期时间格式化配置为空，无法构建 SQL');
    }

    const tblParam = this._resolveTbl(nodeData, edges, cfg);

    // tbl is VARCHAR in the MACRO — always pass as a single-quoted string.
    const tblArg = `  '${escapeSql(tblParam)}'`;

    // Serialize colConfigJson using camelCase → snake_case key mapping
    const serialized = this._serializeColConfig(cfg.colConfigJson);
    const params: string[] = [
      tblArg,
      `  col_config_json := '${escapeSql(JSON.stringify(serialized))}'`,
    ];

    const conditionSql = this.buildUdfConditionSql(nodes, placeholderValues, tblParam, cfg.condition);
    if (conditionSql) {
      params.push(`  condition := '${escapeSql(conditionSql)}'`);
    }

    const sql = `SELECT *\nFROM udf_format_date_time(\n${params.join(',\n')}\n)`;
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
      insights: ['日期时间格式化执行成功'],
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
          (n.data as { udfFunctionName?: string }).udfFunctionName === 'udf_format_date_time'
      ) ??
      nodes.find((n) => n.type === FlowNodeType.SELECT)
    );
  }

  /**
   * Convert camelCase frontend config keys to snake_case expected by the DuckDB MACRO.
   * e.g. { srcFmt, srcTz, dstTz, dstFmt } → { src_fmt, src_tz, dst_tz, dst_fmt }
   */
  private _serializeColConfig(
    colConfigJson: FormatDateConfig['colConfigJson']
  ): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    for (const [col, params] of Object.entries(colConfigJson)) {
      const snakeParams: Record<string, string> = {};
      if (params.srcFmt !== undefined) snakeParams['src_fmt'] = params.srcFmt;
      if (params.srcTz  !== undefined) snakeParams['src_tz']  = params.srcTz;
      if (params.dstTz  !== undefined) snakeParams['dst_tz']  = params.dstTz;
      if (params.dstFmt !== undefined) snakeParams['dst_fmt'] = params.dstFmt;
      result[col] = snakeParams;
    }
    return result;
  }

  private _resolveTbl(
    nodeData: UdfConfigNodeData,
    edges: FlowEdge[],
    cfg: FormatDateConfig
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
      const cols = Object.keys(cfg.colConfigJson);
      const colsByTable = new Map<string, string[]>(tables.map((t) => [t, cols]));
      const subquery = buildJoinSubquery(tables, edges, colsByTable);
      if (subquery) return subquery;
    }
    return (nodeData as unknown as { sourceTable?: string }).sourceTable ?? '__src';
  }
}

export default UdfFormatDateStrategy;
