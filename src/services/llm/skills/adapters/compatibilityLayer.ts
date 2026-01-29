/**
 * @file compatibilityLayer.ts
 * @description Compatibility layer for converting between old FieldMapping and new EntitySemanticFields.
 * Ensures backward compatibility with existing UserSkillConfig while enabling new entity-based architecture.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 4
 */

import type { FieldMapping } from '../types';
import type { EntitySemanticFields } from '../entities/entityTypes';
import { BusinessEntityType } from '../entities/entityTypes';

/**
 * Convert old FieldMapping to new EntitySemanticFields.
 * 
 * @param fieldMapping Old field mapping from UserSkillConfig
 * @param entityType Target business entity type
 * @returns Converted entity semantic fields
 * 
 * @example
 * // ORDER entity
 * convertToEntitySemanticFields({ orderIdColumn: 'id', timeColumn: 'created_at' }, BusinessEntityType.ORDER)
 * // => { primaryKey: 'id', timeField: 'created_at', ... }
 * 
 * @example
 * // USER entity
 * convertToEntitySemanticFields({ userIdColumn: 'user_id', timeColumn: 'registered_at' }, BusinessEntityType.USER)
 * // => { primaryKey: 'user_id', timeField: 'registered_at', ... }
 */
export function convertToEntitySemanticFields(
  fieldMapping: FieldMapping,
  entityType: BusinessEntityType
): EntitySemanticFields {
  const customFields: Record<string, string> = {};

  // Extract primaryKey based on entity type
  let primaryKey: string | undefined;
  switch (entityType) {
    case BusinessEntityType.ORDER:
      primaryKey = fieldMapping.orderIdColumn;
      break;
    case BusinessEntityType.USER:
      primaryKey = fieldMapping.userIdColumn;
      break;
    case BusinessEntityType.PRODUCT:
      // Product doesn't have dedicated column in old FieldMapping
      // Will be in customFields if exists
      break;
    case BusinessEntityType.INVENTORY:
    case BusinessEntityType.FINANCE:
    case BusinessEntityType.LOGISTICS:
    case BusinessEntityType.GENERAL:
      // These entity types were not in old FieldMapping
      // Will use system defaults
      break;
  }

  // Map other semantic fields
  const timeField = fieldMapping.timeColumn;
  const amountField = fieldMapping.amountColumn;
  
  // Store userIdColumn in customFields if not used as primaryKey
  const userField = entityType !== BusinessEntityType.USER ? fieldMapping.userIdColumn : undefined;

  // Store orderIdColumn in customFields if not used as primaryKey
  if (entityType !== BusinessEntityType.ORDER && fieldMapping.orderIdColumn) {
    customFields.orderId = fieldMapping.orderIdColumn;
  }

  return {
    primaryKey,
    timeField,
    amountField,
    userField,
    customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
  } as EntitySemanticFields;
}

/**
 * Convert new EntitySemanticFields back to old FieldMapping.
 * Used for storage in UserSkillConfig to maintain backward compatibility.
 * 
 * @param semanticFields Entity semantic fields
 * @param entityType Source business entity type (to determine which field is which)
 * @returns Converted field mapping
 * 
 * @example
 * convertToFieldMapping({ primaryKey: 'id', timeField: 'created_at' }, BusinessEntityType.ORDER)
 * // => { orderIdColumn: 'id', timeColumn: 'created_at' }
 */
export function convertToFieldMapping(
  semanticFields: EntitySemanticFields,
  entityType: BusinessEntityType
): FieldMapping {
  const fieldMapping: FieldMapping = {};

  // Map primaryKey to appropriate column based on entity type
  if (semanticFields.primaryKey) {
    switch (entityType) {
      case BusinessEntityType.ORDER:
        fieldMapping.orderIdColumn = semanticFields.primaryKey;
        break;
      case BusinessEntityType.USER:
        fieldMapping.userIdColumn = semanticFields.primaryKey;
        break;
      default:
        // For other entity types, store in a way that can be retrieved
        // We'll use orderIdColumn as a generic primary key storage
        // This is a limitation of the old FieldMapping interface
        break;
    }
  }

  // Map other semantic fields
  if (semanticFields.timeField) {
    fieldMapping.timeColumn = semanticFields.timeField;
  }
  
  if (semanticFields.amountField) {
    fieldMapping.amountColumn = semanticFields.amountField;
  }
  
  if (semanticFields.userField) {
    fieldMapping.userIdColumn = semanticFields.userField;
  }

  // Retrieve orderId from customFields if present
  if (semanticFields.customFields?.orderId && entityType !== BusinessEntityType.ORDER) {
    fieldMapping.orderIdColumn = semanticFields.customFields.orderId;
  }

  return fieldMapping;
}

