/**
 * OrderDistributionStrategy
 * Builds DuckDB SQL for fn_ecom_order_distribution (订单分布分析).
 * Supports three sub-types: time_dist | amount_dist | geo_dist,
 * each optionally with YoY (同比) or MoM (环比) comparison via a CTE pattern.
 */

import { BaseStrategy } from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type FlowEdge,
  type AnalysisResult,
  type OrderDistributionConfig,
  type TimeDistConfig,
  type AmountDistConfig,
  type GeoDistConfig,
  type ComparisonType,
  type TimeGranularity,
} from '../types';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Format a JS Date as 'YYYY-MM-DD' */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Auto-compute comparison period start/end dates.
 *
 * - YoY: shift back 1 year
 * - MoM: shift back 1 period determined by granularity
 *   (month → 1 month, week → 1 week, day → 1 day)
 *
 * @returns ISO date strings 'YYYY-MM-DD'
 */
export function computeComparisonDates(
  currentStart: string,
  currentEnd: string,
  comparisonType: ComparisonType,
  granularity?: TimeGranularity
): { cmpStart: string; cmpEnd: string } {
  const start = new Date(currentStart);
  const end = new Date(currentEnd);

  if (comparisonType === 'yoy') {
    start.setFullYear(start.getFullYear() - 1);
    end.setFullYear(end.getFullYear() - 1);
  } else {
    // MoM: shift by granularity period
    switch (granularity) {
      case 'week':
        start.setDate(start.getDate() - 7);
        end.setDate(end.getDate() - 7);
        break;
      case 'day':
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case 'month':
      default:
        start.setMonth(start.getMonth() - 1);
        end.setMonth(end.getMonth() - 1);
        break;
    }
  }

  return { cmpStart: toIsoDate(start), cmpEnd: toIsoDate(end) };
}

/** Map comparisonType → INTERVAL string used in the CTE to shift cmp rows into current-period space */
function cmpIntervalShift(comparisonType: ComparisonType): string {
  return comparisonType === 'yoy' ? '1 YEAR' : '1 MONTH';
}

// ---------------------------------------------------------------------------
// Time distribution SQL
// ---------------------------------------------------------------------------

/**
 * Build SQL for the time_dist sub-type.
 *
 * @param tableName - DuckDB table name (unquoted)
 * @param config    - TimeDistConfig from SelectNode
 */
