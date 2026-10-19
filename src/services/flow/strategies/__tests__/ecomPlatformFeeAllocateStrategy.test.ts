/**
 * Unit tests for EcomPlatformFeeAllocateStrategy
 * (feature: fn_ecom_platform_fee_allocate — 平台佣金/服务费自动分摊)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EcomPlatformFeeAllocateStrategy, FIELD_MATCH_PATTERNS } from '../ecomPlatformFeeAllocateStrategy';
import { OperatorType, FlowNodeType, DEFAULT_FEE_ALLOCATE_CONFIG } from '../../types';
import type { FlowNode, FlowEdge, PlatformFeeAllocateConfig } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConfig = (overrides: Partial<PlatformFeeAllocateConfig> = {}): PlatformFeeAllocateConfig => ({
  mode: 'amount',
  fieldMapping: { orderIdCol: 'order_id', amountCol: 'product_amount', quantityCol: 'quantity' },
  feeSlots: {
    slot1: { operator: '+', column: 'platform_fee' },
    slot2: { operator: '+', column: 'ad_fee' },
    slot3: { operator: '+', column: '' },
    slot4: { operator: '+', column: '' },
  },
  deductSlots: {
    slot1: { operator: '-', column: '' },
    slot2: { operator: '-', column: '' },
  },
  ...overrides,
});

const makeNodes = (config?: PlatformFeeAllocateConfig): FlowNode[] => [
  {
    id: 't1',
    type: FlowNodeType.TABLE,
    position: { x: 0, y: 0 },
    data: { tableName: 'ecom_orders' },
  } as FlowNode,
  {
    id: 's1',
    type: FlowNodeType.SELECT,
    position: { x: 100, y: 0 },
    data: config ? { platformFeeAllocateConfig: config } : {},
  } as FlowNode,
];

const noEdges: FlowEdge[] = [];

/** simulate SQL-output row (真实结果集列, 决议 7) */
const allocRow = (o: Record<string, unknown> = {}) => ({
  order_id: 'O1',
  product_amount: 200,
  order_fee_total: 15,
  allocated_fee: 10,
  alloc_ratio_pct: 0.6667,
  is_rounding_adjust: false,
  product_net_profit: 190,
  alloc_mode_label: '金额比例分摊',
  ...o,
});

type Card = {
  id: string;
  iconKey?: string;
  title: string;
  description?: string;
  suggestion?: string;
  metrics?: Array<{ label: string; value: number; unit?: string }>;
};

const cardsOf = (res: { insightsData?: unknown }): Card[] =>
  ((res.insightsData as { insights?: Card[] })?.insights ?? []);

const strategy = new EcomPlatformFeeAllocateStrategy();

// ---------------------------------------------------------------------------