/**
 * Check if a FieldMapping is compatible with a given entity type.
 * Validates that required fields for the entity type are present.
 * 
 * @param fieldMapping Field mapping to check
 * @param entityType Target entity type
 * @returns True if compatible, false otherwise
 * 
 * @example
 * isCompatibleWithEntity({ orderIdColumn: 'id', timeColumn: 'created_at' }, BusinessEntityType.ORDER)
 * // => true (has orderIdColumn)
 * 
 * @example
 * isCompatibleWithEntity({ userIdColumn: 'user_id' }, BusinessEntityType.ORDER)
 * // => false (missing orderIdColumn)
 */
export function isCompatibleWithEntity(
  fieldMapping: FieldMapping,
  entityType: BusinessEntityType
): boolean {
  switch (entityType) {
    case BusinessEntityType.ORDER:
      // ORDER requires orderIdColumn
      return fieldMapping.orderIdColumn !== undefined;
    
    case BusinessEntityType.USER:
      // USER requires userIdColumn
      return fieldMapping.userIdColumn !== undefined;
    
    case BusinessEntityType.PRODUCT:
      // PRODUCT is flexible, any field mapping can be adapted
      return true;
    
    case BusinessEntityType.INVENTORY:
    case BusinessEntityType.FINANCE:
    case BusinessEntityType.LOGISTICS:
      // These entities are flexible, can work with any field mapping
      // They'll use system defaults if specific fields are missing
      return true;
    
    case BusinessEntityType.GENERAL:
      // GENERAL entity is always compatible
      return true;
    
    default:
      return false;
  }
}

/**
 * Merge user-defined semantic fields with system defaults.
 * Priority: user custom > provided fields > system defaults
 * 
 * @param userFields User-defined semantic fields (may be partial)
 * @param systemDefaults System default semantic fields for entity type
 * @returns Merged semantic fields with all required properties
 */
export function mergeSemanticFields(
  userFields: Partial<EntitySemanticFields>,
  systemDefaults: EntitySemanticFields
): EntitySemanticFields {
  // Merge customFields only if either has non-empty customFields
  const mergedCustomFields = {
    ...systemDefaults.customFields,
    ...userFields.customFields,
  };
  
  // Only include customFields if not empty
  const hasCustomFields = Object.keys(mergedCustomFields).length > 0;
  
  return {
    primaryKey: userFields.primaryKey ?? systemDefaults.primaryKey,
    timeField: userFields.timeField ?? systemDefaults.timeField,
    amountField: userFields.amountField ?? systemDefaults.amountField,
    userField: userFields.userField ?? systemDefaults.userField,
    ...(hasCustomFields ? { customFields: mergedCustomFields } : {}),
  };
}

/**
 * Extract entity type hint from FieldMapping.
 * Attempts to infer the most likely entity type based on which fields are present.
 * 
 * @param fieldMapping Field mapping to analyze
 * @returns Most likely entity type, or GENERAL if ambiguous
 * 
 * @example
 * inferEntityType({ orderIdColumn: 'order_id', timeColumn: 'order_date' })
 * // => BusinessEntityType.ORDER
 * 
 * @example
 * inferEntityType({ userIdColumn: 'user_id', timeColumn: 'registered_at' })
 * // => BusinessEntityType.USER
 */
export function inferEntityType(fieldMapping: FieldMapping): BusinessEntityType {
  // ORDER: has orderIdColumn and typically has amountColumn
  if (fieldMapping.orderIdColumn && fieldMapping.amountColumn) {
    return BusinessEntityType.ORDER;
  }
  
  // USER: has userIdColumn but no orderIdColumn
  if (fieldMapping.userIdColumn && !fieldMapping.orderIdColumn) {
    return BusinessEntityType.USER;
  }
  
  // ORDER (weak signal): has orderIdColumn but no amountColumn
  if (fieldMapping.orderIdColumn) {
    return BusinessEntityType.ORDER;
  }
  
  // USER (weak signal): only has userIdColumn
  if (fieldMapping.userIdColumn) {
    return BusinessEntityType.USER;
  }
  
  // Default: GENERAL entity for ambiguous cases
  return BusinessEntityType.GENERAL;
}
