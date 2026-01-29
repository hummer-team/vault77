/**
 * @file entityTypes.ts
 * @description Core entity type system for business domain modeling.
 * Defines 7 business entity types and their semantic field mappings.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 1
 */

/**
 * Business entity types for skill routing and semantic understanding.
 * Each entity represents a distinct business domain with specific characteristics.
 */
export enum BusinessEntityType {
  /** Order/Transaction entity (订单/交易) */
  ORDER = 'ORDER',
  
  /** User/Customer entity (用户/客户) */
  USER = 'USER',
  
  /** Product/Item entity (商品/产品) */
  PRODUCT = 'PRODUCT',
  
  /** Inventory/Stock entity (库存) */
  INVENTORY = 'INVENTORY',
  
  /** Finance/Accounting entity (财务) */
  FINANCE = 'FINANCE',
  
  /** Logistics/Shipping entity (物流) */
  LOGISTICS = 'LOGISTICS',
  
  /** General/Fallback entity (通用) */
  GENERAL = 'GENERAL',
}

/**
 * Semantic field mapping for a business entity.
 * Maps business concepts to actual column names in the dataset.
 */
export interface EntitySemanticFields {
  /** Primary key field name (e.g., 'order_id', 'user_id') */
  primaryKey: string;
  
  /** Time/Date field name for temporal analysis (e.g., 'order_date', 'created_at') */
  timeField?: string;
  
  /** Amount/Price field name for financial metrics (e.g., 'amount', 'price') */
  amountField?: string;
  
  /** User/Customer identifier field (e.g., 'user_id', 'customer_id') */
  userField?: string;
  
  /** Additional domain-specific fields (e.g., 'status', 'category') */
  customFields?: Record<string, string>;
}

/**
 * Default semantic field mappings for each business entity type.
 * These defaults can be overridden by industry adapters or user configurations.
 * 
 * Design principle: Use generic English field names as system defaults.
 * Industry adapters provide domain-specific terminology (e.g., ecommerce vs finance).
 */
export const ENTITY_DEFAULT_SEMANTIC_FIELDS: Record<
  BusinessEntityType,
  EntitySemanticFields
> = {
  [BusinessEntityType.ORDER]: {
    primaryKey: 'order_id',
    timeField: 'order_date',
    amountField: 'amount',
    userField: 'user_id',
    customFields: {
      status: 'order_status',
      paymentStatus: 'payment_status',
    },
  },

  [BusinessEntityType.USER]: {
    primaryKey: 'user_id',
    timeField: 'registration_date',
    customFields: {
      memberLevel: 'member_level',
      cumulativeConsumption: 'cumulative_consumption',
      purchaseFrequency: 'purchase_frequency',
    },
  },

  [BusinessEntityType.PRODUCT]: {
    primaryKey: 'product_id',
    amountField: 'price',
    customFields: {
      category: 'category',
      stock: 'stock',
      salesVolume: 'sales_volume',
      rating: 'positive_rating',
    },
  },

  [BusinessEntityType.INVENTORY]: {
    primaryKey: 'inventory_id',
    timeField: 'updated_at',
    customFields: {
      warehouseId: 'warehouse_id',
      quantity: 'quantity',
      sku: 'sku',
    },
  },

  [BusinessEntityType.FINANCE]: {
    primaryKey: 'transaction_id',
    timeField: 'transaction_date',
    amountField: 'transaction_amount',
    userField: 'account_id',
    customFields: {
      transactionType: 'transaction_type',
      status: 'transaction_status',
    },
  },

  [BusinessEntityType.LOGISTICS]: {
    primaryKey: 'shipment_id',
    timeField: 'shipped_at',
    customFields: {
      trackingNumber: 'tracking_number',
      status: 'shipment_status',
      carrier: 'carrier',
    },
  },

  [BusinessEntityType.GENERAL]: {
    primaryKey: 'id',
    timeField: 'created_at',
  },
};

/**
 * Get default semantic fields for a business entity type.
 * @param entityType Business entity type
 * @returns Default semantic field mapping
 */
export function getDefaultSemanticFields(
  entityType: BusinessEntityType
): EntitySemanticFields {
  return ENTITY_DEFAULT_SEMANTIC_FIELDS[entityType];
}

/**
 * Check if a given string is a valid BusinessEntityType.
 * @param value String to check
 * @returns True if valid entity type
 */
export function isBusinessEntityType(value: string): value is BusinessEntityType {
  return Object.values(BusinessEntityType).includes(value as BusinessEntityType);
}

/**
 * Entity type display names for UI (English).
 */
export const ENTITY_TYPE_LABELS: Record<BusinessEntityType, string> = {
  [BusinessEntityType.ORDER]: 'Order/Transaction',
  [BusinessEntityType.USER]: 'User/Customer',
  [BusinessEntityType.PRODUCT]: 'Product/Item',
  [BusinessEntityType.INVENTORY]: 'Inventory/Stock',
  [BusinessEntityType.FINANCE]: 'Finance/Accounting',
  [BusinessEntityType.LOGISTICS]: 'Logistics/Shipping',
  [BusinessEntityType.GENERAL]: 'General',
};

/**
 * Entity type display names for UI (Chinese).
 */
export const ENTITY_TYPE_LABELS_ZH: Record<BusinessEntityType, string> = {
  [BusinessEntityType.ORDER]: '订单/交易',
  [BusinessEntityType.USER]: '用户/客户',
  [BusinessEntityType.PRODUCT]: '商品/产品',
  [BusinessEntityType.INVENTORY]: '库存',
  [BusinessEntityType.FINANCE]: '财务',
  [BusinessEntityType.LOGISTICS]: '物流',
  [BusinessEntityType.GENERAL]: '通用',
};
