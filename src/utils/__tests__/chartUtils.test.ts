import { describe, expect, it } from 'vitest';
import {
  inferColumnType,
  inferColumnTypes,
  sturgesBinCount,
  isContinuousNumeric,
  autoBinData,
  formatValue,
  buildBarOption,
  buildLineOption,
  buildPieOption,
  buildScatterOption,
  buildFunnelOption,
  buildChartOption,
  type ChartConfig,
  type ColumnMeta,
} from '../chartUtils';
import type { EChartsColors } from '../../theme/useEChartsTheme';

// ─── Mock EChartsColors ───────────────────────────────────────────────────────

const mockEc: EChartsColors = {
  textPrimary: '#fff',
  textSecondary: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.4)',
  borderSubtle: 'rgba(255,255,255,0.1)',
  borderMid: 'rgba(255,255,255,0.2)',
  tooltipBg: '#1a1a2e',
  primary: '#FF6B00',
  borderLine: 'rgba(255,255,255,0.2)',
  gridLine: 'rgba(255,255,255,0.1)',
  chartBg: 'transparent',
};

// ─── Sample data ──────────────────────────────────────────────────────────────

const salesRows = [
  { month: 'Jan', revenue: 1000, cost: 600, region: 'North' },
  { month: 'Feb', revenue: 1500, cost: 700, region: 'South' },
  { month: 'Mar', revenue: 1200, cost: 650, region: 'North' },
  { month: 'Jan', revenue: 900,  cost: 500, region: 'South' },
];

const numericXRows = Array.from({ length: 50 }, (_, i) => ({ age: i * 2, count: i + 1 }));

// ─── inferColumnType ──────────────────────────────────────────────────────────

describe('inferColumnType', () => {
  it('returns numeric for integer columns', () => {
    const rows = [{ val: 1 }, { val: 2 }, { val: 3 }];
    expect(inferColumnType('val', rows)).toBe('numeric');
  });

  it('returns numeric for decimal columns', () => {
    const rows = [{ v: '3.14' }, { v: '2.71' }, { v: '1.41' }];
    expect(inferColumnType('v', rows)).toBe('numeric');
  });

  it('returns datetime for ISO date strings', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ dt: `2024-0${(i % 9) + 1}-01` }));
    expect(inferColumnType('dt', rows)).toBe('datetime');
  });

  it('returns categorical for text values', () => {
    const rows = [{ cat: 'Apple' }, { cat: 'Banana' }, { cat: 'Cherry' }];
    expect(inferColumnType('cat', rows)).toBe('categorical');
  });

  it('returns categorical for mixed values below thresholds', () => {
    // 50% numeric — below 80% threshold → categorical
    const rows = [
      { v: '1' }, { v: '2' }, { v: 'foo' }, { v: 'bar' },
    ];
    expect(inferColumnType('v', rows)).toBe('categorical');
  });

  it('returns categorical for empty data', () => {
    expect(inferColumnType('x', [])).toBe('categorical');
  });

  it('handles null / undefined values (skips them)', () => {
    const rows = [{ v: 10 }, { v: null }, { v: undefined }, { v: 20 }];
    expect(inferColumnType('v', rows)).toBe('numeric');
  });
});

// ─── inferColumnTypes ─────────────────────────────────────────────────────────

describe('inferColumnTypes', () => {
  it('maps schema to ColumnMeta with inferred types', () => {
    const schema = [{ name: 'month' }, { name: 'revenue' }];
    const result: ColumnMeta[] = inferColumnTypes(schema, salesRows);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'month', inferredType: 'categorical' });
    expect(result[1]).toEqual({ name: 'revenue', inferredType: 'numeric' });
  });

  it('returns empty array for empty schema', () => {
    expect(inferColumnTypes([], salesRows)).toEqual([]);
  });
});

// ─── sturgesBinCount ──────────────────────────────────────────────────────────

describe('sturgesBinCount', () => {
  it('returns 5 for n ≤ 0', () => {
    expect(sturgesBinCount(0)).toBe(5);
    expect(sturgesBinCount(-1)).toBe(5);
  });

  it('returns 5 for small n (≤ 5)', () => {
    expect(sturgesBinCount(1)).toBe(5);
    expect(sturgesBinCount(4)).toBe(5);
  });

  it('returns sensible value for n=100', () => {
    const bins = sturgesBinCount(100);
    expect(bins).toBeGreaterThanOrEqual(5);
    expect(bins).toBeLessThanOrEqual(20);
  });

  it('caps at 20 for large n', () => {
    expect(sturgesBinCount(1_000_000)).toBe(20);
  });
});

// ─── isContinuousNumeric ──────────────────────────────────────────────────────

describe('isContinuousNumeric', () => {
  it('returns true for fully unique values', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(isContinuousNumeric(vals)).toBe(true);
  });

  it('returns false for a small enum-like set', () => {
    // 2 distinct / 10 total = 0.2 < 0.3
    const vals = [1, 1, 1, 2, 2, 2, 1, 2, 1, 2];
    expect(isContinuousNumeric(vals)).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(isContinuousNumeric([])).toBe(false);
  });
});

