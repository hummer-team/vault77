import { getFeatureFlags } from '../../flags/featureFlags';
import type { SkillContext, SkillDefinition } from './types';
import { getSkill } from './registry';

/**
 * Skill router.
 *
 * B1 strategy: analysis.v1 is an orchestrator which can fall back to nl2sql.
 * Therefore, routing only decides whether to wrap with analysis.v1.
 */
export const resolveSkillId = (ctx: SkillContext): string => {
  const flags = getFeatureFlags();
  if (!flags.enableSkillRouter) return 'nl2sql.v1';

  if (flags.enableAnalysisSkillV1) {
    // Prefer analysis.v1 for common analytics expressions.
    if (/统计|趋势|分布|对比|top\s*\d|Top\s*\d|group by|median|stddev/i.test(ctx.userInput)) {
      return 'analysis.v1';
    }
  }
  return 'nl2sql.v1';
};

export const resolveSkill = (ctx: SkillContext): SkillDefinition | null => {
  const id = resolveSkillId(ctx);
  const skill = getSkill(id);
  return skill ?? null;
};
