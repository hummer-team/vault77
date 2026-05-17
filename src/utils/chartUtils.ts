/**
 * chartUtils.ts
 * Pure utilities for chart data processing and ECharts option building.
 * No React / DOM dependencies — safe to import in tests and workers.
 */

import type { EChartsOption } from 'echarts';
import type { EChartsColors } from '../theme/useEChartsTheme';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'funnel';
export type ColumnInferredType = 'numeric' | 'datetime' | 'categorical';

export interface ColumnMeta {
  name: string;
  inferredType: ColumnInferredType;
}

/** A single equal-width bin produced by autoBinData. */
export interface BinBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

/**
 * Full chart configuration — created by ChartConfigPanel, consumed by ChartWidget.
 */
export interface ChartConfig {
  id: string;
  type: ChartType;
  title?: string;
  /** X-axis / label column (all chart types). */
  xColumn: string;
  /**
   * Y-axis / value column(s).
   * - bar / line: 1–5 columns (multi-series)
   * - pie / funnel / scatter: exactly 1 column
   */
  yColumns: string[];
  /** scatter only: optional categorical column used for color-grouping series. */
  colorGroupColumn?: string;
  /** bar: enable stacking mode. */
  stacked?: boolean;
  /** line: enable area fill. */
  areaFill?: boolean;
  /** bar + continuous numeric X: enable equal-width binning. */
  autoBin?: boolean;
  /** Manual bin count override (5–50). Only used when autoBin is true and the user disables auto-compute. */
  binCount?: number;
  /** Display numeric values with thousands comma separator. */
  thousandsSeparator?: boolean;
}

// ─── Column Type Inference ────────────────────────────────────────────────────

/** Matches ISO date strings like 2024-01-15 or 2024-01-15T10:00:00 */
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
/** Matches integers, decimals, and scientific notation */
const NUMERIC_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

/**
 * Infer the display type of a single column by sampling up to 100 rows.
 * Numeric (≥80%) > datetime (≥70%) > categorical.
 *
 * @param colName - column key to inspect
 * @param data - row array used for sampling
 * @returns ColumnInferredType
 */
export function inferColumnType(
  colName: string,
  data: Record<string, unknown>[],
): ColumnInferredType {
  const sample = data.slice(0, 100);
  let numericCount = 0;
  let datetimeCount = 0;
  let validCount = 0;

  for (const row of sample) {
    const val = row[colName];
    if (val === null || val === undefined || val === '') continue;
    validCount++;
    const str = String(val).trim();
    if (NUMERIC_RE.test(str)) {
      numericCount++;
    } else if (ISO_DATE_RE.test(str)) {
      datetimeCount++;
    }
  }

  if (validCount === 0) return 'categorical';
  const ratio = (n: number) => n / validCount;
  if (ratio(numericCount) >= 0.8) return 'numeric';
  if (ratio(datetimeCount) >= 0.7) return 'datetime';
  return 'categorical';
}

/**
 * Infer column types for an array of schema descriptors.
 *
 * @param schema - schema objects, each must have a `name` string field
 * @param data - row data for sampling
 * @returns ColumnMeta[]
 */
export function inferColumnTypes(
  schema: { name: string }[],
  data: Record<string, unknown>[],
): ColumnMeta[] {
  return schema.map((col) => ({
    name: col.name,
    inferredType: inferColumnType(col.name, data),
  }));
}

// ─── Auto-Binning ─────────────────────────────────────────────────────────────

/**
 * Compute Sturges bin count: ceil(log2(n) + 1), clamped to [5, 20].
 *
 * @param n - number of data points
 * @returns recommended bin count
 */
export function sturgesBinCount(n: number): number {
  if (n <= 0) return 5;
  return Math.min(20, Math.max(5, Math.ceil(Math.log2(n) + 1)));
}

