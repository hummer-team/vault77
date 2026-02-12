/**
 * SQL Builder Unit Tests
 * Tests for SQL construction from flow configuration
 */

import { describe, it, expect } from 'vitest';
import { AssociationStrategy, AnomalyStrategy, ClusteringStrategy } from '../strategies';
import {
  FlowNodeType,
  JoinType,
  FieldType,
  type FlowNode,
  type FlowEdge,
  type TableNodeData,
  type JoinNodeData,
  type SelectNodeData,
  type SelectAggNodeData,
  type ConditionNodeData,
} from '../types';

describe('SQL Builder Tests', () => {
  describe('Simple SELECT Query', () => {
    it('should build simple SELECT * FROM table', () => {
      const strategy = new AssociationStrategy();
      
      const nodes: FlowNode[] = [
        {
          id: 'table-1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'users',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'name', type: FieldType.VARCHAR, nullable: false },
            ],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'select-1',
          type: FlowNodeType.SELECT,
          position: { x: 200, y: 0 },
          data: {
            type: FlowNodeType.SELECT,
            fields: [],
            selectAll: true,
          } as SelectNodeData,
        },
      ];

      const edges: FlowEdge[] = [];

      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('SELECT *');
      expect(sql).toContain('FROM users');
    });

    it('should build SELECT with specific fields', () => {
      const strategy = new AssociationStrategy();
      
      const nodes: FlowNode[] = [
        {
          id: 'table-1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'users',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'name', type: FieldType.VARCHAR, nullable: false },
              { name: 'email', type: FieldType.VARCHAR, nullable: true },
            ],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'select-1',
          type: FlowNodeType.SELECT,
          position: { x: 200, y: 0 },
          data: {
            type: FlowNodeType.SELECT,
            fields: [
              { tableName: 'users', fieldName: 'id', alias: undefined },
              { tableName: 'users', fieldName: 'name', alias: 'user_name' },
            ],
            selectAll: false,
          } as SelectNodeData,
        },
      ];

      const edges: FlowEdge[] = [];

      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('SELECT');
      expect(sql).toContain('users.id');
      expect(sql).toContain('users.name AS user_name');
      expect(sql).not.toContain('email');
    });
  });

  describe('JOIN Queries', () => {
    it('should build INNER JOIN query', () => {
      const strategy = new AssociationStrategy();
      
      const nodes: FlowNode[] = [
        {
          id: 'table-1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'users',
            fields: [{ name: 'id', type: FieldType.INTEGER, nullable: false }],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'table-2',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 100 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'orders',
            fields: [{ name: 'user_id', type: FieldType.INTEGER, nullable: false }],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'join-1',
          type: FlowNodeType.JOIN,
          position: { x: 100, y: 50 },
          data: {
            type: FlowNodeType.JOIN,
            joinType: JoinType.INNER,
            leftTable: 'users',
            rightTable: 'orders',
            conditions: [
              {
                leftTable: 'users',
                leftField: 'id',
                rightTable: 'orders',
                rightField: 'user_id',
              },
            ],
            order: 1,
          } as JoinNodeData,
        },
        {
          id: 'select-1',
          type: FlowNodeType.SELECT,
          position: { x: 200, y: 0 },
          data: {
            type: FlowNodeType.SELECT,
            fields: [],
            selectAll: true,
          } as SelectNodeData,
        },
      ];

      const edges: FlowEdge[] = [];

      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('FROM users');
      expect(sql).toContain('INNER JOIN orders');
      expect(sql).toContain('ON users.id = orders.user_id');
    });

    it('should build LEFT JOIN query', () => {
      const strategy = new AssociationStrategy();
      
      const nodes: FlowNode[] = [
        {
          id: 'table-1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'users',
            fields: [],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'table-2',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 100 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'orders',
            fields: [],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'join-1',
          type: FlowNodeType.JOIN,
          position: { x: 100, y: 50 },
          data: {
            type: FlowNodeType.JOIN,
            joinType: JoinType.LEFT,
            leftTable: 'users',
            rightTable: 'orders',
            conditions: [
              {
                leftTable: 'users',
                leftField: 'id',
                rightTable: 'orders',
                rightField: 'user_id',
              },
            ],
            order: 1,
          } as JoinNodeData,
        },
        {
          id: 'select-1',
          type: FlowNodeType.SELECT,
          position: { x: 200, y: 0 },
          data: {
            type: FlowNodeType.SELECT,
            fields: [],
            selectAll: true,
          } as SelectNodeData,
        },
      ];

      const edges: FlowEdge[] = [];

      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('LEFT JOIN orders');
    });
  });

  describe('WHERE Conditions', () => {
    it('should build query with single condition', () => {
      const strategy = new AssociationStrategy();
      
      const nodes: FlowNode[] = [
        {
          id: 'table-1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'users',
            fields: [],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'condition-1',
          type: FlowNodeType.CONDITION,
          position: { x: 100, y: 0 },
          data: {
            type: FlowNodeType.CONDITION,
            tableName: 'users',
            field: 'age',
            operator: '>',
            value: 18,
            logicType: 'AND',
          } as ConditionNodeData,
        },
        {
          id: 'select-1',
          type: FlowNodeType.SELECT,
          position: { x: 200, y: 0 },
          data: {
            type: FlowNodeType.SELECT,
            fields: [],
            selectAll: true,
          } as SelectNodeData,
        },
      ];

      const edges: FlowEdge[] = [];

      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('WHERE');
      expect(sql).toContain('users.age > \'18\'');
    });
  });

  describe('GROUP BY and Aggregation', () => {
    it('should build query with aggregation and GROUP BY', () => {
      const strategy = new ClusteringStrategy();
      
      const nodes: FlowNode[] = [
        {
          id: 'table-1',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            type: FlowNodeType.TABLE,
            tableName: 'orders',
            fields: [],
            expanded: true,
            alias: '',
          } as TableNodeData,
        },
        {
          id: 'select-agg-1',
          type: FlowNodeType.SELECT_AGG,
          position: { x: 200, y: 0 },
          data: {
            type: FlowNodeType.SELECT_AGG,
            fields: [
              { tableName: 'orders', fieldName: 'user_id', alias: undefined },
              { tableName: 'orders', fieldName: 'amount', aggregate: 'SUM', alias: 'total_amount' },
              { tableName: 'orders', fieldName: 'id', aggregate: 'COUNT', alias: 'order_count' },
            ],
            groupByFields: ['orders.user_id'],
          } as SelectAggNodeData,
        },
      ];

      const edges: FlowEdge[] = [];

      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('SELECT');
      expect(sql).toContain('orders.user_id');
      expect(sql).toContain('SUM(orders.amount) AS total_amount');
      expect(sql).toContain('COUNT(orders.id) AS order_count');
      expect(sql).toContain('GROUP BY orders.user_id');
    });
  });
});
