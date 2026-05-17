/**
 * ChartContainer.tsx
 * Multi-chart layout container. Manages the list of ChartConfig items,
 * dispatches refresh / delete to individual ChartWidget instances,
 * and exposes an imperative addChart method via forwardRef.
 */

import React, { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import ChartWidget from './ChartWidget';
import type { ChartConfig } from '../../utils/chartUtils';
import { vmMessage } from '../../utils/vmDialog';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_CHARTS = 6;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChartContainerHandle {
  /** Add a new chart. Returns false and shows toast if limit is reached. */
  addChart: (config: ChartConfig) => boolean;
}

export interface ChartContainerProps {
  /** Current data rows (used on initial render). */
  data: Record<string, unknown>[];
  /**
   * Ref to the parent component's latest-filtered-data holder.
   * ChartWidget refresh calls will read from this ref for up-to-date rows.
   */
  latestFilteredDataRef: React.RefObject<Record<string, unknown>[]>;
  /** Column names currently hidden in the parent table. */
  hiddenColumnNames?: Set<string>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the flex basis (width) for each chart given total count.
 * One chart per row — prevents multi-chart horizontal clutter.
 */
function chartFlexBasis(_count: number): string {
  return '100%';
}

// ─── Component ────────────────────────────────────────────────────────────────

const ChartContainer = React.memo(forwardRef<ChartContainerHandle, ChartContainerProps>(
  ({ data, latestFilteredDataRef, hiddenColumnNames }, ref) => {
    const [charts, setCharts] = useState<ChartConfig[]>([]);

    // ── Imperative handle exposed to parent (ResultsDisplay) ─────────────
    useImperativeHandle(
      ref,
      () => ({
        addChart(config: ChartConfig): boolean {
          if (charts.length >= MAX_CHARTS) {
            vmMessage.warning(`最多同时显示 ${MAX_CHARTS} 个图表`);
            return false;
          }
          setCharts((prev) => [...prev, config]);
          return true;
        },
      }),
      [charts.length],
    );

    // ── Remove chart ──────────────────────────────────────────────────────
    const handleDelete = useCallback((id: string) => {
      setCharts((prev) => prev.filter((c) => c.id !== id));
    }, []);

    // ── Refresh: return latest filtered data ──────────────────────────────
    const handleRefresh = useCallback(
      (_id: string): Record<string, unknown>[] => {
        return latestFilteredDataRef.current ?? data;
      },
      [latestFilteredDataRef, data],
    );

    if (charts.length === 0) return null;

    const flexBasis = chartFlexBasis(charts.length);

    return (
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          padding: '0 0 12px 0',
        }}
      >
        {charts.map((config) => (
          <div
            key={config.id}
            style={{
              flexBasis: flexBasis,
              flexGrow: 0,
              flexShrink: 0,
              minWidth: 280,
            }}
          >
            <ChartWidget
              config={config}
              data={latestFilteredDataRef.current ?? data}
              hiddenColumnNames={hiddenColumnNames}
              onDelete={() => handleDelete(config.id)}
              onRefresh={() => handleRefresh(config.id)}
            />
          </div>
        ))}
      </div>
    );
  },
));

ChartContainer.displayName = 'ChartContainer';

export default ChartContainer;
