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
import {
  EcomSkuSalesAnalysisStrategy,
  SKU_SALES_DEGRADE_SQL,
  buildSkuSalesDisplayConfig,
  buildSkuSalesOutputSchema,
  buildSkuSalesSql,
  composeSkuSalesSrcWhere,
} from '../ecomSkuSalesAnalysisStrategy';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type AnalysisResult,
  type FlowNode,
  type ValidationError,
} from '../../types';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { StrategyFactory } from '../../strategyFactory';
import { BaseStrategy } from '../../strategies';
import { KERNEL_UDF_MAP } from '../../../duckDBUdfService';
import { SEED_KERNELS } from '../../../biz-kernels/bizKernelMeta';
import {
  SelectNodePanelType,
  executeSelectNodeClickStrategy,
  resolveSelectNodePanelType,
  shouldRenderUdfDrawer,
} from '../../bizKernelsBuilderStrategies';

/** 禁用技术词（用户可见区零容忍） */
const BANNED = ['字段', '列', '表达式', '算子', 'SQL', '参数', '配置项', 'JSON'];

function bannedHits(text: string): string[] {
  return BANNED.filter((w) => text.toLowerCase().includes(w.toLowerCase()));
}

/** 顶层可局部覆盖，字段映射允许只给要改的键（测试便利，运行时由契约补默认） */
type CfgPatch = Partial<Omit<EcomSkuSalesAnalysisConfig, 'fieldMapping'>> & {
  fieldMapping?: Partial<EcomSkuSalesAnalysisConfig['fieldMapping']>;
};

/** 仅覆盖若干键的完整字段映射（契约类型要求必填项齐全） */
function mapOf(patch: Partial<EcomSkuSalesAnalysisConfig['fieldMapping']> = {}) {
  return { ...completeCfg().fieldMapping, ...patch };
}

