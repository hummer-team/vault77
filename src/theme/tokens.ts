/**
 * Central design token map.
 * Theme-sensitive values reference CSS variables so they auto-update on theme switch.
 * Non-theme values (accent colors, radii) are literals.
 */
export const TOKEN = {
  // Backgrounds
  bgBase: 'var(--vm-bg-base)',
  bgHeader: 'var(--vm-bg-header)',
  bgSection: 'var(--vm-bg-section)',
  bgRow: 'var(--vm-bg-row)',
  bgCard: 'var(--vm-bg-card)',
  flowNodeBg: 'var(--vm-flow-node-bg)',
  flowCanvasBg: 'var(--vm-flow-canvas-bg)',
  bgRowHover: 'var(--vm-primary-row-hover)',
  bgRowComplete: 'rgba(114, 46, 209, 0.04)',  // purple accent — not theme-sensitive

  // Borders
  borderSubtle: 'var(--vm-border-subtle)',
  borderMid: 'var(--vm-border-mid)',
  borderPrimary: 'var(--vm-primary-border)',
  borderPurple: 'rgba(114, 46, 209, 0.4)',    // purple accent — not theme-sensitive

  // Primary (theme-sensitive)
  primary: 'var(--vm-primary)',
  primaryHover: 'var(--vm-primary-hover)',
  primaryGlow: 'var(--vm-primary-glow)',
  primaryLight: 'var(--vm-primary-light)',

  // Purple accent (static — not theme-sensitive)
  purple: '#722ed1',
  purpleLight: '#b37feb',
  purpleBg: 'rgba(114, 46, 209, 0.12)',

  // Flow semantic colors (theme-sensitive)
  flowInfo: 'var(--vm-flow-info)',
  flowInfoLight: 'var(--vm-flow-info-light)',
  flowSuccess: 'var(--vm-flow-success)',
  flowSuccessLight: 'var(--vm-flow-success-light)',
  flowWarning: 'var(--vm-flow-warning)',
  flowWarningLight: 'var(--vm-flow-warning-light)',
  flowError: 'var(--vm-flow-error)',
  flowErrorLight: 'var(--vm-flow-error-light)',
  flowProcessing: 'var(--vm-flow-processing)',
  flowProcessingLight: 'var(--vm-flow-processing-light)',
  flowProcessingBg: 'var(--vm-flow-processing-bg)',
  flowProcessingBorder: 'var(--vm-flow-processing-border)',
  flowPurple: 'var(--vm-flow-purple)',
  flowPurpleLight: 'var(--vm-flow-purple-light)',
  flowPurpleBg: 'var(--vm-flow-purple-bg)',
  flowPurpleBorder: 'var(--vm-flow-purple-border)',
  flowPink: 'var(--vm-flow-pink)',
  flowPinkLight: 'var(--vm-flow-pink-light)',
  flowEdge: 'var(--vm-flow-edge)',
  flowEdgeSelected: 'var(--vm-flow-edge-selected)',
  flowShadow: 'var(--vm-flow-shadow)',
  flowShadowLg: 'var(--vm-flow-shadow-lg)',
  flowShadowPanel: 'var(--vm-flow-shadow-panel)',
  flowShadowNodeUnselected: 'var(--vm-flow-shadow-node-unselected)',
  flowShadowControl: 'var(--vm-flow-shadow-control)',
  flowShadowDrawer: 'var(--vm-flow-shadow-drawer)',

  // Text
  textPrimary: 'var(--vm-text-primary)',
  textSecondary: 'var(--vm-text-secondary)',
  textMuted: 'var(--vm-text-muted)',
  textError: 'var(--vm-text-error)',
  textDanger: 'var(--vm-text-danger)',

  // Border radius (static)
  radius: '6px',
  radiusLg: '8px',
} as const;
