import { registerSkill } from './registry';
import type { SkillDefinition } from './types';
import { analysisV1Skill } from './builtin/analysis.v1';
import { nl2sqlV1Skill } from './builtin/nl2sql.v1';

let initialized = false;

export const ensureSkillsRegistered = (): void => {
  if (initialized) return;
  const skills: SkillDefinition[] = [nl2sqlV1Skill, analysisV1Skill];
  for (const s of skills) registerSkill(s);
  initialized = true;
};