/**
 * Detect whether a numeric column is a continuous distribution (not an enum).
 * Heuristic: distinct values / total > 0.3.
 *
 * @param values - numeric values array
 * @returns true if the column appears to be continuous
 */
export function isContinuousNumeric(values: number[]): boolean {
  if (values.length === 0) return false;
  const distinct = new Set(values).size;
  return distinct / values.length > 0.3;
}

function formatBucketBound(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/**
 * Partition numeric values into equal-width buckets.
 *
 * @param values - raw numeric values (non-finite values are ignored)
 * @param binCount - number of bins; defaults to Sturges formula
 * @returns BinBucket[] sorted ascending by min
 */
export function autoBinData(values: number[], binCount?: number): BinBucket[] {
  const valid = values.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return [];

  const count = Math.min(50, Math.max(5, binCount ?? sturgesBinCount(valid.length)));
  const minVal = Math.min(...valid);
  const maxVal = Math.max(...valid);

  if (minVal === maxVal) {
    return [{ label: String(minVal), min: minVal, max: maxVal, count: valid.length }];
  }

  const width = (maxVal - minVal) / count;
  const buckets: BinBucket[] = Array.from({ length: count }, (_, i) => {
    const lo = minVal + i * width;
    const hi = lo + width;
    return {
      label: `[${formatBucketBound(lo)}, ${formatBucketBound(hi)})`,
      min: lo,
      max: hi,
      count: 0,
    };
  });

  for (const v of valid) {
    let idx = Math.floor((v - minVal) / width);
    // last bucket is right-inclusive
    if (idx >= count) idx = count - 1;
    buckets[idx].count++;
  }

  return buckets;
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Format a value as string with optional thousands comma separator.
 *
 * @param v - raw value
 * @param thousandsSep - enable comma separator
 * @returns formatted string
 */
export function formatValue(v: unknown, thousandsSep = false): string {
  if (v === null || v === undefined) return '';
  const num = Number(v);
  if (isNaN(num)) return String(v);
  return thousandsSep ? num.toLocaleString('en-US') : String(num);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const SERIES_COLORS = [
  '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de',
  '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc',
];

function makeTooltip(ec: EChartsColors, thousandsSep: boolean): object {
  return {
    trigger: 'axis',
    backgroundColor: ec.tooltipBg,
    borderColor: ec.borderMid,
    textStyle: { color: ec.textPrimary, fontSize: 12 },
    ...(thousandsSep && {
      formatter: (params: unknown) => {
        const ps = params as Array<{
          seriesName: string;
          value: unknown;
          marker: string;
          axisValueLabel?: string;
          name?: string;
        }>;
        const header = ps[0]?.axisValueLabel ?? ps[0]?.name ?? '';
        const lines = ps.map(
          (p) => `${p.marker}${p.seriesName}: <b>${formatValue(p.value, true)}</b>`,
        );
        return [header, ...lines].join('<br/>');
      },
    }),
  };
}

function makeAxisLabel(ec: EChartsColors): object {
  return { color: ec.textSecondary, fontSize: 11 };
}

function makeSplitLine(ec: EChartsColors): object {
  return { lineStyle: { color: ec.gridLine } };
}

// ─── Option Builders ──────────────────────────────────────────────────────────

/**
 * Build ECharts option for a Bar chart.
 * Supports multi-series Y columns, optional stack mode, and numeric auto-binning.
 *
 * @param config - chart configuration
 * @param data - row data array
 * @param ec - theme colors
 * @returns EChartsOption
 */
export function buildBarOption(
  config: ChartConfig,
  data: Record<string, unknown>[],
  ec: EChartsColors,
): EChartsOption {
  const { xColumn, yColumns, stacked, autoBin, binCount, thousandsSeparator = false } = config;

  // ── Auto-binning path ──
  if (autoBin) {
    const xValues = data.map((r) => Number(r[xColumn])).filter((v) => Number.isFinite(v));
    const bins = autoBinData(xValues, binCount);
    const xLabels = bins.map((b) => b.label);

    const series = yColumns.map((yCol, i) => {
      const sums: number[] = new Array(bins.length).fill(0);
      data.forEach((row) => {
        const xv = Number(row[xColumn]);
        if (!Number.isFinite(xv)) return;
        let idx = Math.floor((xv - bins[0].min) / ((bins[bins.length - 1].max - bins[0].min) / bins.length));
        if (idx >= bins.length) idx = bins.length - 1;
        if (idx < 0) idx = 0;
        const yv = Number(row[yCol]);
        if (Number.isFinite(yv)) sums[idx] += yv;
      });
      return {
        name: yCol,
        type: 'bar' as const,
        stack: stacked ? 'total' : undefined,
        itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
        data: sums,
      };
    });

    return {
      backgroundColor: ec.chartBg,
      color: SERIES_COLORS,
      textStyle: { color: ec.textPrimary },
      tooltip: makeTooltip(ec, thousandsSeparator),
      legend: yColumns.length > 1 ? { textStyle: { color: ec.textPrimary } } : undefined,
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: xLabels, axisLabel: { ...makeAxisLabel(ec), rotate: xLabels.length > 8 ? 30 : 0 } },
      yAxis: { type: 'value', axisLabel: makeAxisLabel(ec), splitLine: makeSplitLine(ec) },
      series,
    };
  }

  // ── Standard groupBy path ──
  const xCategories = Array.from(new Set(data.map((r) => String(r[xColumn] ?? ''))));
  const series = yColumns.map((yCol, i) => {
    const aggMap: Record<string, number> = Object.fromEntries(xCategories.map((x) => [x, 0]));
    data.forEach((row) => {
      const x = String(row[xColumn] ?? '');
      const v = Number(row[yCol]);
      if (Number.isFinite(v)) aggMap[x] = (aggMap[x] ?? 0) + v;
    });
    return {
      name: yCol,
      type: 'bar' as const,
      stack: stacked ? 'total' : undefined,
      itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      data: xCategories.map((x) => aggMap[x]),
    };
  });

  return {
    backgroundColor: ec.chartBg,
    color: SERIES_COLORS,
    textStyle: { color: ec.textPrimary },
    tooltip: makeTooltip(ec, thousandsSeparator),
    legend: yColumns.length > 1 ? { textStyle: { color: ec.textPrimary } } : undefined,
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: xCategories,
      axisLabel: { ...makeAxisLabel(ec), rotate: xCategories.length > 8 ? 30 : 0 },
    },
    yAxis: { type: 'value', axisLabel: makeAxisLabel(ec), splitLine: makeSplitLine(ec) },
    series,
  };
}

/**
 * Build ECharts option for a Line chart.
 * Supports multi-series Y columns and optional area fill.
 *
 * @param config - chart configuration
 * @param data - row data array
 * @param ec - theme colors
 * @returns EChartsOption
 */
export function buildLineOption(
  config: ChartConfig,
  data: Record<string, unknown>[],
  ec: EChartsColors,
): EChartsOption {
  const { xColumn, yColumns, areaFill, thousandsSeparator = false } = config;
  const xCategories = Array.from(new Set(data.map((r) => String(r[xColumn] ?? ''))));

  const series = yColumns.map((yCol, i) => {
    const aggMap: Record<string, number> = Object.fromEntries(xCategories.map((x) => [x, 0]));
    data.forEach((row) => {
      const x = String(row[xColumn] ?? '');
      const v = Number(row[yCol]);
      if (Number.isFinite(v)) aggMap[x] = (aggMap[x] ?? 0) + v;
    });
    return {
      name: yCol,
      type: 'line' as const,
      smooth: true,
      itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      areaStyle: areaFill ? { opacity: 0.2 } : undefined,
      data: xCategories.map((x) => aggMap[x]),
    };
  });

  return {
    backgroundColor: ec.chartBg,
    color: SERIES_COLORS,
    textStyle: { color: ec.textPrimary },
    tooltip: makeTooltip(ec, thousandsSeparator),
    legend: yColumns.length > 1 ? { textStyle: { color: ec.textPrimary } } : undefined,
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      data: xCategories,
      boundaryGap: false,
      axisLabel: { ...makeAxisLabel(ec), rotate: xCategories.length > 8 ? 30 : 0 },
    },
    yAxis: { type: 'value', axisLabel: makeAxisLabel(ec), splitLine: makeSplitLine(ec) },
    series,
  };
}

