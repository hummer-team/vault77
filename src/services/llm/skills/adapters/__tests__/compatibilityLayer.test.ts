/**
 * @file compatibilityLayer.test.ts
 * @description Unit tests for compatibility layer between FieldMapping and EntitySemanticFields
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 4
 */

import { describe, it, expect } from 'bun:test';
import {
  convertToEntitySemanticFields,
  convertToFieldMapping,
  isCompatibleWithEntity,
  mergeSemanticFields,
  inferEntityType,
} from '../compatibilityLayer';
import { BusinessEntityType } from '../../entities/entityTypes';
import type { FieldMapping } from '../../types';
import type { EntitySemanticFields } from '../../entities/entityTypes';

describe('Compatibility Layer', () => {
  describe('convertToEntitySemanticFields()', () => {
    it('should convert ORDER FieldMapping to EntitySemanticFields', () => {
      const fieldMapping: FieldMapping = {
        orderIdColumn: 'order_id',
        timeColumn: 'order_date',
        amountColumn: 'amount',
        userIdColumn: 'user_id',
      };

      const result = convertToEntitySemanticFields(fieldMapping, BusinessEntityType.ORDER);

      expect(result.primaryKey).toBe('order_id');
      expect(result.timeField).toBe('order_date');
      expect(result.amountField).toBe('amount');
      expect(result.userField).toBe('user_id');
    });

    it('should convert USER FieldMapping to EntitySemanticFields', () => {
      const fieldMapping: FieldMapping = {
        userIdColumn: 'user_id',
        timeColumn: 'registration_date',
      };

      const result = convertToEntitySemanticFields(fieldMapping, BusinessEntityType.USER);

      expect(result.primaryKey).toBe('user_id');
      expect(result.timeField).toBe('registration_date');
      expect(result.userField).toBeUndefined(); // userIdColumn is primaryKey for USER entity
    });

    it('should handle empty FieldMapping', () => {
      const fieldMapping: FieldMapping = {};

      const result = convertToEntitySemanticFields(fieldMapping, BusinessEntityType.GENERAL);

      expect(result.primaryKey).toBeUndefined();
      expect(result.timeField).toBeUndefined();
      expect(result.amountField).toBeUndefined();
    });

    it('should store orderIdColumn in customFields for non-ORDER entities', () => {
      const fieldMapping: FieldMapping = {
        orderIdColumn: 'order_id',
        userIdColumn: 'user_id',
      };

      const result = convertToEntitySemanticFields(fieldMapping, BusinessEntityType.USER);

      expect(result.primaryKey).toBe('user_id');
      expect(result.customFields?.orderId).toBe('order_id');
    });
  });

  describe('convertToFieldMapping()', () => {
    it('should convert ORDER EntitySemanticFields to FieldMapping', () => {
      const semanticFields: EntitySemanticFields = {
        primaryKey: 'order_id',
        timeField: 'order_date',
        amountField: 'amount',
        userField: 'user_id',
      };

      const result = convertToFieldMapping(semanticFields, BusinessEntityType.ORDER);

      expect(result.orderIdColumn).toBe('order_id');
      expect(result.timeColumn).toBe('order_date');
      expect(result.amountColumn).toBe('amount');
      expect(result.userIdColumn).toBe('user_id');
    });

    it('should convert USER EntitySemanticFields to FieldMapping', () => {
      const semanticFields: EntitySemanticFields = {
        primaryKey: 'user_id',
        timeField: 'registration_date',
      };

      const result = convertToFieldMapping(semanticFields, BusinessEntityType.USER);

      expect(result.userIdColumn).toBe('user_id');
      expect(result.timeColumn).toBe('registration_date');
      expect(result.orderIdColumn).toBeUndefined();
    });

    it('should handle customFields with orderId', () => {
      const semanticFields: EntitySemanticFields = {
        primaryKey: 'user_id',
        customFields: {
          orderId: 'order_id',
        },
      };

      const result = convertToFieldMapping(semanticFields, BusinessEntityType.USER);

      expect(result.userIdColumn).toBe('user_id');
      expect(result.orderIdColumn).toBe('order_id');
    });

    it('should handle empty EntitySemanticFields', () => {
      const semanticFields: Partial<EntitySemanticFields> = {};

      const result = convertToFieldMapping(semanticFields as EntitySemanticFields, BusinessEntityType.GENERAL);

      expect(result).toEqual({});
    });
  });

  describe('Round-trip conversion', () => {
    it('should preserve ORDER fields through round-trip conversion', () => {
      const original: FieldMapping = {
        orderIdColumn: 'order_id',
        timeColumn: 'order_date',
        amountColumn: 'amount',
        userIdColumn: 'user_id',
      };

      const semanticFields = convertToEntitySemanticFields(original, BusinessEntityType.ORDER);
      const result = convertToFieldMapping(semanticFields, BusinessEntityType.ORDER);

      expect(result).toEqual(original);
    });

    it('should preserve USER fields through round-trip conversion', () => {
      const original: FieldMapping = {
        userIdColumn: 'user_id',
        timeColumn: 'registration_date',
      };

      const semanticFields = convertToEntitySemanticFields(original, BusinessEntityType.USER);
      const result = convertToFieldMapping(semanticFields, BusinessEntityType.USER);

      expect(result).toEqual(original);
    });
  });

  describe('isCompatibleWithEntity()', () => {
    it('should return true for ORDER entity with orderIdColumn', () => {
      const fieldMapping: FieldMapping = {
        orderIdColumn: 'order_id',
        timeColumn: 'order_date',
      };

      const result = isCompatibleWithEntity(fieldMapping, BusinessEntityType.ORDER);

      expect(result).toBe(true);
    });

    it('should return false for ORDER entity without orderIdColumn', () => {
      const fieldMapping: FieldMapping = {
        userIdColumn: 'user_id',
        timeColumn: 'order_date',
      };

      const result = isCompatibleWithEntity(fieldMapping, BusinessEntityType.ORDER);

      expect(result).toBe(false);
    });

    it('should return true for USER entity with userIdColumn', () => {
      const fieldMapping: FieldMapping = {
        userIdColumn: 'user_id',
      };

      const result = isCompatibleWithEntity(fieldMapping, BusinessEntityType.USER);

      expect(result).toBe(true);
    });

    it('should return false for USER entity without userIdColumn', () => {
      const fieldMapping: FieldMapping = {
        orderIdColumn: 'order_id',
      };

      const result = isCompatibleWithEntity(fieldMapping, BusinessEntityType.USER);

      expect(result).toBe(false);
    });

    it('should return true for GENERAL entity with any FieldMapping', () => {
      const fieldMapping: FieldMapping = {};

      const result = isCompatibleWithEntity(fieldMapping, BusinessEntityType.GENERAL);

      expect(result).toBe(true);
    });

    it('should return true for PRODUCT entity with any FieldMapping', () => {
      const fieldMapping: FieldMapping = {
        timeColumn: 'created_at',
      };

      const result = isCompatibleWithEntity(fieldMapping, BusinessEntityType.PRODUCT);

      expect(result).toBe(true);
    });
  });

  describe('mergeSemanticFields()', () => {
    it('should prioritize user fields over system defaults', () => {
      const userFields: Partial<EntitySemanticFields> = {
        primaryKey: 'user_custom_id',
      };

      const systemDefaults: EntitySemanticFields = {
        primaryKey: 'system_id',
        timeField: 'created_at',
      };

      const result = mergeSemanticFields(userFields, systemDefaults);

      expect(result.primaryKey).toBe('user_custom_id');
      expect(result.timeField).toBe('created_at'); // From system defaults
    });

    it('should merge customFields from both sources', () => {
      const userFields: Partial<EntitySemanticFields> = {
        customFields: {
          userCustomField: 'value1',
        },
      };

      const systemDefaults: EntitySemanticFields = {
        primaryKey: 'id',
        customFields: {
          systemField: 'value2',
        },
      };

      const result = mergeSemanticFields(userFields, systemDefaults);

      expect(result.customFields?.userCustomField).toBe('value1');
      expect(result.customFields?.systemField).toBe('value2');
    });

    it('should use all system defaults when user fields are empty', () => {
      const userFields: Partial<EntitySemanticFields> = {};

      const systemDefaults: EntitySemanticFields = {
        primaryKey: 'id',
        timeField: 'created_at',
        amountField: 'amount',
      };

      const result = mergeSemanticFields(userFields, systemDefaults);

      expect(result).toEqual(systemDefaults);
    });
  });

  describe('inferEntityType()', () => {
    it('should infer ORDER entity from orderIdColumn and amountColumn', () => {
      const fieldMapping: FieldMapping = {
        orderIdColumn: 'order_id',
        amountColumn: 'amount',
      };

      const result = inferEntityType(fieldMapping);

      expect(result).toBe(BusinessEntityType.ORDER);
    });

    it('should infer USER entity from userIdColumn without orderIdColumn', () => {
      const fieldMapping: FieldMapping = {
        userIdColumn: 'user_id',
        timeColumn: 'registration_date',
      };

      const result = inferEntityType(fieldMapping);

      expect(result).toBe(BusinessEntityType.USER);
    });

    it('should infer ORDER entity from orderIdColumn alone', () => {
      const fieldMapping: FieldMapping = {
        orderIdColumn: 'order_id',
      };

      const result = inferEntityType(fieldMapping);

      expect(result).toBe(BusinessEntityType.ORDER);
    });

    it('should infer GENERAL entity from empty FieldMapping', () => {
      const fieldMapping: FieldMapping = {};

      const result = inferEntityType(fieldMapping);

      expect(result).toBe(BusinessEntityType.GENERAL);
    });

    it('should infer GENERAL entity when only timeColumn is present', () => {
      const fieldMapping: FieldMapping = {
        timeColumn: 'created_at',
      };

      const result = inferEntityType(fieldMapping);

      expect(result).toBe(BusinessEntityType.GENERAL);
    });
  });
});
