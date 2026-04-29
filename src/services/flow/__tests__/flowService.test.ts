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
    it('should generate first refId as GC1 when no nodes exist', () => {
      const nodes: FlowNode[] = [];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('GC1');
    });

    it('should generate GC2 when GC1 exists', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'GC1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('GC2');
    });

    it('should generate GC3 when GC1 and GC2 exist', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'GC1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'GC2', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('GC3');
    });

    it('should fill gaps in sequence', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'GC1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
        {
          id: 'cg3',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'GC3', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const refId = generateConditionGroupRefId(nodes);
      expect(refId).toBe('GC2');
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
      expect(refId).toBe('GC1');
    });
  });

  describe('generatePlaceholderName', () => {
    it('should generate GC1_1 for first condition', () => {
      const placeholder = generatePlaceholderName('GC1', 0);
      expect(placeholder).toBe('GC1_1');
    });

    it('should generate GC1_2 for second condition', () => {
      const placeholder = generatePlaceholderName('GC1', 1);
      expect(placeholder).toBe('GC1_2');
    });

    it('should generate GC2_1 for different group', () => {
      const placeholder = generatePlaceholderName('GC2', 0);
      expect(placeholder).toBe('GC2_1');
    });

    it('should handle custom refId', () => {
      const placeholder = generatePlaceholderName('COND1', 0);
      expect(placeholder).toBe('COND1_1');
    });
  });

  describe('validateRefId', () => {
    it('should validate valid refId', () => {
      const result = validateRefId('GC1');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate 5 character refId', () => {
      const result = validateRefId('GC123');
      expect(result.valid).toBe(true);
    });

    it('should reject refId longer than 5 characters', () => {
      const result = validateRefId('GC1234');
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
          data: { refId: 'GC1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const isUnique = isRefIdUnique('GC2', nodes);
      expect(isUnique).toBe(true);
    });

    it('should return false for duplicate refId', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'GC1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const isUnique = isRefIdUnique('GC1', nodes);
      expect(isUnique).toBe(false);
    });

    it('should exclude specified node when checking', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: { refId: 'GC1', tableName: 't1', logicType: 'AND' as const, conditions: [] },
        },
      ];
      const isUnique = isRefIdUnique('GC1', nodes, 'cg1');
      expect(isUnique).toBe(true);
    });

    it('should ignore non-conditionDefinition nodes', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: { tableName: 't1', fields: [], expanded: false, alias: 'GC1' },
        },
      ];
      const isUnique = isRefIdUnique('GC1', nodes);
      expect(isUnique).toBe(true);
    });
  });
});
