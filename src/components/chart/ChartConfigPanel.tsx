/**
 * ChartConfigPanel.tsx
 * Chart configuration UI — chart type selector + column pickers + advanced options.
 * Rendered inside a Dropdown dropdownRender, styled to match the "列设置" panel.
 */

import React, { useState, useMemo } from 'react';
import { Select, Switch, InputNumber, Tooltip, Button, Divider } from 'antd';
import {
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  DotChartOutlined,
  FunnelPlotOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import type { ColumnMeta, ChartConfig, ChartType } from '../../utils/chartUtils';
import { isContinuousNumeric } from '../../utils/chartUtils';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChartConfigPanelProps {
  /** Inferred schema of all columns in the current result set. */
  schema: ColumnMeta[];
  /** Raw data rows — used to check if X axis is continuous numeric for binning. */
  data: Record<string, unknown>[];
  onConfirm: (config: ChartConfig) => void;
  onCancel: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface ChartTypeOption {
  type: ChartType;
  label: string;
  icon: React.ReactNode;
}

const CHART_TYPE_OPTIONS: ChartTypeOption[] = [
  { type: 'bar', label: '柱状图', icon: <BarChartOutlined /> },
  { type: 'line', label: '折线图', icon: <LineChartOutlined /> },
  { type: 'pie', label: '饼图', icon: <PieChartOutlined /> },
  { type: 'scatter', label: '散点图', icon: <DotChartOutlined /> },
  { type: 'funnel', label: '漏斗图', icon: <FunnelPlotOutlined /> },
];

/** Type emoji prefix for column labels in Select options. */
const TYPE_EMOJI: Record<string, string> = {
  numeric: '🔢',
  datetime: '📅',
  categorical: '🔤',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Whether this chart type supports multi-series Y columns. */
function supportsMultiY(type: ChartType): boolean {
  return type === 'bar' || type === 'line';
}

/** Max Y columns for the given chart type. */
function maxYColumns(type: ChartType): number {
  return supportsMultiY(type) ? 5 : 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ChartConfigPanel: React.FC<ChartConfigPanelProps> = ({
  schema,
  data,
  onConfirm,
  onCancel,
}) => {
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [xColumn, setXColumn] = useState<string | undefined>();
  const [yColumns, setYColumns] = useState<string[]>([]);
  const [colorGroupColumn, setColorGroupColumn] = useState<string | undefined>();

  // Advanced options
  const [stacked, setStacked] = useState(false);
  const [areaFill, setAreaFill] = useState(false);
  const [autoBin, setAutoBin] = useState(false);
  const [binCount, setBinCount] = useState(10);
  const [thousandsSeparator, setThousandsSeparator] = useState(true);

  // Derived column lists
  const numericCols = useMemo(() => schema.filter((c) => c.inferredType === 'numeric'), [schema]);
  const categoricalCols = useMemo(
    () => schema.filter((c) => c.inferredType === 'categorical'),
    [schema],
  );

  // All column Select options (with type emoji)
  const allColOptions = useMemo(
    () =>
      schema.map((c) => ({
        value: c.name,
        label: `${TYPE_EMOJI[c.inferredType] ?? ''} ${c.name}`,
      })),
    [schema],
  );

  // Numeric-only Select options
  const numericColOptions = useMemo(
    () =>
      numericCols.map((c) => ({
        value: c.name,
        label: `${TYPE_EMOJI.numeric} ${c.name}`,
      })),
    [numericCols],
  );

  // Categorical-only Select options (for color group in scatter)
  const categoricalColOptions = useMemo(
    () =>
      categoricalCols.map((c) => ({
        value: c.name,
        label: `${TYPE_EMOJI.categorical} ${c.name}`,
      })),
    [categoricalCols],
  );

  // Determine whether auto-binning can be enabled:
  // only when xColumn is numeric AND data values look continuous
  const canAutoBin = useMemo(() => {
    if (chartType !== 'bar' || !xColumn) return false;
    const colMeta = schema.find((c) => c.name === xColumn);
    if (colMeta?.inferredType !== 'numeric') return false;
    const values = data
      .map((row) => Number(row[xColumn]))
      .filter((v) => !isNaN(v));
    return isContinuousNumeric(values);
  }, [chartType, xColumn, schema, data]);

  // Reset auto-bin when no longer applicable
  const effectiveAutoBin = canAutoBin && autoBin;

  // ── Chart type change: reset columns ───────────────────────────────────
  const handleTypeChange = (type: ChartType) => {
    setChartType(type);
    setXColumn(undefined);
    setYColumns([]);
    setColorGroupColumn(undefined);
    setStacked(false);
    setAreaFill(false);
    setAutoBin(false);
  };

  // ── Y column change: enforce per-type max ─────────────────────────────
  const handleYChange = (vals: string | string[]) => {
    const arr = Array.isArray(vals) ? vals : [vals];
    setYColumns(arr.slice(0, maxYColumns(chartType)));
  };

  // ── Validation ────────────────────────────────────────────────────────
  const isValid = useMemo(() => {
    if (!xColumn || yColumns.length === 0) return false;
    if (chartType === 'scatter') {
      // scatter: X must be numeric, Y must be numeric
      const xMeta = schema.find((c) => c.name === xColumn);
      if (xMeta?.inferredType !== 'numeric') return false;
    }
    return true;
  }, [xColumn, yColumns, chartType, schema]);

  // ── Confirm ───────────────────────────────────────────────────────────
  const handleConfirm = () => {
    if (!xColumn || yColumns.length === 0) return;
    const config: ChartConfig = {
      id: uuidv4(),
      type: chartType,
      xColumn,
      yColumns,
      colorGroupColumn: chartType === 'scatter' ? colorGroupColumn : undefined,
      stacked: chartType === 'bar' ? stacked : undefined,
      areaFill: chartType === 'line' ? areaFill : undefined,
      autoBin: effectiveAutoBin || undefined,
      binCount: effectiveAutoBin ? binCount : undefined,
      thousandsSeparator,
    };
    onConfirm(config);
  };

  // ── Y axis Select: multi vs single ────────────────────────────────────
  const yAxisLabel = chartType === 'pie' ? '值列（数值）' : chartType === 'funnel' ? '转化量列（数值）' : chartType === 'scatter' ? 'Y 轴列（数值）' : 'Y 轴列（数值，最多5列）';

  const xAxisLabel = chartType === 'scatter' ? 'X 轴列（数值）' : chartType === 'pie' ? '标签列' : chartType === 'funnel' ? '步骤名列' : 'X 轴列';

  // X column options: for scatter only numeric; others all columns
  const xColOptions = chartType === 'scatter' ? numericColOptions : allColOptions;

  // ── Styles ─────────────────────────────────────────────────────────────
  const panelStyle: React.CSSProperties = {
    background: 'var(--vm-bg-card)',
    border: '1px solid var(--vm-border-subtle)',
    borderRadius: 6,
    padding: '12px 14px',
    minWidth: 280,
    maxWidth: 340,
    boxShadow: '0 -4px 16px rgba(0,0,0,0.25)',
    color: 'var(--vm-text-primary)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--vm-text-secondary)',
    marginBottom: 4,
    marginTop: 8,
    fontWeight: 500,
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    fontSize: 12,
    color: 'var(--vm-text-secondary)',
  };

  return (
    <div style={panelStyle} onMouseDown={(e) => e.stopPropagation()}>
      {/* ── Chart type selector ─────────────────────────────────────────── */}
      <div style={{ ...labelStyle, marginTop: 0 }}>图表类型</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {CHART_TYPE_OPTIONS.map((opt) => (
          <Tooltip key={opt.type} title={opt.label}>
            <Button
              type={chartType === opt.type ? 'primary' : 'default'}
              size="small"
              icon={opt.icon}
              onClick={() => handleTypeChange(opt.type)}
              style={{
                fontSize: 12,
                padding: '2px 8px',
                height: 28,
                background: chartType === opt.type ? 'var(--vm-primary)' : 'var(--vm-surface-light)',
                borderColor: chartType === opt.type ? 'var(--vm-primary)' : 'var(--vm-border-subtle)',
                color: chartType === opt.type ? '#fff' : 'var(--vm-text-secondary)',
              }}
            >
              {opt.label}
            </Button>
          </Tooltip>
        ))}
      </div>

      <Divider style={{ margin: '10px 0', borderColor: 'var(--vm-border-subtle)' }} />

      {/* ── X axis column ───────────────────────────────────────────────── */}
      <div style={labelStyle}>{xAxisLabel}</div>
      <Select
        value={xColumn}
        onChange={(v) => setXColumn(v)}
        options={xColOptions}
        placeholder="选择列..."
        size="small"
        style={selectStyle}
        dropdownStyle={{
          background: 'var(--vm-bg-card)',
          border: '1px solid var(--vm-border-subtle)',
        }}
      />

      {/* ── Y axis column(s) ─────────────────────────────────────────────── */}
      <div style={labelStyle}>{yAxisLabel}</div>
      {supportsMultiY(chartType) ? (
        <Select
          mode="multiple"
          value={yColumns}
          onChange={handleYChange}
          options={numericColOptions}
          placeholder="选择列（最多5列）..."
          size="small"
          style={selectStyle}
          maxCount={5}
          dropdownStyle={{
            background: 'var(--vm-bg-card)',
            border: '1px solid var(--vm-border-subtle)',
          }}
        />
      ) : (
        <Select
          value={yColumns[0]}
          onChange={(v) => setYColumns([v])}
          options={numericColOptions}
          placeholder="选择列..."
          size="small"
          style={selectStyle}
          dropdownStyle={{
            background: 'var(--vm-bg-card)',
            border: '1px solid var(--vm-border-subtle)',
          }}
        />
      )}

      {/* ── Scatter: color group column ──────────────────────────────────── */}
      {chartType === 'scatter' && (
        <>
          <div style={labelStyle}>颜色分组列（可选，分类列）</div>
          <Select
            value={colorGroupColumn}
            onChange={(v) => setColorGroupColumn(v)}
            options={categoricalColOptions}
            placeholder="不分组..."
            allowClear
            size="small"
            style={selectStyle}
            dropdownStyle={{
              background: 'var(--vm-bg-card)',
              border: '1px solid var(--vm-border-subtle)',
            }}
          />
        </>
      )}

      <Divider style={{ margin: '10px 0', borderColor: 'var(--vm-border-subtle)' }} />

      {/* ── Advanced options ─────────────────────────────────────────────── */}
      <div style={{ ...labelStyle, marginTop: 0 }}>高级选项</div>

      {/* Thousands separator — all chart types */}
      <div style={rowStyle}>
        <span>千分位分隔符</span>
        <Switch
          checked={thousandsSeparator}
          onChange={setThousandsSeparator}
          size="small"
        />
      </div>

      {/* Bar: stack toggle */}
      {chartType === 'bar' && yColumns.length > 1 && (
        <div style={rowStyle}>
          <span>堆叠模式</span>
          <Switch checked={stacked} onChange={setStacked} size="small" />
        </div>
      )}

      {/* Line: area fill toggle */}
      {chartType === 'line' && (
        <div style={rowStyle}>
          <span>面积填充</span>
          <Switch checked={areaFill} onChange={setAreaFill} size="small" />
        </div>
      )}

      {/* Bar: auto-bin (only when X is continuous numeric) */}
      {chartType === 'bar' && (
        <div style={rowStyle}>
          <span style={{ color: canAutoBin ? 'var(--vm-text-secondary)' : 'var(--vm-text-disabled)' }}>
            自动分桶
            {!canAutoBin && <span style={{ fontSize: 10, marginLeft: 4 }}>(需数值 X 轴)</span>}
          </span>
          <Switch
            checked={effectiveAutoBin}
            onChange={(v) => setAutoBin(v)}
            disabled={!canAutoBin}
            size="small"
          />
        </div>
      )}

      {/* Bin count input when auto-bin is active */}
      {effectiveAutoBin && (
        <div style={{ ...rowStyle, marginTop: 6 }}>
          <span>分桶数量</span>
          <InputNumber
            value={binCount}
            min={5}
            max={50}
            step={1}
            onChange={(v) => setBinCount(v ?? 10)}
            size="small"
            style={{ width: 72 }}
          />
        </div>
      )}

      <Divider style={{ margin: '10px 0', borderColor: 'var(--vm-border-subtle)' }} />

      {/* ── Action buttons ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button size="small" onClick={onCancel} style={{ color: 'var(--vm-text-secondary)' }}>
          取消
        </Button>
        <Button
          size="small"
          type="primary"
          disabled={!isValid}
          onClick={handleConfirm}
          style={{ background: isValid ? 'var(--vm-primary)' : undefined }}
        >
          添加图表
        </Button>
      </div>
    </div>
  );
};

export default ChartConfigPanel;
