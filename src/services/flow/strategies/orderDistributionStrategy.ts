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
  type OperatorInsightsData,
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

/** Format a Date as 'YYYY-MM-DD', guarding against month-overflow via ISO string extraction */
function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/**
 * Subtract N months from a date without day-overflow.
 * e.g. March 31 - 1 month → Feb 28/29 (not March 2 via native setMonth).
 */
function subtractMonths(d: Date, months: number): Date {
  const result = new Date(d);
  const targetMonth = result.getMonth() - months;
  result.setDate(1); // prevent overflow before setting month
  result.setMonth(targetMonth);
  // Clamp to last day of target month
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(d.getDate(), lastDay));
  return result;
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
    return {
      cmpStart: toIsoDate(subtractMonths(start, 12)),
      cmpEnd: toIsoDate(subtractMonths(end, 12)),
    };
  }

  // MoM: shift by granularity period
  switch (granularity) {
    case 'week': {
      const s = new Date(start); s.setDate(s.getDate() - 7);
      const e = new Date(end);   e.setDate(e.getDate() - 7);
      return { cmpStart: toIsoDate(s), cmpEnd: toIsoDate(e) };
    }
    case 'day': {
      const s = new Date(start); s.setDate(s.getDate() - 1);
      const e = new Date(end);   e.setDate(e.getDate() - 1);
      return { cmpStart: toIsoDate(s), cmpEnd: toIsoDate(e) };
    }
    case 'month':
    default:
      return {
        cmpStart: toIsoDate(subtractMonths(start, 1)),
        cmpEnd: toIsoDate(subtractMonths(end, 1)),
      };
  }
}

/**
 * Map comparisonType + granularity → INTERVAL string for shifting cmp-period rows
 * into current-period bucket space for the LEFT JOIN.
 *
 * Must match the granularity shift in computeComparisonDates so JOIN keys align.
 */
