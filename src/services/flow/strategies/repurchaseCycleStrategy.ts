/**
 * RepurchaseCycleStrategy
 * Builds DuckDB SQL for fn_ecom_repurchase_cycle (复购周期分析).
 * Uses ts_parse() macro for order_time normalization.
 * Outputs detail (流失预警表) or summary (品类汇总表) based on config.outputMode.
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type RepurchaseCycleConfig,
} from '../types';

/** Build the reference date SQL expression based on refDateMode */
function buildRefDateExpr(tableName: string, config: RepurchaseCycleConfig): string {
  if (config.refDateMode === 'custom' && config.customRefDate) {
    return `'${config.customRefDate}'`;
  }
  return `(SELECT MAX(ts_parse("${config.orderTimeCol}", 'auto')) FROM "${tableName}")`;
}

/** Build the shared base CTEs used by both detail and summary modes */
function buildBaseCtes(tableName: string, config: RepurchaseCycleConfig, additionalWhere?: string): string {
  const { userIdCol, categoryCol, orderTimeCol, thresholds } = config;
  const refDateExpr = buildRefDateExpr(tableName, config);

  // Build the WHERE clause for the first CTE
  const whereClause = additionalWhere ? `WHERE ${additionalWhere.replace(/^WHERE\s+/i, '')}` : '';

  return [
    `WITH order_lags AS (`,
    `  SELECT`,
    `    "${userIdCol}"::VARCHAR AS user_id,`,
    `    "${categoryCol}"::VARCHAR AS category,`,
    `    ts_parse("${orderTimeCol}", 'auto') AS order_ts,`,
    `    LAG(ts_parse("${orderTimeCol}", 'auto')) OVER (`,
    `      PARTITION BY "${userIdCol}", "${categoryCol}"`,
    `      ORDER BY ts_parse("${orderTimeCol}", 'auto')`,
    `    ) AS prev_ts`,
    `  FROM "${tableName}"`,
    ...(whereClause ? [whereClause] : []),
    `),`,
    `user_cat_stats AS (`,
    `  SELECT`,
    `    user_id,`,
    `    category,`,
    `    MIN(order_ts) AS first_order,`,
    `    MAX(order_ts) AS last_order,`,
    `    COUNT(*) AS order_count,`,
    `    ROUND(`,
    `      AVG(DATEDIFF('day', prev_ts, order_ts)) FILTER (WHERE prev_ts IS NOT NULL),`,
    `      1`,
    `    ) AS avg_cycle_days`,
    `  FROM order_lags`,
    `  GROUP BY user_id, category`,
    `),`,
    `ref_date AS (`,
    `  SELECT ${refDateExpr}::TIMESTAMP AS ref_dt`,
    `),`,
    `with_risk AS (`,
    `  SELECT`,
    `    s.user_id,`,
    `    s.category,`,
    `    strftime(s.first_order, '%Y-%m-%d %H:%M:%S') AS first_order,`,
    `    strftime(s.last_order, '%Y-%m-%d %H:%M:%S') AS last_order,`,
    `    s.order_count,`,
    `    s.avg_cycle_days,`,
    `    DATEDIFF('day', s.last_order, r.ref_dt) AS current_interval_days,`,
    `    CASE`,
    `      WHEN s.order_count < 2 THEN '新用户/单次购'`,
    `      WHEN s.avg_cycle_days IS NULL THEN '数据不足'`,
    `      WHEN CAST(DATEDIFF('day', s.last_order, r.ref_dt) AS DOUBLE) / s.avg_cycle_days < ${thresholds.stable}  THEN '稳定'`,
    `      WHEN CAST(DATEDIFF('day', s.last_order, r.ref_dt) AS DOUBLE) / s.avg_cycle_days < ${thresholds.watch}   THEN '关注'`,
    `      WHEN CAST(DATEDIFF('day', s.last_order, r.ref_dt) AS DOUBLE) / s.avg_cycle_days < ${thresholds.warning} THEN '预警'`,
    `      ELSE '已流失'`,
    `    END AS risk_level,`,
    `    'TODO' AS suggested_action`,
    `  FROM user_cat_stats s, ref_date r`,
    `)`,
  ].join('\n');
}

/**
 * Build detail SQL (流失预警表).
 *
 * @param tableName - DuckDB table name
 * @param config    - RepurchaseCycleConfig
 */
export function buildRepurchaseDetailSql(tableName: string, config: RepurchaseCycleConfig, additionalWhere?: string): string {
  const baseCtes = buildBaseCtes(tableName, config, additionalWhere);

  let whereClause = '';
  if (config.detailRiskFilter.length > 0) {
    const levels = config.detailRiskFilter.map((l) => `'${l.replace(/'/g, "''")}'`).join(', ');
    whereClause = `WHERE risk_level IN (${levels})`;
  }

  return [
    baseCtes,
    `SELECT`,
    `  user_id,`,
    `  category,`,
    `  first_order,`,
    `  last_order,`,
    `  order_count,`,
    `  avg_cycle_days,`,
    `  current_interval_days,`,
    `  risk_level,`,
    `  suggested_action`,
    `FROM with_risk`,
    ...(whereClause ? [whereClause] : []),
    `ORDER BY current_interval_days DESC, category, user_id`,
  ].join('\n');
}

