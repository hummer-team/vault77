export interface FeatureFlags {
  /** Enable the new skill router layer (M10). */
  enableSkillRouter: boolean;
  /** Enable analysis.v1 skill (B1: orchestrator on top of NL2SQL). */
  enableAnalysisSkillV1: boolean;
}

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  enableSkillRouter: true,
  enableAnalysisSkillV1: true,
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