describe('EcomPlatformFeeAllocateStrategy', () => {
  describe('FIELD_MATCH_PATTERNS (drawer auto-fill)', () => {
    it('hits both Chinese and English column-name sets', () => {
      expect(FIELD_MATCH_PATTERNS.orderIdCol.test('订单号')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.orderIdCol.test('order_no')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.amountCol.test('商品金额')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.amountCol.test('product_amount')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.quantityCol.test('购买数量')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.quantityCol.test('quantity')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.platformFeeCol.test('平台佣金')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.platformFeeCol.test('platform_fee')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.adFeeCol.test('广告费')).toBe(true);
      expect(FIELD_MATCH_PATTERNS.adFeeCol.test('ad_fee')).toBe(true);
    });
  });

  describe('validate (validateOperatorSpecific contract)', () => {
    it('returns [] when config is absent (not yet configured)', () => {
      expect(strategy.validate(makeNodes(), noEdges)).toEqual([]);
    });

    it('reports ERRORs in order for missing required fields', () => {
      const bad = makeConfig({
        fieldMapping: { orderIdCol: '', amountCol: '', quantityCol: '' },
        feeSlots: {
          slot1: { operator: '+', column: '' },
          slot2: { operator: '+', column: '' },
          slot3: { operator: '+', column: '' },
          slot4: { operator: '+', column: '' },
        },
      });
      const errors = strategy.validate(makeNodes(bad), noEdges);
      const messages = errors.map((e) => e.message);
      expect(errors.every((e) => e.severity === 'error')).toBe(true);
      expect(messages.length).toBe(3);
      expect(messages[0]).toContain('订单号列');
      expect(messages[1]).toContain('商品金额列');
      expect(messages[2]).toContain('费用槽位');
    });

    it('requires quantityCol only when mode=quantity', () => {
      const noQty = makeConfig({ mode: 'quantity', fieldMapping: { orderIdCol: 'order_id', amountCol: 'product_amount' } });
      const errors = strategy.validate(makeNodes(noQty), noEdges);
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain('购买数量列');
      // amount mode without quantity is fine
      const amountMode = makeConfig({ fieldMapping: { orderIdCol: 'order_id', amountCol: 'product_amount' } });
      expect(strategy.validate(makeNodes(amountMode), noEdges)).toEqual([]);
    });
  });

  describe('buildOperatorSql', () => {
    it('falls back to SELECT 1 WHERE false without table node or config', () => {
      const noTable: FlowNode[] = [
        { id: 's', type: FlowNodeType.SELECT, position: { x: 0, y: 0 }, data: { platformFeeAllocateConfig: makeConfig() } } as FlowNode,
      ];
      expect(strategy.buildOperatorSql(noTable, noEdges)).toBe('SELECT 1 WHERE false');
      expect(strategy.buildOperatorSql(makeNodes(), noEdges)).toBe('SELECT 1 WHERE false');
    });

    it('builds the CTE chain src -> ord -> alloc -> agg -> fin with deterministic _src_rn', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      for (const cte of ['WITH src AS', 'ord AS', 'alloc AS', 'agg AS', 'fin AS', 'FROM fin']) {
        expect(sql).toContain(cte);
      }
      expect(sql).toContain('ROW_NUMBER() OVER () AS _src_rn');
    });

    it('dedups fees per-column with MAX OVER order partition and joins by slot operators', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('MAX(COALESCE("platform_fee", 0)) OVER (PARTITION BY "order_id")');
      expect(sql).toContain('MAX(COALESCE("ad_fee", 0)) OVER (PARTITION BY "order_id")');
      expect(sql).toMatch(/MAX\(COALESCE\("platform_fee", 0\)\) OVER \(PARTITION BY "order_id"\) \+ MAX\(COALESCE\("ad_fee", 0\)\) OVER \(PARTITION BY "order_id"\)/);
      // empty slots are skipped entirely
      expect(sql).not.toContain('service_fee');
    });

    it('diverges weight expressions only across the three modes', () => {
      const amountSql = strategy.buildOperatorSql(makeNodes(makeConfig({ mode: 'amount' })), noEdges);
      expect(amountSql).toContain('COALESCE("product_amount", 0) AS row_weight');
      expect(amountSql).toContain('SUM(COALESCE("product_amount", 0)) OVER (PARTITION BY "order_id") AS order_weight_total');

      const qtySql = strategy.buildOperatorSql(makeNodes(makeConfig({ mode: 'quantity' })), noEdges);
      expect(qtySql).toContain('COALESCE("quantity", 0) AS row_weight');

      const evenSql = strategy.buildOperatorSql(makeNodes(makeConfig({ mode: 'even' })), noEdges);
      expect(evenSql).toContain('1 AS row_weight');
      expect(evenSql).toContain('COUNT(*) OVER (PARTITION BY "order_id") AS order_weight_total');
    });

    it('guards zero-weight orders and rounds allocations to 2 decimals', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('WHEN order_weight_total <= 0 THEN 0.0');
      expect(sql).toContain('ROUND(order_fee_total * row_weight / order_weight_total, 2)');
      expect(sql).not.toContain('100.0 *');
    });

    it('compensates tail diff on rn=1 row and flags is_rounding_adjust over 0.005', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('WHEN rn = 1 THEN ROUND(order_fee_total - alloc_sum + alloc_base, 2)');
      expect(sql).toContain('ABS(ROUND(order_fee_total - alloc_sum + alloc_base, 2) - alloc_base) > 0.005');
      expect(sql).toContain('AS is_rounding_adjust');
    });

    it('excludes exactly the 6 intermediate columns and emits label + net profit', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig({ mode: 'quantity' })), noEdges);
      expect(sql).toContain('SELECT * EXCLUDE (_src_rn, row_weight, order_weight_total, alloc_base, alloc_sum, rn)');
      expect(sql).toContain("'数量比例分摊' AS alloc_mode_label");
      expect(sql).toContain("ROUND(COALESCE(\"product_amount\", 0) - allocated_fee, 2) AS product_net_profit");
      const evenSql = strategy.buildOperatorSql(makeNodes(makeConfig({ mode: 'even' })), noEdges);
      expect(evenSql).toContain("'整单均摊' AS alloc_mode_label");
    });

    it('appends deductSlots into product_net_profit with their operators', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig({
        deductSlots: {
          slot1: { operator: '-', column: 'shipping_fee' },
          slot2: { operator: '+', column: 'refund_amount' },
        },
      })), noEdges);
      expect(sql).toContain('ROUND(COALESCE("product_amount", 0) - allocated_fee - COALESCE("shipping_fee", 0) + COALESCE("refund_amount", 0), 2) AS product_net_profit');
    });

    it('orders by order clustering + amount DESC + _src_rn tie-break', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(sql).toContain('ORDER BY "order_id" ASC, COALESCE("product_amount", 0) DESC, _src_rn ASC');
    });

    it('injects userWhere into the src CTE once, stripped of leading WHERE', () => {
      const sql = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges, undefined, 'WHERE status = 1');
      expect(sql.match(/WHERE status = 1/g)?.length).toBe(1);
      const srcPart = sql.slice(0, sql.indexOf('ord AS'));
      expect(srcPart).toContain('WHERE status = 1');
      const noWhere = strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      expect(noWhere.slice(0, noWhere.indexOf('ord AS'))).not.toContain('WHERE');
    });
  });

  describe('postProcess', () => {
    it('handles empty data with a single warning card', async () => {
      const res = await strategy.postProcess({ data: [], schema: [] });
      expect(res.data).toEqual([]);
      const cards = cardsOf(res);
      expect(cards.length).toBe(1);
      expect(cards[0].iconKey).toBe('warning');
      expect(cards[0].id).toBe('fee-allocate-empty-result');
    });

    it('aggregates the 4 contract cards from real result columns', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const rows = [
        allocRow(),
        allocRow({ product_amount: 100, allocated_fee: 5, alloc_ratio_pct: 0.3333 }),
      ];
      const res = await strategy.postProcess({ data: rows, schema: [] });
      const cards = cardsOf(res);
      expect(cards.map((c) => c.id)).toEqual([
        'fee-allocate-summary',
        'fee-allocate-top-orders',
        'rounding-adjust',
        'zero-weight-abnormal',
      ]);
      // card①: Σ allocated_fee on real column; ratio stored raw 0–1 (×100 only in description text)
      expect(cards[0].metrics?.[0].value).toBeCloseTo(15, 2);
      expect(cards[0].metrics?.[0].unit).toBe('元');
      const ratioMetric = cards[0].metrics?.find((m) => m.label === '平均费率');
      expect(ratioMetric?.value).toBeCloseTo(15 / 300, 4); // 0–1 raw fraction
      expect(ratioMetric?.unit).toBe('%');
      expect(cards[0].description).toContain('5.00%');
      // card② top order aggregation
      expect(cards[1].metrics?.[0].value).toBeCloseTo(15, 2);
      // card④ safe when no abnormal order
      expect(cards[3].iconKey).toBe('safe');
    });

    it('flips card④ to warning for zero-weight abnormal orders with suggestion', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const rows = [allocRow({ order_id: 'O2', allocated_fee: 0, alloc_ratio_pct: 0, order_fee_total: 10, product_amount: 0 })];
      const res = await strategy.postProcess({ data: rows, schema: [] });
      const card4 = cardsOf(res)[3];
      expect(card4.iconKey).toBe('warning');
      expect(card4.suggestion).toContain('检查该订单商品金额/数量是否缺失');
      expect(card4.metrics?.[0].value).toBe(1);
    });

    it('counts rounding-adjust rows and involved orders in card③', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const rows = [
        allocRow({ is_rounding_adjust: true }),
        allocRow({ allocated_fee: 5, alloc_ratio_pct: 0.3333, is_rounding_adjust: false }),
      ];
      const res = await strategy.postProcess({ data: rows, schema: [] });
      const card3 = cardsOf(res)[2];
      expect(card3.id).toBe('rounding-adjust');
      expect(card3.metrics?.[0].value).toBe(1);
      expect(card3.metrics?.[1].value).toBe(1);
      for (const m of card3.metrics ?? []) {
        expect(m.value).toBeGreaterThanOrEqual(0);
        expect(m.value).toBeLessThanOrEqual(100);
      }
    });

    it('enriches schema only with columns missing from SQL schema (no duplicates)', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const fullSchema = [
        { name: 'order_id', type: 'VARCHAR' },
        { name: 'order_fee_total', type: 'DOUBLE' },
        { name: 'allocated_fee', type: 'DOUBLE' },
        { name: 'alloc_ratio_pct', type: 'DOUBLE' },
        { name: 'is_rounding_adjust', type: 'BOOLEAN' },
        { name: 'alloc_mode_label', type: 'VARCHAR' },
        { name: 'product_net_profit', type: 'DOUBLE' },
      ];
      const res = await strategy.postProcess({ data: [allocRow()], schema: fullSchema });
      const names = (res.schema as Array<{ name: string }>).map((c) => c.name);
      expect(names.length).toBe(fullSchema.length);
      expect(new Set(names).size).toBe(names.length);

      const sparse = await strategy.postProcess({ data: [allocRow()], schema: [{ name: 'order_id', type: 'VARCHAR' }] });
      const sparseNames = (sparse.schema as Array<{ name: string }>).map((c) => c.name);
      for (const aux of ['order_fee_total', 'allocated_fee', 'alloc_ratio_pct', 'is_rounding_adjust', 'alloc_mode_label', 'product_net_profit']) {
        expect(sparseNames).toContain(aux);
      }
    });

    it('exposes percent_signed / currency formatters and never sets defaultSort', async () => {
      strategy.buildOperatorSql(makeNodes(makeConfig()), noEdges);
      const res = await strategy.postProcess({ data: [allocRow()], schema: [] });
      const dc = res.displayConfig as {
        defaultSort?: unknown;
        columnFormatters: Record<string, { type: string }>;
        columnTooltips: Record<string, string>;
      };
      expect(dc.defaultSort).toBeUndefined();
      expect(dc.columnFormatters.alloc_ratio_pct.type).toBe('percent_signed');
      expect(dc.columnFormatters.allocated_fee.type).toBe('currency_signed');
      for (const tip of ['allocated_fee', 'product_net_profit', 'order_fee_total', 'alloc_ratio_pct', 'is_rounding_adjust', 'alloc_mode_label']) {
        expect(dc.columnTooltips[tip]).toBeTruthy();
      }
    });
  });

  describe('factory registration + 量纲单点', () => {
    it('strategy metadata matches kernel contract', () => {
      expect(strategy.type).toBe(OperatorType.PLATFORM_FEE_ALLOCATE);
      expect(strategy.name).toBe('平台佣金/服务费自动分摊');
      expect(strategy.getRequiredNodes()).toEqual([FlowNodeType.SELECT]);
      expect(DEFAULT_FEE_ALLOCATE_CONFIG.feeSlots.slot1.column).toBe('platform_fee');
    });

    it('source contains exactly one `* 100` (量纲单点, review finding 8)', () => {
      // 双 runner 均从仓库根目录启动，相对路径稳定（import.meta.url 在 vitest 下为 http scheme）
      const src = readFileSync('src/services/flow/strategies/ecomPlatformFeeAllocateStrategy.ts', 'utf8');
      const count = (src.match(/\* 100/g) || []).length;
      expect(count).toBe(1);
    });
  });
});