/**
 * Build summary SQL (品类汇总表).
 *
 * @param tableName - DuckDB table name
 * @param config    - RepurchaseCycleConfig
 */
export function buildRepurchaseSummarySql(tableName: string, config: RepurchaseCycleConfig, additionalWhere?: string): string {
  const baseCtes = buildBaseCtes(tableName, config, additionalWhere);
  const filteredWhere = config.summaryValidOnly ? `  WHERE order_count >= 2` : '';

  const selectBlock = [
    `  category,`,
    `  COUNT(*) AS user_count,`,
    `  ROUND(AVG(avg_cycle_days) FILTER (WHERE order_count >= 2), 1) AS avg_cycle_days,`,
    `  COUNT(*) FILTER (WHERE risk_level = '稳定') AS stable_count,`,
    `  COUNT(*) FILTER (WHERE risk_level = '关注') AS watch_count,`,
    `  COUNT(*) FILTER (WHERE risk_level = '预警') AS warning_count,`,
    `  COUNT(*) FILTER (WHERE risk_level = '已流失') AS churned_count,`,
    `  COUNT(*) FILTER (WHERE risk_level IN ('新用户/单次购', '数据不足')) AS insufficient_count,`,
    `  ROUND(`,
    `    COUNT(*) FILTER (WHERE risk_level = '稳定') * 100.0 / NULLIF(COUNT(*), 0)`,
    `    - COUNT(*) FILTER (WHERE risk_level IN ('预警', '已流失')) * 50.0 / NULLIF(COUNT(*), 0),`,
    `    1`,
    `  ) AS health_score`,
  ].join('\n');

  return [
    baseCtes,
    `,filtered AS (`,
    `  SELECT *`,
    `  FROM with_risk`,
    ...(filteredWhere ? [filteredWhere] : []),
    `)`,
    `SELECT`,
    selectBlock,
    `FROM filtered`,
    `GROUP BY category`,
    ``,
    `UNION ALL`,
    ``,
    `SELECT`,
    `  '汇总' AS category,`,
    selectBlock.split('\n').slice(1).join('\n'),
    `FROM filtered`,
    ``,
    `ORDER BY category`,
  ].join('\n');
}

export class RepurchaseCycleStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.REPURCHASE_CYCLE;
  readonly name = '复购周期分析';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';
    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const config = (selectNode?.data as { repurchaseCycleConfig?: RepurchaseCycleConfig } | undefined)
      ?.repurchaseCycleConfig;

    if (!config) {
      console.warn(`[${this.name}.buildOperatorSql] repurchaseCycleConfig missing — falling back to SELECT *`);
      return `SELECT *\nFROM "${tableName}"`;
    }

    // userWhere is provided by BaseStrategy.buildSql template
    const sql =
      config.outputMode === 'summary'
        ? buildRepurchaseSummarySql(tableName, config, userWhere)
        : buildRepurchaseDetailSql(tableName, config, userWhere);

    console.log(`[${this.name}.buildOperatorSql] outputMode=${config.outputMode} sql=\n${sql}`);
    return sql;
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    const displayConfig = {
      rowColorizer: {
        field: 'risk_level',
        colorMap: {
          '稳定': { bg: 'rgba(82,196,26,0.12)', badgeColor: '#52c41a' },
          '关注': { bg: 'rgba(250,219,20,0.10)', badgeColor: '#d4b106' },
          '预警': { bg: 'rgba(250,140,22,0.12)', badgeColor: '#fa8c16' },
          '已流失': { bg: 'rgba(255,77,79,0.12)', badgeColor: '#ff4d4f' },
          '新用户/单次购': { bg: '', badgeColor: '#1890ff' },
          '数据不足': { bg: '', badgeColor: '#8B5CF6' },
        },
      },
      columnFormatters: {
        avg_cycle_days: { type: 'duration_days' as const, unit: '天' },
        current_interval_days: { type: 'duration_days' as const, unit: '天' },
        order_count: { type: 'duration_days' as const, unit: '次' }, // Reuse for count display
        health_score: { type: 'percent_signed' as const, precision: 1 },
      },
      columnTooltips: {
        risk_level: '复购风险等级：稳定 > 关注 > 预警 > 已流失',
        avg_cycle_days: '平均复购周期（天），两次订单间隔的平均值',
        current_interval_days: '距最后一次购买已过天数，用于判断流失风险',
        order_count: '该用户/类目的订单数',
      },
    };

    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema as { name: string; type: string }[],
      insights: ['复购周期分析执行成功'],
      visualizations: [{ type: 'table', config: { data: queryResult.data } }],
      displayConfig,
    };
  }
}
