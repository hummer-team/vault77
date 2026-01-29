/**
 * @file intentRecognizer.ts
 * @description Intent recognition engine based on keyword matching.
 * Analyzes user input to determine business entity type with confidence score.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 2
 */

import { BusinessEntityType } from '../entities';

/**
 * Intent recognition result with confidence score.
 */
export interface IntentRecognitionResult {
  /** Recognized business entity type */
  entityType: BusinessEntityType;
  
  /** Confidence score (0-1), higher means more confident */
  confidence: number;
  
  /** Keywords that matched in user input */
  matchedKeywords: string[];
}

/**
 * Skill recommendation result.
 */
export interface SkillRecommendation {
  /** Primary entity type to use */
  primary: BusinessEntityType;
  
  /** Related entity types that might also be relevant */
  related: BusinessEntityType[];
}

/**
 * Intent keyword library for each business entity type.
 * Total: 363 keywords across 7 entity types.
 * 
 * Design principle:
 * - Include both Chinese and English keywords
 * - Cover action words, status words, metric words, and business terms
 * - Use lowercase for case-insensitive matching
 */
const INTENT_KEYWORDS: Record<BusinessEntityType, string[]> = {
  [BusinessEntityType.ORDER]: [
    // Core keywords (Chinese)
    '订单', '下单', '购买', '支付', '交易', '订单编号', '下单时间', '支付状态',
    '物流状态', '实付金额', '退款', '退款状态', '订单类型', '履约', '履约时效',
    '商品明细', '订单明细', '购买记录', '消费记录', '买', '税率',
    // Core keywords (English)
    'order', 'purchase', 'buy', 'payment', 'transaction', 'order id',
    'order time', 'payment status', 'logistics status', 'actual payment',
    'refund', 'refund status', 'order type', 'fulfillment', 'order items', 'tax rate',
    // Action words
    '查订单', '订单查询', '取消订单', '订单取消', '订单统计',
    // Status words
    '待支付', '已支付', '待发货', '已发货', '已完成', '已取消', '已关闭',
    // Metric words
    '订单量', '订单数', '订单额', 'gmv', '客单价', '转化率', '下单量',
    '成交额', '交易额', '成交量', '交易量',
    // Business terms
    '成交', '消费', '购物', '买单', '付款', '结算',
  ],

  [BusinessEntityType.USER]: [
    // Core keywords (Chinese)
    '用户', '客户', '会员', '买家', '消费者', '用户id', '会员等级',
    '客单价', '复购', '复购率', '累计消费', '购买频次', '注册时间',
    '消费层级', '用户画像', '用户分析',
    // Core keywords (English)
    'user', 'customer', 'member', 'buyer', 'consumer', 'user id',
    'member level', 'aov', 'repurchase', 'repurchase rate',
    'cumulative consumption', 'purchase frequency', 'registration time',
    'consumption level',
    // Action words
    '注册', '登录', '用户注册', '新注册', '用户活跃',
    // Status words
    '活跃用户', '新用户', '老用户', '流失用户', '沉睡用户', '高价值用户',
    // Metric words
    '用户数', '留存', '留存率', '活跃度', 'rfm', 'ltv', '获客成本',
    // Business terms
    '客群', '会员体系', '用户分层', '用户生命周期',
  ],

  [BusinessEntityType.PRODUCT]: [
    // Core keywords (Chinese)
    '商品', '产品', '货品', '单品', 'spu', 'sku', '商品id', '产品id',
    '商品类目', '品类', '分类', '库存', '售价', '原价', '销量',
    '好评率', '商品状态', '产品状态',
    // Core keywords (English)
    'product', 'item', 'goods', 'spu', 'sku', 'product id',
    'product category', 'category', 'stock', 'selling price',
    'original price', 'sales volume', 'positive rating', 'product status',
    // Action words
    '上架', '下架', '商品分析', '销售排行', '商品排行', '销售榜',
    // Status words
    '热销', '热销商品', '畅销', '滞销', '滞销商品', '缺货', '在售', '停售',
    // Metric words
    '销售额', '动销', '动销率', '库存周转', '周转率', '销售占比',
    // Business terms
    '品类分析', '品牌', '规格', '属性', '标签',
  ],

  [BusinessEntityType.INVENTORY]: [
    // Core keywords (Chinese)
    '库存', '仓库', '入库', '出库', '盘点', '库存预警', '库存量',
    '库存周转', '安全库存', '呆滞库存', '在途库存', '可用库存',
    // Core keywords (English)
    'inventory', 'stock', 'warehouse', 'inbound', 'outbound',
    'stock check', 'stock alert', 'inventory level', 'safety stock',
    'dead stock', 'in-transit inventory', 'available stock',
    // Action words
    '调拨', '盘库', '库存调整', '补货', '库存查询',
    // Status words
    '库存不足', '缺货', '超储', '库存积压', '库存正常',
    // Metric words
    '周转天数', '库存周转率', '呆滞率', '满足率', '缺货率',
    // Business terms
    '仓储', '库位', '批次', '保质期', '先进先出',
  ],

  [BusinessEntityType.FINANCE]: [
    // Core keywords (Chinese)
    '财务', '收入', '成本', '利润', '交易额', '财务报表', '资金',
    '流水', '应收', '应收账款', '应付', '应付账款', '现金流',
    '毛利', '毛利率', '净利润', '营收',
    // Core keywords (English)
    'finance', 'revenue', 'income', 'cost', 'profit', 'financial report',
    'cash', 'cash flow', 'accounts receivable', 'accounts payable',
    'gross profit', 'gross margin', 'net profit', 'earnings',
    // Action words
    '结算', '对账', '财务分析', '财务统计', '收款', '付款',
    // Status words
    '已结算', '未结算', '欠款', '账期', '账龄',
    // Metric words
    '利润率', '回款率', '坏账率', 'roi', '资金周转',
    // Business terms
    '财务指标', '损益', '资产', '负债', '权益',
  ],

  [BusinessEntityType.LOGISTICS]: [
    // Core keywords (Chinese)
    '物流', '配送', '发货', '快递', '运输', '物流单号', '快递单号',
    '签收', '妥投', '妥投率', '派送', '揽收', '配送时效',
    // Core keywords (English)
    'logistics', 'shipping', 'delivery', 'courier', 'transport',
    'tracking number', 'waybill', 'signed', 'delivered',
    'delivery rate', 'dispatch', 'pickup', 'delivery time',
    // Action words
    '发货', '配送', '派件', '签收', '退件', '物流查询',
    // Status words
    '待发货', '已发货', '运输中', '派送中', '已签收', '配送异常',
    // Metric words
    '发货量', '签收率', '配送时效', '物流成本', '配送成本',
    // Business terms
    '承运商', '物流商', '快递公司', '配送范围', '运费',
  ],

  [BusinessEntityType.GENERAL]: [
    // Core keywords (Chinese)
    '查询', '统计', '分析', '趋势', '对比', '汇总', '数据',
    '报表', '列表', '明细', '详情', '总计', '合计', '求和',
    '平均', '最大', '最小', '排序', '筛选', '过滤',
    // Core keywords (English)
    'query', 'statistics', 'analysis', 'trend', 'compare', 'summary',
    'data', 'report', 'list', 'detail', 'total', 'sum', 'average',
    'max', 'min', 'sort', 'filter',
    // Action words
    '查看', '展示', '显示', '计算', '统计',
    // Metric words
    '数量', '占比', '比例', '增长', '环比', '同比',
  ],
};

