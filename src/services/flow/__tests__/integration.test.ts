/**
 * Integration Tests
 * End-to-End tests for complete analysis flow execution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FlowNodeType,
  JoinType,
  FieldType,
  OperatorType,
  LogicType,
  ValidationSeverity,
  type FlowNode,
  type FlowEdge,
} from '../types';
import { validateFlow } from '../validator';
import {
  MemoryMonitor,
  QueryOptimizer,
  BatchProcessor,
  DataSampler,
  CacheManager,
  PerformanceProfiler,
} from '../performanceOptimizer';
import { AssociationStrategy, AnomalyStrategy, ClusteringStrategy } from '../strategies';

describe('Integration Tests - Complete Flow Execution', () => {
  describe('E2E - Association Query Flow', () => {
    it('should execute complete association query flow', () => {
      // Create a complete flow: Table1 JOIN Table2 → SELECT → END
      const nodes: FlowNode[] = [
        {
          id: 'orders',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'order_id', type: FieldType.INTEGER, nullable: false },
              { name: 'user_id', type: FieldType.INTEGER, nullable: false },
              { name: 'amount', type: FieldType.DECIMAL, nullable: false },
              { name: 'created_at', type: FieldType.TIMESTAMP, nullable: false },
            ],
            expanded: true,
            alias: 'o',
          },
        },
        {
          id: 'users',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 200 },
          data: {
            tableName: 'users',
            fields: [
              { name: 'user_id', type: FieldType.INTEGER, nullable: false },
              { name: 'name', type: FieldType.VARCHAR, nullable: false },
              { name: 'email', type: FieldType.VARCHAR, nullable: false },
            ],
            expanded: true,
            alias: 'u',
          },
        },
        {
          id: 'join1',
          type: FlowNodeType.JOIN,
          position: { x: 300, y: 100 },
          data: {
            joinType: JoinType.INNER,
            leftTable: 'orders',
            rightTable: 'users',
            conditions: [
              {
                leftField: 'user_id',
                rightField: 'user_id',
                leftTable: 'orders',
                rightTable: 'users',
              },
            ],
            order: 1,
          },
        },
        {
          id: 'select1',
          type: FlowNodeType.SELECT,
          position: { x: 600, y: 100 },
          data: {
            fields: [
              { tableName: 'orders', fieldName: 'order_id', alias: '订单ID' },
              { tableName: 'orders', fieldName: 'amount', alias: '金额' },
              { tableName: 'users', fieldName: 'name', alias: '用户名' },
              { tableName: 'users', fieldName: 'email', alias: '邮箱' },
            ],
            selectAll: false,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 900, y: 100 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: true,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [
        { id: 'e1', source: 'orders', target: 'join1' },
        { id: 'e2', source: 'users', target: 'join1' },
        { id: 'e3', source: 'join1', target: 'select1' },
        { id: 'e4', source: 'select1', target: 'end1' },
      ];

      // Validate the flow
      const errors = validateFlow(nodes, edges);
      const criticalErrors = errors.filter(
        (e) => e.severity === ValidationSeverity.ERROR
      );

      expect(criticalErrors.length).toBe(0);

      // Build SQL
      const strategy = new AssociationStrategy();
      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('SELECT');
      expect(sql).toContain('FROM orders');
      expect(sql).toContain('INNER JOIN users');
      expect(sql).toContain('orders.user_id = users.user_id');
    });

    it('should execute flow with conditions', () => {
      const nodes: FlowNode[] = [
        {
          id: 'orders',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'order_id', type: FieldType.INTEGER, nullable: false },
              { name: 'amount', type: FieldType.DECIMAL, nullable: false },
            ],
            expanded: true,
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
          id: 'select1',
          type: FlowNodeType.SELECT,
          position: { x: 600, y: 0 },
          data: {
            fields: [
              { tableName: 'orders', fieldName: 'order_id' },
              { tableName: 'orders', fieldName: 'amount' },
            ],
            selectAll: false,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 900, y: 0 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: true,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [
        { id: 'e1', source: 'orders', target: 'condition1' },
        { id: 'e2', source: 'condition1', target: 'select1' },
        { id: 'e3', source: 'select1', target: 'end1' },
      ];

      const errors = validateFlow(nodes, edges);
      const criticalErrors = errors.filter(
        (e) => e.severity === ValidationSeverity.ERROR
      );

      expect(criticalErrors.length).toBe(0);

      const strategy = new AssociationStrategy();
      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('WHERE');
      expect(sql).toContain('orders.amount >');
      expect(sql).toContain('100');
    });

    it('should execute flow with aggregation', () => {
      const nodes: FlowNode[] = [
        {
          id: 'orders',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'user_id', type: FieldType.INTEGER, nullable: false },
              { name: 'amount', type: FieldType.DECIMAL, nullable: false },
            ],
            expanded: true,
            alias: 'o',
          },
        },
        {
          id: 'selectAgg1',
          type: FlowNodeType.SELECT_AGG,
          position: { x: 300, y: 0 },
          data: {
            fields: [
              { tableName: 'orders', fieldName: 'user_id' },
              { tableName: 'orders', fieldName: 'amount', aggregate: 'SUM' },
            ],
            groupByFields: ['orders.user_id'],
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

      const edges: FlowEdge[] = [
        { id: 'e1', source: 'orders', target: 'selectAgg1' },
        { id: 'e2', source: 'selectAgg1', target: 'end1' },
      ];

      const errors = validateFlow(nodes, edges);
      const criticalErrors = errors.filter(
        (e) => e.severity === ValidationSeverity.ERROR
      );

      expect(criticalErrors.length).toBe(0);

      const strategy = new AssociationStrategy();
      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('SUM(orders.amount)');
      expect(sql).toContain('GROUP BY');
    });
  });

  describe('E2E - Anomaly Detection Flow', () => {
    it('should execute anomaly detection flow', async () => {
      const nodes: FlowNode[] = [
        {
          id: 'transactions',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'transactions',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'amount', type: FieldType.DECIMAL, nullable: false },
              { name: 'score', type: FieldType.DOUBLE, nullable: false },
            ],
            expanded: true,
            alias: 't',
          },
        },
        {
          id: 'select1',
          type: FlowNodeType.SELECT,
          position: { x: 300, y: 0 },
          data: {
            fields: [
              { tableName: 'transactions', fieldName: 'id' },
              { tableName: 'transactions', fieldName: 'amount' },
              { tableName: 'transactions', fieldName: 'score' },
            ],
            selectAll: false,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 600, y: 0 },
          data: {
            operatorType: OperatorType.ANOMALY,
            executable: true,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [
        { id: 'e1', source: 'transactions', target: 'select1' },
        { id: 'e2', source: 'select1', target: 'end1' },
      ];

      const errors = validateFlow(nodes, edges);
      const criticalErrors = errors.filter(
        (e) => e.severity === ValidationSeverity.ERROR
      );

      expect(criticalErrors.length).toBe(0);

      const strategy = new AnomalyStrategy();
      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toBeTruthy();

      // Test postProcess
      const mockData = [
        { id: 1, amount: 100, score: 0.5 },
        { id: 2, amount: 1000, score: 0.9 },
        { id: 3, amount: 50, score: 0.1 },
      ];

      const result = await strategy.postProcess(mockData);

      expect(result.type).toBe(OperatorType.ANOMALY);
      expect(result.insights).toBeDefined();
      expect(result.visualizations).toBeDefined();
    });
  });

  describe('E2E - Clustering Flow', () => {
    it('should execute clustering flow', async () => {
      const nodes: FlowNode[] = [
        {
          id: 'customers',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'customers',
            fields: [
              { name: 'id', type: FieldType.INTEGER, nullable: false },
              { name: 'recency', type: FieldType.INTEGER, nullable: false },
              { name: 'frequency', type: FieldType.INTEGER, nullable: false },
              { name: 'monetary', type: FieldType.DECIMAL, nullable: false },
            ],
            expanded: true,
            alias: 'c',
          },
        },
        {
          id: 'select1',
          type: FlowNodeType.SELECT,
          position: { x: 300, y: 0 },
          data: {
            fields: [
              { tableName: 'customers', fieldName: 'id' },
              { tableName: 'customers', fieldName: 'recency' },
              { tableName: 'customers', fieldName: 'frequency' },
              { tableName: 'customers', fieldName: 'monetary' },
            ],
            selectAll: false,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 600, y: 0 },
          data: {
            operatorType: OperatorType.CLUSTERING,
            executable: true,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [
        { id: 'e1', source: 'customers', target: 'select1' },
        { id: 'e2', source: 'select1', target: 'end1' },
      ];

      const errors = validateFlow(nodes, edges);
      const criticalErrors = errors.filter(
        (e) => e.severity === ValidationSeverity.ERROR
      );

      expect(criticalErrors.length).toBe(0);

      const strategy = new ClusteringStrategy();
      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toBeTruthy();

      // Test postProcess
      const mockData = [
        { id: 1, recency: 10, frequency: 5, monetary: 1000 },
        { id: 2, recency: 5, frequency: 10, monetary: 5000 },
        { id: 3, recency: 30, frequency: 1, monetary: 100 },
      ];

      const result = await strategy.postProcess(mockData);

      expect(result.type).toBe(OperatorType.CLUSTERING);
      expect(result.insights).toBeDefined();
      expect(result.visualizations).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty flow', () => {
      const errors = validateFlow([], []);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.message.includes('至少添加一个表'))).toBe(
        true
      );
    });

    it('should handle flow with only start node', () => {
      const nodes: FlowNode[] = [
        {
          id: 'start1',
          type: FlowNodeType.START,
          position: { x: 0, y: 0 },
          data: {},
        },
      ];

      const errors = validateFlow(nodes, []);

      expect(errors.some((e) => e.message.includes('至少添加一个表'))).toBe(
        true
      );
    });

    it('should handle incomplete join conditions', () => {
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
          id: 'join1',
          type: FlowNodeType.JOIN,
          position: { x: 150, y: 75 },
          data: {
            joinType: JoinType.INNER,
            leftTable: 'orders',
            rightTable: 'users',
            conditions: [], // Empty conditions
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
      const joinError = errors.find((e) =>
        e.message.includes('请配置JOIN条件')
      );

      expect(joinError).toBeDefined();
    });

    it('should handle invalid field references', () => {
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
            field: 'nonexistent_field', // Invalid field
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
      const fieldError = errors.find((e) => e.message.includes('字段'));

      expect(fieldError).toBeDefined();
    });

    it('should handle missing operator type in end node', () => {
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
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 300, y: 0 },
          data: {
            operatorType: undefined as any,
            executable: false,
            errors: [],
          },
        },
      ];

      const errors = validateFlow(nodes, []);
      const operatorError = errors.find((e) =>
        e.message.includes('请选择业务算子')
      );

      expect(operatorError).toBeDefined();
    });
  });

  describe('Performance Optimizer Integration', () => {
    it('should optimize query with missing WHERE clause', () => {
      const sql = 'SELECT * FROM orders';
      const result = QueryOptimizer.analyzeQuery(sql);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(
        result.suggestions.some((s) => s && s.includes('WHERE'))
      ).toBe(true);
    });

    it('should add safe LIMIT to query', () => {
      const sql = 'SELECT * FROM orders';
      const optimized = QueryOptimizer.addSafeLimit(sql, 1000);

      expect(optimized).toContain('LIMIT 1000');
    });

    it('should not add LIMIT to query with aggregation', () => {
      const sql = 'SELECT COUNT(*) FROM orders GROUP BY user_id';
      const optimized = QueryOptimizer.addSafeLimit(sql, 1000);

      expect(optimized).not.toContain('LIMIT');
    });

    it('should estimate query complexity', () => {
      const simpleSql = 'SELECT id FROM orders';
      const complexSql = `
        SELECT o.id, u.name, SUM(o.amount)
        FROM orders o
        JOIN users u ON o.user_id = u.id
        JOIN products p ON o.product_id = p.id
        WHERE o.created_at > '2024-01-01'
        GROUP BY o.id, u.name
        ORDER BY SUM(o.amount) DESC
      `;

      const simpleScore = QueryOptimizer.estimateComplexity(simpleSql);
      const complexScore = QueryOptimizer.estimateComplexity(complexSql);

      expect(complexScore).toBeGreaterThan(simpleScore);
      expect(simpleScore).toBeGreaterThanOrEqual(0);
      expect(complexScore).toBeLessThanOrEqual(100);
    });
  });

  describe('Memory Monitor Integration', () => {
    it('should track memory usage', () => {
      const monitor = MemoryMonitor.getInstance();
      const usage = monitor.getMemoryUsage();

      expect(typeof usage).toBe('number');
      expect(usage).toBeGreaterThanOrEqual(0);
    });

    it('should track memory warnings', () => {
      const monitor = MemoryMonitor.getInstance();
      monitor.clearWarnings();

      monitor.addWarning('Test warning');
      const warnings = monitor.getWarnings();

      expect(warnings.length).toBe(1);
      expect(warnings[0]).toBe('Test warning');

      monitor.clearWarnings();
    });
  });

  describe('Cache Manager Integration', () => {
    it('should cache and retrieve data', () => {
      const cache = CacheManager.getInstance();
      cache.clear();

      const testData = { result: 'test', value: 123 };
      const key = 'test_key';

      cache.set(key, testData);
      const retrieved = cache.get(key);

      expect(retrieved).toEqual(testData);

      cache.clear();
    });

    it('should return null for expired cache', () => {
      const cache = CacheManager.getInstance();
      cache.clear();

      const testData = { result: 'test' };
      const key = 'expired_key';

      cache.set(key, testData);

      // Mock time to be 6 minutes later
      const originalNow = Date.now;
      Date.now = vi.fn(() => originalNow() + 6 * 60 * 1000);

      const retrieved = cache.get(key);
      expect(retrieved).toBeNull();

      Date.now = originalNow;
      cache.clear();
    });

    it('should provide cache statistics', () => {
      const cache = CacheManager.getInstance();
      cache.clear();

      cache.set('key1', { data: 1 });
      cache.set('key2', { data: 2 });

      const stats = cache.getStats();

      expect(stats.entries).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.usage).toBeGreaterThan(0);

      cache.clear();
    });
  });

  describe('Batch Processor Integration', () => {
    it('should process data in batches', async () => {
      const items = Array.from({ length: 100 }, (_, i) => i);
      const batchSize = 10;
      const processor = async (batch: number[]) => batch.map((x) => x * 2);

      const results = await BatchProcessor.processBatch(
        items,
        batchSize,
        processor
      );

      expect(results.length).toBe(100);
      expect(results[0]).toBe(0);
      expect(results[99]).toBe(198);
    });

    it('should report progress during batch processing', async () => {
      const items = Array.from({ length: 50 }, (_, i) => i);
      const progressUpdates: number[] = [];

      await BatchProcessor.processBatch(
        items,
        10,
        async (batch) => batch,
        (progress) => progressUpdates.push(progress)
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    });
  });

  describe('Data Sampler Integration', () => {
    it('should sample data using reservoir sampling', () => {
      const data = Array.from({ length: 1000 }, (_, i) => i);
      const sample = DataSampler.reservoirSample(data, 100);

      expect(sample.length).toBe(100);
      // Check that sample is from the original data
      sample.forEach((item) => {
        expect(data).toContain(item);
      });
    });

    it('should return all data if sample size is larger', () => {
      const data = [1, 2, 3];
      const sample = DataSampler.reservoirSample(data, 10);

      expect(sample.length).toBe(3);
      expect(sample).toEqual(data);
    });

    it('should perform stratified sampling', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const sample = DataSampler.stratifiedSample(data, 20, 5);

      expect(sample.length).toBe(20);
    });
  });

  describe('Performance Profiler Integration', () => {
    it('should measure execution time', () => {
      PerformanceProfiler.start('test');

      // Simulate some work
      for (let i = 0; i < 1000000; i++) {
        Math.sqrt(i);
      }

      const duration = PerformanceProfiler.end('test');

      expect(duration).toBeGreaterThan(0);
    });

    it('should measure async function execution', async () => {
      const { result, duration } = await PerformanceProfiler.measure(
        'async_test',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return 'done';
        }
      );

      expect(result).toBe('done');
      expect(duration).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Complex Multi-Table Flow', () => {
    it('should handle 3-table JOIN flow', () => {
      const nodes: FlowNode[] = [
        {
          id: 'orders',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 0 },
          data: {
            tableName: 'orders',
            fields: [
              { name: 'order_id', type: FieldType.INTEGER, nullable: false },
              { name: 'user_id', type: FieldType.INTEGER, nullable: false },
              { name: 'product_id', type: FieldType.INTEGER, nullable: false },
            ],
            expanded: true,
            alias: 'o',
          },
        },
        {
          id: 'users',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 150 },
          data: {
            tableName: 'users',
            fields: [
              { name: 'user_id', type: FieldType.INTEGER, nullable: false },
              { name: 'name', type: FieldType.VARCHAR, nullable: false },
            ],
            expanded: true,
            alias: 'u',
          },
        },
        {
          id: 'products',
          type: FlowNodeType.TABLE,
          position: { x: 0, y: 300 },
          data: {
            tableName: 'products',
            fields: [
              { name: 'product_id', type: FieldType.INTEGER, nullable: false },
              { name: 'product_name', type: FieldType.VARCHAR, nullable: false },
            ],
            expanded: true,
            alias: 'p',
          },
        },
        {
          id: 'join1',
          type: FlowNodeType.JOIN,
          position: { x: 300, y: 75 },
          data: {
            joinType: JoinType.INNER,
            leftTable: 'orders',
            rightTable: 'users',
            conditions: [
              {
                leftField: 'user_id',
                rightField: 'user_id',
                leftTable: 'orders',
                rightTable: 'users',
              },
            ],
            order: 1,
          },
        },
        {
          id: 'join2',
          type: FlowNodeType.JOIN,
          position: { x: 300, y: 225 },
          data: {
            joinType: JoinType.LEFT,
            leftTable: 'orders',
            rightTable: 'products',
            conditions: [
              {
                leftField: 'product_id',
                rightField: 'product_id',
                leftTable: 'orders',
                rightTable: 'products',
              },
            ],
            order: 2,
          },
        },
        {
          id: 'select1',
          type: FlowNodeType.SELECT,
          position: { x: 600, y: 150 },
          data: {
            fields: [
              { tableName: 'orders', fieldName: 'order_id' },
              { tableName: 'users', fieldName: 'name' },
              { tableName: 'products', fieldName: 'product_name' },
            ],
            selectAll: false,
          },
        },
        {
          id: 'end1',
          type: FlowNodeType.END,
          position: { x: 900, y: 150 },
          data: {
            operatorType: OperatorType.ASSOCIATION,
            executable: true,
            errors: [],
          },
        },
      ];

      const edges: FlowEdge[] = [
        { id: 'e1', source: 'orders', target: 'join1' },
        { id: 'e2', source: 'users', target: 'join1' },
        { id: 'e3', source: 'orders', target: 'join2' },
        { id: 'e4', source: 'products', target: 'join2' },
        { id: 'e5', source: 'join1', target: 'select1' },
        { id: 'e6', source: 'join2', target: 'select1' },
        { id: 'e7', source: 'select1', target: 'end1' },
      ];

      const errors = validateFlow(nodes, edges);
      const criticalErrors = errors.filter(
        (e) => e.severity === ValidationSeverity.ERROR
      );

      expect(criticalErrors.length).toBe(0);

      const strategy = new AssociationStrategy();
      const sql = strategy.buildSql(nodes, edges);

      expect(sql).toContain('INNER JOIN users');
      expect(sql).toContain('LEFT JOIN products');
      expect(sql).toContain('orders.user_id = users.user_id');
      expect(sql).toContain('orders.product_id = products.product_id');
    });
  });
});
