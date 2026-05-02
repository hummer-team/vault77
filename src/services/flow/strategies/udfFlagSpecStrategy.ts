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
  type UdfConfigNodeData,
} from '../types';
import { UdfBaseStrategy } from './udfBaseStrategy';
import { escapeSql } from './udfShared';

export class UdfFlagSpecStrategy extends UdfBaseStrategy {
  readonly type: OperatorType = OperatorType.UDF_FLAG_SPEC;
  readonly name = '数据标记';
  readonly udfFunctionName = 'udf_flag_spec_column';

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
    const cfg = (udfNode.data as UdfConfigNodeData).flagSpecConfig;
    if (!cfg || Object.keys(cfg.flagsConfig).length === 0) {
      return [
        {
          nodeId: udfNode.id,
          nodeType: FlowNodeType.UDF_CONFIG,
          message: '请至少配置一列的标记规则',
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

    const cfg = (udfNode.data as UdfConfigNodeData).flagSpecConfig;
    if (!cfg || Object.keys(cfg.flagsConfig).length === 0) {
      throw new Error('数据标记配置为空，无法构建 SQL');
    }

    // Full-schema mode — fixes multi-table column conflict bug
    const { tblParam, columnAliasMap } = this.resolveTblParam(nodes, edges);

    // Remap flagsConfig keys from "tableName.col" → "tbN.col" for multi-table mode
    const remappedFlagsConfig: typeof cfg.flagsConfig = {};
    for (const [key, rule] of Object.entries(cfg.flagsConfig)) {
      remappedFlagsConfig[this.remapColumnKey(key, columnAliasMap)] = rule;
    }

    const conditionSql = this.buildUdfConditionSql(
      nodes, placeholderValues, tblParam, cfg.condition, columnAliasMap
    );

    const params: string[] = [
      `  '${escapeSql(tblParam)}'`,
      `  flags_config := '${escapeSql(JSON.stringify(remappedFlagsConfig))}'`,
    ];
    if (conditionSql) params.push(`  condition := '${escapeSql(conditionSql)}'`);

    const outputColumns = (udfNode.data as UdfConfigNodeData).outputColumns ?? [];
    const selectClause = this.buildUdfSelectClause(outputColumns, columnAliasMap);
    const sql = `${selectClause}\nFROM udf_flag_spec_column(\n${params.join(',\n')}\n)`;
    console.log(`[${this.name}.buildUdfSql] sql=\n${sql}`);
    return sql;
  }

  // postProcess and getSuccessInsight are inherited from UdfBaseStrategy
}

export default UdfFlagSpecStrategy;
