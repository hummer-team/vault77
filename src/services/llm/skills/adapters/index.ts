/**
 * @file index.ts
 * @description Unified exports for adapters module (compatibility layer + industry adapters)
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 4
 */

// Compatibility Layer
export {
  convertToEntitySemanticFields,
  convertToFieldMapping,
  isCompatibleWithEntity,
  mergeSemanticFields,
  inferEntityType,
} from './compatibilityLayer';

// Industry Adapters
export {
  type IndustryAdapter,
  createIndustryAdapter,
  getAllIndustries,
  getIndustryName,
  isSupportedIndustry,
} from './industryAdapters';