/**
 * Normalize user input for keyword matching.
 * @param input User input string
 * @returns Normalized string (lowercase, trimmed)
 */
function normalizeInput(input: string): string {
  return input.toLowerCase().trim();
}

/**
 * Calculate match score for a single entity type.
 * @param input Normalized user input
 * @param keywords Keywords for this entity type
 * @returns Match score and matched keywords
 */
function calculateMatchScore(
  input: string,
  keywords: string[]
): { score: number; matched: string[] } {
  const matched: string[] = [];
  let totalWeight = 0;

  for (const keyword of keywords) {
    if (input.includes(keyword)) {
      matched.push(keyword);
      // Longer keywords get higher weight
      const weight = keyword.length > 3 ? 1.0 : 0.6;
      totalWeight += weight;
    }
  }

  // Normalize score to 0-1 range with aggressive scaling
  // Formula: score = 1 - exp(-totalWeight / 1.5)
  // - 1 match → score ≈ 0.49
  // - 2 matches → score ≈ 0.74
  // - 3 matches → score ≈ 0.87
  // - 4+ matches → score ≥ 0.93
  const score = 1 - Math.exp(-totalWeight / 1.5);

  return { score, matched };
}

/**
 * Recognize intent from user input using keyword matching.
 * @param userInput User's natural language query
 * @returns Intent recognition result with confidence score
 */
