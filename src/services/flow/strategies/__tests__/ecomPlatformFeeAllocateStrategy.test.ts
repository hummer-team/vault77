/**
 * Unit tests for EcomPlatformFeeAllocateStrategy
 * (feature: fn_ecom_platform_fee_allocate — platform fee/service fee auto allocation)
 */

import { describe, it, expect } from 'vitest';
import { EcomPlatformFeeAllocateStrategy, FIELD_MATCH_PATTERNS } from '../ecomPlatformFeeAllocateStrategy';
import { OperatorType, FlowNodeType } from '../../types';
import type { FlowNode, FlowEdge } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (overrides: Partial<Record<string, string>> = {}) => ({
  fieldMapping: {
    orderIdCol: 'order_id',
    skuIdCol: 'sku_id',
    orderNetAmountCol: 'order_amount',
    skuNetAmountCol: 'sku_amount',
    platformFeeCol: 'platform_fee',
    serviceFeeCol: 'service_fee',
    ...overrides,
  },
  allocationMode: 'amount_ratio' as const,
  warningThresholdPct: 15,
});

const makeNodes = (config?: unknown, tableName = 'orders'): FlowNode[] => [
  {
    id: 'table-1',
    type: FlowNodeType.TABLE,
    position: { x: 0, y: 0 },
    data: { tableName },
  } as FlowNode,
  {
    id: 'select-1',
    type: FlowNodeType.SELECT,
    position: { x: 100, y: 0 },
    data: config ? { feeAllocateConfig: config } : {},
  } as FlowNode,
];

const noEdges: FlowEdge[] = [];

