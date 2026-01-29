/**
 * @file index.ts
 * @description Entity type system exports.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 1 & Phase 3
 */

export {
  BusinessEntityType,
  type EntitySemanticFields,
  ENTITY_DEFAULT_SEMANTIC_FIELDS,
  getDefaultSemanticFields,
  isBusinessEntityType,
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_LABELS_ZH,
} from './entityTypes';

export {
  type EntitySkillDefinition,
  ENTITY_SKILLS,
  getEntitySkill,
  getAllEntitySkills,
  getEntitySkillIds,
  isEntitySkillId,
} from './registry';
