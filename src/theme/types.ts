export interface ThemeCssVarMap {
  '--vm-primary': string;
  '--vm-primary-hover': string;
  '--vm-primary-glow': string;
  '--vm-primary-light': string;
  '--vm-primary-border': string;
  '--vm-primary-row-hover': string;
  '--vm-bg-base': string;
  '--vm-bg-header': string;
  '--vm-bg-section': string;
  '--vm-bg-row': string;
  '--vm-bg-dark': string;
  '--vm-bg-sidebar': string;
  '--vm-bg-card': string;
  '--vm-border-subtle': string;
  '--vm-border-mid': string;
  '--vm-surface-light': string;
  '--vm-surface-lighter': string;
  '--vm-surface-hover': string;
  '--vm-surface-hover-light': string;
  '--vm-surface-inset': string;
  '--vm-text-primary': string;
  '--vm-text-secondary': string;
  '--vm-text-muted': string;
  '--vm-text-error': string;
  '--vm-text-danger': string;
  '--vm-success-color': string;
  '--vm-success-color-light': string;
  '--vm-success-color-lighter': string;
  '--vm-warning-color': string;
  '--vm-warning-color-light': string;
  '--vm-warning-color-lighter': string;
  '--vm-error-color': string;
  '--vm-error-color-light': string;
  '--vm-error-color-lighter': string;
  '--vm-layout-bg': string;
  '--vm-grid-dot-color': string;
  '--vm-sider-bg': string;
  '--vm-flow-node-bg': string;
  '--vm-flow-canvas-bg': string;
  '--vm-table-header-color': string;
  '--vm-table-header-bg': string;
  '--vm-table-cell-color': string;
  '--vm-table-cell-border': string;
  '--vm-table-row-hover-bg': string;
  '--vm-table-row-even-bg': string;
  
  // Flow semantic colors
  '--vm-flow-info': string;
  '--vm-flow-info-light': string;
  '--vm-flow-success': string;
  '--vm-flow-success-light': string;
  '--vm-flow-warning': string;
  '--vm-flow-warning-light': string;
  '--vm-flow-error': string;
  '--vm-flow-error-light': string;
  '--vm-flow-processing': string;
  '--vm-flow-processing-light': string;
  '--vm-flow-processing-bg': string;
  '--vm-flow-processing-border': string;
  '--vm-flow-purple': string;
  '--vm-flow-purple-light': string;
  '--vm-flow-purple-bg': string;
  '--vm-flow-purple-border': string;
  '--vm-flow-pink': string;
  '--vm-flow-pink-light': string;
  '--vm-flow-edge': string;
  '--vm-flow-edge-selected': string;
  '--vm-flow-shadow': string;
  '--vm-flow-shadow-lg': string;
  '--vm-flow-shadow-panel': string;
  '--vm-flow-shadow-node-unselected': string;
  '--vm-flow-shadow-control': string;
  '--vm-flow-shadow-drawer': string;
}

export interface AntdTokenConfig {
  colorPrimary: string;
  colorInfo: string;
  colorLink: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  borderRadius: number;
  fontSize: number;
}

export interface ThemeDef {
  name: string;
  displayName: string;
  /** Optional display color for theme switcher circle. Defaults to --vm-primary if not set. */
  circleColor?: string;
  /** Ant Design dark | light algorithm */
  algorithm: 'dark' | 'light';
  cssVars: ThemeCssVarMap;
  antdTokens: AntdTokenConfig;
}
