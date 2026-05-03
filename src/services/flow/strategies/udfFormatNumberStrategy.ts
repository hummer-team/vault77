/**
 * UDF Format Number Strategy
 * Implements the strategy pattern for the "数字精度控制" data-cleaning operator.
 * Builds a DuckDB SQL call to udf_format_number().
 *
 * SQL shape:
 *   SELECT * FROM udf_format_number(
 *     'table_name',
 *     cols_config := '{"price": 2, "amount": 0}',
 *     round_mode  := 'half_up',         -- 'half_up' | 'truncate' | 'ceil' | 'floor'
 *     condition   := 'col = ''value'''  -- optional
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

export class UdfFormatNumberStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_FORMAT_NUMBER;
  readonly name = '数字精度控制';
  readonly udfFunctionName = 'udf_format_number';

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
    const cfg = (udfNode.data as UdfConfigNodeData).formatNumberConfig;
    if (!cfg || Object.keys(cfg.colsConfig).length === 0) {
      return [
        {
          nodeId: udfNode.id,
          nodeType: FlowNodeType.UDF_CONFIG,
          message: '请至少配置一列的精度规则',
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

    const cfg = (udfNode.data as UdfConfigNodeData).formatNumberConfig;
    if (!cfg || Object.keys(cfg.colsConfig).length === 0) {
      throw new Error('数字精度控制配置为空，无法构建 SQL');
    }

    // Full-schema mode — fixes multi-table column conflict bug
    const { tblParam, columnAliasMap } = this.resolveTblParam(nodes, edges);

    // Remap colsConfig keys from "tableName.col" → "tbN.col" for multi-table mode
    const remappedColsConfig: Record<string, number> = {};
    for (const [key, decimals] of Object.entries(cfg.colsConfig)) {
      remappedColsConfig[this.remapColumnKey(key, columnAliasMap)] = decimals;
    }

    const conditionSql = this.buildUdfConditionSql(
      nodes, placeholderValues, tblParam, cfg.condition, columnAliasMap
    );

    const params: string[] = [
      `  '${escapeSql(tblParam)}'`,
      `  cols_config := '${escapeSql(JSON.stringify(remappedColsConfig))}'`,
      `  round_mode := '${escapeSql(cfg.roundMode ?? 'half_up')}'`,
    ];
    if (conditionSql) params.push(`  condition := '${escapeSql(conditionSql)}'`);

    const outputColumns = (udfNode.data as UdfConfigNodeData).outputColumns ?? [];
    const selectClause = this.buildUdfSelectClause(outputColumns, columnAliasMap);
    const sql = `${selectClause}\nFROM udf_format_number(\n${params.join(',\n')}\n)`;
    console.log(`[${this.name}.buildUdfSql] sql=\n${sql}`);
    return sql;
  }

  // postProcess is inherited from UdfBaseStrategy
}

export default UdfFormatNumberStrategy;
