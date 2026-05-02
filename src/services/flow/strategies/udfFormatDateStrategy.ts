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
  type UdfConfigNodeData,
  type FormatDateConfig,
} from '../types';
import { UdfBaseStrategy } from './udfBaseStrategy';
import { escapeSql } from './udfShared';

export class UdfFormatDateStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_FORMAT_DATE;
  readonly name = '日期时间格式化';
  readonly udfFunctionName = 'udf_format_date_time';

  getRequiredNodes(): FlowNodeType[] {
    return [];
  }

  // --------------------------------------------------------------------------
  // validateUdfConfig — called by UdfBaseStrategy.validate() after node check
  // --------------------------------------------------------------------------
  protected validateUdfConfig(
    _nodes: FlowNode[],
    _edges: FlowEdge[],
    udfNode: FlowNode
  ): ValidationError[] {
    const cfg = (udfNode.data as UdfConfigNodeData).formatDateConfig;
    if (!cfg || Object.keys(cfg.colConfigJson).length === 0) {
      return [
        {
          nodeId: udfNode.id,
          nodeType: FlowNodeType.UDF_CONFIG,
          message: '请至少配置一列的日期格式转换规则',
          severity: ValidationSeverity.ERROR,
        },
      ];
    }
    return [];
  }

  // --------------------------------------------------------------------------
  // buildUdfSql
  // --------------------------------------------------------------------------
  protected buildUdfSql(nodes: FlowNode[], edges: FlowEdge[], placeholderValues?: Record<string, unknown>): string {
    const udfNode = this.findUdfNode(nodes, this.udfFunctionName);
    if (!udfNode) throw new Error('UDF 配置节点未找到，无法构建 SQL');

    const cfg = (udfNode.data as UdfConfigNodeData).formatDateConfig;
    if (!cfg || Object.keys(cfg.colConfigJson).length === 0) {
      throw new Error('日期时间格式化配置为空，无法构建 SQL');
    }

    // Full-schema mode — fixes multi-table column conflict bug
    const { tblParam, columnAliasMap } = this.resolveTblParam(nodes, edges);

    // Remap colConfigJson keys from "tableName.col" → "tbN.col" for multi-table mode
    const remappedColConfigJson: typeof cfg.colConfigJson = {};
    for (const [key, colParams] of Object.entries(cfg.colConfigJson)) {
      remappedColConfigJson[this.remapColumnKey(key, columnAliasMap)] = colParams;
    }

    const conditionSql = this.buildUdfConditionSql(
      nodes, placeholderValues, tblParam, cfg.condition, columnAliasMap
    );

    const serialized = this._serializeColConfig(remappedColConfigJson);
    const params: string[] = [
      `  '${escapeSql(tblParam)}'`,
      `  col_config_json := '${escapeSql(JSON.stringify(serialized))}'`,
    ];
    if (conditionSql) params.push(`  condition := '${escapeSql(conditionSql)}'`);

    const outputColumns = (udfNode.data as UdfConfigNodeData).outputColumns ?? [];
    const selectClause = this.buildUdfSelectClause(outputColumns, columnAliasMap);
    const sql = `${selectClause}\nFROM udf_format_date_time(\n${params.join(',\n')}\n)`;
    console.log(`[${this.name}.buildUdfSql] sql=\n${sql}`);
    return sql;
  }

  // postProcess and getSuccessInsight are inherited from UdfBaseStrategy

  // ============================================================================
  // Private helpers
  // ============================================================================

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
}

export default UdfFormatDateStrategy;
