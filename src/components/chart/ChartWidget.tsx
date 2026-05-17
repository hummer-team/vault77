/**
 * ChartWidget.tsx
 * Single chart display component with toolbar (refresh / download / delete).
 * Wraps an ECharts instance and reacts to theme changes and data updates.
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as echarts from 'echarts';
import type { ECharts } from 'echarts';
import { Button, Dropdown, Popconfirm, Tooltip } from 'antd';
import {
  ReloadOutlined,
  DownloadOutlined,
  DeleteOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useEChartsColors } from '../../theme';
import { buildChartOption } from '../../utils/chartUtils';
import type { ChartConfig } from '../../utils/chartUtils';
import { vmMessage } from '../../utils/vmDialog';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ChartWidgetProps {
  /** Fully resolved chart configuration (type, columns, options). */
  config: ChartConfig;
  /** Current data rows to render. */
  data: Record<string, unknown>[];
  /**
   * Column names currently hidden in the parent table.
   * Used to show a warning badge when chart columns are hidden.
   */
  hiddenColumnNames?: Set<string>;
  /** Called when the user confirms chart deletion. */
  onDelete: () => void;
  /**
   * Called when the user clicks refresh.
   * Returns the latest filtered data (from latestFilteredDataRef or full data).
   */
  onRefresh: () => Record<string, unknown>[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if the EChartsColors correspond to a dark theme. */
function isDark(borderSubtle: string): boolean {
  return borderSubtle.includes('255');
}

/** Build a filename stem from chart config. */
function buildFilename(config: ChartConfig): string {
  const cols = [config.xColumn, ...config.yColumns].join('_');
  return `chart_${config.type}_${cols}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ─── Component ────────────────────────────────────────────────────────────────

const ChartWidget: React.FC<ChartWidgetProps> = ({
  config,
  data,
  hiddenColumnNames,
  onDelete,
  onRefresh,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ECharts | null>(null);
  const ec = useEChartsColors();

  // Internal data state — updated on refresh
  const [currentData, setCurrentData] = useState<Record<string, unknown>[]>(data);

  // Detect columns used by this chart that are hidden in the table
  const hiddenUsedCols = (() => {
    if (!hiddenColumnNames || hiddenColumnNames.size === 0) return [];
    const used = [config.xColumn, ...config.yColumns];
    if (config.colorGroupColumn) used.push(config.colorGroupColumn);
    return used.filter((c) => hiddenColumnNames.has(c));
  })();

  // ── ECharts init / theme change ──────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current) return;

    // Dispose existing instance on theme change (must reinit for theme to apply)
    if (instanceRef.current) {
      instanceRef.current.dispose();
      instanceRef.current = null;
    }

    const theme = isDark(ec.borderSubtle) ? 'dark' : null;
    const chart = echarts.init(chartRef.current, theme);
    instanceRef.current = chart;

    chart.setOption(buildChartOption(config, currentData, ec));

    return () => {
      chart.dispose();
      instanceRef.current = null;
    };
    // Re-run when theme tokens change (ec reference changes on theme switch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ec]);

  // ── Re-render when data or config changes (no dispose) ───────────────────
  useEffect(() => {
    if (!instanceRef.current) return;
    instanceRef.current.setOption(buildChartOption(config, currentData, ec), {
      notMerge: true,
    });
  }, [config, currentData, ec]);

  // ── ResizeObserver — responds to CSS resize: both ───────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      instanceRef.current?.resize();
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // ── Window resize fallback ───────────────────────────────────────────────
  useEffect(() => {
    const handleResize = () => instanceRef.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Refresh ──────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(() => {
    const latest = onRefresh();
    setCurrentData(latest);
    // setOption is triggered via the currentData useEffect above
  }, [onRefresh]);

  // ── Download ─────────────────────────────────────────────────────────────
  const handleDownload = useCallback(
    (format: 'png' | 'svg') => {
      const chart = instanceRef.current;
      if (!chart) return;
      try {
        const dataURL = chart.getDataURL({
          type: format,
          pixelRatio: 2,
          backgroundColor: isDark(ec.borderSubtle) ? '#1a1a2e' : '#ffffff',
        });
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `${buildFilename(config)}.${format}`;
        link.click();
      } catch {
        vmMessage.error('下载失败，请稍后重试');
      }
    },
    [config, ec],
  );

  // ── Toolbar button styles ─────────────────────────────────────────────────
  const btnStyle: React.CSSProperties = {
    color: 'var(--vm-text-secondary)',
    padding: '2px 6px',
    height: 24,
    fontSize: 12,
    background: 'var(--vm-bg-card)',
    border: '1px solid var(--vm-border-subtle)',
    borderRadius: 4,
  };

  const downloadMenuItems = [
    { key: 'png', label: 'PNG', onClick: () => handleDownload('png') },
    { key: 'svg', label: 'SVG', onClick: () => handleDownload('svg') },
  ];

  // ── Chart title ──────────────────────────────────────────────────────────
  const chartTitle =
    config.title ||
    `${config.type.toUpperCase()} — ${config.xColumn} / ${config.yColumns.join(', ')}`;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        background: 'var(--vm-bg-card)',
        border: '1px solid var(--vm-border-subtle)',
        borderRadius: 8,
        overflow: 'hidden',
        resize: 'both',
        minWidth: 280,
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Header bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px 4px',
          borderBottom: '1px solid var(--vm-border-subtle)',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Title + warning badge */}
        <div
          style={{
            fontSize: 12,
            color: 'var(--vm-text-secondary)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={chartTitle}
        >
          {chartTitle}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {/* Warning badge for hidden columns */}
          {hiddenUsedCols.length > 0 && (
            <Tooltip
              title={`列 ${hiddenUsedCols.map((c) => `"${c}"`).join(', ')} 在表格中已隐藏，图表仍基于完整数据渲染`}
            >
              <WarningOutlined style={{ color: 'var(--vm-color-warning)', fontSize: 13 }} />
            </Tooltip>
          )}

          {/* Refresh */}
          <Tooltip title="刷新（使用当前过滤数据）">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              style={btnStyle}
              onClick={handleRefresh}
            />
          </Tooltip>

          {/* Download */}
          <Dropdown menu={{ items: downloadMenuItems }} placement="bottomRight" trigger={['click']}>
            <Tooltip title="下载图表">
              <Button
                type="text"
                size="small"
                icon={<DownloadOutlined />}
                style={btnStyle}
              />
            </Tooltip>
          </Dropdown>

          {/* Delete */}
          <Popconfirm
            title="确认删除此图表？"
            onConfirm={onDelete}
            okText="删除"
            cancelText="取消"
            placement="bottomRight"
          >
            <Tooltip title="删除图表">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                style={{ ...btnStyle, color: 'var(--vm-color-error)' }}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>

      {/* ── ECharts canvas ──────────────────────────────────────────────── */}
      <div
        ref={chartRef}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  );
};

export default ChartWidget;
