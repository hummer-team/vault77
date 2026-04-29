/**
 * Flow Service Tests
 * Tests for flow service helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  generateConditionGroupRefId,
  generatePlaceholderName,
  validateRefId,
  isRefIdUnique,
} from '../flowService';
import { FlowNodeType, type FlowNode } from '../types';

describe('Flow Service', () => {
  describe('generateConditionGroupRefId', () => {
    it('should generate first refId as CG1 when no nodes exist', () => {
      const nodes: FlowNode[] = [];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('CG1');
    });

    it('should generate CG2 when CG1 exists', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('CG2');
    });

    it('should generate CG3 when CG1 and CG2 exist', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG2', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('CG3');
    });

    it('should fill gaps in sequence', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
        {
          id: 'cg3',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG3', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('CG2');
    });

    it('should ignore non-conditionDefinition nodes', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: { tableName: 't1', fields: [], expanded: false, alias: 't1' },
        },
      ];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('CG1');
    });
  });

  describe('generatePlaceholderName', () => {
    it('should generate CG1_1 for first condition', () => {
      const placeholder = generatePlaceholderName('CG1', 0);
      expect(placeholder).toBe('CG1_1');
    });

    it('should generate CG1_2 for second condition', () => {
      const placeholder = generatePlaceholderName('CG1', 1);
      expect(placeholder).toBe('CG1_2');
    });

    it('should generate CG2_1 for different group', () => {
      const placeholder = generatePlaceholderName('CG2', 0);
      expect(placeholder).toBe('CG2_1');
    });

    it('should handle custom refId', () => {
      const placeholder = generatePlaceholderName('COND1', 0);
      expect(placeholder).toBe('COND1_1');
    });
  });

  describe('validateRefId', () => {
    it('should validate valid refId', () => {
      const result = validateRefId('CG1');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate 5 character refId', () => {
      const result = validateRefId('CG123');
      expect(result.valid).toBe(true);
    });

    it('should reject refId longer than 5 characters', () => {
      const result = validateRefId('CG1234');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('5');
    });

    it('should reject refId with special characters', () => {
      const result = validateRefId('CG-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('alphanumeric');
    });

    it('should reject refId with spaces', () => {
      const result = validateRefId('CG 1');
      expect(result.valid).toBe(false);
    });

    it('should accept lowercase letters', () => {
      const result = validateRefId('cg1');
      expect(result.valid).toBe(true);
    });
  });

  describe('isRefIdUnique', () => {
    it('should return true for unique refId', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const isUnique = isRefIdUnique('CG2', nodes);
      expect(isUnique).toBe(true);
    });

    it('should return false for duplicate refId', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const isUnique = isRefIdUnique('CG1', nodes);
      expect(isUnique).toBe(false);
    });

    it('should exclude specified node when checking', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'CG1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const isUnique = isRefIdUnique('CG1', nodes, 'cg1');
      expect(isUnique).toBe(true);
    });

    it('should ignore non-conditionDefinition nodes', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: { tableName: 't1', fields: [], expanded: false, alias: 'CG1' },
        },
      ];
      const isUnique = isRefIdUnique('CG1', nodes);
      expect(isUnique).toBe(true);
    });
  });
});
