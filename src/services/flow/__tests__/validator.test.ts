/**
 * Validator Unit Tests
 * Tests for flow validation functionality
 */

import { describe, it, expect } from 'vitest';
import {
  validateFlow,
  validateNode,
  analyzeQueryPlan,
} from '../validator';
import {
  FlowNodeType,
  JoinType,
  FieldType,
  OperatorType,
  LogicType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
  type TableNodeData,
  type JoinNodeData,
  type ConditionNodeData,
  type SelectNodeData,
  type EndNodeData,
} from '../types';

describe('Validator Tests', () => {
  describe('validateFlow - Required Nodes', () => {
    it('should pass validation with all required nodes', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'amount', type: FieldType.DECIMAL, nullable: false },
            ],
            expanded: false,
            alias: 'o',
          },
        },
        {
          id: 'select1',
          type: FlowNodeType.SELECT,
          position: { x: 300, y: 0 },
          data: {
            fields: [
              { tableName: 'orders', fieldName: 'id' },
              { tableName: 'orders', fieldName: 'amount' },
            ],
            selectAll: false,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 600, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: true,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [];

      const errors = validateFlow(nodes, edges);
      const criticalErrors = errors.filter(
        (e) => e.severity === ValidationSeverity.ERROR
      );

      expect(criticalErrors.length).toBe(0);
    });

    it('should fail validation without table node', () => {
      const nodes: FlowNode[] = [
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 0, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: false,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [];

      const errors = validateFlow(nodes, edges);
      const noTableError = errors.find((e) => e.message.includes('至少添加一个表'));

      expect(noTableError).toBeDefined();
      expect(noTableError?.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should fail validation without end node', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 'o',
          },
        },
      ];

      const edges: FlowEdge[] = [];

      const errors = validateFlow(nodes, edges);
      const noEndNodeError = errors.find((e) =>
        e.message.includes('结束节点')
      );

      expect(noEndNodeError).toBeDefined();
    });
  });

  describe('validateFlow - Table Nodes', () => {
    it('should fail validation for table without name', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: '',
            fields: [],
            expanded: false,
            alias: '',
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 300, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: false,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const tableError = errors.find((e) => e.nodeId === 'table1');

      expect(tableError).toBeDefined();
      expect(tableError?.message).toContain('请选择数据源');
    });

    it('should fail validation for duplicate table aliases', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 'o',
          },
        },
        {
          id: 'table2',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 150 },
          data: {
            tableName: 'users',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 'o', // Duplicate alias
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 300, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: false,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const aliasError = errors.find((e) => e.message.includes('表别名'));

      expect(aliasError).toBeDefined();
    });
  });

  describe('validateFlow - Join Nodes', () => {
    it('should pass validation for valid join', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'user_id', type: FieldType.INTEGER, nullable: false },
            ],
            expanded: false,
            alias: 'o',
          },
        },
        {
          id: 'table2',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 150 },
          data: {
            tableName: 'users',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'name', type: FieldType.VARCHAR, nullable: false },
            ],
            expanded: false,
            alias: 'u',
          },
        },
        {
          id: 'join1',
          type: FlowNodeType.JOIN,
          position: { x: 150, y: 75 },
          data: {
            joinType: JoinType.INNER,
            leftTable: 'orders',
            rightTable: 'users',
            conditions: [
              {
                leftField: 'user_id',
                rightField: 'id',
                leftTable: 'orders',
                rightTable: 'users',
              },
            ],
            order: 1,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 600, y: 75 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: true,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const joinErrors = errors.filter(
        (e) => e.nodeId === 'join1' && e.severity === ValidationSeverity.ERROR
      );

      expect(joinErrors.length).toBe(0);
    });

    it('should fail validation for join with type mismatch', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'id', type: FieldType.VARCHAR, nullable: false }, // String
            ],
            expanded: false,
            alias: 'o',
          },
        },
        {
          id: 'table2',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 150 },
          data: {
            tableName: 'users',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false }, // Number
            ],
            expanded: false,
            alias: 'u',
          },
        },
        {
          id: 'join1',
          type: FlowNodeType.JOIN,
          position: { x: 150, y: 75 },
          data: {
            joinType: JoinType.INNER,
            leftTable: 'orders',
            rightTable: 'users',
            conditions: [
              {
                leftField: 'id',
                rightField: 'id',
                leftTable: 'orders',
                rightTable: 'users',
              },
            ],
            order: 1,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 600, y: 75 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: false,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const typeMismatchError = errors.find((e) =>
        e.message.includes('字段类型不匹配')
      );

      expect(typeMismatchError).toBeDefined();
    });

    it('should require join for multiple tables', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 'o',
          },
        },
        {
          id: 'table2',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 150 },
          data: {
            tableName: 'users',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 'u',
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 300, y: 75 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: false,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const noJoinError = errors.find((e) =>
        e.message.includes('需要配置JOIN关系')
      );

      expect(noJoinError).toBeDefined();
    });
  });

  describe('validateFlow - Condition Nodes', () => {
    it('should pass validation for valid condition', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'amount', type: FieldType.DECIMAL, nullable: false },
            ],
            expanded: false,
            alias: 'o',
          },
        },
        {
          id: 'condition1',
          type: FlowNodeType.CONDITION,
          position: { x: 300, y: 0 },
          data: {
            tableName: 'orders',
            field: 'amount',
            operator: '>',
            value: 100,
            logicType: LogicType.AND,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 600, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: true,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const conditionErrors = errors.filter(
        (e) =>
          e.nodeId === 'condition1' && e.severity === ValidationSeverity.ERROR
      );

      expect(conditionErrors.length).toBe(0);
    });

    it('should fail validation for condition with missing field', () => {
      const nodes: FlowNode[] = [
        {
          id: 'table1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 'o',
          },
        },
        {
          id: 'condition1',
          type: FlowNodeType.CONDITION,
          position: { x: 300, y: 0 },
          data: {
            tableName: 'orders',
            field: '', // Missing field
            operator: '>',
            value: 100,
            logicType: LogicType.AND,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 600, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: false,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const fieldError = errors.find(
        (e) => e.nodeId === 'condition1' && e.message.includes('请选择字段')
      );

      expect(fieldError).toBeDefined();
    });
  });

  describe('validateFlow - Circular Dependencies', () => {
    it('should detect circular dependencies', () => {
      const nodes: FlowNode[] = [
        {
          id: 'node1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'table1',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 't1',
          },
        },
        {
          id: 'node2',
          type: FlowNodeType.TABLE,
          position: { x: 150, y: 0 },
          data: {
            tableName: 'table2',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: false,
            alias: 't2',
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 300, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: false,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [
        { id: 'edge1', source: 'node1', target: 'node2' },
        { id: 'edge2', source: 'node2', target: 'node1' }, // Circular
      ];

      const errors = validateFlow(nodes, edges);
      const circularError = errors.find((e) =>
        e.message.includes('循环引用')
      );

      expect(circularError).toBeDefined();
    });
  });

  describe('validateNode - Real-time Validation', () => {
    it('should validate single table node', () => {
      const node: FlowNode = {
        id: 'table1',
        type: FlowNodeType.TABLE,
        position: { x: 0, y: 0 },
        data: {
          tableName: 'orders',
          fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
          expanded: false,
          alias: 'o',
        },
      };

      const errors = validateNode(node, [], []);

      expect(errors.length).toBe(0);
    });
  });

  describe('analyzeQueryPlan - Query Optimization', () => {
    it('should suggest adding WHERE clause', async () => {
      const sql = 'SELECT * FROM orders';
      const suggestions = await analyzeQueryPlan(sql);

      const whereSuggestion = suggestions.find((s) =>
        s.message.includes('WHERE 条件')
      );

      expect(whereSuggestion).toBeDefined();
    });

    it('should suggest avoiding SELECT *', async () => {
      const sql = 'SELECT * FROM orders WHERE amount > 100';
      const suggestions = await analyzeQueryPlan(sql);

      const selectAllSuggestion = suggestions.find((s) =>
        s.message.includes('SELECT *')
      );

      expect(selectAllSuggestion).toBeDefined();
    });

    it('should not suggest for optimized query', async () => {
      const sql = 'SELECT id, amount FROM orders WHERE amount > 100 LIMIT 100';
      const suggestions = await analyzeQueryPlan(sql);

      expect(suggestions.length).toBe(0);
    });
  });
});
