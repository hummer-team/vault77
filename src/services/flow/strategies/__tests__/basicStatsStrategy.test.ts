import { describe, it, expect } from 'bun:test';
import { BasicStatsStrategy } from '../basicStatsStrategy';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type BasicStatsConfig,
} from '../../types';

describe('BasicStatsStrategy', () => {
  const strategy = new BasicStatsStrategy();

  const createTableNode = (fields: { name: string; type: string }[]): FlowNode => ({
    id: 'table-1',
    type: FlowNodeType.TABLE,
    position: { x: 0, y: 0 },
    data: {
      tableName: 'orders',
      fields,
    },
  });

  const createSelectNode = (config: BasicStatsConfig): FlowNode => ({
    id: 'select-1',
    type: FlowNodeType.SELECT,
    position: { x: 100, y: 0 },
    data: {
      tableName: 'orders',
      basicStatsConfig: config,
    },
  });

  it('should generate SQL with time granularity (date_trunc)', () => {
    const nodes: FlowNode[] = [
      createTableNode([
        { name: 'order_date', type: 'TIMESTAMP' },
        { name: 'amount', type: 'DECIMAL' },
      ]),
      createSelectNode({
        tableName: 'orders',
        aggFields: [
          { id: '1', column: 'amount', func: 'SUM', alias: 'total_amount', distinct: false },
        ],
        groupByColumns: ['order_date'],
        groupByGranularities: { order_date: 'month' },
        havingFilters: [],
        sortConfigs: [],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain("date_trunc('month', \"order_date\"::TIMESTAMP)");
    expect(sql).toContain("strftime(date_trunc('month', \"order_date\"::TIMESTAMP), '%Y-%m')");
    expect(sql).toContain('GROUP BY strftime');
    expect(sql).not.toContain('ROUND');
  });

  it('should apply ROUND for numeric aggregations with precision', () => {
    const nodes: FlowNode[] = [
      createTableNode([
        { name: 'category', type: 'VARCHAR' },
        { name: 'amount', type: 'DECIMAL' },
      ]),
      createSelectNode({
        tableName: 'orders',
        aggFields: [
          { id: '1', column: 'amount', func: 'SUM', alias: 'total_amount', distinct: false },
        ],
        groupByColumns: ['category'],
        columnPrecision: { amount: 2 },
        havingFilters: [],
        sortConfigs: [],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('ROUND(SUM("amount"), 2)');
    expect(sql).toContain('AS "total_amount"');
  });

  it('should mix time granularity and numeric precision', () => {
    const nodes: FlowNode[] = [
      createTableNode([
        { name: 'order_date', type: 'TIMESTAMP' },
        { name: 'category', type: 'VARCHAR' },
        { name: 'amount', type: 'DECIMAL' },
      ]),
      createSelectNode({
        tableName: 'orders',
        aggFields: [
          { id: '1', column: 'amount', func: 'SUM', alias: 'total_amount', distinct: false },
          { id: '2', column: 'amount', func: 'AVG', alias: 'avg_amount', distinct: false },
        ],
        groupByColumns: ['order_date', 'category'],
        groupByGranularities: { order_date: 'quarter' },
        columnPrecision: { amount: 2 },
        havingFilters: [],
        sortConfigs: [],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    // Check time granularity with quarter formatting (CONCAT + strftime)
    expect(sql).toContain("date_trunc('quarter', \"order_date\"::TIMESTAMP)");
    expect(sql).toContain('CONCAT(strftime(date_trunc');
    // Check precision for both aggregations
    expect(sql).toContain('ROUND(SUM("amount"), 2)');
    expect(sql).toContain('ROUND(AVG("amount"), 2)');
    // Check GROUP BY contains CONCAT (quarter special case)
    expect(sql).toContain('GROUP BY CONCAT');
    expect(sql).toContain('"category"');
  });

  it('should NOT apply ROUND to COUNT aggregation', () => {
    const nodes: FlowNode[] = [
      createTableNode([
        { name: 'category', type: 'VARCHAR' },
        { name: 'order_id', type: 'INTEGER' },
      ]),
      createSelectNode({
        tableName: 'orders',
        aggFields: [
          { id: '1', column: 'order_id', func: 'COUNT', alias: 'cnt', distinct: false },
        ],
        groupByColumns: ['category'],
        columnPrecision: { order_id: 2 },
        havingFilters: [],
        sortConfigs: [],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    // COUNT should not be wrapped in ROUND
    expect(sql).toContain('COUNT("order_id")');
    expect(sql).not.toContain('ROUND(COUNT');
  });

  it('should handle ORDER BY for groupBy columns with granularity', () => {
    const nodes: FlowNode[] = [
      createTableNode([
        { name: 'order_date', type: 'TIMESTAMP' },
        { name: 'amount', type: 'DECIMAL' },
      ]),
      createSelectNode({
        tableName: 'orders',
        aggFields: [
          { id: '1', column: 'amount', func: 'SUM', alias: 'total', distinct: false },
        ],
        groupByColumns: ['order_date'],
        groupByGranularities: { order_date: 'month' },
        havingFilters: [],
        sortConfigs: [
          { id: '1', column: 'order_date', direction: 'ASC' },
          { id: '2', column: 'total', direction: 'DESC' },
        ],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    // ORDER BY should use date_trunc for groupBy column
    const lines = sql.split('\n');
    const orderByLine = lines.find((l) => l.includes('ORDER BY'));
    expect(orderByLine).toContain("date_trunc('month'");
    expect(orderByLine).toContain('"total"');
  });

  it('should fallback to SELECT * when no aggregation fields', () => {
    const nodes: FlowNode[] = [
      createTableNode([{ name: 'id', type: 'INTEGER' }]),
      createSelectNode({
        tableName: 'orders',
        aggFields: [],
        groupByColumns: [],
        havingFilters: [],
        sortConfigs: [],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('SELECT *');
    expect(sql).toContain('FROM "orders"');
  });

  it('should handle multiple granularities for different columns', () => {
    const nodes: FlowNode[] = [
      createTableNode([
        { name: 'created_at', type: 'TIMESTAMP' },
        { name: 'updated_at', type: 'TIMESTAMP' },
        { name: 'value', type: 'DECIMAL' },
      ]),
      createSelectNode({
        tableName: 'records',
        aggFields: [{ id: '1', column: 'value', func: 'SUM', alias: 'total', distinct: false }],
        groupByColumns: ['created_at', 'updated_at'],
        groupByGranularities: { created_at: 'month', updated_at: 'day' },
        columnPrecision: { value: 3 },
        havingFilters: [],
        sortConfigs: [],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain("date_trunc('month', \"created_at\"::TIMESTAMP)");
    expect(sql).toContain("date_trunc('day', \"updated_at\"::TIMESTAMP)");
    expect(sql).toContain('ROUND(SUM("value"), 3)');
  });

  it('should apply TRUNCATE strategy instead of ROUND when specified', () => {
    const nodes: FlowNode[] = [
      createTableNode([
        { name: 'category', type: 'VARCHAR' },
        { name: 'amount', type: 'DECIMAL' },
      ]),
      createSelectNode({
        tableName: 'orders',
        aggFields: [
          { id: '1', column: 'amount', func: 'SUM', alias: 'total_amount', distinct: false },
        ],
        groupByColumns: ['category'],
        columnPrecision: { amount: 2 },
        columnPrecisionStrategy: { amount: 'TRUNCATE' },
        havingFilters: [],
        sortConfigs: [],
      }),
    ];

    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain('truncate_num(SUM("amount"), 2)');
    expect(sql).not.toContain('ROUND');
  });
});