function cmpIntervalShift(comparisonType: ComparisonType, granularity?: TimeGranularity): string {
  if (comparisonType === 'yoy') return '1 YEAR';
  switch (granularity) {
    case 'week':  return '7 DAYS';
    case 'day':   return '1 DAY';
    case 'month':
    default:      return '1 MONTH';
  }
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
export function buildTimeDistSql(tableName: string, config: TimeDistConfig, additionalWhere?: string): string {
  const { orderTimeColumn: tc, orderAmountColumn: ac, granularity, currentStart, currentEnd } = config;

  // Combine time range filter with any additional where conditions
  const dateFilter = `"${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`;
  const whereCondition = additionalWhere ? `${dateFilter} AND (${additionalWhere.replace(/^WHERE\s+/i, '')})` : dateFilter;

  if (!config.enableComparison) {
    return [
      `SELECT`,
      `  date_trunc('${granularity}', "${tc}"::TIMESTAMP) AS period,`,
      `  COUNT(*) AS order_count,`,
      `  SUM("${ac}") AS total_amount,`,
      `  ROUND(AVG("${ac}"), 2) AS avg_amount`,
      `FROM "${tableName}"`,
      `WHERE ${whereCondition}`,
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

  const shift = cmpIntervalShift(compType, granularity);
  const cmpDateFilter = `"${tc}"::TIMESTAMP BETWEEN '${cmpStart}'::TIMESTAMP AND '${cmpEnd}'::TIMESTAMP`;
  const cmpWhereCondition = additionalWhere ? `${cmpDateFilter} AND (${additionalWhere.replace(/^WHERE\s+/i, '')})` : cmpDateFilter;

  return [
    `WITH current_period AS (`,
    `  SELECT`,
    `    date_trunc('${granularity}', "${tc}"::TIMESTAMP) AS period,`,
    `    COUNT(*) AS order_count,`,
    `    SUM("${ac}") AS total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE ${whereCondition}`,
    `  GROUP BY 1`,
    `),`,
    `cmp_period AS (`,
    `  SELECT`,
    `    date_trunc('${granularity}', "${tc}"::TIMESTAMP + INTERVAL '${shift}') AS period,`,
    `    COUNT(*) AS cmp_order_count,`,
    `    SUM("${ac}") AS cmp_total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS cmp_avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE ${cmpWhereCondition}`,
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
    const label = b.label.replace(/'/g, "''"); // escape single quotes to prevent SQL injection
    if (b.min === null && b.max !== null) {
      return `    WHEN "${amtCol}" < ${b.max} THEN '${label}'`;
    }
    if (b.min !== null && b.max === null) {
      return `    WHEN "${amtCol}" >= ${b.min} THEN '${label}'`;
    }
    return `    WHEN "${amtCol}" >= ${b.min} AND "${amtCol}" < ${b.max} THEN '${label}'`;
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
export function buildAmountDistSql(tableName: string, config: AmountDistConfig, additionalWhere?: string): string {
  const { orderAmountColumn: ac, orderTimeColumn: tc, buckets, currentStart, currentEnd } = config;
  const caseExpr = buildBucketCaseExpr(ac, buckets);

  // Combine time range filter with any additional where conditions
  const dateFilter = `"${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`;
  const whereCondition = additionalWhere ? `${dateFilter} AND (${additionalWhere.replace(/^WHERE\s+/i, '')})` : dateFilter;

  if (!config.enableComparison) {
    return [
      `SELECT`,
      caseExpr + `,`,
      `  COUNT(*) AS order_count,`,
      `  SUM("${ac}") AS total_amount,`,
      `  ROUND(AVG("${ac}"), 2) AS avg_amount`,
      `FROM "${tableName}"`,
      `WHERE ${whereCondition}`,
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

  const cmpDateFilter = `"${tc}"::TIMESTAMP BETWEEN '${cmpStart}'::TIMESTAMP AND '${cmpEnd}'::TIMESTAMP`;
  const cmpWhereCondition = additionalWhere ? `${cmpDateFilter} AND (${additionalWhere.replace(/^WHERE\s+/i, '')})` : cmpDateFilter;

  return [
    `WITH current_period AS (`,
    `  SELECT`,
    caseExpr + `,`,
    `    COUNT(*) AS order_count,`,
    `    SUM("${ac}") AS total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE ${whereCondition}`,
    `  GROUP BY 1`,
    `),`,
    `cmp_period AS (`,
    `  SELECT`,
    buildBucketCaseExpr(ac, buckets) + `,`,
    `    COUNT(*) AS cmp_order_count,`,
    `    SUM("${ac}") AS cmp_total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS cmp_avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE ${cmpWhereCondition}`,
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
    `ORDER BY c.total_amount`,
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
export function buildGeoDistSql(tableName: string, config: GeoDistConfig, additionalWhere?: string): string {
  const { geoColumn: gc, orderAmountColumn: ac, orderTimeColumn: tc, currentStart, currentEnd } = config;

  // Combine time range filter with any additional where conditions
  const dateFilter = `"${tc}"::TIMESTAMP BETWEEN '${currentStart}'::TIMESTAMP AND '${currentEnd}'::TIMESTAMP`;
  const whereCondition = additionalWhere ? `${dateFilter} AND (${additionalWhere.replace(/^WHERE\s+/i, '')})` : dateFilter;

  if (!config.enableComparison) {
    return [
      `SELECT`,
      `  "${gc}" AS region,`,
      `  COUNT(*) AS order_count,`,
      `  SUM("${ac}") AS total_amount,`,
      `  ROUND(AVG("${ac}"), 2) AS avg_amount`,
      `FROM "${tableName}"`,
      `WHERE ${whereCondition}`,
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

  const cmpDateFilter = `"${tc}"::TIMESTAMP BETWEEN '${cmpStart}'::TIMESTAMP AND '${cmpEnd}'::TIMESTAMP`;
  const cmpWhereCondition = additionalWhere ? `${cmpDateFilter} AND (${additionalWhere.replace(/^WHERE\s+/i, '')})` : cmpDateFilter;

  return [
    `WITH current_period AS (`,
    `  SELECT`,
    `    "${gc}" AS region,`,
    `    COUNT(*) AS order_count,`,
    `    SUM("${ac}") AS total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE ${whereCondition}`,
    `  GROUP BY 1`,
    `),`,
    `cmp_period AS (`,
    `  SELECT`,
    `    "${gc}" AS region,`,
    `    COUNT(*) AS cmp_order_count,`,
    `    SUM("${ac}") AS cmp_total_amount,`,
    `    ROUND(AVG("${ac}"), 2) AS cmp_avg_amount`,
    `  FROM "${tableName}"`,
    `  WHERE ${cmpWhereCondition}`,
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

  protected buildOperatorSql(
    nodes: FlowNode[],
    _edges: FlowEdge[],
    _placeholderValues: Record<string, unknown> | undefined,
    userWhere: string
  ): string {
    const tableNode = nodes.find((n) => n.type === FlowNodeType.TABLE);
    const tableName = (tableNode?.data as { tableName?: string } | undefined)?.tableName ?? '';

    const selectNode = nodes.find((n) => n.type === FlowNodeType.SELECT);
    const config = (selectNode?.data as { orderDistConfig?: OrderDistributionConfig } | undefined)
      ?.orderDistConfig;

    if (!config) {
      console.warn(`[${this.name}.buildOperatorSql] orderDistConfig missing — falling back to SELECT *`);
      return `SELECT *\nFROM "${tableName}"`;
    }

    // userWhere is provided by BaseStrategy.buildSql template
    let sql: string;
    switch (config.subType) {
      case 'time_dist':
        if (!config.timeDist) {
          console.warn(`[${this.name}.buildOperatorSql] timeDist config missing`);
          return `SELECT *\nFROM "${tableName}"`;
        }
        sql = buildTimeDistSql(tableName, config.timeDist, userWhere);
        break;

      case 'amount_dist':
        if (!config.amountDist) {
          console.warn(`[${this.name}.buildOperatorSql] amountDist config missing`);
          return `SELECT *\nFROM "${tableName}"`;
        }
        sql = buildAmountDistSql(tableName, config.amountDist, userWhere);
        break;

      case 'geo_dist':
        if (!config.geoDist) {
          console.warn(`[${this.name}.buildOperatorSql] geoDist config missing`);
          return `SELECT *\nFROM "${tableName}"`;
        }
        sql = buildGeoDistSql(tableName, config.geoDist, userWhere);
        break;

      default: {
        const _exhaustive: never = config.subType;
        console.warn(`[${this.name}.buildOperatorSql] unknown subType: ${_exhaustive as string}`);
        return `SELECT *\nFROM "${tableName}"`;
      }
    }

    console.log(`[${this.name}.buildOperatorSql] subType=${config.subType} sql=\n${sql}`);
    return sql;
  }

  async postProcess(queryResult: { data: unknown[]; schema: unknown[] }): Promise<AnalysisResult> {
    // Build displayConfig dynamically based on actual SQL output columns
    // Different sub-types produce different column sets
    const columnFormatters: Record<string, any> = {};
    const columnTooltips: Record<string, string> = {};

    const schemaArray = queryResult.schema as { name: string; type?: string }[];

    for (const col of schemaArray) {
      const colName = col.name;

      // Time distribution columns
      if (colName === 'period') {
        columnTooltips[colName] = '时间周期';
      }
      // Geo distribution columns
      else if (colName === 'region') {
        columnTooltips[colName] = '地理区域（省份、城市等）';
      }
      // Amount bucket
      else if (colName === 'amount_bucket') {
        columnTooltips[colName] = '金额分布段';
      }
      // Order count columns
      else if (colName === 'order_count') {
        columnFormatters[colName] = { type: 'duration_days' as const, unit: '单' };
        columnTooltips[colName] = '该周期/地区的订单数量';
      }
      else if (colName === 'cmp_order_count') {
        columnFormatters[colName] = { type: 'duration_days' as const, unit: '单' };
        columnTooltips[colName] = '对比周期的订单数量';
      }
      // Total amount columns
      else if (colName === 'total_amount') {
        columnFormatters[colName] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[colName] = '该周期/地区的总金额';
      }
      else if (colName === 'cmp_total_amount') {
        columnFormatters[colName] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[colName] = '对比周期的总金额';
      }
      // Average amount columns
      else if (colName === 'avg_amount') {
        columnFormatters[colName] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[colName] = '该周期/地区的平均订单金额';
      }
      else if (colName === 'cmp_avg_amount') {
        columnFormatters[colName] = { type: 'currency_signed' as const, unit: '元', precision: 2 };
        columnTooltips[colName] = '对比周期的平均订单金额';
      }
      // Change percentage columns
      else if (colName === 'order_count_change_pct') {
        columnFormatters[colName] = { type: 'percent_signed' as const, precision: 1 };
        columnTooltips[colName] = '订单数环比/同比变化';
      }
      else if (colName === 'amount_change_pct') {
        columnFormatters[colName] = { type: 'percent_signed' as const, precision: 1 };
        columnTooltips[colName] = '金额环比/同比变化';
      }
    }

    const displayConfig = Object.keys(columnFormatters).length > 0 || Object.keys(columnTooltips).length > 0
      ? {
          columnFormatters: Object.keys(columnFormatters).length > 0 ? columnFormatters : undefined,
          columnTooltips: Object.keys(columnTooltips).length > 0 ? columnTooltips : undefined,
        }
      : undefined;

    // Detect sub_type from schema column presence
    const hasPeriod = schemaArray.some(c => c.name === 'period');
    const hasAmountBucket = schemaArray.some(c => c.name === 'amount_bucket');
    const hasRegion = schemaArray.some(c => c.name === 'region');

    const rows = queryResult.data as Record<string, unknown>[];
    const totalOrderCount = rows.reduce((s, r) => s + Number(r.order_count ?? 0), 0);

    let insightsData: OperatorInsightsData;

    if (hasPeriod) {
      // time_dist: find peak and trough periods by order_count
      const sorted = [...rows].sort((a, b) => Number(b.order_count ?? 0) - Number(a.order_count ?? 0));
      const peakRow = sorted[0] ?? {};
      const troughRow = sorted[sorted.length - 1] ?? {};
      const peakPeriod = String(peakRow.period ?? '');
      const peakCount = Number(peakRow.order_count ?? 0);
      const troughPeriod = String(troughRow.period ?? '');
      const troughCount = Number(troughRow.order_count ?? 0);

      insightsData = {
        summary: {
          totalRecordCount: totalOrderCount,
          totalFilterRecordCount: rows.length,
          peakPeriod: peakPeriod || undefined,
        },
        insights: [{
          id: 'time-distribution',
          cardType: 'standard',
          iconKey: 'order',
          title: '时段分布洞察',
          sortOrder: 1,
          description: peakPeriod ? `峰值时段 ${peakPeriod}，低谷时段 ${troughPeriod}` : undefined,
          metrics: [
            { label: '峰值时段订单', value: peakCount, unit: '单', highlight: peakCount > 0 },
            { label: '低谷时段订单', value: troughCount, unit: '单' },
            { label: '分析周期数', value: rows.length, unit: '个' },
          ],
        }],
      };
    } else if (hasAmountBucket) {
      // amount_dist: find dominant bucket by order_count
      const sorted = [...rows].sort((a, b) => Number(b.order_count ?? 0) - Number(a.order_count ?? 0));
      const topRow = sorted[0] ?? {};
      const topBucket = String(topRow.amount_bucket ?? '');
      const topCount = Number(topRow.order_count ?? 0);
      const concentration = totalOrderCount > 0 ? topCount / totalOrderCount : 0;

      insightsData = {
        summary: {
          totalRecordCount: totalOrderCount,
          totalFilterRecordCount: rows.length,
        },
        insights: [{
          id: 'amount-distribution',
          cardType: 'standard',
          iconKey: 'price',
          title: '金额分布洞察',
          sortOrder: 1,
          description: topBucket ? `主力金额段：${topBucket}` : undefined,
          metrics: [
            { label: '主力金额段', value: topCount, unit: '单', highlight: true },
            { label: '金额集中度', value: concentration, unit: '%' },
            { label: '分析金额段数', value: rows.length, unit: '个' },
          ],
        }],
      };
    } else if (hasRegion) {
      // geo_dist: find top region by order_count
      const sorted = [...rows].sort((a, b) => Number(b.order_count ?? 0) - Number(a.order_count ?? 0));
      const topRow = sorted[0] ?? {};
      const topRegion = String(topRow.region ?? '');
      const topCount = Number(topRow.order_count ?? 0);
      const geoConcentration = totalOrderCount > 0 ? topCount / totalOrderCount : 0;

      insightsData = {
        summary: {
          totalRecordCount: totalOrderCount,
          totalFilterRecordCount: rows.length,
          topRegion: topRegion || undefined,
        },
        insights: [{
          id: 'geo-distribution',
          cardType: 'standard',
          iconKey: 'insight',
          title: '地区分布洞察',
          sortOrder: 1,
          description: topRegion ? `头部地区：${topRegion}` : undefined,
          metrics: [
            { label: '头部地区订单', value: topCount, unit: '单', highlight: topCount > 0 },
            { label: '地区集中度', value: geoConcentration, unit: '%' },
            { label: '分析地区数', value: rows.length, unit: '个' },
          ],
        }],
      };
    } else {
      // Fallback: unknown sub_type — generic overview
      insightsData = {
        summary: {
          totalRecordCount: totalOrderCount,
          totalFilterRecordCount: rows.length,
        },
        insights: [{
          id: 'distribution-overview',
          cardType: 'standard',
          iconKey: 'insight',
          title: '分布分析概览',
          sortOrder: 1,
          metrics: [
            { label: '总订单数', value: totalOrderCount, unit: '单' },
            { label: '分析分组数', value: rows.length, unit: '个' },
          ],
        }],
      };
    }

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
