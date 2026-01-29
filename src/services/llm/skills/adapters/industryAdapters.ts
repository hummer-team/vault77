/**
 * @file industryAdapters.ts
 * @description Industry-specific adapters for field mappings, terminology, and metrics templates.
 * Provides configuration layer between business entities and domain knowledge.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 4
 */

import { BusinessEntityType, type EntitySemanticFields } from '../entities/entityTypes';
import type { MetricDefinition } from '../types';

/**
 * Industry adapter interface.
 * Provides industry-specific configurations without changing core skill logic.
 */
export interface IndustryAdapter {
  /** Unique industry identifier (e.g., 'ecommerce', 'finance', 'retail') */
  industryId: string;
  
  /** Human-readable industry name (Chinese + English) */
  industryName: string;
  
  /**
   * Get default semantic fields for an entity type in this industry.
   * @param entityType Business entity type
   * @returns Industry-specific semantic field mappings
   */
  getEntitySemanticFields(entityType: BusinessEntityType): EntitySemanticFields;
  
  /**
   * Get industry-specific terminology mapping.
   * Maps domain terms to their meanings (Chinese + English).
   * @returns Record of term to description
   */
  getTerminologyMap(): Record<string, string>;
  
  /**
   * Get suggested metrics templates for entity type.
   * Provides common metrics used in this industry for the entity.
   * @param entityType Business entity type
   * @returns Array of metric definitions
   */
  getMetricsTemplates(entityType: BusinessEntityType): MetricDefinition[];
}

/**
 * Ecommerce industry adapter.
 * Specialized for online retail, marketplace, and B2C scenarios.
 */
class EcommerceAdapter implements IndustryAdapter {
  industryId = 'ecommerce';
  industryName = 'E-commerce / 电商';

  getEntitySemanticFields(entityType: BusinessEntityType): EntitySemanticFields {
    switch (entityType) {
      case BusinessEntityType.ORDER:
        return {
          primaryKey: 'order_id',
          timeField: 'order_date',
          amountField: 'amount',
          userField: 'user_id',
          customFields: {
            status: 'order_status',
            paymentMethod: 'payment_method',
          },
        };
      
      case BusinessEntityType.USER:
        return {
          primaryKey: 'user_id',
          timeField: 'registration_date',
          amountField: 'total_spend',
          customFields: {
            tier: 'user_tier',
            channel: 'acquisition_channel',
          },
        };
      
      case BusinessEntityType.PRODUCT:
        return {
          primaryKey: 'product_id',
          timeField: 'created_at',
          amountField: 'price',
          customFields: {
            category: 'category',
            sku: 'sku',
          },
        };
      
      case BusinessEntityType.INVENTORY:
        return {
          primaryKey: 'inventory_id',
          timeField: 'updated_at',
          amountField: 'stock_quantity',
          customFields: {
            warehouse: 'warehouse_id',
            productId: 'product_id',
          },
        };
      
      default:
        return {
          primaryKey: 'id',
          timeField: 'created_at',
        };
    }
  }

  getTerminologyMap(): Record<string, string> {
    return {
      'GMV': 'Gross Merchandise Volume / 成交总额',
      '客单价': 'Average Order Value / AOV',
      '复购率': 'Repeat Purchase Rate / 用户重复购买比例',
      '转化率': 'Conversion Rate / 访客到购买转化率',
      '退货率': 'Return Rate / 退货订单比例',
      'SKU': 'Stock Keeping Unit / 库存单位',
      '动销率': 'Sell-through Rate / 销售商品占比',
      'ROI': 'Return on Investment / 投资回报率',
    };
  }