/**
 * Build ECharts option for a Pie chart.
 * xColumn provides category labels; yColumns[0] provides values.
 * Values are aggregated (sum) per category.
 *
 * @param config - chart configuration
 * @param data - row data array
 * @param ec - theme colors
 * @returns EChartsOption
 */
export function buildPieOption(
  config: ChartConfig,
  data: Record<string, unknown>[],
  ec: EChartsColors,
): EChartsOption {
  const { xColumn, yColumns, thousandsSeparator = false } = config;
  const yCol = yColumns[0];

  const aggMap: Record<string, number> = {};
  data.forEach((row) => {
    const label = String(row[xColumn] ?? '');
    const v = Number(row[yCol]);
    if (Number.isFinite(v)) aggMap[label] = (aggMap[label] ?? 0) + v;
  });
  const pieData = Object.entries(aggMap).map(([name, value]) => ({ name, value }));

  return {
    backgroundColor: ec.chartBg,
    color: SERIES_COLORS,
    textStyle: { color: ec.textPrimary },
    tooltip: {
      trigger: 'item',
      backgroundColor: ec.tooltipBg,
      borderColor: ec.borderMid,
      textStyle: { color: ec.textPrimary, fontSize: 12 },
      formatter: thousandsSeparator
        ? (p: unknown) => {
            const param = p as { name: string; value: number; percent: number; marker: string };
            return `${param.marker}${param.name}: <b>${formatValue(param.value, true)}</b> (${param.percent}%)`;
          }
        : '{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'vertical',
      right: 'right',
      textStyle: { color: ec.textPrimary, fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['35%', '65%'],
        center: ['40%', '50%'],
        data: pieData,
        label: { color: ec.textSecondary, fontSize: 11 },
        labelLine: { lineStyle: { color: ec.borderMid } },
      },
    ],
  };
}

