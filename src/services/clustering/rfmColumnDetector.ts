/**
 * RFM Column Detector
 * Automatically identifies RFM-related columns in a DuckDB table
 * Reuses COLUMN_PATTERNS from contextBuilder for consistency
 */

import type { TableMetadata } from '../../types/insight-action.types';
import { COLUMN_PATTERNS } from '../insight/contextBuilder';

/**
 * Precise Amount Patterns (Level 1 Detection)
 * 
 * These patterns use exact matching (^...$) to identify true monetary columns.
 * They are checked BEFORE the fuzzy COLUMN_PATTERNS.amount patterns.
 * 
 * Strategy: Extract what we need, not exclude what we don't want.
 */
const PRECISE_AMOUNT_PATTERNS: RegExp[] = [
  // === 订单金额类 (Order Amount) ===
  /^订单金额$/i,
  /^总金额$/i,
  /^实付金额$/i,
  /^应付金额$/i,
  /^成交金额$/i,
  /^order[_\s]*amount$/i,
  /^total[_\s]*amount$/i,
  /^paid[_\s]*amount$/i,
  /^payable[_\s]*amount$/i,
  /^transaction[_\s]*amount$/i,
  
  // === 支付金额类 (Payment Amount - Exact Only) ===
  // Note: Must be exact "支付金额" or "payment_amount" to avoid matching "支付时间"
  /^支付金额$/i,
  /^payment[_\s]*amount$/i,
  
  // === 价格类 (Price) ===
  /^单价$/i,
  /^价格$/i,
  /^总价$/i,
  /^商品价格$/i,
  /^price$/i,
  /^unit[_\s]*price$/i,
  /^total[_\s]*price$/i,
  /^item[_\s]*price$/i,
  /^product[_\s]*price$/i,
  
  // === 费用类 (Fees) ===
  /^运费$/i,
  /^手续费$/i,
  /^服务费$/i,
  /^优惠金额$/i,
  /^折扣金额$/i,
  /^shipping[_\s]*fee$/i,
  /^service[_\s]*fee$/i,
  /^handling[_\s]*fee$/i,
  /^discount[_\s]*amount$/i,
  
  // === 收入/成本类 (Revenue/Cost) ===
  /^收入$/i,
  /^销售额$/i,
  /^成本$/i,
  /^利润$/i,
  /^revenue$/i,
  /^sales$/i,
  /^cost$/i,
  /^profit$/i,
  
  // === 其他金额 (Other Amounts) ===
  /^金额$/i,      // Generic "amount" in Chinese
  /^amount$/i,    // Generic "amount" in English
];

/**
 * RFM column detection result
 */
export interface RFMColumns {
  customerId: string | null;   // Customer ID column
  orderId: string | null;       // Order ID column (optional, for frequency)
  orderDate: string | null;     // Order date column
  orderAmount: string | null;   // Order amount column
  
  // Detection confidence (for ambiguous cases)
  confidence: {
    customerId: number;
    orderId: number;
    orderDate: number;
    orderAmount: number;
  };
  
  // Pre-computed RFM columns (if user data already has RFM)
  precomputedRFM: {
    recency: string | null;
    frequency: string | null;
    monetary: string | null;
  };
}

/**
 * Detect RFM-related columns from table metadata
 * @param tableMetadata Table metadata from contextBuilder
 * @returns Detected RFM columns
 */
