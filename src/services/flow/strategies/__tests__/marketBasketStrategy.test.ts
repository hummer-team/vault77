/**
 * Tests for MarketBasketStrategy
 *
 * Note: buildOperatorSql and postProcess (Phase-1 pure SQL path) are fully tested here.
 * Wasm-based Phase-2 path is not covered as it requires the Wasm runtime.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { MarketBasketStrategy, DEFAULT_MARKET_BASKET_CONFIG } from '../marketBasketStrategy';
import {
  FlowNodeType,
  OperatorType,
  type FlowNode,
  type MarketBasketConfig,
} from '../../types';
import { StrategyFactory } from '../../strategyFactory';

// ============================================================================
// Helpers
// ============================================================================

const createTableNode = (tableName = 'orders'): FlowNode => ({
  id: 'table-1',
  type: FlowNodeType.TABLE,
  position: { x: 0, y: 0 },
  data: { tableName, fields: [] },
});

const createSelectNode = (config: MarketBasketConfig): FlowNode => ({
  id: 'select-1',
  type: FlowNodeType.SELECT,
  position: { x: 100, y: 0 },
  data: { tableName: 'orders', marketBasketConfig: config },
});

const BASE_CONFIG: MarketBasketConfig = {
  orderIdCol:       'order_id',
  productIdCol:     'product_id',
  minSupport:       0.01,
  minConfidence:    0.30,
  minLift:          1.2,
  maxItemsPerOrder: 50,
  topN:             100,
};

// ============================================================================
// buildOperatorSql tests
// ============================================================================

describe('MarketBasketStrategy › buildOperatorSql', () => {
  const strategy = new MarketBasketStrategy();

  it('generates item_freq CTE for pass-1 Apriori prune', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode(BASE_CONFIG)],
      []
    );
    expect(sql).toContain('item_freq');
    expect(sql).toContain('COUNT(DISTINCT "order_id")');
    expect(sql).toContain('HAVING order_count >= CAST(0.01 *');
  });

  it('generates order_size CTE to exclude B2B bulk orders', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode(BASE_CONFIG)],
      []
    );
    expect(sql).toContain('order_size');
    expect(sql).toContain('HAVING COUNT(*) <= 50');
  });

  it('generates self-join with canonical a < b direction', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode(BASE_CONFIG)],
      []
    );
    expect(sql).toContain('AND a.product_id < b.product_id');
  });

  it('computes support, confidence_ab, confidence_ba, lift in SELECT', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode(BASE_CONFIG)],
      []
    );
    expect(sql).toContain('AS support');
    expect(sql).toContain('AS confidence_ab');
    expect(sql).toContain('AS confidence_ba');
    expect(sql).toContain('AS lift');
  });

  it('applies minConfidence via GREATEST() in WHERE clause', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode(BASE_CONFIG)],
      []
    );
    expect(sql).toContain('GREATEST(');
    expect(sql).toContain('>= 0.3');
  });

  it('applies LIMIT from topN config', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, topN: 50 })],
      []
    );
    expect(sql).toContain('LIMIT 50');
  });

  it('uses the correct column names from config', () => {
    const sql = strategy.buildSql(
      [
        createTableNode('txns'),
        createSelectNode({ ...BASE_CONFIG, orderIdCol: 'txn_id', productIdCol: 'sku' }),
      ],
      []
    );
    expect(sql).toContain('"txn_id"');
    expect(sql).toContain('"sku"');
  });

  it('falls back to safe SQL when no table node exists', () => {
    const sql = strategy.buildSql(
      [createSelectNode(BASE_CONFIG)],
      []
    );
    expect(sql).toBe('SELECT 1 WHERE false');
  });

  it('orders result by lift DESC', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode(BASE_CONFIG)],
      []
    );
    expect(sql).toContain('ORDER BY lift DESC');
  });
});

// ============================================================================
// postProcess tests
// ============================================================================

describe('MarketBasketStrategy › postProcess', () => {
  const strategy = new MarketBasketStrategy();

  // Pre-warm _lastConfig
  beforeEach(() => {
    strategy.buildSql([createTableNode(), createSelectNode(BASE_CONFIG)], []);
  });

  it('returns warning InsightItem when rows are empty', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });
    expect(result.insightsData?.insights).toHaveLength(1);
    expect(result.insightsData?.insights[0].iconKey).toBe('warning');
    expect(result.data).toHaveLength(0);
  });

  it('returns up to 5 InsightItem cards for top pairs by lift', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      product_a:      `A${i}`,
      product_b:      `B${i}`,
      co_count:       100 - i * 5,
      support:        0.05 - i * 0.005,
      confidence_ab:  0.6 - i * 0.05,
      confidence_ba:  0.4 - i * 0.03,
      lift:           3.0 - i * 0.2,
    }));

    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.insightsData?.insights).toHaveLength(5);
    expect(result.data).toHaveLength(7);
  });

  it('assigns correct iconKey based on lift threshold', async () => {
    const rows = [
      { product_a: 'A', product_b: 'B', co_count: 200, support: 0.05, confidence_ab: 0.6, confidence_ba: 0.4, lift: 2.5 },
      { product_a: 'C', product_b: 'D', co_count: 150, support: 0.03, confidence_ab: 0.5, confidence_ba: 0.3, lift: 1.5 },
      { product_a: 'E', product_b: 'F', co_count: 50,  support: 0.01, confidence_ab: 0.3, confidence_ba: 0.2, lift: 1.0 },
    ];

    const result = await strategy.postProcess({ data: rows, schema: [] });
    const icons = result.insightsData?.insights.map((i) => i.iconKey) ?? [];
    expect(icons[0]).toBe('insight');  // lift > 2.0
    expect(icons[1]).toBe('order');    // 1.2 <= lift <= 2.0
    expect(icons[2]).toBe('warning');  // lift < 1.2
  });

  it('table rows contain all required columns', async () => {
    const rows = [{
      product_a: 'phone_case', product_b: 'screen_guard',
      co_count: 500, support: 0.05, confidence_ab: 0.65, confidence_ba: 0.42, lift: 3.1,
    }];
    const result = await strategy.postProcess({ data: rows, schema: [] });
    const row = result.data[0] as Record<string, unknown>;
    expect(row).toHaveProperty('product_a', 'phone_case');
    expect(row).toHaveProperty('product_b', 'screen_guard');
    expect(row).toHaveProperty('support', 0.05);
    expect(row).toHaveProperty('confidence_ab', 0.65);
    expect(row).toHaveProperty('confidence_ba', 0.42);
    expect(row).toHaveProperty('lift', 3.1);
    expect(row).toHaveProperty('co_count', 500);
  });

  it('sets defaultSort to lift descend in displayConfig', async () => {
    const rows = [{
      product_a: 'A', product_b: 'B', co_count: 100, support: 0.02,
      confidence_ab: 0.5, confidence_ba: 0.3, lift: 2.0,
    }];
    const result = await strategy.postProcess({ data: rows, schema: [] });
    expect(result.displayConfig?.defaultSort).toEqual({ column: 'lift', order: 'descend' });
  });

  it('returns type = MARKET_BASKET', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });
    expect(result.type).toBe(OperatorType.MARKET_BASKET);
  });
});

// ============================================================================
// StrategyFactory registration
// ============================================================================

describe('MarketBasketStrategy › StrategyFactory', () => {
  it('can retrieve MarketBasketStrategy from factory', () => {
    const strategy = StrategyFactory.getStrategy(OperatorType.MARKET_BASKET);
    expect(strategy).toBeInstanceOf(MarketBasketStrategy);
  });
});

// ============================================================================
// Validation tests
// ============================================================================

describe('MarketBasketStrategy › validate', () => {
  const strategy = new MarketBasketStrategy();

  it('returns no errors when config is valid', () => {
    const errors = strategy.validate(
      [createTableNode(), createSelectNode(BASE_CONFIG)],
      []
    );
    expect(errors).toHaveLength(0);
  });

  it('returns error when orderIdCol is missing', () => {
    const errors = strategy.validate(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, orderIdCol: '' })],
      []
    );
    expect(errors.some((e) => e.message.includes('orderIdCol'))).toBe(true);
  });

  it('returns error when productIdCol is missing', () => {
    const errors = strategy.validate(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, productIdCol: '' })],
      []
    );
    expect(errors.some((e) => e.message.includes('productIdCol'))).toBe(true);
  });

  it('returns error when orderIdCol and productIdCol are the same', () => {
    const errors = strategy.validate(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, orderIdCol: 'id', productIdCol: 'id' })],
      []
    );
    expect(errors.some((e) => e.message.includes('differ'))).toBe(true);
  });
});

// ============================================================================
// DEFAULT_MARKET_BASKET_CONFIG sanity
// ============================================================================

describe('DEFAULT_MARKET_BASKET_CONFIG', () => {
  it('has expected default values', () => {
    expect(DEFAULT_MARKET_BASKET_CONFIG.minSupport).toBe(0.01);
    expect(DEFAULT_MARKET_BASKET_CONFIG.minConfidence).toBe(0.30);
    expect(DEFAULT_MARKET_BASKET_CONFIG.minLift).toBe(1.2);
    expect(DEFAULT_MARKET_BASKET_CONFIG.maxItemsPerOrder).toBe(50);
    expect(DEFAULT_MARKET_BASKET_CONFIG.topN).toBe(500);
    expect(DEFAULT_MARKET_BASKET_CONFIG.enableTriples).toBe(false);
  });
});

// ============================================================================
// Phase-2: enableTriples SQL path
// ============================================================================

describe('MarketBasketStrategy › buildOperatorSql (Phase-2 clean txn)', () => {
  const strategy = new MarketBasketStrategy();

  it('outputs clean (order_id, product_id) SELECT when enableTriples = true', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, enableTriples: true })],
      []
    );
    expect(sql).toContain('SELECT f.order_id, f.product_id');
    expect(sql).not.toContain('self-join');
    expect(sql).not.toContain('confidence_ab');
    expect(sql).not.toContain('AS lift');
  });

  it('still includes Apriori prune (item_freq) for Phase-2', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, enableTriples: true })],
      []
    );
    expect(sql).toContain('item_freq');
    expect(sql).toContain('HAVING order_count >= CAST(0.01 *');
  });

  it('still includes B2B bulk order filter for Phase-2', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, enableTriples: true })],
      []
    );
    expect(sql).toContain('order_size');
    expect(sql).toContain('HAVING COUNT(*) <= 50');
  });

  it('does NOT include LIMIT in Phase-2 SQL (Wasm processes all)', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, enableTriples: true })],
      []
    );
    expect(sql).not.toContain('LIMIT');
  });

  it('Phase-1 SQL still contains self-join when enableTriples = false', () => {
    const sql = strategy.buildSql(
      [createTableNode(), createSelectNode({ ...BASE_CONFIG, enableTriples: false })],
      []
    );
    expect(sql).toContain('AND a.product_id < b.product_id');
    expect(sql).toContain('AS confidence_ab');
  });
});