  getMetricsTemplates(entityType: BusinessEntityType): MetricDefinition[] {
    switch (entityType) {
      case BusinessEntityType.ORDER:
        return [
          { label: 'Order Count / 订单数', aggregation: 'count' },
          { label: 'GMV / 成交总额', aggregation: 'sum', column: 'amount' },
          { label: 'AOV / 客单价', aggregation: 'avg', column: 'amount' },
          {
            label: 'Paid Orders / 已支付订单数',
            aggregation: 'count',
            where: [{ column: 'order_status', op: '=', value: 'paid' }],
          },
        ];
      
      case BusinessEntityType.USER:
        return [
          { label: 'User Count / 用户数', aggregation: 'count' },
          { label: 'Total Spend / 总消费额', aggregation: 'sum', column: 'total_spend' },
          { label: 'Avg Spend Per User / 人均消费', aggregation: 'avg', column: 'total_spend' },
        ];
      
      case BusinessEntityType.PRODUCT:
        return [
          { label: 'Product Count / 商品数', aggregation: 'count' },
          { label: 'Avg Price / 平均价格', aggregation: 'avg', column: 'price' },
        ];
      
      default:
        return [];
    }
  }
}

/**
 * Finance industry adapter.
 * Specialized for banking, trading, payments, and financial services.
 */
class FinanceAdapter implements IndustryAdapter {
  industryId = 'finance';
  industryName = 'Finance / 金融';

  getEntitySemanticFields(entityType: BusinessEntityType): EntitySemanticFields {
    switch (entityType) {
      case BusinessEntityType.ORDER:
        return {
          primaryKey: 'transaction_id',
          timeField: 'transaction_date',
          amountField: 'transaction_amount',
          userField: 'account_id',
          customFields: {
            type: 'transaction_type',
            status: 'transaction_status',
            fee: 'fee',
          },
        };
      
      case BusinessEntityType.USER:
        return {
          primaryKey: 'account_id',
          timeField: 'account_open_date',
          amountField: 'balance',
          customFields: {
            accountType: 'account_type',
            riskLevel: 'risk_level',
          },
        };
      
      case BusinessEntityType.FINANCE:
        return {
          primaryKey: 'record_id',
          timeField: 'booking_date',
          amountField: 'amount',
          customFields: {
            debitAccount: 'debit_account',
            creditAccount: 'credit_account',
          },
        };
      
      default:
        return {
          primaryKey: 'id',
          timeField: 'created_at',
        };
    }
  }

  getTerminologyMap(): Record<string, string> {
    return {
      '交易额': 'Transaction Volume / 交易总金额',
      '手续费': 'Transaction Fee / 交易手续费',
      '余额': 'Balance / 账户余额',
      '流水': 'Transaction Flow / 资金流水',
      'AUM': 'Assets Under Management / 管理资产规模',
      'NPL': 'Non-Performing Loan / 不良贷款',
      '净值': 'Net Asset Value / 资产净值',
      '收益率': 'Return Rate / 投资收益率',
    };
  }

  getMetricsTemplates(entityType: BusinessEntityType): MetricDefinition[] {
    switch (entityType) {
      case BusinessEntityType.ORDER:
        return [
          { label: 'Transaction Count / 交易笔数', aggregation: 'count' },
          { label: 'Transaction Volume / 交易总额', aggregation: 'sum', column: 'transaction_amount' },
          { label: 'Total Fee / 手续费总额', aggregation: 'sum', column: 'fee' },
          { label: 'Avg Transaction / 平均交易额', aggregation: 'avg', column: 'transaction_amount' },
        ];
      
      case BusinessEntityType.USER:
        return [
          { label: 'Account Count / 账户数', aggregation: 'count' },
          { label: 'Total Balance / 总余额', aggregation: 'sum', column: 'balance' },
          { label: 'Avg Balance / 平均余额', aggregation: 'avg', column: 'balance' },
        ];
      
      default:
        return [];
    }
  }
}

/**
 * Retail industry adapter.
 * Specialized for physical retail stores, POS systems, and B2C scenarios.
 */
class RetailAdapter implements IndustryAdapter {
  industryId = 'retail';
  industryName = 'Retail / 零售';