// ─── autoBinData ──────────────────────────────────────────────────────────────

describe('autoBinData', () => {
  it('returns empty array for empty input', () => {
    expect(autoBinData([])).toEqual([]);
  });

  it('returns single bucket when min === max', () => {
    const result = autoBinData([5, 5, 5]);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it('produces requested number of buckets', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i);
    const result = autoBinData(vals, 10);
    expect(result).toHaveLength(10);
  });

  it('total count across buckets equals input length', () => {
    const vals = Array.from({ length: 200 }, (_, i) => i);
    const result = autoBinData(vals);
    const total = result.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(200);
  });

  it('bucket labels contain [ and ) bracket notation', () => {
    const vals = [0, 10, 20, 30, 40, 50];
    const result = autoBinData(vals, 5);
    result.forEach((b) => {
      expect(b.label).toMatch(/^\[.*\)$/);
    });
  });

  it('clamps binCount to [5, 50]', () => {
    const vals = Array.from({ length: 100 }, (_, i) => i);
    expect(autoBinData(vals, 1)).toHaveLength(5);
    expect(autoBinData(vals, 100)).toHaveLength(50);
  });

  it('ignores non-finite values', () => {
    const vals = [1, 2, NaN, Infinity, 3, -Infinity, 4];
    const result = autoBinData(vals, 5);
    const total = result.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(4); // only 1,2,3,4 are finite
  });
});

// ─── formatValue ─────────────────────────────────────────────────────────────

describe('formatValue', () => {
  it('returns empty string for null / undefined', () => {
    expect(formatValue(null)).toBe('');
    expect(formatValue(undefined)).toBe('');
  });

  it('formats number without separator', () => {
    expect(formatValue(1234567)).toBe('1234567');
  });

  it('formats number with thousands separator', () => {
    expect(formatValue(1234567, true)).toBe('1,234,567');
  });

  it('returns original string for non-numeric', () => {
    expect(formatValue('hello')).toBe('hello');
  });

  it('handles decimal numbers', () => {
    expect(formatValue(1234.56, true)).toBe('1,234.56');
  });
});

// ─── buildBarOption ───────────────────────────────────────────────────────────

