import type { SkillDefinition } from './types';

const registry = new Map<string, SkillDefinition>();

export const registerSkill = (skill: SkillDefinition): void => {
  registry.set(skill.id, skill);
};

export const getSkill = (id: string): SkillDefinition | undefined => {
  return registry.get(id);
};

export const listSkills = (): SkillDefinition[] => {
  return Array.from(registry.values());
};
