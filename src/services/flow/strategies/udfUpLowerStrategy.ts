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
  type UdfConfigNodeData,
} from '../types';
import { UdfBaseStrategy } from './udfBaseStrategy';
import { escapeSql } from './udfShared';

export class UdfUpLowerStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_UP_LOWER;
  readonly name = '大小写转换';
  readonly udfFunctionName = 'udf_up_lower_str';

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
    const cfg = (udfNode.data as UdfConfigNodeData).upLowerConfig;
    if (!cfg || cfg.cols.length === 0) {
      return [
        {
          nodeId: udfNode.id,
          nodeType: FlowNodeType.UDF_CONFIG,
          message: '请至少选择一个需要大小写转换的列',
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

    const cfg = (udfNode.data as UdfConfigNodeData).upLowerConfig;
    if (!cfg || cfg.cols.length === 0) throw new Error('大小写转换配置为空，无法构建 SQL');

    // Full-schema mode — fixes multi-table column conflict bug
    const { tblParam, columnAliasMap } = this.resolveTblParam(nodes, edges);

    // Remap cols from "tableName.col" → "tbN.col" for multi-table mode
    const remappedCols = cfg.cols.map((col) => this.remapColumnKey(col, columnAliasMap));

    const conditionSql = this.buildUdfConditionSql(
      nodes, placeholderValues, tblParam, cfg.condition, columnAliasMap
    );

    const params: string[] = [
      `  '${escapeSql(tblParam)}'`,
      `  cols := ${JSON.stringify(remappedCols)}`,
      `  action := '${escapeSql(cfg.action ?? 'upper')}'`,
    ];
    if (conditionSql) params.push(`  condition := '${escapeSql(conditionSql)}'`);

    const outputColumns = (udfNode.data as UdfConfigNodeData).outputColumns ?? [];
    const selectClause = this.buildUdfSelectClause(outputColumns, columnAliasMap);
    const sql = `${selectClause}\nFROM udf_up_lower_str(\n${params.join(',\n')}\n)`;
    console.log(`[${this.name}.buildUdfSql] sql=\n${sql}`);
    return sql;
  }

  // postProcess is inherited from UdfBaseStrategy
}

export default UdfUpLowerStrategy;
