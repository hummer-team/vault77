import type { ThemeDef } from '../types';

export const lightOrangeTheme: ThemeDef = {
  name: 'light-orange',
  displayName: 'V2 Light',
  circleColor: '#F9FAFB',
  algorithm: 'light',
  cssVars: {
    // Primary (Safety Orange)
    '--vm-primary': '#FF8C00',
    '--vm-primary-hover': '#E67E00',
    '--vm-primary-glow': 'rgba(255, 140, 0, 0.2)',
    '--vm-primary-light': 'rgba(255, 140, 0, 0.1)',
    '--vm-primary-border': 'rgba(255, 140, 0, 0.4)',
    '--vm-primary-row-hover': 'rgba(255, 140, 0, 0.06)',

    // Backgrounds (light)
    '--vm-bg-base': '#FFFFFF',
    '--vm-bg-header': '#F9FAFB',
    '--vm-bg-section': 'rgba(0, 0, 0, 0.02)',
    '--vm-bg-row': 'rgba(0, 0, 0, 0.01)',
    '--vm-bg-dark': '#F9FAFB',
    '--vm-bg-sidebar': '#E5E7EB',
    '--vm-bg-card': '#FFFFFF',
    '--vm-sider-bg': '#1E293B',     // deep blue sidebar (stays dark)

    // Borders (light)
    '--vm-border-subtle': 'rgba(0, 0, 0, 0.06)',
    '--vm-border-mid': '#E5E7EB',

    // Text (dark on light)
    '--vm-text-primary': 'rgba(15, 23, 42, 0.88)',
    '--vm-text-secondary': 'rgba(71, 85, 105, 0.75)',
    '--vm-text-muted': 'rgba(148, 163, 184, 0.9)',
    '--vm-text-error': '#ef4444',
    '--vm-text-danger': '#dc2626',

    // Layout
    '--vm-layout-bg': '#F9FAFB',
    '--vm-grid-dot-color': 'rgba(255, 140, 0, 0.04)',

    // Tables (light mode)
    '--vm-table-header-color': '#7C3D0A',
    '--vm-table-header-bg': 'rgba(255, 140, 0, 0.06)',
    '--vm-table-cell-color': 'rgba(15, 23, 42, 0.85)',
    '--vm-table-cell-border': 'rgba(0, 0, 0, 0.06)',
    '--vm-table-row-hover-bg': 'rgba(255, 140, 0, 0.04)',
    '--vm-table-row-even-bg': 'rgba(0, 0, 0, 0.015)',
  },
  antdTokens: {
    colorPrimary: '#FF8C00',
    colorInfo: '#FF8C00',
    colorLink: '#FF8C00',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#ef4444',
    borderRadius: 12,
    fontSize: 14,
  },
};
