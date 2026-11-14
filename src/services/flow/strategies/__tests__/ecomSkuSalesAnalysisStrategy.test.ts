/**
 * 本算子单测：契约段 / SQL 生成 / 过滤条件 / postProcess / validate / 注册面。
 *
 * 契约段用例是本需求「唯一判据来源」的白盒校验；断言口径与 plan §1–§8 逐条对应。
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SKU_SALES_CONFIG,
  DEFAULT_SKU_SALES_EXCLUDE_STATUSES,
  SKU_SALES_AMOUNT_DENY,
  SKU_SALES_AMOUNT_FIELDS,
  SKU_SALES_COLUMN_LABEL,
  SKU_SALES_FIELD_LABEL,
  SKU_SALES_FIELD_MATCH_ORDER,
  SKU_SALES_FIELD_MATCH_PATTERNS,
  SKU_SALES_QUALITY_DESC,
  SKU_SALES_QUALITY_ORDER,
  SKU_SALES_REQUIRED_FIELDS,
  SKU_SALES_SLOT_FIELDS,
  SKU_SALES_SLOT_OPERATORS,
  SKU_SALES_SLOT_SOURCE_COLS,
  allowedSkuSalesSlots,
  applySkuSalesCaliber,
  buildSkuSalesFormulaPreview,
  cloneSkuSalesConfig,
  collectSkuSalesBlockers,
  isSkuSalesSlotColumnAllowed,
  joinSkuSalesQuality,
  matchSkuSalesColumns,
  matchesSkuSalesColumnSearch,
  parseSkuSalesStatusList,
  resolveSkuSalesEffectiveAbcMetric,
  resolveSkuSalesEffectiveGroupLevel,
  resolveSkuSalesObjectKey,
  resolveSkuSalesProfitSlots,
  resolveSkuSalesQualityCodes,
  resolveSkuSalesSkuAggKey,
  skuSalesBlockingErrors,
  skuSalesColumnOptionLabel,
  skuSalesSlotHuman,
  skuSalesSlotSql,
  skuSalesSlotsIncludeRefund,
  type SkuSalesBlockerCode,
  type SkuSalesFieldKey,
} from '../ecomSkuSalesAnalysisContract';
import type { EcomSkuSalesAnalysisConfig, FormulaSlot } from '../../types';

/** 禁用技术词（用户可见区零容忍） */
const BANNED = ['字段', '列', '表达式', '算子', 'SQL', '参数', '配置项', 'JSON'];

function bannedHits(text: string): string[] {
  return BANNED.filter((w) => text.toLowerCase().includes(w.toLowerCase()));
}

function makeCfg(patch: Partial<EcomSkuSalesAnalysisConfig> = {}): EcomSkuSalesAnalysisConfig {
  const base = cloneSkuSalesConfig(DEFAULT_SKU_SALES_CONFIG);
  const cfg: EcomSkuSalesAnalysisConfig = {
    ...base,
    ...patch,
    fieldMapping: { ...base.fieldMapping, ...(patch.fieldMapping ?? {}) },
  };
  if (patch.salesSlots) cfg.salesSlots = patch.salesSlots;
  if (patch.profitSlots) cfg.profitSlots = patch.profitSlots;
  return cfg;
}

/** 一份必填项齐全的配置 */
function completeCfg(patch: Partial<EcomSkuSalesAnalysisConfig> = {}): EcomSkuSalesAnalysisConfig {
  return makeCfg({
    ...patch,
    fieldMapping: {
      skuIdCol: 'sku_id',
      productIdCol: 'product_id',
      salesCol: 'net_amount',
      quantityCol: 'quantity',
      grossProfitCol: 'gross_profit',
      costCol: 'cost_amount',
      refundAmountCol: 'refund_amount',
      stockQtyCol: 'stock_qty',
      orderIdCol: 'order_id',
      orderStatusCol: 'order_status',
      ...(patch.fieldMapping ?? {}),
    },
  });
}

// ============================================================================
// 契约段
// ============================================================================