export function detectRFMColumns(tableMetadata: TableMetadata): RFMColumns {
  const columns = tableMetadata.columns.map(col => col.name);
  
  // Initialize result
  const result: RFMColumns = {
    customerId: null,
    orderId: null,
    orderDate: null,
    orderAmount: null,
    confidence: {
      customerId: 0,
      orderId: 0,
      orderDate: 0,
      orderAmount: 0,
    },
    precomputedRFM: {
      recency: null,
      frequency: null,
      monetary: null,
    },
  };
  
  // Check for pre-computed RFM columns (case-insensitive)
  for (const col of columns) {
    const colLower = col.toLowerCase();
    if (colLower === 'recency' || colLower.includes('recency')) {
      result.precomputedRFM.recency = col;
    }
    if (colLower === 'frequency' || colLower.includes('frequency')) {
      result.precomputedRFM.frequency = col;
    }
    if (colLower === 'monetary' || colLower.includes('monetary')) {
      result.precomputedRFM.monetary = col;
    }
  }
  
  // If all RFM columns exist, return early
  if (result.precomputedRFM.recency && result.precomputedRFM.frequency && result.precomputedRFM.monetary) {
    console.log('[RFMDetector] Pre-computed RFM columns detected:', result.precomputedRFM);
    return result;
  }
  
  // Detect required columns for RFM computation using COLUMN_PATTERNS
  
  // 1. Customer ID: Prioritize customer+id combination, fallback to user_id/member_id
  // First try to find columns that match both 'customer' AND 'id' patterns
  result.customerId = findColumnByPatterns(columns, [
    // Explicit customer ID patterns (highest priority)
    /(^|_)(customer_id|customer_code|cust_id|client_id|顾客ID|顾客编号|客户ID|客户编号)($|_)/i,
    /^顾客ID$/i,
    /^客户ID$/i,
    /^客户编号$/i,
    /^顾客编号$/i,
    // User/Member ID patterns (fallback)
    /(^|_)(user_id|member_id|buyer_id|purchaser_id|用户ID|会员编号|会员ID|买家ID)($|_)/i,
    /^用户ID$/i,
    /^会员编号$/i,
    /^会员ID$/i,
    // Generic patterns from COLUMN_PATTERNS (lowest priority)
    ...COLUMN_PATTERNS.customer.map(pattern => 
      // Combine customer pattern with _id suffix requirement
      new RegExp(pattern.source.replace(/\$\|_\)\$/, '') + '_id($|_)', pattern.flags)
    ),
  ]);
  if (result.customerId) {
    result.confidence.customerId = 1.0;
  }
  
  // 2. Order ID: Use 'order' pattern + 'id' pattern
  result.orderId = findColumnByPatterns(columns, [
    /(^|_)(order_id|order_no|order_number|transaction_id|trans_id)($|_)/i,
    /订单编号|订单号|交易ID/,
  ]);
  if (result.orderId) {
    result.confidence.orderId = 1.0;
  }
  
  // 3. Order Date: Use 'time' pattern with order preference
  result.orderDate = findColumnByPatterns(columns, [
    ...COLUMN_PATTERNS.time,
  ]);
  if (result.orderDate) {
    result.confidence.orderDate = 1.0;
  }
  
  // 4. Order Amount: Three-level detection strategy
  // Level 1 (Precise): Use PRECISE_AMOUNT_PATTERNS for exact matching
  // Level 2 (Fuzzy): Use COLUMN_PATTERNS.amount with exclusion rules
  // Level 3 (Fail): Return null if no match found
  
  // === LEVEL 1: Precise Matching (Highest Priority) ===
  const preciseAmountMatch = columns.find(col => 
    PRECISE_AMOUNT_PATTERNS.some(pattern => pattern.test(col))
  );
  
  if (preciseAmountMatch) {
    console.log('[RFMDetector] Level 1: Precise amount match:', preciseAmountMatch);
    result.orderAmount = preciseAmountMatch;
    result.confidence.orderAmount = 1.0;
    return result;
  }
  
  // === LEVEL 2: Fuzzy Matching + Exclusion (Fallback) ===
  console.log('[RFMDetector] Level 1 failed, trying Level 2 (fuzzy match + exclusion)');
  
  // First find all columns that match amount patterns
  const allAmountMatches = columns.filter(col => 
    COLUMN_PATTERNS.amount.some(pattern => pattern.test(col))
  );
  
  console.log('[RFMDetector] Columns matching amount patterns:', allAmountMatches.join(', '));
  
  // Then filter out non-monetary columns using comprehensive exclusion rules
  const amountCandidates = allAmountMatches.filter(col => {
    const colLower = col.toLowerCase();
    
    // Exclude pattern 1: ID/Serial/Number columns (流水号, 单号, 编号, 序号, ID, number, serial)
    const isIdColumn = 
      colLower.includes('流水号') ||
      colLower.includes('单号') ||
      colLower.includes('编号') ||
      colLower.includes('序号') ||
      colLower.includes('_id') ||
      colLower.endsWith('id') ||
      /[_\s]*(number|no|serial|code)$/i.test(col);
    
    // Exclude pattern 2: Method/Type/Way columns (方式, 类型, 方法, method, type, way)
    const isMethodTypeColumn = 
      colLower.includes('方式') ||
      colLower.includes('类型') ||
      colLower.includes('方法') ||
      /[_\s]*(method|type|way|mode)$/i.test(col);
    
    // Exclude pattern 3: Status/State columns (状态, status, state)
    const isStatusColumn =
      colLower.includes('状态') ||
      /[_\s]*(status|state)$/i.test(col);
    
    // Exclude pattern 4: Time/Date columns (时间, 日期, date, time, timestamp) - NEW!
    const isTimeColumn =
      colLower.includes('时间') ||
      colLower.includes('日期') ||
      /[_\s]*(date|time|timestamp|datetime|created|updated)$/i.test(col);
    
    const shouldExclude = isIdColumn || isMethodTypeColumn || isStatusColumn || isTimeColumn;
    
    if (shouldExclude) {
      const reason = isIdColumn ? '(ID/Serial)' 
                   : isMethodTypeColumn ? '(Method/Type)'
                   : isStatusColumn ? '(Status)'
                   : '(Time/Date)';
      console.log('[RFMDetector] Level 2: Excluding non-monetary column:', col, reason);
    }
    
    return !shouldExclude;
  });
  
  console.log('[RFMDetector] Level 2: Amount candidates after filtering:', amountCandidates.join(', '));
  
  if (amountCandidates.length > 0) {
    result.orderAmount = amountCandidates[0];
    result.confidence.orderAmount = 0.8; // Lower confidence for fuzzy match
    console.log('[RFMDetector] Level 2: Selected amount column:', result.orderAmount);
  } else {
    // === LEVEL 3: No Match Found ===
    console.log('[RFMDetector] Level 3: No amount column detected (all levels failed)');
    result.orderAmount = null;
    result.confidence.orderAmount = 0;
  }
  
  return result;
}

