export interface FeatureFlags {
  /** Enable the new skill router layer (M10). */
  enableSkillRouter: boolean;
  /** Enable analysis.v1 skill (B1: orchestrator on top of NL2SQL). */
  enableAnalysisSkillV1: boolean;
  
  // Industry-specific feature flags (M11.1)
  /** Enable ecommerce industry support */
  enableEcommerce: boolean;
  /** Enable finance industry support */
  enableFinance: boolean;
  /** Enable retail industry support */
  enableRetail: boolean;
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableSkillRouter: true,
  enableAnalysisSkillV1: true,
  
  // Industry flags: Only ecommerce enabled by default
  enableEcommerce: true,
  enableFinance: false,
  enableRetail: false,
};

/**
 * Returns feature flags.
 *
 * NOTE: This is intentionally lightweight (no storage binding yet) to follow the
 * minimal-intervention principle. Later we can wire it to settingsService.
 */
export const getFeatureFlags = (): FeatureFlags => {
  return DEFAULT_FEATURE_FLAGS;
};

/**
 * Industry flag mapping helper.
 * Maps industry ID to its corresponding feature flag.
 */
const INDUSTRY_FLAG_MAP: Record<string, keyof FeatureFlags> = {
  ecommerce: 'enableEcommerce',
  finance: 'enableFinance',
  retail: 'enableRetail',
};

/**
 * Check if an industry is enabled.
 * @param industry Industry identifier (e.g., 'ecommerce', 'finance', 'retail')
 * @returns True if industry is enabled
 */
export const isIndustryEnabled = (industry: string): boolean => {
  const flags = getFeatureFlags();
  const flagKey = INDUSTRY_FLAG_MAP[industry.toLowerCase()];
  
  if (!flagKey) {
    // Unknown industry - return false for safety
    return false;
  }
  
  return flags[flagKey] as boolean;
};

/**
 * Get list of enabled industries.
 * @returns Array of enabled industry IDs
 */
export const getEnabledIndustries = (): string[] => {
  const flags = getFeatureFlags();
  const enabled: string[] = [];
  
  for (const [industry, flagKey] of Object.entries(INDUSTRY_FLAG_MAP)) {
    if (flags[flagKey] as boolean) {
      enabled.push(industry);
    }
  }
  
  return enabled;
};
