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
    '--vm-flow-node-bg': '#FFFFFF',
    '--vm-flow-canvas-bg': '#F0F2F5',

    // Borders (light)
    '--vm-border-subtle': 'rgba(0, 0, 0, 0.06)',
    '--vm-border-mid': '#E5E7EB',

    // Surface overlays (for panels, dropdowns, etc.)
    '--vm-surface-light': 'rgba(0, 0, 0, 0.02)',
    '--vm-surface-lighter': 'rgba(0, 0, 0, 0.01)',
    '--vm-surface-hover': 'rgba(0, 0, 0, 0.03)',
    '--vm-surface-hover-light': 'rgba(0, 0, 0, 0.015)',
    '--vm-surface-inset': 'rgba(0, 0, 0, 0.015)',

    // Text (dark on light)
    '--vm-text-primary': 'rgba(15, 23, 42, 0.88)',
    '--vm-text-secondary': 'rgba(71, 85, 105, 0.75)',
    '--vm-text-muted': 'rgba(148, 163, 184, 0.9)',
    '--vm-text-error': '#ef4444',
    '--vm-text-danger': '#dc2626',

    // Semantic colors (Ant Design) - light theme versions
    '--vm-success-color': '#16a34a',
    '--vm-success-color-light': 'rgba(22, 163, 74, 0.2)',
    '--vm-success-color-lighter': 'rgba(22, 163, 74, 0.1)',
    '--vm-warning-color': '#d97706',
    '--vm-warning-color-light': 'rgba(217, 119, 6, 0.2)',
    '--vm-warning-color-lighter': 'rgba(217, 119, 6, 0.1)',
    '--vm-error-color': '#ef4444',
    '--vm-error-color-light': 'rgba(239, 68, 68, 0.2)',
    '--vm-error-color-lighter': 'rgba(239, 68, 68, 0.1)',
    
    // Flow semantic colors (Ant Design palette adapted for light theme)
    '--vm-flow-info': '#1890ff',
    '--vm-flow-info-light': 'rgba(24, 144, 255, 0.1)',
    '--vm-flow-success': '#16a34a',
    '--vm-flow-success-light': 'rgba(22, 163, 74, 0.1)',
    '--vm-flow-warning': '#d97706',
    '--vm-flow-warning-light': 'rgba(217, 119, 6, 0.1)',
    '--vm-flow-error': '#ef4444',
    '--vm-flow-error-light': 'rgba(239, 68, 68, 0.1)',
    '--vm-flow-processing': '#3b82f6',
    '--vm-flow-processing-light': 'rgba(59, 130, 246, 0.1)',
    '--vm-flow-processing-bg': 'rgba(59, 130, 246, 0.12)',
    '--vm-flow-processing-border': 'rgba(59, 130, 246, 0.4)',
    '--vm-flow-purple': '#7c3aed',
    '--vm-flow-purple-light': 'rgba(124, 58, 237, 0.1)',
    '--vm-flow-purple-bg': 'rgba(124, 58, 237, 0.12)',
    '--vm-flow-purple-border': 'rgba(124, 58, 237, 0.4)',
    '--vm-flow-pink': '#ec4899',
    '--vm-flow-pink-light': 'rgba(236, 72, 153, 0.1)',
    '--vm-flow-edge': 'rgba(155, 160, 163, 0.65)',
    '--vm-flow-edge-selected': '#d97706',
    '--vm-flow-shadow': '0 2px 8px rgba(0, 0, 0, 0.08)',
    '--vm-flow-shadow-lg': '0 4px 16px rgba(0, 0, 0, 0.1)',
    '--vm-flow-shadow-panel': '-4px 0 24px rgba(0, 0, 0, 0.08), -1px 0 0 rgba(255, 140, 0, 0.1)',
    '--vm-flow-shadow-node-unselected': '0 4px 15px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(255, 140, 0, 0.2)',
    '--vm-flow-shadow-control': '0 4px 20px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 140, 0, 0.1)',
    '--vm-flow-shadow-drawer': '-6px 0 32px rgba(0, 0, 0, 0.15), -1px 0 0 rgba(255, 140, 0, 0.07)',

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
