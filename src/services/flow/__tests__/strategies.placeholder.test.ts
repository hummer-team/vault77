/**
 * Strategies Placeholder Tests
 * Tests for placeholder-aware SQL building in strategies
 */

import { describe, it, expect } from 'vitest';
import { AssociationStrategy } from '../strategies/associationStrategy';
import { FlowNodeType, LogicType, type FlowNode, type FlowEdge } from '../types';

describe('AssociationStrategy - Placeholder Support', () => {
  const strategy = new AssociationStrategy();

  describe('buildWhereClauseWithPlaceholders', () => {
    it('should build WHERE clause with filled placeholder values', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'GC1_1', valueType: 'number' },
              { id: 'c2', field: 'name', operator: '=', placeholder: 'GC1_2', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        GC1_1: 18,
        GC1_2: 'John',
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
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'GC1_1', valueType: 'number' },
              { id: 'c2', field: 'status', operator: '=', placeholder: 'GC1_2', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        GC1_1: 25,
        // GC1_2 is not filled
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
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'role', operator: 'IN', placeholder: 'GC1_1', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        GC1_1: ['admin', 'user', 'guest'],
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('"role" IN (\'admin\', \'user\', \'guest\')');
    });

    it('should escape single quotes in string values', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'name', operator: '=', placeholder: 'GC1_1', valueType: 'string' },
            ],
          },
        },
      ];

      const placeholderValues = {
        GC1_1: "O'Brien",
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain("'O''Brien'");
    });

    it('should handle multiple condition groups with AND logic', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'GC1_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC2',
            tableName: 'orders',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c2', field: 'amount', operator: '>', placeholder: 'GC2_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'rel1',
          type: FlowNodeType.CONDITION_GROUP_RELATION,
          position: { x: 0, y: 0 },
          data: {
            relationType: 'AND',
            logicType: LogicType.AND,
            conditionIds: ['cg1', 'cg2'],
          },
        },
      ];

      const placeholderValues = {
        GC1_1: 18,
        GC2_1: 100,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('WHERE');
      expect(sql).toMatch(/\(.*age.*\) AND \(.*amount.*\)/);
    });

    it('should parse custom expression with CG references', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'status', operator: '=', placeholder: 'GC1_1', valueType: 'string' },
            ],
          },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC2',
            tableName: 'orders',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c2', field: 'amount', operator: '>', placeholder: 'GC2_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'rel1',
          type: FlowNodeType.CONDITION_GROUP_RELATION,
          position: { x: 0, y: 0 },
          data: {
            relationType: 'CUSTOM',
            customExpression: 'GC1 AND GC2',
          },
        },
      ];

      const placeholderValues = {
        GC1_1: 'active',
        GC2_1: 500,
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
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'GC1_1', valueType: 'number' },
            ],
          },
        },
        {
          id: 'cg2',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC2',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c2', field: 'vip', operator: '=', placeholder: 'GC2_1', valueType: 'boolean' },
            ],
          },
        },
        {
          id: 'rel1',
          type: FlowNodeType.CONDITION_GROUP_RELATION,
          position: { x: 0, y: 0 },
          data: {
            relationType: 'CUSTOM',
            customExpression: 'GC1 并且 GC2',
          },
        },
      ];

      const placeholderValues = {
        GC1_1: 18,
        GC2_1: true,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('AND');
      expect(sql).not.toContain('并且');
    });

    it('should handle boolean values', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'active', operator: '=', placeholder: 'GC1_1', valueType: 'boolean' },
            ],
          },
        },
      ];

      const placeholderValues = {
        GC1_1: true,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      expect(sql).toContain('TRUE');
    });

    it('should skip conditions with null placeholder values', () => {
      // null values are treated as unfilled placeholders and skipped
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'deleted_at', operator: 'IS', placeholder: 'GC1_1', valueType: 'date' },
            ],
          },
        },
      ];

      const placeholderValues = {
        GC1_1: null,
      };

      const sql = strategy.buildSql(nodes, [], placeholderValues);
      // null values are skipped, so no WHERE clause
      expect(sql).not.toContain('WHERE');
    });

    it('should return empty WHERE when no placeholders are filled', () => {
      const nodes: FlowNode[] = [
        {
          id: 'cg1',
          type: FlowNodeType.CONDITION_GROUP_DEFINITION,
          position: { x: 0, y: 0 },
          data: {
            refId: 'GC1',
            tableName: 'users',
            logicType: LogicType.AND,
            conditions: [
              { id: 'c1', field: 'age', operator: '>', placeholder: 'GC1_1', valueType: 'number' },
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

describe('AssociationStrategy - LIKE / STARTS WITH / ENDS WITH / BETWEEN', () => {
  const strategy = new AssociationStrategy();

  const makeNode = (conditions: Array<Record<string, unknown>>): FlowNode => ({
    id: 'cg1',
    type: FlowNodeType.CONDITION_GROUP_DEFINITION,
    position: { x: 0, y: 0 },
    data: {
      refId: 'GC1',
      tableName: 'products',
      logicType: LogicType.AND,
      conditions,
    },
  });

  it('LIKE with likeMode=both wraps value with %value%', () => {
    const node = makeNode([{ id: 'c1', field: 'name', operator: 'LIKE', placeholder: 'GC1_1', valueType: 'VARCHAR', likeMode: 'both' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: 'apple' });
    expect(sql).toContain(`"products"."name" LIKE '%apple%'`);
  });

  it('LIKE with likeMode=left wraps value with %value', () => {
    const node = makeNode([{ id: 'c1', field: 'name', operator: 'LIKE', placeholder: 'GC1_1', valueType: 'VARCHAR', likeMode: 'left' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: 'apple' });
    expect(sql).toContain(`"products"."name" LIKE '%apple'`);
  });

  it('LIKE with likeMode=right wraps value with value%', () => {
    const node = makeNode([{ id: 'c1', field: 'name', operator: 'LIKE', placeholder: 'GC1_1', valueType: 'VARCHAR', likeMode: 'right' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: 'apple' });
    expect(sql).toContain(`"products"."name" LIKE 'apple%'`);
  });

  it('LIKE without likeMode defaults to both (%value%)', () => {
    const node = makeNode([{ id: 'c1', field: 'name', operator: 'LIKE', placeholder: 'GC1_1', valueType: 'VARCHAR' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: 'pear' });
    expect(sql).toContain(`"products"."name" LIKE '%pear%'`);
  });

  it('STARTS WITH converts to LIKE col LIKE val%', () => {
    const node = makeNode([{ id: 'c1', field: 'sku', operator: 'STARTS WITH', placeholder: 'GC1_1', valueType: 'VARCHAR' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: '006' });
    expect(sql).toContain(`"products"."sku" LIKE '006%'`);
    expect(sql).not.toContain('STARTS WITH');
  });

  it('ENDS WITH converts to LIKE %val', () => {
    const node = makeNode([{ id: 'c1', field: 'sku', operator: 'ENDS WITH', placeholder: 'GC1_1', valueType: 'VARCHAR' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: '_XL' });
    expect(sql).toContain(`"products"."sku" LIKE '%_XL'`);
    expect(sql).not.toContain('ENDS WITH');
  });

  it('BETWEEN emits col BETWEEN val1 AND val2', () => {
    const node = makeNode([{ id: 'c1', field: 'price', operator: 'BETWEEN', placeholder: 'GC1_1', valueType: 'DECIMAL' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: '10,100' });
    expect(sql).toContain(`"products"."price" BETWEEN 10 AND 100`);
  });

  it('NOT BETWEEN emits col NOT BETWEEN val1 AND val2', () => {
    const node = makeNode([{ id: 'c1', field: 'price', operator: 'NOT BETWEEN', placeholder: 'GC1_1', valueType: 'DECIMAL' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: '10,100' });
    expect(sql).toContain(`"products"."price" NOT BETWEEN 10 AND 100`);
  });

  it('BETWEEN with insufficient parts skips the condition', () => {
    const node = makeNode([{ id: 'c1', field: 'price', operator: 'BETWEEN', placeholder: 'GC1_1', valueType: 'DECIMAL' }]);
    const sql = strategy.buildSql([node], [], { GC1_1: '10' });
    expect(sql).not.toContain('BETWEEN');
  });
});