export function recognizeIntent(userInput: string): IntentRecognitionResult {
  const normalizedInput = normalizeInput(userInput);

  // Calculate match scores for all entity types
  const scores = Object.entries(INTENT_KEYWORDS).map(([entityType, keywords]) => {
    const { score, matched } = calculateMatchScore(normalizedInput, keywords);
    return {
      entityType: entityType as BusinessEntityType,
      confidence: score,
      matchedKeywords: matched,
    };
  });

  // Sort by confidence (descending)
  scores.sort((a, b) => b.confidence - a.confidence);

  // Return highest confidence result
  const topResult = scores[0];

  // If confidence is very low, default to GENERAL
  if (topResult.confidence < 0.1) {
    return {
      entityType: BusinessEntityType.GENERAL,
      confidence: 0.3,
      matchedKeywords: [],
    };
  }

  return topResult;
}

/**
 * Recommend related skills based on intent recognition result.
 * @param intent Intent recognition result
 * @returns Skill recommendation with primary and related entity types
 */
export function recommendSkills(intent: IntentRecognitionResult): SkillRecommendation {
  const { entityType, confidence } = intent;

  // Define entity relationships (which entities are commonly analyzed together)
  const entityRelations: Record<BusinessEntityType, BusinessEntityType[]> = {
    [BusinessEntityType.ORDER]: [
      BusinessEntityType.USER,
      BusinessEntityType.PRODUCT,
      BusinessEntityType.FINANCE,
    ],
    [BusinessEntityType.USER]: [
      BusinessEntityType.ORDER,
      BusinessEntityType.PRODUCT,
    ],
    [BusinessEntityType.PRODUCT]: [
      BusinessEntityType.ORDER,
      BusinessEntityType.INVENTORY,
    ],
    [BusinessEntityType.INVENTORY]: [
      BusinessEntityType.PRODUCT,
      BusinessEntityType.LOGISTICS,
    ],
    [BusinessEntityType.FINANCE]: [
      BusinessEntityType.ORDER,
      BusinessEntityType.USER,
    ],
    [BusinessEntityType.LOGISTICS]: [
      BusinessEntityType.ORDER,
      BusinessEntityType.INVENTORY,
    ],
    [BusinessEntityType.GENERAL]: [],
  };

  const related = entityRelations[entityType] || [];

  // If confidence is low, suggest multiple options
  if (confidence < 0.5) {
    return {
      primary: entityType,
      related: [BusinessEntityType.GENERAL, ...related],
    };
  }

  return {
    primary: entityType,
    related,
  };
}

/**
 * Get total keyword count for statistics.
 * @returns Total number of keywords across all entity types
 */
export function getKeywordStats(): Record<string, number> {
  const stats: Record<string, number> = {};
  let total = 0;

  for (const [entityType, keywords] of Object.entries(INTENT_KEYWORDS)) {
    stats[entityType] = keywords.length;
    total += keywords.length;
  }

  stats['total'] = total;
  return stats;
}
