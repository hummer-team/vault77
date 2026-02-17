/**
 * Strategies Placeholder Tests
 * Tests for placeholder-aware SQL building in strategies
 */

import { describe, it, expect } from 'vitest';
import { AssociationStrategy } from '../strategies';
import { FlowNodeType, LogicType, type FlowNode, type FlowEdge } from '../types';

describe('AssociationStrategy - Placeholder Support', () => {
  const strategy = new AssociationStrategy();

  describe('buildWhereClauseWithPlaceholders', () => {
    it('should build WHERE clause with filled placeholder values', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'CG1_1', valueType: 'number' },
              { id: 'c2', field: 'name', operator: '=', placeholder: 'CG1_2', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        CG1_1: 18,
        CG1_2: 'John',
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('WHERE');
      expect(sql).toContain('"age" > 18');
      expect(sql).toContain('"name" = \'John\'');
    });

    it('should skip conditions with unfilled placeholders', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'CG1_1', valueType: 'number' },
              { id: 'c2', field: 'status', operator: '=', placeholder: 'CG1_2', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        CG1_1: 25,
        // CG1_2 is not filled
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('WHERE');
      expect(sql).toContain('"age" > 25');
      expect(sql).not.toContain('status');
    });

    it('should handle IN operator with array values', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'role', operator: 'IN', placeholder: 'CG1_1', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        CG1_1: ['admin', 'user', 'guest'],
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('"role" IN (\'admin\', \'user\', \'guest\')');
    });

    it('should escape single quotes in string values', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'name', operator: '=', placeholder: 'CG1_1', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        CG1_1: "O'Brien",
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain("'O''Brien'");
    });

    it('should handle multiple condition groups with AND logic', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'CG1_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG2',
            tableName: 'orders',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c2', field: 'amount', operator: '>', placeholder: 'CG2_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'rel1',
          type: FlowNodeType.CONDITION_GROUP,
          position: { x: 0, y: 0 },
          data: {
            relationType: 'AND',
            logicType: LogicType.AND,
            conditionIds: ['cg1', 'cg2'],
          },
        },
      ];

      const placeholderValues = {
        CG1_1: 18,
        CG2_1: 100,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('WHERE');
      expect(sql).toMatch(/\(.*age.*\) AND \(.*amount.*\)/);
    });

    it('should parse custom expression with CG references', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'status', operator: '=', placeholder: 'CG1_1', valueType: 'string' },
            ],
          },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG2',
            tableName: 'orders',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c2', field: 'amount', operator: '>', placeholder: 'CG2_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'rel1',
          type: FlowNodeType.CONDITION_GROUP,
          position: { x: 0, y: 0 },
          data: {
            relationType: 'CUSTOM',
            customExpression: 'CG1 AND CG2',
          },
        },
      ];

      const placeholderValues = {
        CG1_1: 'active',
        CG2_1: 500,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('WHERE');
      expect(sql).toContain('"status" = \'active\'');
      expect(sql).toContain('"amount" > 500');
      expect(sql).toMatch(/AND/);
    });

    it('should handle Chinese operators in custom expression', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'CG1_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG2',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c2', field: 'vip', operator: '=', placeholder: 'CG2_1', valueType: 'boolean' },
            ],
          },
        },
        {
          id: 'rel1',
          type: FlowNodeType.CONDITION_GROUP,
          position: { x: 0, y: 0 },
          data: {
            relationType: 'CUSTOM',
            customExpression: 'CG1 并且 CG2',
          },
        },
      ];

      const placeholderValues = {
        CG1_1: 18,
        CG2_1: true,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('AND');
      expect(sql).not.toContain('并且');
    });

    it('should handle boolean values', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'active', operator: '=', placeholder: 'CG1_1', valueType: 'boolean' },
            ],
          },
        },
      ];

      const placeholderValues = {
        CG1_1: true,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('TRUE');
    });

    it('should skip conditions with null placeholder values', () => {
      // null values are treated as unfilled placeholders and skipped
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'deleted_at', operator: 'IS', placeholder: 'CG1_1', valueType: 'date' },
            ],
          },
        },
      ];

      const placeholderValues = {
        CG1_1: null,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      // null values are skipped, so no WHERE clause
      expect(sql).not.toContain('WHERE');
    });

    it('should return empty WHERE when no placeholders are filled', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'CG1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'CG1_1', valueType: 'number' },
            ],
          },
        },
      ];

      const placeholderValues = {};

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).not.toContain('WHERE');
    });

    it('should fallback to legacy WHERE clause when no placeholder values provided', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cond1',
          type: FlowNodeType.CONDITION,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'users',
            field: 'age',
            operator: '>',
            value: 18,
            logicType: LogicType.AND,
          },
        },
      ];

      const sql = strategy.buildSql(nodes, []);
      expect(sql).toContain('WHERE');
      expect(sql).toContain('"age" > \'18\'');
    });
  });
});