describe('契约段', () => {
  describe('字段字典与下拉 label', () => {
    it('字段字典覆盖 13 个字段槽', () => {
      expect(Object.keys(SKU_SALES_FIELD_LABEL)).toHaveLength(13);
      expect(Object.keys(DEFAULT_SKU_SALES_CONFIG.fieldMapping)).toHaveLength(13);
      expect(SKU_SALES_FIELD_MATCH_ORDER).toHaveLength(13);
      expect(Object.keys(SKU_SALES_FIELD_MATCH_PATTERNS).sort())
        .toEqual(Object.keys(SKU_SALES_FIELD_LABEL).sort());
    });

    it('字段中文名非空且不含禁用技术词', () => {
      for (const [key, label] of Object.entries(SKU_SALES_FIELD_LABEL)) {
        expect(label.length, key).toBeGreaterThan(0);
        expect(bannedHits(label), key).toEqual([]);
      }
    });

    it('源列中文名不含「列」等禁用词', () => {
      for (const [col, label] of Object.entries(SKU_SALES_COLUMN_LABEL)) {
        expect(bannedHits(label), col).toEqual([]);
      }
    });

    it('下拉 label 形如「中文名（源列）」', () => {
      expect(skuSalesColumnOptionLabel('net_amount')).toBe('实收金额（net_amount）');
      expect(skuSalesColumnOptionLabel('stock_qty')).toBe('库存数量（stock_qty）');
    });

    it('未知源列的下拉 label 退化为源列名', () => {
      expect(skuSalesColumnOptionLabel('unknown_col')).toBe('unknown_col');
    });
  });

  describe('搜索匹配', () => {
    it('中英双向、大小写不敏感、去首尾空格', () => {
      expect(matchesSkuSalesColumnSearch('实收', 'net_amount')).toBe(true);
      expect(matchesSkuSalesColumnSearch('NET', 'net_amount')).toBe(true);
      expect(matchesSkuSalesColumnSearch('net', 'net_amount')).toBe(true);
      expect(matchesSkuSalesColumnSearch('xyz', 'net_amount')).toBe(false);
      expect(matchesSkuSalesColumnSearch('  net  ', 'net_amount')).toBe(true);
      expect(matchesSkuSalesColumnSearch('品牌', 'quantity')).toBe(false);
      expect(matchesSkuSalesColumnSearch('', 'quantity')).toBe(true);
    });
  });

  describe('必填项与金额类字段', () => {
    it('必填项为 SKU 编码 / 实收金额 / 销量', () => {
      expect(SKU_SALES_REQUIRED_FIELDS).toEqual(['skuIdCol', 'salesCol', 'quantityCol']);
    });

    it('金额类字段为 4 个', () => {
      expect(SKU_SALES_AMOUNT_FIELDS).toEqual(['salesCol', 'grossProfitCol', 'costCol', 'refundAmountCol']);
    });

    it('金额排除词拦下比率与时间类列名', () => {
      expect(SKU_SALES_AMOUNT_DENY.test('销售额占比')).toBe(true);
      expect(SKU_SALES_AMOUNT_DENY.test('退款金额')).toBe(false);
      expect(SKU_SALES_AMOUNT_DENY.test('gross_profit_rate')).toBe(false);
    });
  });

  describe('槽位引用域', () => {
    it('槽位源列域固定为 4 个金额类源列', () => {
      expect(SKU_SALES_SLOT_SOURCE_COLS).toEqual(['net_amount', 'gross_profit', 'cost_amount', 'refund_amount']);
      expect(SKU_SALES_SLOT_FIELDS.salesSlots)
        .toEqual(['net_amount', 'gross_profit', 'cost_amount', 'refund_amount']);
    });

    it('毛利槽位额外允许销售额，销售额槽位不允许', () => {
      expect(SKU_SALES_SLOT_FIELDS.profitSlots)
        .toEqual(['net_amount', 'gross_profit', 'cost_amount', 'refund_amount', 'sales']);
      expect(isSkuSalesSlotColumnAllowed('profitSlots', 'sales')).toBe(true);
      expect(isSkuSalesSlotColumnAllowed('salesSlots', 'sales')).toBe(false);
    });

    it('数量类与比率类源列一律不可进入槽位', () => {
      for (const col of ['quantity', 'stock_qty', 'margin_rate', 'sell_through_rate', 'turnover_rate', 'sku_id']) {
        expect(isSkuSalesSlotColumnAllowed('salesSlots', col), col).toBe(false);
        expect(isSkuSalesSlotColumnAllowed('profitSlots', col), col).toBe(false);
      }
      expect(isSkuSalesSlotColumnAllowed('salesSlots', '')).toBe(false);
    });

    it('运算符闭集为加与减', () => {
      expect(SKU_SALES_SLOT_OPERATORS).toEqual(['+', '-']);
    });

    it('越界槽位项在构建前被丢弃，返回项为副本', () => {
      const slots: FormulaSlot[] = [
        { operator: '+', column: 'net_amount' },
        { operator: '+', column: 'quantity' },
        { operator: '-', column: 'cost_amount' },
      ];
      const allowed = allowedSkuSalesSlots('salesSlots', slots);
      expect(allowed).toEqual([
        { operator: '+', column: 'net_amount' },
        { operator: '-', column: 'cost_amount' },
      ]);
      expect(allowed[0]).not.toBe(slots[0]);
    });

    it('非法运算符的槽位项被丢弃', () => {
      const slots = [{ operator: '*', column: 'net_amount' }] as unknown as FormulaSlot[];
      expect(allowedSkuSalesSlots('salesSlots', slots)).toEqual([]);
    });
  });

  describe('同源拼装', () => {
    it('槽位 SQL 首项省略运算符，列名双引号且不带括号与前缀', () => {
      expect(skuSalesSlotSql([
        { operator: '+', column: 'net_amount' },
        { operator: '-', column: 'cost_amount' },
      ])).toBe('"net_amount" - "cost_amount"');
    });

    it('槽位 SQL 空集返回 null', () => {
      expect(skuSalesSlotSql([])).toBeNull();
      expect(skuSalesSlotSql(undefined)).toBeNull();
    });

    it('槽位人话串与 SQL 同源（中文名 + 减号）', () => {
      expect(skuSalesSlotHuman([
        { operator: '+', column: 'net_amount' },
        { operator: '-', column: 'cost_amount' },
      ])).toBe('实收金额 \u2212 商品成本');
      expect(skuSalesSlotHuman([
        { operator: '+', column: 'net_amount' },
        { operator: '+', column: 'gross_profit' },
      ])).toBe('实收金额 + 毛利额');
    });

    it('槽位人话串空集返回 null', () => {
      expect(skuSalesSlotHuman([])).toBeNull();
    });

    it('销售额口径：毛额不扣退款、净额再扣一次', () => {
      expect(applySkuSalesCaliber(makeCfg({ salesCaliber: 'gross' }))).toBe('"net_amount"');
      expect(applySkuSalesCaliber(makeCfg({ salesCaliber: 'net' })))
        .toBe('"net_amount" - COALESCE("refund_amount", 0)');
      expect(applySkuSalesCaliber(makeCfg({ salesSlots: [] }))).toBeNull();
    });

    it('退款重复扣减判定只看销售额槽位', () => {
      expect(skuSalesSlotsIncludeRefund([{ operator: '-', column: 'refund_amount' }])).toBe(true);
      expect(skuSalesSlotsIncludeRefund([{ operator: '+', column: 'net_amount' }])).toBe(false);
      expect(skuSalesSlotsIncludeRefund([{ operator: '+', column: 'quantity' }])).toBe(false);
    });
  });

  describe('毛利槽位解析', () => {
    it('用户配置非空时直接采用', () => {
      const cfg = completeCfg({ profitSlots: [{ operator: '+', column: 'net_amount' }] });
      expect(resolveSkuSalesProfitSlots(cfg.fieldMapping, cfg.profitSlots))
        .toEqual([{ operator: '+', column: 'net_amount' }]);
    });

    it('空配置且已映射毛利额时取毛利额', () => {
      const cfg = completeCfg({ profitSlots: [] });
      expect(resolveSkuSalesProfitSlots(cfg.fieldMapping, cfg.profitSlots))
        .toEqual([{ operator: '+', column: 'gross_profit' }]);
    });

    it('毛利额缺失且有商品成本时降级为销售额减商品成本', () => {
      const cfg = completeCfg({
        profitSlots: [],
        fieldMapping: { grossProfitCol: '', costCol: 'cost_amount' },
      });
      expect(resolveSkuSalesProfitSlots(cfg.fieldMapping, cfg.profitSlots)).toEqual([
        { operator: '+', column: 'sales' },
        { operator: '-', column: 'cost_amount' },
      ]);
    });

    it('毛利额与商品成本都缺时为空集', () => {
      const cfg = completeCfg({
        profitSlots: [],
        fieldMapping: { grossProfitCol: '', costCol: '' },
      });
      expect(resolveSkuSalesProfitSlots(cfg.fieldMapping, cfg.profitSlots)).toEqual([]);
    });
  });

  describe('粒度与对象键解析', () => {
    it('sku 粒度恒为 sku', () => {
      expect(resolveSkuSalesEffectiveGroupLevel({ skuIdCol: 'sku' }, 'sku')).toBe('sku');
      expect(resolveSkuSalesEffectiveGroupLevel({ productIdCol: 'pid' }, 'sku')).toBe('sku');
    });

    it('spu 缺商品编码时回落 sku', () => {
      expect(resolveSkuSalesEffectiveGroupLevel({ productIdCol: 'pid' }, 'spu')).toBe('spu');
      expect(resolveSkuSalesEffectiveGroupLevel({ productIdCol: '' }, 'spu')).toBe('sku');
    });

    it('对象键随有效粒度切换', () => {
      expect(resolveSkuSalesObjectKey({ productIdCol: 'pid' }, 'spu')).toBe('product_id');
      expect(resolveSkuSalesObjectKey({ productIdCol: '' }, 'spu')).toBe('sku_id');
      expect(resolveSkuSalesObjectKey({ skuIdCol: 'sku' }, 'sku')).toBe('sku_id');
    });

    it('SKU 级聚合键优先 SKU 编码', () => {
      expect(resolveSkuSalesSkuAggKey({ skuIdCol: 'sku', productIdCol: 'pid' }, 'spu')).toBe('sku_id');
      expect(resolveSkuSalesSkuAggKey({ skuIdCol: '', productIdCol: 'pid' }, 'spu')).toBe('product_id');
      expect(resolveSkuSalesSkuAggKey({ skuIdCol: '', productIdCol: '' }, 'spu')).toBe('sku_id');
    });

    it('ABC 排序指标毛利不可用时回落销售额', () => {
      expect(resolveSkuSalesEffectiveAbcMetric(true, 'profit')).toBe('profit');
      expect(resolveSkuSalesEffectiveAbcMetric(false, 'profit')).toBe('sales');
      expect(resolveSkuSalesEffectiveAbcMetric(true, 'sales')).toBe('sales');
    });
  });

  describe('质量码', () => {
    it('闭集为 6 个，固定次序 5 个', () => {
      expect(Object.keys(SKU_SALES_QUALITY_DESC)).toHaveLength(6);
      expect(SKU_SALES_QUALITY_ORDER).toEqual([
        'ROW_LEVEL', 'NO_STOCK_COL', 'NO_PROFIT_COL', 'NO_STATUS_FILTER', 'SPU_FALLBACK',
      ]);
    });

    it('质量码文案不含禁用技术词', () => {
      for (const [code, desc] of Object.entries(SKU_SALES_QUALITY_DESC)) {
        expect(bannedHits(desc), code).toEqual([]);
      }
    });

    it('口径完整时为 OK', () => {
      expect(resolveSkuSalesQualityCodes(completeCfg())).toEqual(['OK']);
      expect(joinSkuSalesQuality(['OK'])).toBe('OK');
      expect(joinSkuSalesQuality([])).toBe('OK');
    });

    it('缺订单号触发 ROW_LEVEL', () => {
      expect(resolveSkuSalesQualityCodes(completeCfg({ fieldMapping: { orderIdCol: '' } })))
        .toContain('ROW_LEVEL');
    });

    it('缺库存数量触发 NO_STOCK_COL', () => {
      expect(resolveSkuSalesQualityCodes(completeCfg({ fieldMapping: { stockQtyCol: '' } })))
        .toContain('NO_STOCK_COL');
    });

    it('缺毛利额触发 NO_PROFIT_COL', () => {
      expect(resolveSkuSalesQualityCodes(completeCfg({ fieldMapping: { grossProfitCol: '' } })))
        .toContain('NO_PROFIT_COL');
    });

    it('缺订单状态或剔除值为空触发 NO_STATUS_FILTER', () => {
      expect(resolveSkuSalesQualityCodes(completeCfg({ fieldMapping: { orderStatusCol: '' } })))
        .toContain('NO_STATUS_FILTER');
      expect(resolveSkuSalesQualityCodes(completeCfg({ excludeStatusValues: ' , ' })))
        .toContain('NO_STATUS_FILTER');
    });

    it('SPU 回落触发 SPU_FALLBACK', () => {
      expect(resolveSkuSalesQualityCodes(completeCfg({ groupLevel: 'spu', fieldMapping: { productIdCol: '' } })))
        .toContain('SPU_FALLBACK');
    });

    it('全降级时按固定次序拼接', () => {
      const cfg = completeCfg({
        groupLevel: 'spu',
        fieldMapping: { orderIdCol: '', stockQtyCol: '', grossProfitCol: '', orderStatusCol: '', productIdCol: '' },
      });
      expect(joinSkuSalesQuality(resolveSkuSalesQualityCodes(cfg)))
        .toBe('ROW_LEVEL+NO_STOCK_COL+NO_PROFIT_COL+NO_STATUS_FILTER+SPU_FALLBACK');
    });
  });

  describe('默认配置、状态值与克隆', () => {
    it('默认剔除值为 8 项中英集合', () => {
      expect(DEFAULT_SKU_SALES_EXCLUDE_STATUSES)
        .toBe('已取消,交易关闭,已关闭,未支付,待付款,CANCELLED,CLOSED,UNPAID');
      expect(parseSkuSalesStatusList(DEFAULT_SKU_SALES_EXCLUDE_STATUSES)).toHaveLength(8);
    });

    it('剔除值解析去空白并统一大写', () => {
      expect(parseSkuSalesStatusList(' 已取消 , cancelled ')).toEqual(['已取消', 'CANCELLED']);
      expect(parseSkuSalesStatusList('')).toEqual([]);
      expect(parseSkuSalesStatusList(undefined)).toEqual([]);
    });

    it('默认阈值与条数符合契约', () => {
      const cfg = DEFAULT_SKU_SALES_CONFIG;
      expect(cfg.groupLevel).toBe('sku');
      expect(cfg.extraDimension).toBe('none');
      expect(cfg.salesCaliber).toBe('gross');
      expect(cfg.abcMetric).toBe('sales');
      expect(cfg.abcThresholdA).toBe(70);
      expect(cfg.abcThresholdB).toBe(90);
      expect(cfg.slowMovingQtyThreshold).toBe(1);
      expect(cfg.profitMarginThreshold).toBe(30);
      expect(cfg.topN).toBe(200);
      expect(cfg.salesSlots).toEqual([{ operator: '+', column: 'net_amount' }]);
      expect(cfg.profitSlots).toEqual([{ operator: '+', column: 'gross_profit' }]);
    });

    it('默认配置的 13 个字段槽均为空串', () => {
      for (const [key, value] of Object.entries(DEFAULT_SKU_SALES_CONFIG.fieldMapping)) {
        expect(value, key).toBe('');
      }
    });

    it('克隆配置深拷贝槽位，避免共享引用', () => {
      const source = completeCfg({ salesSlots: [{ operator: '+', column: 'net_amount' }] });
      const cloned = cloneSkuSalesConfig(source);
      cloned.salesSlots[0].column = 'cost_amount';
      cloned.fieldMapping.salesCol = 'changed';
      expect(source.salesSlots[0].column).toBe('net_amount');
      expect(source.fieldMapping.salesCol).toBe('net_amount');
    });

    it('克隆缺失配置时返回一份可用的默认副本', () => {
      const cloned = cloneSkuSalesConfig();
      expect(cloned).toEqual(DEFAULT_SKU_SALES_CONFIG);
      expect(cloned).not.toBe(DEFAULT_SKU_SALES_CONFIG);
      expect(cloned.salesSlots).not.toBe(DEFAULT_SKU_SALES_CONFIG.salesSlots);
    });
  });

  describe('阻断判据', () => {
    it('全部阻断消息不含禁用技术词', () => {
      const cfg = makeCfg({
        groupLevel: 'spu',
        extraDimension: 'brand',
        salesCaliber: 'net',
        salesSlots: [{ operator: '+', column: 'refund_amount' }, { operator: '+', column: 'quantity' }],
        profitSlots: [{ operator: '+', column: 'stock_qty' }],
        abcThresholdA: 90,
        abcThresholdB: 70,
        profitMarginThreshold: 120,
        slowMovingQtyThreshold: -1,
        topN: 2.5,
      });
      const blockers = collectSkuSalesBlockers(cfg);
      expect(blockers.length).toBeGreaterThan(0);
      for (const b of blockers) {
        expect(bannedHits(b.message), b.code).toEqual([]);
      }
    });

    it('10 个可同时命中的 ERROR 阻断码按固定次序收集', () => {
      const cfg = makeCfg({
        groupLevel: 'spu',
        extraDimension: 'category',
        salesCaliber: 'net',
        salesSlots: [],
        abcThresholdA: 0,
        abcThresholdB: 0,
        profitMarginThreshold: -5,
        slowMovingQtyThreshold: -1,
        topN: 2.5,
      });
      const errors = skuSalesBlockingErrors(cfg).map((b) => b.code);
      expect(errors).toEqual([
        'no-object-key', 'no-sales-col', 'no-quantity-col', 'no-sales-slot', 'no-refund-col',
        'no-dim-col', 'bad-abc-threshold', 'bad-margin-threshold', 'bad-slow-threshold', 'bad-topn',
      ]);
      expect(errors).not.toContain('no-sku-key');
    });

    it('按 SKU 统计只映射商品编码时报 no-sku-key', () => {
      const cfg = completeCfg({ groupLevel: 'sku', fieldMapping: { skuIdCol: '' } });
      expect(skuSalesBlockingErrors(cfg).map((b) => b.code)).toEqual(['no-sku-key']);
    });

    it('阻断消息为业务化文案', () => {
      const cfg = makeCfg({ fieldMapping: { salesCol: '' } });
      expect(collectSkuSalesBlockers(cfg).map((b) => b.message)).toContain('请先选择实收金额');
    });

    it('毛利引用域为空时给出 WARNING 而非 ERROR', () => {
      const cfg = completeCfg({
        profitSlots: [],
        fieldMapping: { grossProfitCol: '', costCol: '' },
      });
      const empty = collectSkuSalesBlockers(cfg).find((b) => b.code === 'empty-profit-slots');
      expect(empty?.severity).toBe('warning');
      expect(skuSalesBlockingErrors(cfg).map((b) => b.code)).not.toContain('empty-profit-slots');
    });

    it('越界槽位项给出 slot-dropped WARNING', () => {
      const cfg = completeCfg({ profitSlots: [{ operator: '+', column: 'quantity' }] });
      expect(collectSkuSalesBlockers(cfg).find((b) => b.code === 'slot-dropped')?.severity).toBe('warning');
    });

    it('净额口径下销售额含退款时给出 refund-double-deduct WARNING', () => {
      const cfg = completeCfg({
        salesCaliber: 'net',
        salesSlots: [{ operator: '+', column: 'net_amount' }, { operator: '-', column: 'refund_amount' }],
      });
      expect(collectSkuSalesBlockers(cfg).find((b) => b.code === 'refund-double-deduct')?.severity)
        .toBe('warning');
    });

    it('每条降级质量码各产生一条 WARNING 提示', () => {
      const cfg = completeCfg({ fieldMapping: { stockQtyCol: '', orderIdCol: '' } });
      const warningCodes = collectSkuSalesBlockers(cfg)
        .filter((b) => b.severity === 'warning')
        .map((b) => b.code);
      expect(warningCodes).toContain('ROW_LEVEL');
      expect(warningCodes).toContain('NO_STOCK_COL');
    });

    it('error 与 warning 严格分离', () => {
      const cfg = completeCfg({ fieldMapping: { stockQtyCol: '' } });
      const all = collectSkuSalesBlockers(cfg);
      expect(all.filter((b) => b.severity === 'error')).toEqual([]);
      expect(skuSalesBlockingErrors(cfg)).toEqual([]);
    });
  });

  describe('预填', () => {
    it('商品编码与支付金额各就各位', () => {
      const { fieldMapping, ambiguous } = matchSkuSalesColumns(['商品编码', 'pay_amount', '销量']);
      expect(fieldMapping.productIdCol).toBe('商品编码');
      expect(fieldMapping.salesCol).toBe('pay_amount');
      expect(fieldMapping.quantityCol).toBe('销量');
      expect(ambiguous).toEqual([]);
    });

    it('销量与库存数量不会被当成金额', () => {
      const { fieldMapping } = matchSkuSalesColumns(['销量', '库存数量']);
      expect(fieldMapping.quantityCol).toBe('销量');
      expect(fieldMapping.stockQtyCol).toBe('库存数量');
      expect(fieldMapping.salesCol ?? '').toBe('');
    });

    it('唯一命中才写入，金额排除词挡住占比列', () => {
      const unique = matchSkuSalesColumns(['销售额', '销售额占比']);
      expect(unique.fieldMapping.salesCol).toBe('销售额');
      expect(unique.ambiguous).toEqual([]);

      const denied = matchSkuSalesColumns(['销售额占比']);
      expect(denied.fieldMapping.salesCol ?? '').toBe('');
      expect(denied.ambiguous).toEqual([]);
    });

    it('退款金额与退款金额占比只取前者', () => {
      const { fieldMapping, ambiguous } = matchSkuSalesColumns(['退款金额', '退款金额占比']);
      expect(fieldMapping.refundAmountCol).toBe('退款金额');
      expect(ambiguous).toEqual([]);
    });

    it('毛利额与毛利额占比只取前者', () => {
      const { fieldMapping } = matchSkuSalesColumns(['毛利额', '毛利额占比']);
      expect(fieldMapping.grossProfitCol).toBe('毛利额');
    });

    it('已填值不覆盖', () => {
      const { fieldMapping } = matchSkuSalesColumns(
        ['销量', 'sales_amount'],
        { ...DEFAULT_SKU_SALES_CONFIG.fieldMapping, salesCol: 'my_sales' },
      );
      expect(fieldMapping.salesCol).toBe('my_sales');
      expect(fieldMapping.quantityCol).toBe('销量');
    });

    it('一列只绑一个字段', () => {
      const { fieldMapping } = matchSkuSalesColumns(['销量']);
      expect(fieldMapping.quantityCol).toBe('销量');
      expect(fieldMapping.salesCol ?? '').toBe('');
      expect(fieldMapping.stockQtyCol ?? '').toBe('');
    });

    it('同正则命中多列时留空并回报歧义', () => {
      const { fieldMapping, ambiguous } = matchSkuSalesColumns(['品牌', '品牌名称']);
      expect(fieldMapping.brandCol ?? '').toBe('');
      expect(ambiguous.find((a) => a.field === 'brandCol')?.candidates).toEqual(['品牌', '品牌名称']);
    });

    it('空列表不产生任何映射', () => {
      const { fieldMapping, ambiguous } = matchSkuSalesColumns([]);
      expect(ambiguous).toEqual([]);
      expect(Object.values(fieldMapping).filter((v) => !!v)).toEqual([]);
    });

    it('预填正则不含全局标记（避免 test() 状态污染）', () => {
      for (const [key, pattern] of Object.entries(SKU_SALES_FIELD_MATCH_PATTERNS)) {
        expect(pattern.global, key).toBe(false);
        expect(pattern.ignoreCase, key).toBe(true);
      }
    });

    it('固定次序：SKU 编码先于商品编码', () => {
      expect(SKU_SALES_FIELD_MATCH_ORDER.slice(0, 2)).toEqual(['skuIdCol', 'productIdCol']);
      expect(SKU_SALES_FIELD_MATCH_ORDER[2]).toBe('salesCol');
    });
  });

  describe('公式预览', () => {
    it('销售额与毛利同源', () => {
      const cfg = makeCfg({
        salesCaliber: 'net',
        salesSlots: [{ operator: '+', column: 'net_amount' }, { operator: '-', column: 'refund_amount' }],
      });
      const preview = buildSkuSalesFormulaPreview(cfg);
      expect(preview.salesFormula).toBe('实收金额 \u2212 退款金额');
      expect(preview.salesSql).toBe('"net_amount" - "refund_amount" - COALESCE("refund_amount", 0)');
      expect(preview.salesCaliberNote).toContain('已扣退款');
    });

    it('收集被丢弃的越界项', () => {
      const cfg = completeCfg({ profitSlots: [{ operator: '+', column: 'quantity' }] });
      const preview = buildSkuSalesFormulaPreview(cfg);
      expect(preview.droppedSlots).toEqual([{ operator: '+', column: 'quantity' }]);
      expect(preview.profitSql).toBe('"gross_profit"');
    });

    it('毛利人话串随降级口径变化', () => {
      const cfg = completeCfg({
        profitSlots: [],
        fieldMapping: { grossProfitCol: '', costCol: 'cost_amount' },
      });
      expect(buildSkuSalesFormulaPreview(cfg).profitFormula).toBe('销售额 \u2212 商品成本');
    });
  });

  describe('配置键一致性', () => {
    it('字段槽键名与配置对象完全一致', () => {
      const keys = Object.keys(SKU_SALES_FIELD_LABEL) as SkuSalesFieldKey[];
      expect(keys.sort()).toEqual(Object.keys(DEFAULT_SKU_SALES_CONFIG.fieldMapping).sort());
      expect(collectSkuSalesBlockers(makeCfg()).map((b) => b.code))
        .toContain<SkuSalesBlockerCode>('no-object-key');
    });
  });
});