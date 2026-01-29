/**
 * @file registry.test.ts
 * @description Unit tests for entity skill registry.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 3
 */

import { describe, it, expect } from 'bun:test';
import {
  BusinessEntityType,
  getEntitySkill,
  getAllEntitySkills,
  getEntitySkillIds,
  isEntitySkillId,
  ENTITY_SKILLS,
} from '../index';

describe('Entity Skill Registry', () => {
  describe('getEntitySkill()', () => {
    it('should return ORDER skill with correct ID', () => {
      const skill = getEntitySkill(BusinessEntityType.ORDER);
      expect(skill).toBeDefined();
      expect(skill.id).toBe('nl2sql.order.v1');
      expect(skill.entityType).toBe(BusinessEntityType.ORDER);
      expect(skill.description).toContain('Order');
    });

    it('should return USER skill with correct ID', () => {
      const skill = getEntitySkill(BusinessEntityType.USER);
      expect(skill).toBeDefined();
      expect(skill.id).toBe('nl2sql.user.v1');
      expect(skill.entityType).toBe(BusinessEntityType.USER);
      expect(skill.description).toContain('User');
    });

    it('should return PRODUCT skill with correct ID', () => {
      const skill = getEntitySkill(BusinessEntityType.PRODUCT);
      expect(skill).toBeDefined();
      expect(skill.id).toBe('nl2sql.product.v1');
      expect(skill.entityType).toBe(BusinessEntityType.PRODUCT);
      expect(skill.description).toContain('Product');
    });

    it('should return INVENTORY skill with correct ID', () => {
      const skill = getEntitySkill(BusinessEntityType.INVENTORY);
      expect(skill).toBeDefined();
      expect(skill.id).toBe('nl2sql.inventory.v1');
      expect(skill.entityType).toBe(BusinessEntityType.INVENTORY);
      expect(skill.description).toContain('Inventory');
    });

    it('should return FINANCE skill with correct ID', () => {
      const skill = getEntitySkill(BusinessEntityType.FINANCE);
      expect(skill).toBeDefined();
      expect(skill.id).toBe('nl2sql.finance.v1');
      expect(skill.entityType).toBe(BusinessEntityType.FINANCE);
      expect(skill.description).toContain('Finance');
    });

    it('should return LOGISTICS skill with correct ID', () => {
      const skill = getEntitySkill(BusinessEntityType.LOGISTICS);
      expect(skill).toBeDefined();
      expect(skill.id).toBe('nl2sql.logistics.v1');
      expect(skill.entityType).toBe(BusinessEntityType.LOGISTICS);
      expect(skill.description).toContain('Logistics');
    });

    it('should return GENERAL skill with correct ID', () => {
      const skill = getEntitySkill(BusinessEntityType.GENERAL);
      expect(skill).toBeDefined();
      expect(skill.id).toBe('nl2sql.general.v1');
      expect(skill.entityType).toBe(BusinessEntityType.GENERAL);
      expect(skill.description).toContain('General');
    });

    it('should return skill with run method', () => {
      const skill = getEntitySkill(BusinessEntityType.ORDER);
      expect(typeof skill.run).toBe('function');
    });

    it('should have description length > 10', () => {
      const skill = getEntitySkill(BusinessEntityType.ORDER);
      expect(skill.description.length).toBeGreaterThan(10);
    });

    it('should have English-only description', () => {
      const skill = getEntitySkill(BusinessEntityType.ORDER);
      // Check description only contains English characters, spaces, and basic punctuation
      expect(skill.description).toMatch(/^[A-Za-z0-9\s\-\/,.']+$/);
    });
  });

  describe('getAllEntitySkills()', () => {
    it('should return exactly 7 entity skills', () => {
      const allSkills = getAllEntitySkills();
      const skillCount = Object.keys(allSkills).length;
      expect(skillCount).toBe(7);
    });

    it('should have unique skill IDs', () => {
      const allSkills = getAllEntitySkills();
      const skillIds = Object.values(allSkills).map((skill) => skill.id);
      const uniqueIds = new Set(skillIds);
      expect(uniqueIds.size).toBe(skillIds.length);
    });

    it('should have entityType matching map key', () => {
      const allSkills = getAllEntitySkills();
      for (const [entityTypeKey, skill] of Object.entries(allSkills)) {
        // Cast key to BusinessEntityType for comparison
        expect(skill.entityType).toBe(entityTypeKey as BusinessEntityType);
      }
    });

    it('should have run method for all skills', () => {
      const allSkills = getAllEntitySkills();
      for (const skill of Object.values(allSkills)) {
        expect(typeof skill.run).toBe('function');
      }
    });
  });

  describe('getEntitySkillIds()', () => {
    it('should return 7 skill IDs', () => {
      const skillIds = getEntitySkillIds();
      expect(skillIds.length).toBe(7);
    });

    it('should return IDs in correct format', () => {
      const skillIds = getEntitySkillIds();
      const expectedIds = [
        'nl2sql.order.v1',
        'nl2sql.user.v1',
        'nl2sql.product.v1',
        'nl2sql.inventory.v1',
        'nl2sql.finance.v1',
        'nl2sql.logistics.v1',
        'nl2sql.general.v1',
      ];
      
      for (const expectedId of expectedIds) {
        expect(skillIds).toContain(expectedId);
      }
    });
  });

  describe('isEntitySkillId()', () => {
    it('should return true for valid entity skill IDs', () => {
      expect(isEntitySkillId('nl2sql.order.v1')).toBe(true);
      expect(isEntitySkillId('nl2sql.user.v1')).toBe(true);
      expect(isEntitySkillId('nl2sql.product.v1')).toBe(true);
      expect(isEntitySkillId('nl2sql.inventory.v1')).toBe(true);
      expect(isEntitySkillId('nl2sql.finance.v1')).toBe(true);
      expect(isEntitySkillId('nl2sql.logistics.v1')).toBe(true);
      expect(isEntitySkillId('nl2sql.general.v1')).toBe(true);
    });

    it('should return false for invalid skill IDs', () => {
      expect(isEntitySkillId('nl2sql.v1')).toBe(false);
      expect(isEntitySkillId('analysis.v1')).toBe(false);
      expect(isEntitySkillId('nl2sql.ORDER.v1')).toBe(false); // uppercase
      expect(isEntitySkillId('nl2sql.order.v2')).toBe(false); // wrong version
      expect(isEntitySkillId('nl2sql.order')).toBe(false); // missing version
      expect(isEntitySkillId('invalid')).toBe(false);
    });
  });

  describe('ENTITY_SKILLS constant', () => {
    it('should have all 7 entity types defined', () => {
      expect(ENTITY_SKILLS[BusinessEntityType.ORDER]).toBeDefined();
      expect(ENTITY_SKILLS[BusinessEntityType.USER]).toBeDefined();
      expect(ENTITY_SKILLS[BusinessEntityType.PRODUCT]).toBeDefined();
      expect(ENTITY_SKILLS[BusinessEntityType.INVENTORY]).toBeDefined();
      expect(ENTITY_SKILLS[BusinessEntityType.FINANCE]).toBeDefined();
      expect(ENTITY_SKILLS[BusinessEntityType.LOGISTICS]).toBeDefined();
      expect(ENTITY_SKILLS[BusinessEntityType.GENERAL]).toBeDefined();
    });

    it('should follow naming convention: nl2sql.<entity>.v1', () => {
      const expectedMapping: Record<BusinessEntityType, string> = {
        [BusinessEntityType.ORDER]: 'nl2sql.order.v1',
        [BusinessEntityType.USER]: 'nl2sql.user.v1',
        [BusinessEntityType.PRODUCT]: 'nl2sql.product.v1',
        [BusinessEntityType.INVENTORY]: 'nl2sql.inventory.v1',
        [BusinessEntityType.FINANCE]: 'nl2sql.finance.v1',
        [BusinessEntityType.LOGISTICS]: 'nl2sql.logistics.v1',
        [BusinessEntityType.GENERAL]: 'nl2sql.general.v1',
      };

      for (const [entityType, expectedId] of Object.entries(expectedMapping)) {
        const skill = ENTITY_SKILLS[entityType as BusinessEntityType];
        expect(skill.id).toBe(expectedId);
      }
    });

    it('should have valid EntitySkillDefinition interface', () => {
      for (const skill of Object.values(ENTITY_SKILLS)) {
        // Check required fields
        expect(skill.id).toBeDefined();
        expect(typeof skill.id).toBe('string');
        expect(skill.description).toBeDefined();
        expect(typeof skill.description).toBe('string');
        expect(skill.entityType).toBeDefined();
        expect(typeof skill.run).toBe('function');
      }
    });
  });

  describe('Compatibility with existing registry', () => {
    it('should not conflict with existing skill registry', async () => {
      // Import existing registry and ensure skills are registered
      const { getSkill } = await import('../../registry');
      const { ensureSkillsRegistered } = await import('../../index');
      
      // Initialize existing skills
      ensureSkillsRegistered();
      
      // Existing skills should still work
      const nl2sqlV1 = getSkill('nl2sql.v1');
      expect(nl2sqlV1).toBeDefined();
      
      const analysisV1 = getSkill('analysis.v1');
      expect(analysisV1).toBeDefined();
    });

    it('should coexist with old and new skills', async () => {
      const { getSkill } = await import('../../registry');
      const { ensureSkillsRegistered } = await import('../../index');
      
      // Initialize existing skills
      ensureSkillsRegistered();
      
      // Old skill
      const oldSkill = getSkill('nl2sql.v1');
      expect(oldSkill).toBeDefined();
      
      // New entity skill
      const newSkill = getEntitySkill(BusinessEntityType.ORDER);
      expect(newSkill).toBeDefined();
      
      // They should be different
      expect(oldSkill?.id).not.toBe(newSkill.id);
    });
  });
});