/**
 * Build ECharts option for a Scatter chart.
 * xColumn → X axis (numeric), yColumns[0] → Y axis (numeric).
 * Optional colorGroupColumn creates separate named series per group value.
 *
 * @param config - chart configuration
 * @param data - row data array
 * @param ec - theme colors
 * @returns EChartsOption
 */
export function buildScatterOption(
  config: ChartConfig,
  data: Record<string, unknown>[],
  ec: EChartsColors,
): EChartsOption {
  const { xColumn, yColumns, colorGroupColumn, thousandsSeparator = false } = config;
  const yCol = yColumns[0];

  let series: object[];

  if (colorGroupColumn) {
    const groups: Record<string, [number, number][]> = {};
    data.forEach((row) => {
      const grp = String(row[colorGroupColumn] ?? 'other');
      const x = Number(row[xColumn]);
      const y = Number(row[yCol]);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        if (!groups[grp]) groups[grp] = [];
        groups[grp].push([x, y]);
      }
    });
    series = Object.entries(groups).map(([name, pts], i) => ({
      name,
      type: 'scatter',
      symbolSize: 6,
      itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      data: pts,
    }));
  } else {
    const pts = data
      .map((row) => [Number(row[xColumn]), Number(row[yCol])] as [number, number])
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    series = [
      {
        name: `${xColumn} vs ${yCol}`,
        type: 'scatter',
        symbolSize: 6,
        itemStyle: { color: ec.primary },
        data: pts,
      },
    ];
  }

  return {
    backgroundColor: ec.chartBg,
    color: SERIES_COLORS,
    textStyle: { color: ec.textPrimary },
    tooltip: {
      trigger: 'item',
      backgroundColor: ec.tooltipBg,
      borderColor: ec.borderMid,
      textStyle: { color: ec.textPrimary, fontSize: 12 },
      formatter: (p: unknown) => {
        const param = p as { data: [number, number]; seriesName: string; marker: string };
        const [x, y] = param.data;
        return `${param.marker}${param.seriesName}<br/>${xColumn}: ${formatValue(x, thousandsSeparator)}<br/>${yCol}: ${formatValue(y, thousandsSeparator)}`;
      },
    },
    legend: colorGroupColumn ? { textStyle: { color: ec.textPrimary } } : undefined,
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'value',
      name: xColumn,
      axisLabel: makeAxisLabel(ec),
      splitLine: makeSplitLine(ec),
    },
    yAxis: {
      type: 'value',
      name: yCol,
      axisLabel: makeAxisLabel(ec),
      splitLine: makeSplitLine(ec),
    },
    series,
  };
}

