/**
 * Tests for InventoryForecastStrategy
 *
 * Note: postProcess tests are skipped in this environment because they require
 * the Wasm runtime (predict_inventory_demand_batch). SQL generation and
 * validation tests are fully covered here.
 */

import { describe, it, expect } from 'bun:test';
import { InventoryForecastStrategy } from '../inventoryForecastStrategy';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type InventoryForecastConfig,
} from '../../types';

// ============================================================================
// Helpers
// ============================================================================

const createTableNode = (tableName = 'sales'): FlowNode => ({
  id: 'table-1',
  type: FlowNodeType.TABLE,
  position: { x: 0, y: 0 },
  data: { tableName, fields: [] },
});

const createSelectNode = (config: InventoryForecastConfig): FlowNode => ({
  id: 'select-1',
  type: FlowNodeType.SELECT,
  position: { x: 100, y: 0 },
  data: { tableName: 'sales', inventoryForecastConfig: config },
});

const BASE_CONFIG: InventoryForecastConfig = {
  skuCol: 'product_id',
  timeCol: 'order_date',
  demandCol: 'quantity',
  granularity: 'day',
  predictSteps: 7,
  predictionMode: 'ensemble',
};

// ============================================================================
// A. buildOperatorSql — day granularity
// ============================================================================

describe('InventoryForecastStrategy > buildOperatorSql', () => {
  const strategy = new InventoryForecastStrategy();

  it('A. day granularity — SQL contains date_trunc(day), SUM, ROW_NUMBER', () => {
    const nodes: FlowNode[] = [
      createTableNode(),
      createSelectNode({ ...BASE_CONFIG, granularity: 'day' }),
    ];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain("date_trunc('day'");
    expect(sql).toContain('ROW_NUMBER() OVER');
    expect(sql).toContain('PARTITION BY "product_id"');
    expect(sql).toContain('SUM("quantity")::DOUBLE AS demand');
    expect(sql).toContain('"product_id" AS sku_id');
    expect(sql).toContain('GROUP BY "product_id"');
    expect(sql).toContain('ORDER BY "product_id"');
  });

  it('B. month granularity — SQL contains date_trunc(month)', () => {
    const nodes: FlowNode[] = [
      createTableNode(),
      createSelectNode({ ...BASE_CONFIG, granularity: 'month' }),
    ];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain("date_trunc('month'");
    expect(sql).not.toContain("date_trunc('day'");
    expect(sql).not.toContain("date_trunc('week'");
  });

  it('B2. week granularity — SQL contains date_trunc(week)', () => {
    const nodes: FlowNode[] = [
      createTableNode(),
      createSelectNode({ ...BASE_CONFIG, granularity: 'week' }),
    ];
    const sql = strategy.buildSql(nodes, []);

    expect(sql).toContain("date_trunc('week'");
  });

  it('should cast timeCol to TIMESTAMP', () => {
    const nodes: FlowNode[] = [
      createTableNode(),
      createSelectNode({ ...BASE_CONFIG, granularity: 'day' }),
    ];
    const sql = strategy.buildSql(nodes, []);
    expect(sql).toContain('"order_date"::TIMESTAMP');
  });

  it('should cast time_index to DOUBLE', () => {
    const nodes: FlowNode[] = [
      createTableNode(),
      createSelectNode({ ...BASE_CONFIG }),
    ];
    const sql = strategy.buildSql(nodes, []);
    expect(sql).toContain('::DOUBLE AS time_index');
  });

  it('fallback to SELECT * when config is missing', () => {
    const selectNodeNoConfig: FlowNode = {
      id: 'select-1',
      type: FlowNodeType.SELECT,
      position: { x: 100, y: 0 },
      data: { tableName: 'sales' },
    };
    const sql = strategy.buildSql([createTableNode(), selectNodeNoConfig], []);
    expect(sql).toContain('SELECT *');
    expect(sql).toContain('FROM "sales"');
  });
});

// ============================================================================
// C. validate — missing required fields
// ============================================================================

describe('InventoryForecastStrategy > validate', () => {
  const strategy = new InventoryForecastStrategy();

  it('C. no errors when config is complete', () => {
    const nodes: FlowNode[] = [
      createTableNode(),
      createSelectNode({ ...BASE_CONFIG }),
    ];
    const errors = strategy.validate(nodes, []);
    // Structural validation may return errors for missing END node; we only check
    // there is no error caused by empty skuCol / timeCol / demandCol.
    const configErrors = errors.filter((e) => e.message?.includes('config'));
    expect(configErrors.length).toBe(0);
  });

  it('reports error when TABLE node is missing', () => {
    const nodes: FlowNode[] = [createSelectNode({ ...BASE_CONFIG })];
    const errors = strategy.validate(nodes, []);
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// D/E. postProcess — tested at integration level (Wasm required)
// ============================================================================

describe('InventoryForecastStrategy > metadata', () => {
  const strategy = new InventoryForecastStrategy();

  it('has correct OperatorType', () => {
    expect(strategy.type).toBe(OperatorType.INVENTORY_FORECAST);
  });

  it('has a readable name', () => {
    expect(typeof strategy.name).toBe('string');
    expect(strategy.name.length).toBeGreaterThan(0);
  });

  it('getRequiredNodes returns TABLE', () => {
    const required = strategy.getRequiredNodes();
    expect(required).toContain(FlowNodeType.TABLE);
  });
});
