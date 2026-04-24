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
}

/**
 * Returns resolved ECharts-compatible color values that update on theme change.
 * Reads from `currentTheme.cssVars` directly (no DOM access needed).
 */
export const useEChartsColors = (): EChartsColors => {
  const { currentTheme } = useTheme();
  const v = currentTheme.cssVars;
  return {
    textPrimary: v['--vm-text-primary'],
    textSecondary: v['--vm-text-secondary'],
    textMuted: v['--vm-text-muted'],
    borderSubtle: v['--vm-border-subtle'],
    borderMid: v['--vm-border-mid'],
    tooltipBg: v['--vm-bg-card'],
    primary: v['--vm-primary'],
  };
};
