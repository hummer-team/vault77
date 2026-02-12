/**
 * Strategy Classes Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  BaseStrategy,
  AssociationStrategy,
  AnomalyStrategy,
  ClusteringStrategy,
} from '../strategies';
import {
  FlowNodeType,
  OperatorType,
  JoinType,
  LogicType,
  FieldType,
  type FlowNode,
  type FlowEdge,
  type StartNodeData,
  type TableNodeData,
  type JoinNodeData,
  type SelectNodeData,
  type EndNodeData,
} from '../types';

describe('Strategy Classes', () => {
  // Helper: Create test flow configuration
  const createTestFlow = () => {
    const startNode: FlowNode = {
      id: 'start-1',
      type: FlowNodeType.START,
      position: { x: 0, y: 0 },
      data: {
        type: FlowNodeType.START,
        selectedTable: 'main_table_users',
      } as StartNodeData,
    };

    const tableNode1: FlowNode = {
      id: 'table-1',
      type: FlowNodeType.TABLE,
      position: { x: 200, y: 0 },
      data: {
        type: FlowNodeType.TABLE,
        tableName: 'main_table_users',
        fields: [
          { name: 'id', type: FieldType.INTEGER, nullable: false },
          { name: 'name', type: FieldType.VARCHAR, nullable: false },
          { name: 'age', type: FieldType.INTEGER, nullable: true },
        ],
      } as TableNodeData,
    };

    const tableNode2: FlowNode = {
      id: 'table-2',
      type: FlowNodeType.TABLE,
      position: { x: 400, y: 0 },
      data: {
        type: FlowNodeType.TABLE,
        tableName: 'main_table_orders',
        fields: [
          { name: 'id', type: FieldType.INTEGER, nullable: false },
          { name: 'user_id', type: FieldType.INTEGER, nullable: false },
          { name: 'amount', type: FieldType.DOUBLE, nullable: false },
        ],
      } as TableNodeData,
    };

    const joinNode: FlowNode = {
      id: 'join-1',
      type: FlowNodeType.JOIN,
      position: { x: 300, y: 100 },
      data: {
        type: FlowNodeType.JOIN,
        joinType: JoinType.INNER,
        leftTable: 'main_table_users',
        rightTable: 'main_table_orders',
        conditions: [
          {
            leftTable: 'main_table_users',
            leftField: 'id',
            rightTable: 'main_table_orders',
            rightField: 'user_id',
          },
        ],
        order: 1,
      } as JoinNodeData,
    };

    const selectNode: FlowNode = {
      id: 'select-1',
      type: FlowNodeType.SELECT,
      position: { x: 600, y: 0 },
      data: {
        type: FlowNodeType.SELECT,
        fields: [
          { tableName: 'main_table_users', fieldName: 'name', alias: 'user_name' },
          { tableName: 'main_table_orders', fieldName: 'amount', alias: undefined },
        ],
        selectAll: false,
      } as SelectNodeData,
    };

    const endNode: FlowNode = {
      id: 'end-1',
      type: FlowNodeType.END,
      position: { x: 800, y: 0 },
      data: {
        type: FlowNodeType.END,
        operatorType: OperatorType.ASSOCIATION,
        errors: [],
      } as EndNodeData,
    };

    const edges: FlowEdge[] = [
      { id: 'e-start-table1', source: 'start-1', target: 'table-1', type: 'smoothstep' },
      { id: 'e-table1-join', source: 'table-1', target: 'join-1', type: 'smoothstep' },
      { id: 'e-table2-join', source: 'table-2', target: 'join-1', type: 'smoothstep' },
      { id: 'e-join-select', source: 'join-1', target: 'select-1', type: 'smoothstep' },
      { id: 'e-select-end', source: 'select-1', target: 'end-1', type: 'smoothstep' },
    ];

    return { nodes: [startNode, tableNode1, tableNode2, joinNode, selectNode, endNode], edges };
  };

  describe('AssociationStrategy', () => {
    it('should have ASSOCIATION as operator type', () => {
      const strategy = new AssociationStrategy();
      expect(strategy.type).toBe(OperatorType.ASSOCIATION);
    });

    it('should require TABLE nodes', () => {
      const strategy = new AssociationStrategy();
      const requiredNodes = strategy.getRequiredNodes();
      expect(requiredNodes).toContain(FlowNodeType.TABLE);
    });

    it('should validate flow configuration successfully', () => {
      const strategy = new AssociationStrategy();
      const { nodes, edges } = createTestFlow();
      const errors = strategy.validate(nodes, edges);
      // May have validation warnings about select fields
      expect(errors.filter(e => e.severity === 'error')).toHaveLength(0);
    });

    it('should build SQL query with JOIN', () => {
      const strategy = new AssociationStrategy();
      const { nodes, edges } = createTestFlow();
      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('SELECT');
      expect(sql).toContain('main_table_users.name AS user_name');
      expect(sql).toContain('main_table_orders.amount');
      expect(sql).toContain('FROM main_table_users');
      expect(sql).toContain('INNER JOIN main_table_orders');
      expect(sql).toContain('ON main_table_users.id = main_table_orders.user_id');
    });

    it('should post-process results correctly', async () => {
      const strategy = new AssociationStrategy();
      const mockResult = {
        rows: [
          { user_name: 'Alice', amount: 100 },
          { user_name: 'Bob', amount: 200 },
        ],
        columns: ['user_name', 'amount'],
        rowCount: 2,
      };

      const analysisResult = await strategy.postProcess(mockResult);
      expect(analysisResult.type).toBe(OperatorType.ASSOCIATION);
      expect(analysisResult.data).toEqual(mockResult);
    });
  });

  describe('AnomalyStrategy', () => {
    it('should have ANOMALY as operator type', () => {
      const strategy = new AnomalyStrategy();
      expect(strategy.type).toBe(OperatorType.ANOMALY);
    });

    it('should require TABLE and SELECT nodes', () => {
      const strategy = new AnomalyStrategy();
      const requiredNodes = strategy.getRequiredNodes();
      expect(requiredNodes).toContain(FlowNodeType.TABLE);
      expect(requiredNodes).toContain(FlowNodeType.SELECT);
    });

    it('should build SQL query with aggregation', () => {
      const strategy = new AnomalyStrategy();
      const { nodes, edges } = createTestFlow();

      // Replace SELECT with SELECT_AGG
      const selectAggNode: FlowNode = {
        id: 'select-agg-1',
        type: FlowNodeType.SELECT_AGG,
        position: { x: 600, y: 0 },
        data: {
          type: FlowNodeType.SELECT_AGG,
          fields: [
            { tableName: 'main_table_orders', fieldName: 'amount', aggregate: 'SUM', alias: 'total_amount' },
          ],
          groupByFields: ['main_table_users.name'],
        },
      };

      const modifiedNodes = nodes.map((n) =>
        n.id === 'select-1' ? selectAggNode : n
      );
      const modifiedEdges = edges.map((e) =>
        e.source === 'select-1' ? { ...e, source: 'select-agg-1' } : e.target === 'select-1' ? { ...e, target: 'select-agg-1' } : e
      );

      const sql = strategy.buildSql(modifiedNodes, modifiedEdges);

      expect(sql).toContain('SELECT');
      expect(sql).toContain('SUM(main_table_orders.amount) AS total_amount');
      // AnomalyStrategy doesn't include GROUP BY clause
    });

    it('should post-process results for anomaly detection', async () => {
      const strategy = new AnomalyStrategy();
      const mockResult = {
        rows: [
          { name: 'Alice', total_amount: 1000 },
          { name: 'Bob', total_amount: 2000 },
          { name: 'Charlie', total_amount: 100000 }, // Anomaly
        ],
        columns: ['name', 'total_amount'],
        rowCount: 3,
      };

      const analysisResult = await strategy.postProcess(mockResult);
      expect(analysisResult.type).toBe(OperatorType.ANOMALY);
      expect(analysisResult.data).toEqual(mockResult);
    });
  });

  describe('ClusteringStrategy', () => {
    it('should have CLUSTERING as operator type', () => {
      const strategy = new ClusteringStrategy();
      expect(strategy.type).toBe(OperatorType.CLUSTERING);
    });

    it('should require TABLE and SELECT nodes', () => {
      const strategy = new ClusteringStrategy();
      const requiredNodes = strategy.getRequiredNodes();
      expect(requiredNodes).toContain(FlowNodeType.TABLE);
      expect(requiredNodes).toContain(FlowNodeType.SELECT);
    });

    it('should build SQL query with aggregation and grouping', () => {
      const strategy = new ClusteringStrategy();
      const { nodes, edges } = createTestFlow();

      // Replace SELECT with SELECT_AGG
      const selectAggNode: FlowNode = {
        id: 'select-agg-1',
        type: FlowNodeType.SELECT_AGG,
        position: { x: 600, y: 0 },
        data: {
          type: FlowNodeType.SELECT_AGG,
          fields: [
            { tableName: 'main_table_orders', fieldName: 'amount', aggregate: 'AVG', alias: 'avg_amount' },
            { tableName: 'main_table_orders', fieldName: 'id', aggregate: 'COUNT', alias: 'order_count' },
          ],
          groupByFields: ['main_table_users.id'],
        },
      };

      const modifiedNodes = nodes.map((n) =>
        n.id === 'select-1' ? selectAggNode : n
      );
      const modifiedEdges = edges.map((e) =>
        e.source === 'select-1' ? { ...e, source: 'select-agg-1' } : e.target === 'select-1' ? { ...e, target: 'select-agg-1' } : e
      );

      const sql = strategy.buildSql(modifiedNodes, modifiedEdges);

      expect(sql).toContain('AVG(main_table_orders.amount) AS avg_amount');
      expect(sql).toContain('COUNT(main_table_orders.id) AS order_count');
      expect(sql).toContain('GROUP BY main_table_users.id');
    });

    it('should post-process results for clustering', async () => {
      const strategy = new ClusteringStrategy();
      const mockResult = {
        rows: [
          { id: 1, avg_amount: 100, order_count: 5 },
          { id: 2, avg_amount: 500, order_count: 10 },
          { id: 3, avg_amount: 50, order_count: 2 },
        ],
        columns: ['id', 'avg_amount', 'order_count'],
        rowCount: 3,
      };

      const analysisResult = await strategy.postProcess(mockResult);
      expect(analysisResult.type).toBe(OperatorType.CLUSTERING);
      expect(analysisResult.data).toEqual(mockResult);
    });
  });
});
