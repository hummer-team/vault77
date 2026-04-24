import { useTheme } from './index';

/** Resolved color values for use in ECharts option configs. */
export interface EChartsColors {
  /** Primary axis label text, title text */
  textPrimary: string;
  /** Secondary axis label, tick text */
  textSecondary: string;
  /** Muted/disabled text */
  textMuted: string;
  /** Subtle divider/grid line color */
  borderSubtle: string;
  /** Medium border/grid line */
  borderMid: string;
  /** Tooltip/legend background */
  tooltipBg: string;
  /** Primary brand color */
  primary: string;
  /** Border color for axis lines (thicker) */
  borderLine: string;
  /** Very subtle grid lines */
  gridLine: string;
  /** Chart background color */
  chartBg: string;
}

/**
 * Returns resolved ECharts-compatible color values that update on theme change.
 * Reads from `currentTheme.cssVars` directly (no DOM access needed).
 */
export const useEChartsColors = (): EChartsColors => {
  const { currentTheme } = useTheme();
  const v = currentTheme.cssVars;
  
  // Helper function to compute lighter version of borderSubtle for grid lines
  const computeGridLine = (): string => {
    const borderSubtle = v['--vm-border-subtle'];
    // If it's a dark theme (white-based rgba), use the white color
    if (borderSubtle.includes('255')) {
      return 'rgba(255, 255, 255, 0.1)';
    }
    // Light theme (dark-based rgba), use a lighter gray
    return 'rgba(150, 150, 150, 0.1)';
  };
  
  const computeBorderLine = (): string => {
    const borderSubtle = v['--vm-border-subtle'];
    if (borderSubtle.includes('255')) {
      return 'rgba(255, 255, 255, 0.2)';
    }
    return 'rgba(150, 150, 150, 0.2)';
  };

  const computeChartBg = (): string => {
    const borderSubtle = v['--vm-border-subtle'];
    // Dark theme: use transparent/dark background
    if (borderSubtle.includes('255')) {
      return 'transparent';
    }
    // Light theme: use light background from layout
    return v['--vm-layout-bg'];
  };

  return {
    textPrimary: v['--vm-text-primary'],
    textSecondary: v['--vm-text-secondary'],
    textMuted: v['--vm-text-muted'],
    borderSubtle: v['--vm-border-subtle'],
    borderMid: v['--vm-border-mid'],
    tooltipBg: v['--vm-bg-card'],
    primary: v['--vm-primary'],
    borderLine: computeBorderLine(),
    gridLine: computeGridLine(),
    chartBg: computeChartBg(),
  };
};