/**
 * Find column by matching against multiple RegExp patterns
 * @param columns Available column names
 * @param patterns RegExp patterns to match (ordered by priority)
 * @returns Best matching column name or null
 */
function findColumnByPatterns(columns: string[], patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    for (const col of columns) {
      if (pattern.test(col)) {
        return col;
      }
    }
  }
  return null;
}

/**
 * Validate RFM columns and throw error if missing required columns
 * @param rfmColumns Detected RFM columns
 * @throws Error if required columns are missing
 */
export function validateRFMColumns(rfmColumns: RFMColumns): void {
  const missingColumns: string[] = [];
  
  // Check if pre-computed RFM is available
  if (rfmColumns.precomputedRFM.recency && 
      rfmColumns.precomputedRFM.frequency && 
      rfmColumns.precomputedRFM.monetary) {
    // All RFM columns present, no need to validate source columns
    return;
  }
  
  // Check required columns for RFM computation
  if (!rfmColumns.customerId) {
    missingColumns.push('customer_id (or similar)');
  }
  if (!rfmColumns.orderDate) {
    missingColumns.push('order_date (or similar)');
  }
  if (!rfmColumns.orderAmount) {
    missingColumns.push('order_amount (or similar)');
  }
  
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns for RFM analysis: ${missingColumns.join(', ')}`);
  }
}

/**
 * Get RFM column names for SQL queries
 * @param rfmColumns Detected RFM columns
 * @returns Object with column names or throws if invalid
 */
export function getRFMColumnNames(rfmColumns: RFMColumns): {
  customerId: string;
  orderId: string | null;
  orderDate: string;
  orderAmount: string;
} {
  validateRFMColumns(rfmColumns);
  
  return {
    customerId: rfmColumns.customerId!,
    orderId: rfmColumns.orderId,
    orderDate: rfmColumns.orderDate!,
    orderAmount: rfmColumns.orderAmount!,
  };
}
