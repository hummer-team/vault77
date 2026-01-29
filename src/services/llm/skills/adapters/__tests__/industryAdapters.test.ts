/**
 * @file industryAdapters.test.ts
 * @description Unit tests for industry-specific adapters
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 4
 */

import { describe, it, expect } from 'bun:test';
import {
  createIndustryAdapter,
  getAllIndustries,
  getIndustryName,
  isSupportedIndustry,
} from '../industryAdapters';
import { BusinessEntityType } from '../../entities/entityTypes';

describe('Industry Adapters', () => {
  describe('createIndustryAdapter()', () => {
    it('should create ecommerce adapter', () => {
      const adapter = createIndustryAdapter('ecommerce');
      
      expect(adapter).toBeDefined();
      expect(adapter?.industryId).toBe('ecommerce');
      expect(adapter?.industryName).toContain('E-commerce');
    });

    it('should create finance adapter', () => {
      const adapter = createIndustryAdapter('finance');
      
      expect(adapter).toBeDefined();
      expect(adapter?.industryId).toBe('finance');
      expect(adapter?.industryName).toContain('Finance');
    });

    it('should create retail adapter', () => {
      const adapter = createIndustryAdapter('retail');
      
      expect(adapter).toBeDefined();
      expect(adapter?.industryId).toBe('retail');
      expect(adapter?.industryName).toContain('Retail');
    });

    it('should return null for unsupported industry', () => {
      const adapter = createIndustryAdapter('unknown_industry');
      
      expect(adapter).toBeNull();
    });
  });

  describe('Ecommerce Adapter - Field Mapping (Case I1)', () => {
    const adapter = createIndustryAdapter('ecommerce')!;

    it('should return correct field mapping for ORDER entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.ORDER);
      
      expect(fields.primaryKey).toBe('order_id');
      expect(fields.timeField).toBe('order_date');
      expect(fields.amountField).toBe('amount');
      expect(fields.userField).toBe('user_id');
    });

    it('should return correct field mapping for USER entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.USER);
      
      expect(fields.primaryKey).toBe('user_id');
      expect(fields.timeField).toBe('registration_date');
      expect(fields.amountField).toBe('total_spend');
    });

    it('should return correct field mapping for PRODUCT entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.PRODUCT);
      
      expect(fields.primaryKey).toBe('product_id');
      expect(fields.timeField).toBe('created_at');
      expect(fields.amountField).toBe('price');
    });
  });

  describe('Finance Adapter - Field Mapping (Case I2)', () => {
    const adapter = createIndustryAdapter('finance')!;

    it('should return correct field mapping for ORDER entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.ORDER);
      
      expect(fields.primaryKey).toBe('transaction_id');
      expect(fields.timeField).toBe('transaction_date');
      expect(fields.amountField).toBe('transaction_amount');
      expect(fields.userField).toBe('account_id');
    });

    it('should return correct field mapping for USER entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.USER);
      
      expect(fields.primaryKey).toBe('account_id');
      expect(fields.timeField).toBe('account_open_date');
      expect(fields.amountField).toBe('balance');
    });

    it('should return correct field mapping for FINANCE entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.FINANCE);
      
      expect(fields.primaryKey).toBe('record_id');
      expect(fields.timeField).toBe('booking_date');
      expect(fields.amountField).toBe('amount');
    });
  });

  describe('Ecommerce Adapter - Terminology Mapping (Case I3)', () => {
    const adapter = createIndustryAdapter('ecommerce')!;

    it('should return terminology map with GMV', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['GMV']).toBeDefined();
      expect(terminology['GMV']).toContain('Gross Merchandise Volume');
      expect(terminology['GMV']).toContain('成交总额');
    });

    it('should return terminology map with 客单价', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['客单价']).toBeDefined();
      expect(terminology['客单价']).toContain('Average Order Value');
    });

    it('should return terminology map with 复购率', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['复购率']).toBeDefined();
      expect(terminology['复购率']).toContain('Repeat Purchase Rate');
    });

    it('should return terminology map with 转化率', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['转化率']).toBeDefined();
      expect(terminology['转化率']).toContain('Conversion Rate');
    });

    it('should have at least 5 terminology entries', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(Object.keys(terminology).length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Retail Adapter - Field Mapping (Case I4)', () => {
    const adapter = createIndustryAdapter('retail')!;

    it('should return correct field mapping for ORDER entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.ORDER);
      
      expect(fields.primaryKey).toBe('sale_id');
      expect(fields.timeField).toBe('sale_date');
      expect(fields.amountField).toBe('sales_amount');
      expect(fields.userField).toBe('customer_id');
    });

    it('should return correct field mapping for PRODUCT entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.PRODUCT);
      
      expect(fields.primaryKey).toBe('sku');
      expect(fields.timeField).toBe('inventory_date');
      expect(fields.amountField).toBe('price');
    });

    it('should return correct field mapping for INVENTORY entity', () => {
      const fields = adapter.getEntitySemanticFields(BusinessEntityType.INVENTORY);
      
      expect(fields.primaryKey).toBe('inventory_id');
      expect(fields.timeField).toBe('stock_date');
      expect(fields.amountField).toBe('quantity');
    });
  });

  describe('Finance Adapter - Terminology Mapping', () => {
    const adapter = createIndustryAdapter('finance')!;

    it('should return terminology map with 交易额', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['交易额']).toBeDefined();
      expect(terminology['交易额']).toContain('Transaction Volume');
    });

    it('should return terminology map with 手续费', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['手续费']).toBeDefined();
      expect(terminology['手续费']).toContain('Transaction Fee');
    });
  });

  describe('Retail Adapter - Terminology Mapping', () => {
    const adapter = createIndustryAdapter('retail')!;

    it('should return terminology map with 销售额', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['销售额']).toBeDefined();
      expect(terminology['销售额']).toContain('Sales Revenue');
    });

    it('should return terminology map with 库存周转率', () => {
      const terminology = adapter.getTerminologyMap();
      
      expect(terminology['库存周转率']).toBeDefined();
      expect(terminology['库存周转率']).toContain('Inventory Turnover');
    });
  });

  describe('Metrics Templates', () => {
    it('should return ORDER metrics for ecommerce', () => {
      const adapter = createIndustryAdapter('ecommerce')!;
      const metrics = adapter.getMetricsTemplates(BusinessEntityType.ORDER);
      
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].label).toContain('Order');
      expect(metrics[0].aggregation).toBeDefined();
    });

    it('should return ORDER metrics for finance', () => {
      const adapter = createIndustryAdapter('finance')!;
      const metrics = adapter.getMetricsTemplates(BusinessEntityType.ORDER);
      
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].label).toContain('Transaction');
    });

    it('should return ORDER metrics for retail', () => {
      const adapter = createIndustryAdapter('retail')!;
      const metrics = adapter.getMetricsTemplates(BusinessEntityType.ORDER);
      
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[0].label).toContain('Sales');
    });

    it('should return empty array for unsupported entity type', () => {
      const adapter = createIndustryAdapter('ecommerce')!;
      const metrics = adapter.getMetricsTemplates(BusinessEntityType.LOGISTICS);
      
      expect(metrics).toEqual([]);
    });
  });

  describe('getAllIndustries()', () => {
    it('should return all supported industries', () => {
      const industries = getAllIndustries();
      
      expect(industries).toContain('ecommerce');
      expect(industries).toContain('finance');
      expect(industries).toContain('retail');
      expect(industries.length).toBe(3);
    });
  });

  describe('getIndustryName()', () => {
    it('should return ecommerce industry name', () => {
      const name = getIndustryName('ecommerce');
      
      expect(name).toContain('E-commerce');
      expect(name).toContain('电商');
    });

    it('should return finance industry name', () => {
      const name = getIndustryName('finance');
      
      expect(name).toContain('Finance');
      expect(name).toContain('金融');
    });

    it('should return retail industry name', () => {
      const name = getIndustryName('retail');
      
      expect(name).toContain('Retail');
      expect(name).toContain('零售');
    });

    it('should return industryId for unknown industry', () => {
      const name = getIndustryName('unknown');
      
      expect(name).toBe('unknown');
    });
  });

  describe('isSupportedIndustry()', () => {
    it('should return true for ecommerce', () => {
      expect(isSupportedIndustry('ecommerce')).toBe(true);
    });

    it('should return true for finance', () => {
      expect(isSupportedIndustry('finance')).toBe(true);
    });

    it('should return true for retail', () => {
      expect(isSupportedIndustry('retail')).toBe(true);
    });

    it('should return false for unsupported industry', () => {
      expect(isSupportedIndustry('unknown')).toBe(false);
    });
  });

  describe('Adapter Interface Compliance', () => {
    it('all adapters should implement IndustryAdapter interface', () => {
      const industries = getAllIndustries();
      
      industries.forEach(industryId => {
        const adapter = createIndustryAdapter(industryId);
        
        expect(adapter).toBeDefined();
        expect(adapter?.industryId).toBe(industryId);
        expect(adapter?.industryName).toBeDefined();
        expect(typeof adapter?.getEntitySemanticFields).toBe('function');
        expect(typeof adapter?.getTerminologyMap).toBe('function');
        expect(typeof adapter?.getMetricsTemplates).toBe('function');
      });
    });
  });
});
