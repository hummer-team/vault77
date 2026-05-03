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
  type OperatorInsightsData,
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
    // Build displayConfig based on actual schema columns
    // Supports both detail (user_id, category, risk_level) and summary (category, health_score) modes
    const columnFormatters: Record<string, any> = {};
    const columnTooltips: Record<string, string> = {};

    const schemaArray = queryResult.schema as { name: string; type?: string }[];

    // First, check what columns exist to determine output mode
    const hasRiskLevel = schemaArray.some(col => col.name === 'risk_level');

    for (const col of schemaArray) {
      const colName = col.name;

      // Risk level — common to both detail and summary
      if (colName === 'risk_level') {
        columnTooltips[colName] = '复购风险等级：稳定 > 关注 > 预警 > 已流失';
      }

      // Cycle/interval days
      if (colName === 'avg_cycle_days') {
        columnFormatters[colName] = { type: 'duration_days' as const, unit: '天' };
        columnTooltips[colName] = '平均复购周期（天），两次订单间隔的平均值';
      }
      if (colName === 'current_interval_days') {
        columnFormatters[colName] = { type: 'duration_days' as const, unit: '天' };
        columnTooltips[colName] = '距最后一次购买已过天数，用于判断流失风险';
      }

      // Order/user counts
      if (colName === 'order_count') {
        columnFormatters[colName] = { type: 'duration_days' as const, unit: '次' };
        columnTooltips[colName] = '该用户/类目的订单数';
      }
      if (colName === 'user_count') {
        columnFormatters[colName] = { type: 'duration_days' as const, unit: '个' };
        columnTooltips[colName] = '该分类的用户数';
      }

      // Counts by risk level (summary mode)
      if (colName.endsWith('_count') && colName !== 'order_count' && colName !== 'user_count') {
        columnFormatters[colName] = { type: 'duration_days' as const, unit: '个' };
        columnTooltips[colName] = `风险等级为"${colName.replace('_count', '')}"的用户数`;
      }

      // Health score (summary mode)
      if (colName === 'health_score') {
        columnFormatters[colName] = { type: 'percent_signed' as const, precision: 1 };
        columnTooltips[colName] = '分类健康度评分（稳定用户占比 - 流失风险占比×50%）';
      }

      // Dates
      if (colName === 'first_order' || colName === 'last_order') {
        columnTooltips[colName] = colName === 'first_order' ? '首次订购日期' : '最后订购日期';
      }

      // ID/category columns get tooltips
      if (colName === 'user_id') {
        columnTooltips[colName] = '用户唯一标识';
      }
      if (colName === 'category') {
        columnTooltips[colName] = '商品分类';
      }

      // Suggested action column (if exists)
      if (colName === 'suggested_action') {
        columnTooltips[colName] = '针对该用户的推荐行动';
      }
    }

    const displayConfig = Object.keys(columnFormatters).length > 0 || Object.keys(columnTooltips).length > 0
      ? {
          ...(hasRiskLevel && {
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
          }),
          columnFormatters: Object.keys(columnFormatters).length > 0 ? columnFormatters : undefined,
          columnTooltips: Object.keys(columnTooltips).length > 0 ? columnTooltips : undefined,
        }
      : undefined;

    const rows = queryResult.data as Record<string, unknown>[];

    // Repurchase users: users with order_count >= 2 (have actually re-ordered)
    const repurchaseUsers = rows.filter(r => Number(r.order_count ?? 0) >= 2).length;
    // Average repurchase cycle days across all users with avg_cycle_days data
    const avgDays = rows.reduce((s, r) => s + Number(r.avg_cycle_days ?? 0), 0) / Math.max(rows.length, 1);
    // At-risk users: 预警 or 已流失
    const atRiskCount = rows.filter(r => ['预警', '已流失'].includes(r.risk_level as string)).length;

    // Build structured insights for InsightsPanel
    const insightsData: OperatorInsightsData = {
      summary: {
        totalRecordCount: rows.length,
        totalFilterRecordCount: repurchaseUsers,
        repurchaseUserCount: repurchaseUsers,
        avgRepurchaseDays: Math.round(avgDays),
      },
      insights: [
        {
          id: 'repurchase-health',
          cardType: 'standard',
          iconKey: 'rfm',
          title: '复购健康度',
          sortOrder: 1,
          description: repurchaseUsers > 0
            ? `${repurchaseUsers} 名用户有复购记录，平均 ${Math.round(avgDays)} 天复购一次`
            : '暂无复购记录',
          metrics: [
            { label: '复购用户数', value: repurchaseUsers, unit: '人', highlight: repurchaseUsers > 0 },
            { label: '平均复购周期', value: Math.round(avgDays), unit: '天' },
            { label: '分析用户数', value: rows.length, unit: '人' },
          ],
        },
        ...(atRiskCount > 0 ? [{
          id: 'churn-risk',
          cardType: 'standard' as const,
          iconKey: 'warning' as const,
          title: '流失预警',
          sortOrder: 2,
          description: `${atRiskCount} 名用户处于预警或流失状态，建议及时跟进`,
          metrics: [
            { label: '预警/流失用户', value: atRiskCount, unit: '人', highlight: true },
            { label: '流失风险率', value: atRiskCount / Math.max(rows.length, 1), unit: '%' },
          ],
        }] : []),
      ],
    };

    return {
      type: this.type,
      sql: '',
      data: rows,
      schema: queryResult.schema as { name: string; type: string }[],
      insightsData,
      displayConfig,
    };
  }
}