/**
 * Build ECharts option for a Funnel chart.
 * xColumn provides step labels; yColumns[0] provides values (sorted descending).
 *
 * @param config - chart configuration
 * @param data - row data array
 * @param ec - theme colors
 * @returns EChartsOption
 */
export function buildFunnelOption(
  config: ChartConfig,
  data: Record<string, unknown>[],
  ec: EChartsColors,
): EChartsOption {
  const { xColumn, yColumns, thousandsSeparator = false } = config;
  const yCol = yColumns[0];

  const funnelData = data
    .map((row) => ({ name: String(row[xColumn] ?? ''), value: Number(row[yCol]) }))
    .filter((d) => d.name && Number.isFinite(d.value))
    .sort((a, b) => b.value - a.value);

  return {
    backgroundColor: ec.chartBg,
    color: SERIES_COLORS,
    textStyle: { color: ec.textPrimary },
    tooltip: {
      trigger: 'item',
      backgroundColor: ec.tooltipBg,
      borderColor: ec.borderMid,
      textStyle: { color: ec.textPrimary, fontSize: 12 },
      formatter: thousandsSeparator
        ? (p: unknown) => {
            const param = p as { name: string; value: number; percent: number; marker: string };
            return `${param.marker}${param.name}: <b>${formatValue(param.value, true)}</b>`;
          }
        : '{b}: {c}',
    },
    legend: { textStyle: { color: ec.textPrimary } },
    series: [
      {
        type: 'funnel',
        left: '10%',
        width: '80%',
        label: { color: ec.textPrimary, fontSize: 12 },
        labelLine: { lineStyle: { color: ec.borderMid } },
        data: funnelData,
      },
    ],
  };
}

// ─── Unified Entry ────────────────────────────────────────────────────────────

/**
 * Build ECharts option for any supported chart type.
 * Routes to the correct builder based on config.type.
 *
 * @param config - chart configuration
 * @param data - row data array
 * @param ec - resolved ECharts theme colors
 * @returns EChartsOption
 * @throws Error for unknown chart types (exhaustiveness check)
 */
export function buildChartOption(
  config: ChartConfig,
  data: Record<string, unknown>[],
  ec: EChartsColors,
): EChartsOption {
  switch (config.type) {
    case 'bar':     return buildBarOption(config, data, ec);
    case 'line':    return buildLineOption(config, data, ec);
    case 'pie':     return buildPieOption(config, data, ec);
    case 'scatter': return buildScatterOption(config, data, ec);
    case 'funnel':  return buildFunnelOption(config, data, ec);
    default: {
      const _exhaustive: never = config.type;
      throw new Error(`Unsupported chart type: ${_exhaustive}`);
    }
  }
}
