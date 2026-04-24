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
  '--vm-text-primary': string;
  '--vm-text-secondary': string;
  '--vm-text-muted': string;
  '--vm-text-error': string;
  '--vm-text-danger': string;
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
  /** Ant Design dark | light algorithm */
  algorithm: 'dark' | 'light';
  cssVars: ThemeCssVarMap;
  antdTokens: AntdTokenConfig;
}
