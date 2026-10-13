/**
 * OrderFeeAllocateCalcStrategy (stub)
 *
 * Placeholder for fn_ecom_platform_fee_allocate strategy.
 * Full implementation in Phase 2.
 *
 * Currently exports only FIELD_MATCH_PATTERNS for drawer auto-fill.
 */

// ============================================================================
// Field match patterns (for drawer auto-fill)
// ============================================================================

export const FIELD_MATCH_PATTERNS: Record<string, RegExp> = {
  orderIdCol: /订单[_-]?id|order[_-]?id/i,
  skuIdCol: /商品[_-]?id|sku[_-]?id|product[_-]?id|item[_-]?id/i,
  orderNetAmountCol: /订单[_-]?净额|order[_-]?net[_-]?amount|order[_-]?total/i,
  skuNetAmountCol: /商品[_-]?净额|sku[_-]?net[_-]?amount|item[_-]?amount/i,
  platformFeeCol: /平台[_-]?佣金|platform[_-]?fee|commission/i,
  serviceFeeCol: /服务[_-]?费|service[_-]?fee/i,
  orderTimeCol: /下单[_-]?时间|order[_-]?time|created[_-]?at/i,
  categoryCol: /类目|category/i,
  channelCol: /渠道|channel/i,
};
