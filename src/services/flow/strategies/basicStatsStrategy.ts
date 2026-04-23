/**
 * BasicStatsStrategy
 * Builds GROUP BY aggregate SQL from BasicStatsConfig stored on the SelectNode.
 * Does NOT use a DuckDB MACRO — generates standard SQL directly.
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type BasicStatsConfig,
} from '../types';

export class BasicStatsStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.BASIC_STATS;
  readonly name = '基础统计分析';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  buildSql(nodes: FlowNode[], _edges: FlowEdge[]): string {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const config = (selectNode?.data as { basicStatsConfig?: BasicStatsConfig } | undefined)
      ?.basicStatsConfig;

    if (!config || config.aggFields.length === 0) {
      // Fallback: plain SELECT * from the first table
      const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
      const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';
      return `SELECT *\nFROM "${tableName}"`;
    }

    const parts: string[] = [];

    // SELECT clause: group cols first, then agg expressions
    const selectCols: string[] = [
      ...config.groupByColumns.map((c) => `"${c}"`),
      ...config.aggFields.map((f) => `${f.func}("${f.column}") AS "${f.alias}"`),
    ];
    parts.push(`SELECT ${selectCols.join(', ')}`);

    // FROM
    parts.push(`FROM "${config.tableName}"`);

    // GROUP BY
    if (config.groupByColumns.length > 0) {
      parts.push(`GROUP BY ${config.groupByColumns.map((c) => `"${c}"`).join(', ')}`);
    }

    // HAVING (result filter)
    if (config.havingFilters.length > 0) {
      const validFilters = config.havingFilters.filter((f) => Number.isFinite(f.value));
      if (validFilters.length > 0) {
        const conditions = validFilters
          .map((f) => `"${f.resultAlias}" ${f.operator} ${f.value}`)
          .join(' AND ');
        parts.push(`HAVING ${conditions}`);
      }
    }

    // ORDER BY
    if (config.sortConfigs.length > 0) {
      const orderCols = config.sortConfigs.map((s) => `"${s.column}" ${s.direction}`);
      parts.push(`ORDER BY ${orderCols.join(', ')}`);
    }

    const sql = parts.join('\n');
    console.log(`[${this.name}.buildSql] sql=\n${sql}`);
    return sql;
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema,
      insights: ['基础统计分析执行成功'],
      visualizations: [{ type: 'table', config: { data: queryResult.data } }],
    };
  }
}