function makeCfg(patch: CfgPatch = {}): EcomSkuSalesAnalysisConfig {
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
function completeCfg(patch: CfgPatch = {}): EcomSkuSalesAnalysisConfig {
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
      expect(resolveSkuSalesSkuAggKey(mapOf({ skuIdCol: 'sku', productIdCol: 'pid' }), 'spu')).toBe('sku_id');
      expect(resolveSkuSalesSkuAggKey(mapOf({ skuIdCol: '', productIdCol: 'pid' }), 'spu')).toBe('product_id');
      expect(resolveSkuSalesSkuAggKey(mapOf({ skuIdCol: '', productIdCol: '' }), 'spu')).toBe('sku_id');
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
// ============================================================================
// Phase 1 — SQL 拼装层
// ============================================================================

function makeNodes(cfg: EcomSkuSalesAnalysisConfig, tableName = 'shop_orders'): FlowNode[] {
  return [
    { id: 'table-1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName } },
    {
      id: 'select-1',
      type: FlowNodeType.SELECT,
      position: { x: 100, y: 0 },
      data: { tableName, ecomSkuSalesAnalysisConfig: cfg },
    },
  ];
}

function makeNodesWithoutTable(cfg: EcomSkuSalesAnalysisConfig): FlowNode[] {
  return [
    {
      id: 'select-1',
      type: FlowNodeType.SELECT,
      position: { x: 0, y: 0 },
      data: { ecomSkuSalesAnalysisConfig: cfg },
    },
  ];
}

function sqlOf(cfg: EcomSkuSalesAnalysisConfig, userWhere = ''): string {
  return buildSkuSalesSql('shop_orders', cfg, userWhere);
}

/** 取单个 CTE 的文本（到下一个 CTE 边界为止） */
function cteOf(sql: string, name: string): string {
  const start = sql.indexOf(`${name} AS (`);
  if (start < 0) return '';
  const end = sql.indexOf('\n),', start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end);
}

/** 取 CTE 的 GROUP BY 列清单（去掉表别名前缀后比较） */
function groupByOf(sql: string, name: string): string {
  const hit = /GROUP BY ([^\n]+)/.exec(cteOf(sql, name));
  return (hit?.[1] ?? '').replace(/\b[sk]\./g, '').trim();
}

describe('buildOperatorSql', () => {
  const strategy = new EcomSkuSalesAnalysisStrategy();

  it('六段 CTE 各出现恰好一次', () => {
    const sql = strategy.buildSql(makeNodes(completeCfg()), []);
    for (const name of ['src', 'sku_agg', 'calc', 'sales', 'metric', 'tag']) {
      expect((sql.match(new RegExp(`${name} AS`, 'g')) ?? []).length, name).toBe(1);
    }
    expect(sql.startsWith('WITH src AS (')).toBe(true);
  });

  it('缺表节点时降级为空查询', () => {
    expect(strategy.buildSql(makeNodesWithoutTable(completeCfg()), [])).toBe(SKU_SALES_DEGRADE_SQL);
  });

  it('缺配置时降级为空查询', () => {
    const nodes = makeNodes(completeCfg()).map((n) =>
      n.type === FlowNodeType.SELECT ? { ...n, data: {} } : n,
    );
    expect(strategy.buildSql(nodes, [])).toBe(SKU_SALES_DEGRADE_SQL);
  });
});

describe('userWhere', () => {
  it('三档合成：皆空 / 仅上游条件 / 两者都有', () => {
    expect(composeSkuSalesSrcWhere('', '')).toBe('');
    expect(composeSkuSalesSrcWhere('', "pay_time >= '2024-01-01'")).toBe(
      "WHERE pay_time >= '2024-01-01'",
    );
    expect(composeSkuSalesSrcWhere('a = 1', "pay_time >= '2024-01-01'")).toBe(
      "WHERE a = 1 AND (pay_time >= '2024-01-01')",
    );
    expect(composeSkuSalesSrcWhere('a = 1', '')).toBe('WHERE a = 1');
  });

  it('WHERE 前缀去重，1=1 视为无上游条件', () => {
    expect(composeSkuSalesSrcWhere('', "WHERE pay_time >= '2024-01-01'")).toBe(
      "WHERE pay_time >= '2024-01-01'",
    );
    expect(composeSkuSalesSrcWhere('', '1=1')).toBe('');
  });

  it('两种子句皆空时全 SQL 不生成 WHERE', () => {
    const sql = sqlOf(completeCfg({ excludeStatusValues: '', topN: 0 }));
    expect(sql.includes('WHERE')).toBe(false);
    expect(sql.includes('NOT IN')).toBe(false);
  });

  it('上游条件只在 src 层出现一次', () => {
    const sql = sqlOf(completeCfg(), "pay_time >= '2024-01-01'");
    expect(sql.split('pay_time').length - 1).toBe(1);
    expect(sql.indexOf('pay_time')).toBe(sql.lastIndexOf('pay_time'));
  });

  it('状态剔除与上游条件共存时先剔除后条件', () => {
    const sql = sqlOf(completeCfg(), "pay_time >= '2024-01-01'");
    expect(sql.includes("NOT IN ('已取消'")).toBe(true);
    expect(sql.indexOf('NOT IN')).toBeLessThan(sql.indexOf("AND (pay_time >= '2024-01-01')"));
  });
});

describe('状态剔除', () => {
  it('默认剔除集按固定项序写入', () => {
    const sql = sqlOf(completeCfg());
    expect(sql.includes('COALESCE(UPPER(TRIM(')).toBe(true);
    expect(
      sql.includes(
        "NOT IN ('已取消', '交易关闭', '已关闭', '未支付', '待付款', 'CANCELLED', 'CLOSED', 'UNPAID')",
      ),
    ).toBe(true);
  });

  it('空串不进剔除集，NULL 状态被放过', () => {
    expect(parseSkuSalesStatusList(DEFAULT_SKU_SALES_EXCLUDE_STATUSES)).not.toContain('');
    expect(sqlOf(completeCfg())).toContain(
      `COALESCE(UPPER(TRIM(CAST("order_status" AS VARCHAR))), '')`,
    );
  });

  it('未映射订单状态时不生成剔除', () => {
    expect(sqlOf(completeCfg({ fieldMapping: { orderStatusCol: '' } })).includes('NOT IN')).toBe(
      false,
    );
  });

  it('剔除值为空时不生成剔除', () => {
    expect(sqlOf(completeCfg({ excludeStatusValues: ' , ' })).includes('NOT IN')).toBe(false);
  });

  it('剔除值内的单引号被转义', () => {
    expect(sqlOf(completeCfg({ excludeStatusValues: "o'brien" })).includes("'O''BRIEN'")).toBe(true);
  });
});

describe('槽位进 SQL', () => {
  it('销售额表达式与预览字符级相等', () => {
    const cfg = completeCfg();
    const preview = buildSkuSalesFormulaPreview(cfg);
    expect(preview.salesSql).toBe('"net_amount"');
    expect(sqlOf(cfg).includes(`(${preview.salesSql}) AS "sales"`)).toBe(true);
  });

  it('毛利表达式与预览字符级相等', () => {
    const cfg = completeCfg();
    const preview = buildSkuSalesFormulaPreview(cfg);
    expect(sqlOf(cfg).includes(`(${preview.profitSql}) AS "profit"`)).toBe(true);
  });

  it('净额口径追加退款扣减', () => {
    expect(sqlOf(completeCfg({ salesCaliber: 'net' }))).toContain('COALESCE("refund_amount", 0)');
  });

  it('越界槽位零残留', () => {
    const slots = [
      { operator: '+', column: 'net_amount' },
      { operator: '+', column: 'unit_price' },
    ] as FormulaSlot[];
    const cfg = completeCfg({ salesSlots: slots });
    expect(isSkuSalesSlotColumnAllowed('salesSlots', 'unit_price')).toBe(false);
    expect(collectSkuSalesBlockers(cfg).find((b) => b.code === 'slot-dropped')?.severity).toBe(
      'warning',
    );
    expect(sqlOf(cfg).includes('unit_price')).toBe(false);
  });
});

describe('未映射列', () => {
  it('缺库存数量时以 NULL 投影且不折零', () => {
    const sql = sqlOf(completeCfg({ fieldMapping: { stockQtyCol: '' } }));
    expect(sql.includes('CAST(NULL AS DOUBLE) AS "stock_qty"')).toBe(true);
    expect(sql.includes('COALESCE("stock_qty", 0)')).toBe(false);
  });

  it('缺毛利额与成本时毛利为 NULL 且比率带 NULLIF', () => {
    const sql = sqlOf(
      completeCfg({ profitSlots: [], fieldMapping: { grossProfitCol: '', costCol: '' } }),
    );
    expect(sql.includes('(CAST(NULL AS DOUBLE)) AS "profit"')).toBe(true);
    expect(
      cteOf(sql, 'metric').includes('NULLIF(sl."quantity" + sl."stock_qty", 0) AS "sell_through_rate"'),
    ).toBe(true);
  });
  it('未映射列仅以 CAST(NULL AS DOUBLE) 形式出现', () => {
    const sql = sqlOf(completeCfg({ fieldMapping: { stockQtyCol: '' } }));
    expect(/CAST\(NULL AS DOUBLE\)\s+AS/.test(sql)).toBe(true);
    expect(sql.includes('SUM(CAST(NULL AS DOUBLE')).toBe(false);
  });
});

describe('排名与 ABC', () => {
  it('排名与累计占比窗口齐备', () => {
    const sql = sqlOf(completeCfg());
    expect(sql.includes('ROW_NUMBER() OVER (ORDER BY')).toBe(true);
    expect(sql.includes('ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW')).toBe(true);
  });

  it('排序指标为毛利时按毛利排序与累计', () => {
    const sql = sqlOf(completeCfg({ abcMetric: 'profit' }));
    expect(sql.includes('ORDER BY m."profit" DESC')).toBe(true);
    expect(sql.includes('SUM(GREATEST(m."profit", 0)) OVER ()')).toBe(true);
    expect(sql.includes('GREATEST(m."sales"')).toBe(false);
  });

  it('毛利不可用时回落销额排序', () => {
    const sql = sqlOf(
      completeCfg({ abcMetric: 'profit', profitSlots: [], fieldMapping: { grossProfitCol: '', costCol: '' } }),
    );
    expect(sql.includes('ORDER BY m."sales" DESC')).toBe(true);
    expect(sql.includes('SUM(GREATEST(m."sales", 0)) OVER ()')).toBe(true);
    expect(sql.includes('GREATEST(m."profit"')).toBe(false);
  });

  it('排序取未钳位原值', () => {
    for (const cfg of [completeCfg(), completeCfg({ abcMetric: 'profit' })]) {
      expect(sqlOf(cfg).includes('ORDER BY GREATEST(')).toBe(false);
    }
  });

  it('累计基数钳位恰两处', () => {
    for (const cfg of [completeCfg(), completeCfg({ abcMetric: 'profit' })]) {
      expect((sqlOf(cfg).match(/GREATEST\(/g) ?? []).length, cfg.abcMetric).toBe(2);
    }
  });

  it('TopN 为零时不加条数上限', () => {
    expect(sqlOf(completeCfg({ topN: 0 })).includes('"rank" <=')).toBe(false);
    expect(sqlOf(completeCfg({ topN: 200 })).includes('"rank" <= 200')).toBe(true);
  });
});

describe('标签优先级', () => {
  const SLOW = 't."quantity" < 1 AND (t."stock_qty" IS NULL OR t."stock_qty" > 0)';

  it('四个标签按优先级依次出现', () => {
    const sql = sqlOf(completeCfg());
    expect(sql.indexOf('滞销款')).toBeGreaterThan(-1);
    expect(sql.indexOf('滞销款')).toBeLessThan(sql.indexOf('爆款'));
    expect(sql.indexOf('爆款')).toBeLessThan(sql.indexOf('利润款'));
    expect(sql.indexOf('利润款')).toBeLessThan(sql.indexOf('普通'));
  });

  it('滞销判据与 is_slow_moving 同源', () => {
    expect(sqlOf(completeCfg()).split(SLOW).length - 1).toBe(2);
  });

  it('滞销阈值可配', () => {
    expect(sqlOf(completeCfg({ slowMovingQtyThreshold: 3 })).includes('t."quantity" < 3')).toBe(true);
  });

  it('毛利率与 ABC 阈值可配', () => {
    const sql = sqlOf(
      completeCfg({ profitMarginThreshold: 45, abcThresholdA: 60, abcThresholdB: 85 }),
    );
    expect(sql.includes('t."margin_rate" * 100 >= 45')).toBe(true);
    expect(sql.includes('t."abc_share" * 100 <= 60')).toBe(true);
    expect(sql.includes('t."abc_share" * 100 <= 85')).toBe(true);
  });

  it('数量为空时不出滞销标签', () => {
    expect(sqlOf(completeCfg()).includes('CASE WHEN t."quantity" IS NULL THEN NULL')).toBe(true);
  });
});

describe('降级与门禁', () => {
  const strategy = new EcomSkuSalesAnalysisStrategy();
  const degrade = (cfg: EcomSkuSalesAnalysisConfig): string => strategy.buildSql(makeNodes(cfg), []);

  it('缺表节点降级', () => {
    expect(strategy.buildSql(makeNodesWithoutTable(completeCfg()), [])).toBe(SKU_SALES_DEGRADE_SQL);
  });

  it('缺对象键降级', () => {
    expect(
      degrade(completeCfg({ groupLevel: 'spu', fieldMapping: { skuIdCol: '', productIdCol: '' } })),
    ).toBe(SKU_SALES_DEGRADE_SQL);
  });

  it('SKU 粒度缺 SKU 编码降级且不进入拼装', () => {
    const sql = degrade(completeCfg({ groupLevel: 'sku', fieldMapping: { skuIdCol: '' } }));
    expect(sql).toBe(SKU_SALES_DEGRADE_SQL);
    expect(sql.includes('GROUP BY')).toBe(false);
  });

  it('缺实收金额降级', () => {
    expect(degrade(completeCfg({ fieldMapping: { salesCol: '' } }))).toBe(SKU_SALES_DEGRADE_SQL);
  });

  it('销售额公式为空降级', () => {
    expect(degrade(completeCfg({ salesSlots: [] }))).toBe(SKU_SALES_DEGRADE_SQL);
  });

  it('缺销量降级', () => {
    expect(degrade(completeCfg({ fieldMapping: { quantityCol: '' } }))).toBe(SKU_SALES_DEGRADE_SQL);
  });
});

describe('validate', () => {
  const ERROR_CASES: Array<[string, EcomSkuSalesAnalysisConfig]> = [
    ['no-object-key', completeCfg({ groupLevel: 'spu', fieldMapping: { skuIdCol: '', productIdCol: '' } })],
    ['no-sku-key', completeCfg({ groupLevel: 'sku', fieldMapping: { skuIdCol: '' } })],
    ['no-sales-col', completeCfg({ fieldMapping: { salesCol: '' } })],
    ['no-quantity-col', completeCfg({ fieldMapping: { quantityCol: '' } })],
    ['no-sales-slot', completeCfg({ salesSlots: [] })],
    ['no-refund-col', completeCfg({ salesCaliber: 'net', fieldMapping: { refundAmountCol: '' } })],
    ['no-dim-col', completeCfg({ extraDimension: 'brand', fieldMapping: { brandCol: '' } })],
    ['bad-abc-threshold', completeCfg({ abcThresholdA: 95 })],
    ['bad-margin-threshold', completeCfg({ profitMarginThreshold: 120 })],
    ['bad-slow-threshold', completeCfg({ slowMovingQtyThreshold: -1 })],
    ['bad-topn', completeCfg({ topN: 2.5 })],
  ];

  const validateWith = (cfg: EcomSkuSalesAnalysisConfig): ValidationError[] =>
    new EcomSkuSalesAnalysisStrategy().validate(makeNodes(cfg), []);

  it('11 个阻断码各产出一条 ERROR', () => {
    for (const [code, cfg] of ERROR_CASES) {
      const expected = collectSkuSalesBlockers(cfg).find((b) => b.code === code);
      expect(expected, code).toBeTruthy();
      const hit = validateWith(cfg).find(
        (e) => e.severity === ValidationSeverity.ERROR && e.message === expected?.message,
      );
      expect(hit?.nodeId, code).toBe('select-1');
      expect(hit?.nodeType, code).toBe(FlowNodeType.SELECT);
    }
  });

  it('全通配置无 ERROR 且带时间范围提示', () => {
    const result = validateWith(completeCfg());
    expect(result.filter((e) => e.severity === ValidationSeverity.ERROR)).toEqual([]);
    expect(result.some((e) => e.message.includes('时间范围继承上游筛选条件'))).toBe(true);
  });

  it('退款重复扣减与质量码降级均为 WARNING', () => {
    const dup = validateWith(
      completeCfg({
        salesCaliber: 'net',
        salesSlots: [
          { operator: '+', column: 'net_amount' },
          { operator: '-', column: 'refund_amount' },
        ],
      }),
    ).find((e) => e.message.includes('重复扣除'));
    expect(dup?.severity).toBe(ValidationSeverity.WARNING);

    const degraded = validateWith(completeCfg({ fieldMapping: { stockQtyCol: '' } })).find((e) =>
      e.message.includes('NO_STOCK_COL'),
    );
    expect(degraded?.severity).toBe(ValidationSeverity.WARNING);
  });

  it('缺选择节点时不报本算子的阻断项', () => {
    const nodes: FlowNode[] = [
      { id: 'table-1', type: FlowNodeType.TABLE, position: { x: 0, y: 0 }, data: { tableName: 't' } },
    ];
    const result = new EcomSkuSalesAnalysisStrategy().validate(nodes, []);
    expect(result.filter((e) => e.nodeId === 'select-1')).toEqual([]);
  });
});

describe('SQL 冒烟', () => {
  const sql = sqlOf(completeCfg());

  it('六段 CTE 名各一次且输出带引号排名', () => {
    for (const name of ['src', 'sku_agg', 'calc', 'sales', 'metric', 'tag']) {
      expect((sql.match(new RegExp(`${name} AS`, 'g')) ?? []).length, name).toBe(1);
    }
    expect(sql.includes('AS "rank"')).toBe(true);
  });

  it('窗口与比率函数齐备', () => {
    expect(sql.includes('ROW_NUMBER() OVER (ORDER BY')).toBe(true);
    expect(sql.includes('ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW')).toBe(true);
    expect(sql.includes('NULLIF(')).toBe(true);
  });

  it('末尾为排序且无分号', () => {
    expect(sql.trimEnd().endsWith('ORDER BY t."rank"')).toBe(true);
    expect(sql.trimEnd().endsWith(';')).toBe(false);
  });

  it('calc 段不派生销售额，sales 段派生', () => {
    expect(cteOf(sql, 'calc').includes('AS "sales"')).toBe(false);
    expect(cteOf(sql, 'sales').includes('AS "sales"')).toBe(true);
  });
});

describe('SQL 语义结构', () => {
  it('SKU 模式两层分组键一致', () => {
    const sql = sqlOf(completeCfg());
    expect(groupByOf(sql, 'sku_agg')).toBe('"sku_id"');
    expect(groupByOf(sql, 'calc')).toBe('"sku_id"');
    expect(groupByOf(sql, 'sku_agg')).toBe(groupByOf(sql, 'calc'));
  });

  it('SPU 模式对象键以 MAX 投影且不进分组', () => {
    const sql = sqlOf(completeCfg({ groupLevel: 'spu' }));
    expect(cteOf(sql, 'sku_agg').includes('MAX(s."product_id") AS "product_id"')).toBe(true);
    expect(groupByOf(sql, 'sku_agg')).toBe('"sku_id"');
    expect(groupByOf(sql, 'calc')).toBe('"product_id"');
  });

  it('主 SELECT 的对象键二者一：SPU 不投影 sku_id（该层已无此列）', () => {
    // 主 SELECT 层统一用 t. 前缀，CTE 层用 s./k./c./m. 前缀，故按前缀即可区分
    const spuSql = sqlOf(completeCfg({ groupLevel: 'spu' }));
    expect(spuSql.includes('t."product_id"')).toBe(true);
    expect(spuSql.includes('t."sku_id"')).toBe(false);
    const skuSql = sqlOf(completeCfg());
    expect(skuSql.includes('t."sku_id"')).toBe(true);
    expect(skuSql.includes('t."product_id"')).toBe(false);
  });

  it('附加维度进入两层分组键', () => {
    const sql = sqlOf(completeCfg({ extraDimension: 'brand', fieldMapping: { brandCol: 'brand' } }));
    expect(groupByOf(sql, 'sku_agg')).toBe('"sku_id", "brand"');
    expect(groupByOf(sql, 'calc')).toBe('"sku_id", "brand"');
    expect(sql.includes('t."brand"')).toBe(true);
  });

  it('库存两级聚合：SKU 级取最大、对象级求和', () => {
    const sql = sqlOf(completeCfg());
    expect(cteOf(sql, 'sku_agg').includes('MAX(s."stock_qty") AS "stock_qty"')).toBe(true);
    expect(cteOf(sql, 'sku_agg').includes('SUM(s."stock_qty")')).toBe(false);
    expect(cteOf(sql, 'calc').includes('SUM(k."stock_qty")')).toBe(true);
  });

  it('订单数：映射订单号去重、未映射按行计', () => {
    expect(cteOf(sqlOf(completeCfg()), 'sku_agg').includes('COUNT(DISTINCT s."order_id")')).toBe(true);
    expect(
      cteOf(sqlOf(completeCfg({ fieldMapping: { orderIdCol: '' } })), 'sku_agg').includes('COUNT(*)'),
    ).toBe(true);
  });

  it('ABC 阈值写入分级判据', () => {
    const sql = sqlOf(completeCfg());
    expect(sql.includes('* 100 <= 70')).toBe(true);
    expect(sql.includes('* 100 <= 90')).toBe(true);
    expect(sqlOf(completeCfg({ abcThresholdA: 60 })).includes('* 100 <= 60')).toBe(true);
  });

  it('金额与数量保留两位、比率保留四位', () => {
    const sql = sqlOf(completeCfg());
    for (const col of ['quantity', 'sales', 'profit', 'stock_qty']) {
      expect(sql.includes(`ROUND(t."${col}", 2) AS "${col}"`), col).toBe(true);
    }
    for (const col of ['margin_rate', 'sell_through_rate', 'turnover_rate']) {
      expect(sql.includes(`ROUND(t."${col}", 4) AS "${col}"`), col).toBe(true);
    }
  });

  it('质量码以字面量写出', () => {
    expect(sqlOf(completeCfg()).includes(`'OK' AS "data_quality_flag"`)).toBe(true);
  });

  it('状态条件含清洗包裹', () => {
    expect(cteOf(sqlOf(completeCfg()), 'src').includes('COALESCE(UPPER(TRIM(')).toBe(true);
  });

  it('累计基数钳位：分子分母各一次、排序不钳位、总计两次', () => {
    for (const cfg of [completeCfg(), completeCfg({ abcMetric: 'profit' })]) {
      const sql = sqlOf(cfg);
      const metric = cfg.abcMetric === 'profit' ? 'profit' : 'sales';
      expect(sql.split(`GREATEST(m."${metric}", 0)`).length - 1, metric).toBe(2);
      expect(sql.includes(`SUM(GREATEST(m."${metric}", 0)) OVER ()`)).toBe(true);
      expect(
        sql.includes(`SUM(GREATEST(m."${metric}", 0)) OVER (ORDER BY m."${metric}" DESC, m."sku_id"`),
      ).toBe(true);
      expect(sql.includes('ORDER BY GREATEST(')).toBe(false);
      expect((sql.match(/GREATEST\(/g) ?? []).length, cfg.abcMetric).toBe(2);
    }
  });
});

// ============================================================================
// Phase 2 — 结果加工层（洞察卡 / 输出契约 / 展示配置）
// ============================================================================

type Row = Record<string, unknown>;

/** 与线上同序：先拼 SQL（写入 _lastConfig）再加工 */
async function post(
  cfg: EcomSkuSalesAnalysisConfig,
  rows: Row[],
): Promise<AnalysisResult> {
  const strategy = new EcomSkuSalesAnalysisStrategy();
  strategy.buildSql(makeNodes(cfg), []);
  return strategy.postProcess({ data: rows });
}

function mkRow(patch: Row = {}): Row {
  return {
    rank: 1,
    sku_id: 'SKU-A',
    order_cnt: 1,
    quantity: 1,
    sales: 100,
    profit: 10,
    margin_rate: 0.1,
    stock_qty: 5,
    sell_through_rate: 0.2,
    turnover_rate: 0.5,
    abc_class: 'A',
    tag: '爆款',
    is_slow_moving: false,
    data_quality_flag: 'OK',
    ...patch,
  };
}

const INSIGHT_KEYS = ['order', 'price', 'warning', 'insight'];

describe('postProcess 洞察卡', () => {
  // 夹具 4 行：quantity 依次 5 / 2 / 0 / null
  const rows: Row[] = [
    mkRow({ rank: 1, sku_id: 'SKU-A', quantity: 5, sales: 500, profit: 100 }),
    mkRow({ rank: 2, sku_id: 'SKU-B', quantity: 2, sales: 300, profit: 50 }),
    mkRow({ rank: 3, sku_id: 'SKU-C', quantity: 0, sales: 100, profit: 0, is_slow_moving: true, tag: '滞销款' }),
    mkRow({ rank: 4, sku_id: 'SKU-D', quantity: null, sales: 60, profit: null, margin_rate: null, is_slow_moving: null }),
  ];

  it('四张卡、图标与排序稳定、标识唯一', async () => {
    const result = await post(completeCfg(), rows);
    const insights = result.insightsData?.insights ?? [];

    expect(insights).toHaveLength(4);
    expect(insights.map((i) => i.iconKey)).toEqual(INSIGHT_KEYS);
    expect(insights.map((i) => i.sortOrder)).toEqual([1, 2, 3, 4]);
    expect(insights.every((i) => i.cardType === 'standard')).toBe(true);
    expect(insights.every((i) => typeof i.id === 'string' && i.id.length > 0)).toBe(true);
    expect(new Set(insights.map((i) => i.id)).size).toBe(4);
  });

  it('返回值形状符合结果契约', async () => {
    const result = await post(completeCfg(), rows);
    expect(Array.isArray(result)).toBe(false);
    expect(result.type).toBe(OperatorType.SKU_SALES_ANALYSIS);
    expect(result.sql).toBe('');
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.displayConfig?.defaultSort?.column).toBe('rank');
  });

  it('双计数：总量与有效量分别统计', async () => {
    const result = await post(completeCfg(), rows);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(4);
    expect(result.insightsData?.summary?.totalFilterRecordCount).toBe(2);
  });

  it('冠军卡带关键数字', async () => {
    const insights = (await post(completeCfg(), rows)).insightsData?.insights ?? [];
    const qty = insights.find((i) => i.id === 'sku-sales-qty-champion');
    const profit = insights.find((i) => i.id === 'sku-sales-profit-champion');
    expect(qty?.title).toContain('SKU-A');
    expect(qty?.description).toContain('5');
    expect(profit?.description).toContain('100');
    expect(profit?.description).toContain('毛利率');
  });

  it('文案不含技术词', async () => {
    const insights = (await post(completeCfg(), rows)).insightsData?.insights ?? [];
    for (const item of insights) {
      expect(bannedHits(`${item.title}${item.description ?? ''}`), item.id).toEqual([]);
    }
  });
});

describe('postProcess 空结果', () => {
  it('返回单张提示卡而非数组', async () => {
    const strategy = new EcomSkuSalesAnalysisStrategy();
    strategy.buildSql(makeNodes(completeCfg()), []);
    const pending = strategy.postProcess({ data: [] });
    expect(pending).toBeInstanceOf(Promise);

    const result = await pending;
    const insights = result.insightsData?.insights ?? [];
    expect(Array.isArray(result)).toBe(false);
    expect(insights).toHaveLength(1);
    expect(insights[0].iconKey).toBe('warning');
    expect(insights[0].title).toContain('没有可分析');
    expect(insights[0].sortOrder).toBe(1);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(0);
  });
});

describe('postProcess 降级文案', () => {
  const rows = [mkRow({ sku_id: 'SKU-A', quantity: 3, sales: 300, profit: 30 })];

  it('库存未识别时滞销卡追加说明且不含禁用词', async () => {
    const insights =
      (await post(completeCfg({ fieldMapping: { stockQtyCol: '' } }), rows)).insightsData?.insights ??
      [];
    const slow = insights.find((i) => i.id === 'sku-sales-slow-moving');
    expect(slow?.description).toContain('未识别库存');
    expect(slow?.description?.includes('列')).toBe(false);
  });

  it('毛利未识别时不出毛利冠军卡', async () => {
    const insights =
      (
        await post(
          completeCfg({ profitSlots: [], fieldMapping: { grossProfitCol: '', costCol: '' } }),
          rows,
        )
      ).insightsData?.insights ?? [];
    expect(insights.some((i) => i.iconKey === 'price')).toBe(false);
    expect(insights.every((i) => i.id !== 'sku-sales-profit-champion')).toBe(true);
  });

  it('回落 SKU 统计时集中度卡追加说明', async () => {
    const insights =
      (
        await post(
          completeCfg({ groupLevel: 'spu', fieldMapping: { productIdCol: '' } }),
          rows,
        )
      ).insightsData?.insights ?? [];
    expect(insights.find((i) => i.id === 'sku-sales-cr5')?.description).toContain('已按 SKU 统计');
  });
});

describe('CR5', () => {
  const mk = (sales: number[]): Row[] =>
    sales.map((s, i) => mkRow({ rank: i + 1, sku_id: `SKU-${i + 1}`, quantity: 1, sales: s }));

  const cr5Of = async (cfg: EcomSkuSalesAnalysisConfig, rows: Row[]): Promise<string> => {
    const insights = (await post(cfg, rows)).insightsData?.insights ?? [];
    return insights.find((i) => i.id === 'sku-sales-cr5')?.description ?? '';
  };

  it('前五合计即全体时为一成之内', async () => {
    expect(await cr5Of(completeCfg(), mk([300, 200, 150, 10, 0]))).toContain('100.0%');
  });

  it('销售额含负值时按原值求和', async () => {
    expect(await cr5Of(completeCfg(), mk([300, 200, 150, 10, -60]))).toContain('100.0%');
  });

  it('销售额全为零时不出集中度卡', async () => {
    const insights = (await post(completeCfg(), mk([0, 0, 0]))).insightsData?.insights ?? [];
    expect(insights.some((i) => i.id === 'sku-sales-cr5')).toBe(false);
  });

  it('截断与非截断两档口径', async () => {
    const truncated = await cr5Of(completeCfg({ topN: 2 }), mk([300, 200]));
    expect(truncated).toContain('100.0%');
    expect(truncated).toContain('非全量');

    const full = await cr5Of(completeCfg({ topN: 0 }), mk([300, 200, 150, 100, 50]));
    expect(full).toContain('100.0%');
    expect(full.includes('非全量')).toBe(false);
  });

  it('负毛利口径不由集中度卡承载', async () => {
    const rows = [
      mkRow({ rank: 1, sku_id: 'A', sales: 300, profit: 10 }),
      mkRow({ rank: 2, sku_id: 'B', sales: 200, profit: 5 }),
      mkRow({ rank: 3, sku_id: 'C', sales: 100, profit: -100 }),
    ];
    expect(await cr5Of(completeCfg({ abcMetric: 'profit' }), rows)).not.toContain(
      'ABC 与爆款仅按正贡献累计',
    );
  });
});

describe('输出 schema', () => {
  const CONST_COLS = [
    'order_cnt', 'quantity', 'sales', 'profit', 'margin_rate', 'stock_qty',
    'sell_through_rate', 'turnover_rate', 'abc_class', 'is_slow_moving', 'tag', 'data_quality_flag',
  ];

  it('SKU 粒度含商品编码不含产品编码', () => {
    const cols = buildSkuSalesOutputSchema(completeCfg());
    expect(cols).toContain('sku_id');
    expect(cols).not.toContain('product_id');
  });

  it('SPU 粒度含产品编码不含商品编码', () => {
    const cols = buildSkuSalesOutputSchema(completeCfg({ groupLevel: 'spu' }));
    expect(cols).toContain('product_id');
    expect(cols).not.toContain('sku_id');
  });

  it('SPU 回落到 SKU 时按实际键出列', () => {
    expect(buildSkuSalesOutputSchema(completeCfg({ groupLevel: 'spu', fieldMapping: { productIdCol: '' } })))
      .toContain('sku_id');
  });

  it('维度项三选一', () => {
    const cols = buildSkuSalesOutputSchema(
      completeCfg({ extraDimension: 'brand', fieldMapping: { brandCol: 'brand' } }),
    );
    expect(cols).toContain('brand');
    expect(cols).not.toContain('category');
    expect(cols).not.toContain('shop');
  });

  it('恒定项恒在，长度随维度项变化', () => {
    const base = buildSkuSalesOutputSchema(completeCfg());
    expect(base).toHaveLength(14);
    for (const col of CONST_COLS) expect(base, col).toContain(col);
    expect(base).toContain('rank');

    const withDim = buildSkuSalesOutputSchema(
      completeCfg({ extraDimension: 'brand', fieldMapping: { brandCol: 'brand' } }),
    );
    expect(withDim).toHaveLength(15);
  });

  it('十六种组合均含对象键与恒定项', () => {
    const levels = ['sku', 'spu'] as const;
    const dims = ['none', 'category', 'brand', 'shop'] as const;
    for (const groupLevel of levels) {
      for (const extraDimension of dims) {
        for (const productIdCol of ['product_id', '']) {
          const cfg = completeCfg({ groupLevel, extraDimension, fieldMapping: { productIdCol } });
          const cols = buildSkuSalesOutputSchema(cfg);
          expect(cols.includes('sku_id') || cols.includes('product_id'), `${groupLevel}/${extraDimension}(${productIdCol})`).toBe(true);
          for (const col of CONST_COLS) expect(cols, col).toContain(col);
        }
      }
    }
  });
});

describe('展示配置', () => {
  const cfg = completeCfg();
  const display = buildSkuSalesDisplayConfig(cfg);
  const formatters = display.columnFormatters ?? {};

  it('默认按排名升序', () => {
    expect(display.defaultSort).toEqual({ column: 'rank', order: 'ascend' });
  });

  it('六项格式逐项定稿', () => {
    expect(formatters.sales).toEqual({ type: 'currency_signed', unit: '元', precision: 2 });
    expect(formatters.profit).toEqual({ type: 'currency_signed', unit: '元', precision: 2 });
    expect(formatters.margin_rate).toEqual({ type: 'percent_signed', precision: 1 });
    expect(formatters.sell_through_rate).toEqual({ type: 'percent_signed', precision: 1 });
    expect(formatters.turnover_rate).toEqual({ type: 'percent_signed', precision: 1 });
    expect(formatters.tag).toEqual({
      type: 'json_tag_badges',
      priorityTags: ['滞销款', '爆款', '利润款'],
    });
    expect(Object.keys(formatters).sort()).toEqual(
      ['margin_rate', 'profit', 'sales', 'sell_through_rate', 'tag', 'turnover_rate'].sort(),
    );
  });

  it('取值全部落在既有格式集内', () => {
    const ALLOWED = [
      'ratio_to_fold', 'percent_signed', 'currency_signed', 'percent_deviation',
      'json_tag_badges', 'duration_days', 'risk_badge',
    ];
    expect(Object.values(formatters).every((f) => ALLOWED.includes(f.type))).toBe(true);
  });

  it('口径说明齐备且不含技术词', () => {
    const tooltips = display.columnTooltips ?? {};
    expect(Object.keys(tooltips).sort()).toEqual(
      ['margin_rate', 'profit', 'sales', 'sell_through_rate', 'turnover_rate'].sort(),
    );
    for (const text of Object.values(tooltips)) expect(bannedHits(text)).toEqual([]);
  });
});

describe('postProcess 不再截断', () => {
  it('传入多少行就返回多少行，总量照实统计', async () => {
    const rows: Row[] = Array.from({ length: 250 }, (_, i) =>
      mkRow({ rank: i + 1, sku_id: `SKU-${i + 1}`, quantity: 1, sales: 250 - i, profit: 1 }),
    );
    const result = await post(completeCfg({ topN: 200 }), rows);
    expect(result.data).toHaveLength(250);
    expect((result.data[0] as Row).rank).toBe(1);
    expect(result.insightsData?.summary?.totalRecordCount).toBe(250);
  });
});

describe('负毛利提示', () => {
  const NEG = 'ABC 与爆款仅按正贡献累计';

  const slowDesc = async (cfg: EcomSkuSalesAnalysisConfig, rows: Row[]): Promise<string> => {
    const insights = (await post(cfg, rows)).insightsData?.insights ?? [];
    return insights.find((i) => i.id === 'sku-sales-slow-moving')?.description ?? '';
  };

  const posRows = [
    mkRow({ rank: 1, sku_id: 'A', sales: 300, profit: 10 }),
    mkRow({ rank: 2, sku_id: 'B', sales: 200, profit: 5 }),
    mkRow({ rank: 3, sku_id: 'C', sales: 100, profit: -100 }),
  ];

  it('按毛利排序累计时给出披露', async () => {
    expect(await slowDesc(completeCfg({ abcMetric: 'profit' }), posRows)).toContain(
      `本期有 1 个商品毛利为负，${NEG}`,
    );
  });

  it('按销售额排序累计时不出现披露', async () => {
    expect(await slowDesc(completeCfg({ abcMetric: 'sales' }), posRows).then((d) => d.includes(NEG)))
      .toBe(false);
  });

  it('集中度卡被抑制时披露仍在', async () => {
    const rows = [
      mkRow({ rank: 1, sku_id: 'A', sales: 0, profit: -1 }),
      mkRow({ rank: 2, sku_id: 'B', sales: 0, profit: -2 }),
      mkRow({ rank: 3, sku_id: 'C', sales: 0, profit: 0 }),
    ];
    const result = await post(completeCfg({ abcMetric: 'profit' }), rows);
    const insights = result.insightsData?.insights ?? [];
    expect(insights.some((i) => i.id === 'sku-sales-cr5')).toBe(false);
    expect(insights.find((i) => i.id === 'sku-sales-slow-moving')?.description).toContain(
      '本期有 2 个商品毛利为负',
    );
  });

  it('截断与非截断两档文案', async () => {
    const negRows = [
      mkRow({ rank: 1, sku_id: 'A', sales: 100, profit: -1 }),
      mkRow({ rank: 2, sku_id: 'B', sales: 100, profit: -2 }),
    ];
    const truncated = await slowDesc(completeCfg({ abcMetric: 'profit', topN: 2 }), negRows);
    expect(truncated).toContain('返回的前 2 条中有 2 个商品毛利为负');

    const full = await slowDesc(completeCfg({ abcMetric: 'profit', topN: 0 }), negRows);
    expect(full).toContain('本期有');
    expect(full.includes('返回的前')).toBe(false);
  });

  it('卡数不变量：不出现第五张卡', async () => {
    const positive = await post(completeCfg({ abcMetric: 'profit' }), posRows);
    const pInsights = positive.insightsData?.insights ?? [];
    expect(pInsights).toHaveLength(4);
    expect(new Set(pInsights.map((i) => i.id)).size).toBe(4);

    const degraded = await post(
      completeCfg({ abcMetric: 'profit' }),
      [
        mkRow({ rank: 1, sku_id: 'A', sales: 0, profit: -1 }),
        mkRow({ rank: 2, sku_id: 'B', sales: 0, profit: -2 }),
      ],
    );
    const dInsights = degraded.insightsData?.insights ?? [];
    expect(dInsights.length).toBeLessThanOrEqual(4);
    expect(dInsights.some((i) => i.id === 'sku-sales-cr5')).toBe(false);
  });
});

// ── Phase 4: 注册面与元数据 ──────────────────────────────────────────────────

const KERNEL = 'fn_ecom_sku_sales_analysis';
const SRC = resolve(__dirname, '../../../..');

function readSrc(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf8');
}

/** §5 输出并集（18 项，顺序即元数据顺序） */
const OUTPUT_UNION = [
  'rank', 'sku_id', 'product_id', 'category', 'brand', 'shop', 'order_cnt', 'quantity',
  'sales', 'profit', 'margin_rate', 'stock_qty', 'sell_through_rate', 'turnover_rate',
  'abc_class', 'tag', 'is_slow_moving', 'data_quality_flag',
];

describe('StrategyFactory 注册', () => {
  it('工厂返回本算子策略实例且通过类型守卫', () => {
    const s = StrategyFactory.getStrategy(OperatorType.SKU_SALES_ANALYSIS);
    expect(s).toBeInstanceOf(EcomSkuSalesAnalysisStrategy);
    expect(s).toBeInstanceOf(BaseStrategy);
    // buildOperatorSql 是 BaseStrategy 的 protected 抽象成员：接口不可见、不可直接取值
    expect('buildOperatorSql' in s).toBe(true);
    expect(typeof (s as unknown as Record<string, unknown>).buildOperatorSql).toBe('function');
  });

  it('实例可被 sealed buildSql 调用（签名契约）', () => {
    const s = StrategyFactory.getStrategy(OperatorType.SKU_SALES_ANALYSIS);
    expect(typeof s.buildSql).toBe('function');
    expect(typeof s.postProcess).toBe('function');
  });
});

describe('元数据契约', () => {
  const meta = SEED_KERNELS.find((k) => k.name === KERNEL);

  it('条目存在且名称唯一（就地补全，不新增重复条目）', () => {
    expect(meta).toBeTruthy();
    const occurrences = readSrc('services/biz-kernels/bizKernelMeta.ts')
      .split(`name: '${KERNEL}'`).length - 1;
    expect(occurrences).toBe(1);
  });

  it('14 项入参，且入参名与出参名不混（net_amount 是输入，sales 是输出）', () => {
    const input = meta?.metadata?.inputFields ?? [];
    expect(input.length).toBe(14);
    expect(input).toContain('net_amount');
    expect(input).not.toContain('sales');
  });

  it('18 项出参与 §5 并集逐列相等', () => {
    const out = meta?.metadata?.outputFields ?? [];
    expect(out.length).toBe(18);
    expect([...out].sort()).toEqual([...OUTPUT_UNION].sort());
  });

  it('出参不含输入名 net_amount', () => {
    expect(meta?.metadata?.outputFields ?? []).not.toContain('net_amount');
  });

  it('12 条口径约束，编号可引用且非空', () => {
    const cs = meta?.metadata?.constraints ?? [];
    expect(cs.length).toBe(12);
    cs.forEach((c) => expect(c.trim().length).toBeGreaterThan(0));
  });

  it('约束覆盖关键口径（库存/口径/优先级/回退/截断/质量码）', () => {
    const joined = (meta?.metadata?.constraints ?? []).join('\n');
    ['NO_STOCK_COL', '滞销款 > 爆款', 'SPU_FALLBACK', '返回条数', '质量码', 'fn_ecom_inventory_turnover']
      .forEach((kw) => expect(joined).toContain(kw));
  });
});

describe('注册面一致性', () => {
  it('三处注册面对本算子同键（UDF 映射 / 面板路由 / 节点映射）', () => {
    expect(KERNEL_UDF_MAP[KERNEL]).toBe(KERNEL);
    expect(resolveSelectNodePanelType(KERNEL)).toBe(SelectNodePanelType.SKU_SALES_ANALYSIS_DRAWER);
    expect(shouldRenderUdfDrawer(KERNEL)).toBe(true);
    ['components/flow/nodes/SelectNode.tsx', 'components/flow/nodes/EndNode.tsx'].forEach((f) => {
      expect(readSrc(f)).toContain(`${KERNEL}:`);
    });
  });

  it('点击路由落到 openUdfDrawer（并入既有 fall-through 组）', () => {
    let drawer = 0;
    let detail = 0;
    executeSelectNodeClickStrategy(KERNEL, {
      openUdfDrawer: () => { drawer += 1; },
      openDetailPanel: () => { detail += 1; },
    });
    expect(drawer).toBe(1);
    expect(detail).toBe(0);
  });

  it('策略工厂键与节点映射键一致（同 OperatorType 成员）', () => {
    // 源码带对齐空格，断言前归一化空白
    const flat = readSrc('components/flow/nodes/SelectNode.tsx').replace(/\s+/g, ' ');
    expect(flat).toContain(`${KERNEL}: OperatorType.SKU_SALES_ANALYSIS`);
    expect(StrategyFactory.getStrategy(OperatorType.SKU_SALES_ANALYSIS)).toBeTruthy();
  });
});
