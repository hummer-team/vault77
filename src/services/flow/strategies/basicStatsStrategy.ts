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
  type OperatorInsightsData,
  type BasicStatsConfig,
} from '../types';

export class BasicStatsStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.BASIC_STATS;
  readonly name = '基础统计分析';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  private isTimeType(colType?: string): boolean {
    if (!colType) return false;
    const timeTypes = ['DATE', 'TIMESTAMP', 'DATETIME', 'TIMESTAMPTZ', 'TIMESTAMPNTZ'];
    return timeTypes.some((t) => colType.toUpperCase().includes(t));
  }

  buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const config = (selectNode?.data as { basicStatsConfig?: BasicStatsConfig } | undefined)
      ?.basicStatsConfig;

    if (!config || config.aggFields.length === 0) {
      // Fallback: plain SELECT * from the first table
      const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
      const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';
      return `SELECT *\nFROM "${tableName}"`;
    }

    // Get field type info from TABLE node
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableData = tableNode?.data as { fields?: { name: string; type?: string }[] } | undefined;
    const fieldTypeMap: Record<string, string | undefined> = {};
    if (tableData?.fields) {
      for (const field of tableData.fields) {
        fieldTypeMap[field.name] = field.type;
      }
    }

    const parts: string[] = [];

    // Helper: map granularity to strftime format string
    const getFormatString = (granularity: string): string | null => {
      switch (granularity) {
        case 'year':
          return '%Y';
        case 'quarter':
          // DuckDB quarter: use CONCAT with (MONTH()-1)/3+1
          return null; // special case handled below
        case 'month':
          return '%Y-%m';
        case 'week':
          return '%Y-W%02d'; // strftime %W for week number
        case 'day':
          return '%Y-%m-%d';
        default:
          return '%Y-%m-%d';
      }
    };

    // Helper: build SELECT expression for a column (with time truncation + formatting if applicable)
    const getColumnExpr = (colName: string): string => {
      const colType = fieldTypeMap[colName];
      if (this.isTimeType(colType) && config.groupByGranularities?.[colName]) {
        const granularity = config.groupByGranularities[colName];
        const baseTrunc = `date_trunc('${granularity}', "${colName}"::TIMESTAMP)`;

        // Special handling for quarter
        if (granularity === 'quarter') {
          return `CONCAT(strftime(${baseTrunc}, '%Y'), '-Q', CAST(((MONTH(${baseTrunc})-1)/3)+1 AS VARCHAR))`;
        }

        const format = getFormatString(granularity);
        if (format) {
          return `strftime(${baseTrunc}, '${format}')`;
        }
      }
      return `"${colName}"`;
    };

    // Helper: build aggregation expression (with precision if applicable)
    const getAggExpr = (f: typeof config.aggFields[0]): string => {
      // Special case: COUNT(*) — no column quoting, no DISTINCT, no precision wrapping
      if (f.column === '*') {
        return 'COUNT(*)';
      }

      const aggExpr = `${f.func}(${f.distinct ? 'DISTINCT ' : ''}"${f.column}")`;
      
      // Apply precision for numeric result columns
      if (config.columnPrecision?.[f.column] !== undefined && ['SUM', 'AVG', 'MAX', 'MIN'].includes(f.func)) {
        const precision = config.columnPrecision[f.column];
        const strategy = config.columnPrecisionStrategy?.[f.column] ?? 'ROUND';
        
        if (strategy === 'TRUNCATE') {
          // DuckDB TRUNCATE: truncate_num(value, digits)
          return `truncate_num(${aggExpr}, ${precision})`;
        } else {
          // ROUND is default
          return `ROUND(${aggExpr}, ${precision})`;
        }
      }
      
      return aggExpr;
    };

    // SELECT clause: group cols first (with time truncation), then agg expressions
    const selectCols: string[] = [
      ...config.groupByColumns.map((c) => {
        const expr = getColumnExpr(c);
        return `${expr} AS "${c}"`;
      }),
      ...config.aggFields.map((f) => {
        const expr = getAggExpr(f);
        return `${expr} AS "${f.alias}"`;
      }),
    ];
    parts.push(`SELECT ${selectCols.join(', ')}`);

    // FROM
    parts.push(`FROM "${config.tableName}"`);

    // WHERE: provided by BaseStrategy.buildSql template via userWhere
    if (userWhere) {
      parts.push(userWhere);
    }
    
    // Debug: log all nodes
    const nodeTypes = nodes.map(n => n.type).join(', ');
    console.log(`[${this.name}.buildSql] nodes=[${nodeTypes}]`);

    // GROUP BY: use the same expressions as in SELECT (positional or full expressions)
    if (config.groupByColumns.length > 0) {
      const groupByCols = config.groupByColumns.map((c) => getColumnExpr(c));
      parts.push(`GROUP BY ${groupByCols.join(', ')}`);
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

    // ORDER BY: map column names to their expressions
    if (config.sortConfigs.length > 0) {
      const orderCols = config.sortConfigs.map((s) => {
        // Check if the sort column is a groupBy column
        if (config.groupByColumns.includes(s.column)) {
          const expr = getColumnExpr(s.column);
          return `${expr} ${s.direction}`;
        }
        // Otherwise, it's an alias from aggFields
        return `"${s.column}" ${s.direction}`;
      });
      parts.push(`ORDER BY ${orderCols.join(', ')}`);
    }

    const sql = parts.join('\n');
    console.log(`[${this.name}.buildOperatorSql] sql=\n${sql}`);
    return sql;
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    // Build formatters dynamically based on actual schema and aggregation column names
    // Infer formatter type from SQL function in aggregation column alias
    const columnFormatters: Record<string, any> = {};
    const columnTooltips: Record<string, string> = {};

    const schemaArray = queryResult.schema as { name: string; type?: string }[];

    for (const col of schemaArray) {
      const colName = col.name.toLowerCase();
      
      // Match numeric aggregation patterns: *_count, *_sum, *_avg, *_min, *_max, *_stddev
      if (colName.includes('_count') || colName === 'count') {
        columnFormatters[col.name] = { type: 'duration_days' as const, unit: '' };
        columnTooltips[col.name] = '该分组的记录数或计数值';
      } else if (colName.includes('_sum') || colName === 'sum') {
        columnFormatters[col.name] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[col.name] = '该分组的总和';
      } else if (colName.includes('_avg') || colName === 'avg') {
        columnFormatters[col.name] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[col.name] = '该分组的平均值';
      } else if (colName.includes('_min') || colName === 'min') {
        columnFormatters[col.name] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[col.name] = '该分组的最小值';
      } else if (colName.includes('_max') || colName === 'max') {
        columnFormatters[col.name] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[col.name] = '该分组的最大值';
      } else if (colName.includes('_stddev') || colName === 'stddev') {
        columnFormatters[col.name] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[col.name] = '该分组的标准差';
      } else if (colName.includes('_pct') || colName.includes('_percent')) {
        columnFormatters[col.name] = { type: 'percent_signed' as const, precision: 1 };
        columnTooltips[col.name] = '百分比数值';
      }
    }

    const rows = queryResult.data as Record<string, unknown>[];

    const displayConfig = columnFormatters ? {
      columnFormatters,
      columnTooltips,
    } : undefined;

    // Structured insights: single overview card with record/column counts
    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: rows.length,
        totalFilterRecordCount: rows.length,
      },
      insights: [{
        id: 'stats-overview',
        cardType: 'standard',
        iconKey: 'insight',
        title: '统计概览',
        sortOrder: 1,
        metrics: [
          { label: '分析记录数', value: rows.length, unit: '条' },
          { label: '统计列数', value: schemaArray.length, unit: '列' },
        ],
      }],
    };

    return {
      type: this.type,
      sql: '',
      data: rows,
      schema: queryResult.schema,
      insightsData,
      displayConfig,
    };
  }
}