describe('EcomPlatformFeeAllocateStrategy', () => {
  const strategy = new EcomPlatformFeeAllocateStrategy();

  describe('basic properties', () => {
    it('has correct operator type and display name', () => {
      expect(strategy.type).toBe(OperatorType.PLATFORM_FEE_ALLOCATE);
      expect(strategy.name).toBe('平台佣金/服务费自动分摊');
    });

    it('requires a TABLE node', () => {
      expect(strategy.getRequiredNodes()).toContain(FlowNodeType.TABLE);
    });

    it('exposes FIELD_MATCH_PATTERNS for drawer auto-fill', () => {
      expect(FIELD_MATCH_PATTERNS.orderIdCol.test('订单_id')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.platformFeeCol.test('platform_fee')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.serviceFeeCol.test('服务费')).toBe(true);
    });
  });

  describe('validate (validateOperatorSpecific contract)', () => {
    it('returns [] when config is absent (not yet configured)', () => {
      expect(strategy.validate(makeNodes(), noEdges)).toEqual([]);
    });

    it('reports ERROR for each missing required field mapping', () => {
      const bad = makeConfig({ orderIdCol: '', platformFeeCol: '' });
      const errors = strategy.validate(makeNodes(bad), noEdges);
      expect(errors.length).toBe(2);
      expect(errors.every((e) => e.severity === 'error')).toBe(true);
      expect(errors.map((e) => e.message).join()).toContain('订单ID列');
      expect(errors.map((e) => e.message).join()).toContain('平台佣金列');
    });

    it('passes when all required fields are present', () => {
      expect(strategy.validate(makeNodes(makeConfig()), noEdges)).toEqual([]);
    });
  });

  describe('buildOperatorSql', () => {
    it('falls back to SELECT 1 WHERE false without table node', () => {
      const nodes: FlowNode[] = [
        { id: 's', type: FlowNodeType.SELECT, position: { x: 0, y: 0 }, data: {} } as FlowNode,
      ];
      expect(strategy.buildOperatorSql(nodes, noEdges)).toBe('SELECT 1 WHERE false');
    });

    it('falls back when config is missing', () => {
      expect(strategy.buildOperatorSql(makeNodes(), noEdges)).toBe('SELECT 1 WHERE false');
    });

    it('builds the CTE chain src -> ord -> alloc -> agg', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      for (const cte of ['WITH src AS', 'ord AS', 'alloc AS', 'agg AS', 'SELECT * FROM agg']) {
        expect(sql).toContain(cte);
      }
    });

    it('dedups fees per-column with MAX OVER order partition (never MAX of sum)', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('MAX(COALESCE("platform_fee", 0)) OVER (PARTITION BY "order_id")');
      expect(sql).toContain('MAX(COALESCE("service_fee", 0)) OVER (PARTITION BY "order_id")');
      // fee_total must be the sum of the two per-column MAX windows
      expect(sql).toMatch(/\(_fee_platform\s*\+\s*_fee_service\)|MAX\(COALESCE\("platform_fee", 0\)\) OVER \(PARTITION BY "order_id"\) \+ MAX\(COALESCE\("service_fee", 0\)\) OVER/);
    });

    it('uses deterministic _src_rn tie-break, synced with EXCLUDE/ORDER BY', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('ROW_NUMBER() OVER () AS _src_rn');
      expect(sql).toContain('_src_rn ASC');
      expect(sql).toContain('ORDER BY "order_id", _src_rn');
      // _src_rn is excluded from final output but _is_zero_weight is kept
      const excludeList = sql.match(/EXCLUDE \(([^)]*)\)/)?.[1] ?? '';
      expect(excludeList).toContain('_src_rn');
      expect(excludeList).not.toContain('_is_zero_weight');
    });

    it('rounds allocations to 2 decimals and compensates tail diff on max-weight row', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('ROUND(');
      expect(sql).toContain('_max_weight_row THEN ROUND(_alloc_raw + (_fee_total - _order_alloc_sum), 2)');
    });

    it('injects userWhere into the src CTE only once, stripped of leading WHERE', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges, undefined, 'WHERE status = 1');
      expect(sql).toContain('WHERE status = 1');
      expect(sql.match(/WHERE status = 1/g)?.length).toBe(1);
    });

    it('guards zero-weight orders (allocated_fee = 0)', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('WHEN _is_zero_weight THEN 0');
    });
  });

  describe('postProcess', () => {
    it('handles empty data with a warning card', async () => {
      const res = await strategy.postProcess({ data: [], schema: [] });
      expect(res.data).toEqual([]);
      const cards = (res.insightsData as { insights: Array<{ iconKey: string }> }).insights;
      expect(cards[0].iconKey).toBe('warning');
    });

    it('aggregates 4 insight cards for normal rows', async () => {
      // simulate SQL output rows for O1: fees 10 + 5 = 15 split 10/5 across 2 rows
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges); // prime _lastConfig
      const rows = [
        { order_id: 'O1', sku_id: 'S1', allocated_fee: 10, alloc_ratio_pct: 0.6667, is_rounding_adjust: 0, product_net_profit: 5, _is_zero_weight: false },
        { order_id: 'O1', sku_id: 'S2', allocated_fee: 5, alloc_ratio_pct: 0.3333, is_rounding_adjust: 0, product_net_profit: 0, _is_zero_weight: false },
      ];
      const res = await strategy.postProcess({ data: rows, schema: [] });
      const cards = (res.insightsData as { insights: Array<{ id: string; title: string; iconKey: string; metrics?: Array<{ label: string; value: number; unit?: string }> }> }).insights;
      expect(cards.length).toBe(4);
      // metrics carry raw numbers; unit drives display formatting
      expect(cards[0].metrics?.[0].value).toBeCloseTo(15, 2); // per-order fee total preserved
      expect(cards[0].metrics?.[0].unit).toBe('元');
      expect(cards[1].metrics?.[0].value).toBe(1);
      expect(cards[2].metrics?.[0].value).toBeCloseTo(0.6667, 4); // ratio stored 0-1
      expect(cards[2].metrics?.[0].unit).toBe('%');
      expect(cards[3].iconKey).toBe('safe');
    });

    it('card 4 flips to warning when zero-weight rows exist', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const rows = [
        { order_id: 'O2', sku_id: 'S9', allocated_fee: 0, alloc_ratio_pct: 0, is_rounding_adjust: 0, product_net_profit: 0, _is_zero_weight: true },
      ];
      const res = await strategy.postProcess({ data: rows, schema: [] });
      const cards = (res.insightsData as { insights: Array<{ iconKey: string; title: string }> }).insights;
      expect(cards[3].iconKey).toBe('warning');
      expect(cards[3].title).toBe('零权重订单');
    });

    it('enriches schema with the 4 auxiliary columns', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const rows = [
        { order_id: 'O1', allocated_fee: 1, alloc_ratio_pct: 0.1, is_rounding_adjust: 0, product_net_profit: 1, _is_zero_weight: false },
      ];
      const res = await strategy.postProcess({ data: rows, schema: [{ name: 'order_id', type: 'VARCHAR' }] });
      const names = (res.schema as Array<{ name: string }>).map((c) => c.name);
      for (const aux of ['allocated_fee', 'alloc_ratio_pct', 'is_rounding_adjust', 'product_net_profit']) {
        expect(names).toContain(aux);
      }
    });

    it('exposes percent_signed formatter for alloc_ratio_pct (0-1 fraction)', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const res = await strategy.postProcess({
        data: [{ order_id: 'O1', allocated_fee: 1, alloc_ratio_pct: 0.1, is_rounding_adjust: 0, product_net_profit: 1, _is_zero_weight: false }],
        schema: [],
      });
      const fmt = (res.displayConfig as { columnFormatters: Record<string, { type: string }> }).columnFormatters;
      expect(fmt.alloc_ratio_pct.type).toBe('percent_signed');
    });
  });
});