export function buildTimeDistSql(tableName: string, config: TimeDistConfig): string {
  const { orderTimeColumn: tc, orderAmountColumn: ac, granularity, currentStart, currentEnd } = config;

  if (!config.enableComparison) {
    return [
      `SELECT`,
      `  date_trunc('${granularity}', "${tc}"::TIMESTAMP) AS period,`,
      `  COUNT(*) AS order_count,`,
      `  SUM("${ac}") AS total_amount,`,
      `  ROUND(AVG("${ac}"), 2) AS avg_amount`,
      `FROM "${tableName}"`,
      `WHERE "${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`,
      `GROUP BY 1`,
      `ORDER BY 1`,
    ].join('\n');
  }

  const compType = config.comparisonType ?? 'yoy';
  let cmpStart: string;
  let cmpEnd: string;

  if (config.comparisonStart && config.comparisonEnd) {
    cmpStart = config.comparisonStart;
    cmpEnd = config.comparisonEnd;
  } else {
    ({ cmpStart, cmpEnd } = computeComparisonDates(currentStart, currentEnd, compType, granularity));
  }

  const shift = cmpIntervalShift(compType);

  return [
    `WITH current_period AS (`,
    `  SELECT`,
    `    date_trunc('${granularity}', "${tc}"::TIMESTAMP) AS period,`,
    `    COUNT(*) AS order_count,`,
    `    SUM("${ac}") AS total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE "${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`,
    `  GROUP BY 1`,
    `),`,
    `cmp_period AS (`,
    `  SELECT`,
    `    date_trunc('${granularity}', "${tc}"::TIMESTAMP + INTERVAL '${shift}') AS period,`,
    `    COUNT(*) AS cmp_order_count,`,
    `    SUM("${ac}") AS cmp_total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS cmp_avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE "${tc}"::TIMESTAMP BETWEEN '${cmpStart}'::TIMESTAMP AND '${cmpEnd}'::TIMESTAMP`,
    `  GROUP BY 1`,
    `)`,
    `SELECT`,
    `  c.period,`,
    `  c.order_count,`,
    `  c.total_amount,`,
    `  c.avg_amount,`,
    `  cp.cmp_order_count,`,
    `  cp.cmp_total_amount,`,
    `  cp.cmp_avg_amount,`,
    `  ROUND((c.order_count - cp.cmp_order_count) * 100.0 / NULLIF(cp.cmp_order_count, 0), 2) AS order_count_change_pct,`,
    `  ROUND((c.total_amount - cp.cmp_total_amount) * 100.0 / NULLIF(cp.cmp_total_amount, 0), 2) AS amount_change_pct`,
    `FROM current_period c`,
    `LEFT JOIN cmp_period cp ON c.period = cp.period`,
    `ORDER BY c.period`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Amount distribution SQL
// ---------------------------------------------------------------------------

/** Build the CASE WHEN expression for amount buckets */
function buildBucketCaseExpr(amtCol: string, buckets: AmountDistConfig['buckets']): string {
  const whenClauses = buckets.map((b) => {
    if (b.min === null && b.max !== null) {
      return `    WHEN "${amtCol}" < ${b.max} THEN '${b.label}'`;
    }
    if (b.min !== null && b.max === null) {
      return `    WHEN "${amtCol}" >= ${b.min} THEN '${b.label}'`;
    }
    return `    WHEN "${amtCol}" >= ${b.min} AND "${amtCol}" < ${b.max} THEN '${b.label}'`;
  });

  return [
    `  CASE`,
    ...whenClauses,
    `    ELSE '其他'`,
    `  END AS amount_bucket`,
  ].join('\n');
}

/**
 * Build SQL for the amount_dist sub-type.
 *
 * @param tableName - DuckDB table name (unquoted)
 * @param config    - AmountDistConfig from SelectNode
 */
export function buildAmountDistSql(tableName: string, config: AmountDistConfig): string {
  const { orderAmountColumn: ac, orderTimeColumn: tc, buckets, currentStart, currentEnd } = config;
  const caseExpr = buildBucketCaseExpr(ac, buckets);

  if (!config.enableComparison) {
    return [
      `SELECT`,
      caseExpr + `,`,
      `  COUNT(*) AS order_count,`,
      `  SUM("${ac}") AS total_amount,`,
      `  ROUND(AVG("${ac}"), 2) AS avg_amount`,
      `FROM "${tableName}"`,
      `WHERE "${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`,
      `GROUP BY 1`,
      `ORDER BY MIN("${ac}")`,
    ].join('\n');
  }

  const compType = config.comparisonType ?? 'yoy';
  let cmpStart: string;
  let cmpEnd: string;

  if (config.comparisonStart && config.comparisonEnd) {
    cmpStart = config.comparisonStart;
    cmpEnd = config.comparisonEnd;
  } else {
    ({ cmpStart, cmpEnd } = computeComparisonDates(currentStart, currentEnd, compType));
  }

  return [
    `WITH current_period AS (`,
    `  SELECT`,
    caseExpr + `,`,
    `    COUNT(*) AS order_count,`,
    `    SUM("${ac}") AS total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE "${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`,
    `  GROUP BY 1`,
    `),`,
    `cmp_period AS (`,
    `  SELECT`,
    buildBucketCaseExpr(ac, buckets) + `,`,
    `    COUNT(*) AS cmp_order_count,`,
    `    SUM("${ac}") AS cmp_total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS cmp_avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE "${tc}"::TIMESTAMP BETWEEN '${cmpStart}'::TIMESTAMP AND '${cmpEnd}'::TIMESTAMP`,
    `  GROUP BY 1`,
    `)`,
    `SELECT`,
    `  c.amount_bucket,`,
    `  c.order_count,`,
    `  c.total_amount,`,
    `  c.avg_amount,`,
    `  cp.cmp_order_count,`,
    `  cp.cmp_total_amount,`,
    `  cp.cmp_avg_amount,`,
    `  ROUND((c.order_count - cp.cmp_order_count) * 100.0 / NULLIF(cp.cmp_order_count, 0), 2) AS order_count_change_pct,`,
    `  ROUND((c.total_amount - cp.cmp_total_amount) * 100.0 / NULLIF(cp.cmp_total_amount, 0), 2) AS amount_change_pct`,
    `FROM current_period c`,
    `LEFT JOIN cmp_period cp ON c.amount_bucket = cp.amount_bucket`,
    `ORDER BY MIN(c.total_amount)`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Geographic distribution SQL
// ---------------------------------------------------------------------------

/**
 * Build SQL for the geo_dist sub-type.
 *
 * @param tableName - DuckDB table name (unquoted)
 * @param config    - GeoDistConfig from SelectNode
 */
export function buildGeoDistSql(tableName: string, config: GeoDistConfig): string {
  const { geoColumn: gc, orderAmountColumn: ac, orderTimeColumn: tc, currentStart, currentEnd } = config;

  if (!config.enableComparison) {
    return [
      `SELECT`,
      `  "${gc}" AS region,`,
      `  COUNT(*) AS order_count,`,
      `  SUM("${ac}") AS total_amount,`,
      `  ROUND(AVG("${ac}"), 2) AS avg_amount`,
      `FROM "${tableName}"`,
      `WHERE "${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`,
      `GROUP BY 1`,
      `ORDER BY order_count DESC`,
    ].join('\n');
  }

  const compType = config.comparisonType ?? 'yoy';
  let cmpStart: string;
  let cmpEnd: string;

  if (config.comparisonStart && config.comparisonEnd) {
    cmpStart = config.comparisonStart;
    cmpEnd = config.comparisonEnd;
  } else {
    ({ cmpStart, cmpEnd } = computeComparisonDates(currentStart, currentEnd, compType));
  }

  return [
    `WITH current_period AS (`,
    `  SELECT`,
    `    "${gc}" AS region,`,
    `    COUNT(*) AS order_count,`,
    `    SUM("${ac}") AS total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE "${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`,
    `  GROUP BY 1`,
    `),`,
    `cmp_period AS (`,
    `  SELECT`,
    `    "${gc}" AS region,`,
    `    COUNT(*) AS cmp_order_count,`,
    `    SUM("${ac}") AS cmp_total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS cmp_avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE "${tc}"::TIMESTAMP BETWEEN '${cmpStart}'::TIMESTAMP AND '${cmpEnd}'::TIMESTAMP`,
    `  GROUP BY 1`,
    `)`,
    `SELECT`,
    `  c.region,`,
    `  c.order_count,`,
    `  c.total_amount,`,
    `  c.avg_amount,`,
    `  cp.cmp_order_count,`,
    `  cp.cmp_total_amount,`,
    `  cp.cmp_avg_amount,`,
    `  ROUND((c.order_count - cp.cmp_order_count) * 100.0 / NULLIF(cp.cmp_order_count, 0), 2) AS order_count_change_pct,`,
    `  ROUND((c.total_amount - cp.cmp_total_amount) * 100.0 / NULLIF(cp.cmp_total_amount, 0), 2) AS amount_change_pct`,
    `FROM current_period c`,
    `LEFT JOIN cmp_period cp ON c.region = cp.region`,
    `ORDER BY c.order_count DESC`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Strategy class
// ---------------------------------------------------------------------------

export class OrderDistributionStrategy extends BaseStrategy {
  readonly type: OperatorType = OperatorType.ORDER_DISTRIBUTION;
  readonly name = '订单分布分析';

  getRequiredNodes(): FlowNodeType[] {
    return [FlowNodeType.TABLE];
  }

  buildSql(nodes: FlowNode[], _edges: FlowEdge[]): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const config = (selectNode?.data as { orderDistConfig?: OrderDistributionConfig } | undefined)
      ?.orderDistConfig;

    if (!config) {
      console.warn(`[${this.name}.buildSql] orderDistConfig missing — falling back to SELECT *`);
      return `SELECT *\nFROM "${tableName}"`;
    }

    let sql: string;
    switch (config.subType) {
      case 'time_dist':
        if (!config.timeDist) {
          console.warn(`[${this.name}.buildSql] timeDist config missing`);
          return `SELECT *\nFROM "${tableName}"`;
        }
        sql = buildTimeDistSql(tableName, config.timeDist);
        break;

      case 'amount_dist':
        if (!config.amountDist) {
          console.warn(`[${this.name}.buildSql] amountDist config missing`);
          return `SELECT *\nFROM "${tableName}"`;
        }
        sql = buildAmountDistSql(tableName, config.amountDist);
        break;

      case 'geo_dist':
        if (!config.geoDist) {
          console.warn(`[${this.name}.buildSql] geoDist config missing`);
          return `SELECT *\nFROM "${tableName}"`;
        }
        sql = buildGeoDistSql(tableName, config.geoDist);
        break;

      default: {
        const _exhaustive: never = config.subType;
        console.warn(`[${this.name}.buildSql] unknown subType: ${_exhaustive as string}`);
        return `SELECT *\nFROM "${tableName}"`;
      }
    }

    console.log(`[${this.name}.buildSql] subType=${config.subType} sql=\n${sql}`);
    return sql;
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    return {
      type: this.type,
      sql: '',
      data: queryResult.data as Record<string, unknown>[],
      schema: queryResult.schema,
      insights: ['订单分布分析执行成功'],
      visualizations: [{ type: 'table', config: { data: queryResult.data } }],
    };
  }
}