  getEntitySemanticFields(entityType: BusinessEntityType): EntitySemanticFields {
    switch (entityType) {
      case BusinessEntityType.ORDER:
        return {
          primaryKey: 'sale_id',
          timeField: 'sale_date',
          amountField: 'sales_amount',
          userField: 'customer_id',
          customFields: {
            storeId: 'store_id',
            cashierId: 'cashier_id',
          },
        };
      
      case BusinessEntityType.PRODUCT:
        return {
          primaryKey: 'sku',
          timeField: 'inventory_date',
          amountField: 'price',
          customFields: {
            barcode: 'barcode',
            category: 'category',
          },
        };
      
      case BusinessEntityType.INVENTORY:
        return {
          primaryKey: 'inventory_id',
          timeField: 'stock_date',
          amountField: 'quantity',
          customFields: {
            storeId: 'store_id',
            sku: 'sku',
          },
        };
      
      default:
        return {
          primaryKey: 'id',
          timeField: 'created_at',
        };
    }
  }

  getTerminologyMap(): Record<string, string> {
    return {
      '销售额': 'Sales Revenue / 销售收入',
      '库存周转率': 'Inventory Turnover / 库存周转速度',
      '动销率': 'Sell-through Rate / 在售商品比例',
      '坪效': 'Sales Per Square Meter / 单位面积销售额',
      '客流量': 'Customer Traffic / 进店客户数',
      '连带率': 'Attach Rate / 客单件数',
      'SKU': 'Stock Keeping Unit / 库存单位',
      '同店增长': 'Same-Store Growth / 同店销售增长率',
    };
  }

  getMetricsTemplates(entityType: BusinessEntityType): MetricDefinition[] {
    switch (entityType) {
      case BusinessEntityType.ORDER:
        return [
          { label: 'Sales Count / 销售笔数', aggregation: 'count' },
          { label: 'Sales Revenue / 销售额', aggregation: 'sum', column: 'sales_amount' },
          { label: 'Avg Transaction / 平均客单价', aggregation: 'avg', column: 'sales_amount' },
        ];
      
      case BusinessEntityType.PRODUCT:
        return [
          { label: 'SKU Count / 商品SKU数', aggregation: 'count' },
          { label: 'Avg Price / 平均售价', aggregation: 'avg', column: 'price' },
        ];
      
      case BusinessEntityType.INVENTORY:
        return [
          { label: 'Total Stock / 总库存量', aggregation: 'sum', column: 'quantity' },
          { label: 'Avg Stock / 平均库存', aggregation: 'avg', column: 'quantity' },
        ];
      
      default:
        return [];
    }
  }
}

/**
 * Industry adapter registry.
 * Maps industry IDs to adapter instances.
 */
const INDUSTRY_ADAPTERS: Record<string, IndustryAdapter> = {
  ecommerce: new EcommerceAdapter(),
  finance: new FinanceAdapter(),
  retail: new RetailAdapter(),
};

/**
 * Create industry adapter by industry ID.
 * @param industryId Industry identifier
 * @returns Industry adapter instance, or null if not found
 */
export function createIndustryAdapter(industryId: string): IndustryAdapter | null {
  return INDUSTRY_ADAPTERS[industryId] || null;
}

/**
 * Get all supported industry IDs.
 * @returns Array of industry identifiers
 */
export function getAllIndustries(): string[] {
  return Object.keys(INDUSTRY_ADAPTERS);
}

/**
 * Get human-readable industry name.
 * @param industryId Industry identifier
 * @returns Industry name (Chinese + English), or the ID if not found
 */
export function getIndustryName(industryId: string): string {
  const adapter = INDUSTRY_ADAPTERS[industryId];
  return adapter ? adapter.industryName : industryId;
}

/**
 * Check if an industry ID is supported.
 * @param industryId Industry identifier to check
 * @returns True if industry is supported
 */
export function isSupportedIndustry(industryId: string): boolean {
  return industryId in INDUSTRY_ADAPTERS;
}