describe('buildBarOption', () => {
  const config: ChartConfig = {
    id: 'bar-1',
    type: 'bar',
    xColumn: 'month',
    yColumns: ['revenue'],
  };

  it('produces series with type bar', () => {
    const opt = buildBarOption(config, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('bar');
  });

  it('produces correct number of series for multi-Y', () => {
    const cfg: ChartConfig = { ...config, yColumns: ['revenue', 'cost'] };
    const opt = buildBarOption(cfg, salesRows, mockEc);
    expect((opt.series as unknown[]).length).toBe(2);
  });

  it('includes stack property when stacked=true', () => {
    const cfg: ChartConfig = { ...config, yColumns: ['revenue', 'cost'], stacked: true };
    const opt = buildBarOption(cfg, salesRows, mockEc);
    const s = opt.series as Array<{ stack?: string }>;
    expect(s[0].stack).toBe('total');
  });

  it('auto-bin path produces binned x-axis labels', () => {
    const cfg: ChartConfig = { id: 'b', type: 'bar', xColumn: 'age', yColumns: ['count'], autoBin: true };
    const opt = buildBarOption(cfg, numericXRows, mockEc);
    const xAxis = opt.xAxis as { data: string[] };
    expect(xAxis.data.length).toBeGreaterThan(0);
    expect(xAxis.data[0]).toMatch(/^\[/);
  });

  it('sets backgroundColor from ec.chartBg', () => {
    const opt = buildBarOption(config, salesRows, mockEc);
    expect(opt.backgroundColor).toBe(mockEc.chartBg);
  });
});

// ─── buildLineOption ──────────────────────────────────────────────────────────

describe('buildLineOption', () => {
  const config: ChartConfig = {
    id: 'line-1',
    type: 'line',
    xColumn: 'month',
    yColumns: ['revenue'],
  };

  it('produces series with type line', () => {
    const opt = buildLineOption(config, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('line');
  });

  it('includes areaStyle when areaFill=true', () => {
    const cfg: ChartConfig = { ...config, areaFill: true };
    const opt = buildLineOption(cfg, salesRows, mockEc);
    const s = opt.series as Array<{ areaStyle?: object }>;
    expect(s[0].areaStyle).toBeDefined();
  });

  it('areaStyle is undefined when areaFill=false', () => {
    const opt = buildLineOption(config, salesRows, mockEc);
    const s = opt.series as Array<{ areaStyle?: object }>;
    expect(s[0].areaStyle).toBeUndefined();
  });

  it('xAxis has boundaryGap: false', () => {
    const opt = buildLineOption(config, salesRows, mockEc);
    expect((opt.xAxis as { boundaryGap: boolean }).boundaryGap).toBe(false);
  });
});

// ─── buildPieOption ───────────────────────────────────────────────────────────

describe('buildPieOption', () => {
  const config: ChartConfig = {
    id: 'pie-1',
    type: 'pie',
    xColumn: 'region',
    yColumns: ['revenue'],
  };

  it('produces series with type pie', () => {
    const opt = buildPieOption(config, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('pie');
  });

  it('aggregates values by category', () => {
    const opt = buildPieOption(config, salesRows, mockEc);
    const pieData = (opt.series as Array<{ data: Array<{ name: string; value: number }> }>)[0].data;
    const northEntry = pieData.find((d) => d.name === 'North');
    expect(northEntry?.value).toBe(1000 + 1200); // Jan + Mar
  });

  it('has legend defined', () => {
    const opt = buildPieOption(config, salesRows, mockEc);
    expect(opt.legend).toBeDefined();
  });
});

// ─── buildScatterOption ───────────────────────────────────────────────────────

describe('buildScatterOption', () => {
  const scatterRows = [
    { x: 1, y: 2, group: 'A' },
    { x: 3, y: 4, group: 'B' },
    { x: 5, y: 6, group: 'A' },
  ];
  const config: ChartConfig = {
    id: 'sc-1',
    type: 'scatter',
    xColumn: 'x',
    yColumns: ['y'],
  };

  it('produces series with type scatter', () => {
    const opt = buildScatterOption(config, scatterRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('scatter');
  });

  it('filters non-finite points', () => {
    const rows = [{ x: NaN, y: 1 }, { x: 2, y: Infinity }, { x: 3, y: 4 }];
    const opt = buildScatterOption(config, rows, mockEc);
    const s = opt.series as Array<{ data: [number, number][] }>;
    expect(s[0].data).toHaveLength(1);
    expect(s[0].data[0]).toEqual([3, 4]);
  });

  it('creates separate series per group when colorGroupColumn is set', () => {
    const cfg: ChartConfig = { ...config, colorGroupColumn: 'group' };
    const opt = buildScatterOption(cfg, scatterRows, mockEc);
    expect((opt.series as unknown[]).length).toBe(2); // A and B
  });
});

// ─── buildFunnelOption ────────────────────────────────────────────────────────

describe('buildFunnelOption', () => {
  const funnelRows = [
    { step: 'View',    count: 10000 },
    { step: 'Click',   count: 5000  },
    { step: 'Add',     count: 2000  },
    { step: 'Pay',     count: 800   },
  ];
  const config: ChartConfig = {
    id: 'fn-1',
    type: 'funnel',
    xColumn: 'step',
    yColumns: ['count'],
  };

  it('produces series with type funnel', () => {
    const opt = buildFunnelOption(config, funnelRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('funnel');
  });

  it('data is sorted descending by value', () => {
    const opt = buildFunnelOption(config, funnelRows, mockEc);
    const data = (opt.series as Array<{ data: Array<{ value: number }> }>)[0].data;
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i].value).toBeGreaterThanOrEqual(data[i + 1].value);
    }
  });

  it('filters rows with non-finite values', () => {
    const rows = [...funnelRows, { step: 'Bad', count: NaN }];
    const opt = buildFunnelOption(config, rows, mockEc);
    const data = (opt.series as Array<{ data: unknown[] }>)[0].data;
    expect(data).toHaveLength(4); // NaN row excluded
  });
});

// ─── buildChartOption (unified entry) ────────────────────────────────────────

describe('buildChartOption', () => {
  it('routes bar type to bar builder', () => {
    const cfg: ChartConfig = { id: '1', type: 'bar', xColumn: 'month', yColumns: ['revenue'] };
    const opt = buildChartOption(cfg, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('bar');
  });

  it('routes line type to line builder', () => {
    const cfg: ChartConfig = { id: '2', type: 'line', xColumn: 'month', yColumns: ['revenue'] };
    const opt = buildChartOption(cfg, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('line');
  });

  it('routes pie type to pie builder', () => {
    const cfg: ChartConfig = { id: '3', type: 'pie', xColumn: 'region', yColumns: ['revenue'] };
    const opt = buildChartOption(cfg, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('pie');
  });

  it('routes scatter type to scatter builder', () => {
    const cfg: ChartConfig = { id: '4', type: 'scatter', xColumn: 'revenue', yColumns: ['cost'] };
    const opt = buildChartOption(cfg, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('scatter');
  });

  it('routes funnel type to funnel builder', () => {
    const cfg: ChartConfig = { id: '5', type: 'funnel', xColumn: 'month', yColumns: ['revenue'] };
    const opt = buildChartOption(cfg, salesRows, mockEc);
    expect((opt.series as Array<{ type: string }>)[0].type).toBe('funnel');
  });
});
