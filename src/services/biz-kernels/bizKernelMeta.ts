/**
 * @file bizKernelMeta.ts
 * @description Hardcoded business kernel metadata
 * Following naming convention: fn_[industry]_[kernel]_[function]
 * This file serves as the initial data source before backend integration
 */

import type { BizKernelMetadata } from './types';

/**
 * Seed business kernels - 10 initial operators
 * Based on suanzi.md business logic
 */
export const SEED_KERNELS: BizKernelMetadata[] = [
  // 基础洞察 - 订单分布
  {
    name: 'fn_ecom_order_distribution',
    displayName: '订单分布分析',
    industry: '电商/订单',
    category: '基础洞察',
    version: '1.0.0',
    description: '快速分析订单金额分布，洞察订单量趋势',
    detailedDescription:
      '基于订单数据，分析订单金额分布、订单量趋势、客单价变化等核心指标。支持按日/周/月维度聚合，帮助运营人员快速掌握业务走势。',
    author: 'official',
    likes: 120,
    credits: 100,
    dataVolume: '5w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['order_id', 'amount', 'order_time'],
      outputFields: ['date', 'order_count', 'total_amount', 'avg_amount'],
      constraints: ['需要订单时间字段'],
    },
  },

  // 基础洞察 - 基础统计
  {
    name: 'fn_ecom_basic_stats',
    displayName: '基础统计分析',
    industry: '电商/订单',
    category: '基础洞察',
    version: '1.0.0',
    description: '代替 Excel 透视表，秒级响应的基础统计',
    detailedDescription:
      '提供订单数据的基础统计能力，包括计数、求和、平均值、最大最小值等。支持多维度分组统计，替代传统 Excel 透视表操作。',
    author: 'official',
    likes: 98,
    credits: 80,
    dataVolume: '10w order',
    estimatedTime: '1s',
    metadata: {
      inputFields: ['*'],
      outputFields: ['count', 'sum', 'avg', 'min', 'max'],
      constraints: [],
    },
  },

  // 风险风控 - 异常金额
  {
    name: 'fn_ecom_abnormal_amount',
    displayName: '异常金额监控',
    industry: '电商/订单',
    category: '风险风控',
    version: '1.0.0',
    description: '快速分析订单金额分布，洞察非正常订单',
    detailedDescription:
      '通过统计分析和 Z-Score 算法，识别异常订单金额。可发现刷单、价格错误、优惠叠加异常等风险订单，帮助财务及时止损。',
    author: 'official',
    likes: 156,
    credits: 150,
    dataVolume: '5w order',
    estimatedTime: '3s',
    metadata: {
      inputFields: ['order_id', 'amount', 'original_amount'],
      outputFields: ['order_id', 'amount', 'z_score', 'risk_level'],
      constraints: ['需要原始金额字段用于计算折扣率'],
    },
  },

  // 风险风控 - 价格套利审计
  {
    name: 'fn_ecom_arbitrage_analyze',
    displayName: '价格套利分析',
    industry: '电商/订单',
    category: '风险风控',
    version: '1.0.0',
    description: '发现利润流失点，保障资产安全',
    detailedDescription:
      '扫描异常毛利（Margin < 0）或异常折扣比例，找出价格明显低于均值的订单。结合 LLM 总结异常原因，如人为设置错误或营销规则重叠。',
    author: 'official',
    likes: 203,
    credits: 200,
    dataVolume: '10w order',
    estimatedTime: '5s',
    metadata: {
      inputFields: ['order_id', 'amount', 'cost', 'coupon_amount'],
      outputFields: ['order_id', 'margin', 'discount_rate', 'risk_type'],
      constraints: ['需要成本字段计算毛利'],
    },
  },

  // 用户增长 - RFM 画像
  {
    name: 'fn_ecom_rfm_profile',
    displayName: 'RFM 用户画像',
    industry: '电商/订单',
    category: '用户增长',
    version: '1.0.0',
    description: '提升 LTV，识别流失风险',
    detailedDescription:
      '基于 RFM 模型（Recency, Frequency, Monetary）对用户进行分群。自动识别高价值用户、流失风险用户，支持 K-Means 聚类分析。',
    author: 'official',
    likes: 245,
    credits: 200,
    dataVolume: '5w order',
    estimatedTime: '10s',
    metadata: {
      inputFields: ['user_id', 'order_time', 'amount'],
      outputFields: ['user_id', 'r_score', 'f_score', 'm_score', 'segment'],
      constraints: ['需要用户ID字段'],
    },
  },

  // 用户增长 - 复购周期
  {
    name: 'fn_ecom_repurchase_cycle',
    displayName: '复购周期分析',
    industry: '电商/订单',
    category: '用户增长',
    version: '1.0.0',
    description: '识别流失边缘用户，直接用于私域挽回',
    detailedDescription:
      '自动识别用户的首次下单时间、末次下单时间，计算平均下单间隔（AOV）。实时标记处于"流失边缘"的用户名单，一键生成流失预警表。',
    author: 'official',
    likes: 178,
    credits: 150,
    dataVolume: '5w order',
    estimatedTime: '4s',
    metadata: {
      inputFields: ['user_id', 'order_time'],
      outputFields: ['user_id', 'first_order', 'last_order', 'avg_interval', 'churn_risk'],
      constraints: ['需要用户ID和订单时间'],
    },
  },

  // 经营决策 - 库存预测
  {
    name: 'fn_ecom_inventory_forecast',
    displayName: '库存预测分析',
    industry: '电商/商品',
    category: '经营决策',
    version: '1.0.0',
    description: '指导备货与营销策略',
    detailedDescription:
      '基于历史销售数据和趋势分析，预测未来库存需求。帮助商家优化库存周转，避免缺货或积压。',
    author: 'official',
    likes: 134,
    credits: 180,
    dataVolume: '10w order',
    estimatedTime: '8s',
    metadata: {
      inputFields: ['product_id', 'quantity', 'order_time'],
      outputFields: ['product_id', 'forecast_demand', 'safety_stock'],
      constraints: ['需要商品ID字段'],
    },
  },

  // 经营决策 - 关联销售建议
  {
    name: 'fn_ecom_market_basket',
    displayName: '关联销售建议',
    industry: '电商/商品',
    category: '经营决策',
    version: '1.0.0',
    description: '直接生成搭配套餐建议，提升客单价',
    detailedDescription:
      '利用 DuckDB 的 Self-Join 能力快速计算商品共现矩阵。LLM 将相关系数转化为业务建议："建议将商品 A 和 B 捆绑销售，因为 70% 的高端用户会同时下单"。',
    author: 'official',
    likes: 189,
    credits: 200,
    dataVolume: '10w order',
    estimatedTime: '15s',
    metadata: {
      inputFields: ['order_id', 'product_id'],
      outputFields: ['product_a', 'product_b', 'support', 'confidence', 'lift'],
      constraints: ['需要订单ID和商品ID'],
    },
  },

  // 运营细节 - 履约时效
  {
    name: 'fn_ecom_fulfillment_efficiency',
    displayName: '履约时效分析',
    industry: '电商/订单',
    category: '运营细节',
    version: '1.0.0',
    description: '优化服务细节，从数据到直觉的跨越',
    detailedDescription:
      '计算各地区、各快递服务商、各时段的履约时序分布。利用 DuckDB 的时间序列函数找出延迟节点，一眼看出哪家快递在拖后腿。',
    author: 'official',
    likes: 112,
    credits: 120,
    dataVolume: '5w order',
    estimatedTime: '5s',
    metadata: {
      inputFields: ['order_id', 'pay_time', 'ship_time', 'receive_time', 'region', 'carrier'],
      outputFields: ['region', 'carrier', 'avg_pay_to_ship', 'avg_ship_to_receive'],
      constraints: ['需要支付、发货、签收时间'],
    },
  },

  // 运营细节 - 语义标签生成
  {
    name: 'fn_ecom_semantic_tagging',
    displayName: '智能语义标签',
    industry: '电商/营销',
    category: '运营细节',
    version: '1.0.0',
    description: '将订单行变成鲜活的用户画像',
    detailedDescription:
      'LLM 采样分析订单中的备注、商品描述，结合 DuckDB 的聚合结果，为用户自动打标签（如："精致妈妈"、"羊毛党"、"大宗团购商"）。让数据分析具有"叙事性"。',
    author: 'official',
    likes: 167,
    credits: 250,
    dataVolume: '2w order',
    estimatedTime: '20s',
    metadata: {
      inputFields: ['user_id', 'remark', 'product_name', 'address'],
      outputFields: ['user_id', 'tags', 'persona'],
      constraints: ['需要备注或商品描述字段'],
    },
  },
];

/**
 * Get all kernel metadata
 */
export function getAllKernels(): BizKernelMetadata[] {
  return [...SEED_KERNELS];
}

/**
 * Get kernel by name
 */
export function getKernelByName(name: string): BizKernelMetadata | undefined {
  return SEED_KERNELS.find((k) => k.name === name);
}

/**
 * Get kernels by industry
 */
export function getKernelsByIndustry(industry: string): BizKernelMetadata[] {
  return SEED_KERNELS.filter((k) => k.industry === industry);
}

/**
 * Get kernels by category
 */
export function getKernelsByCategory(category: string): BizKernelMetadata[] {
  return SEED_KERNELS.filter((k) => k.category === category);
}

/**
 * Get unique industries from kernels
 */
export function getIndustries(): string[] {
  return [...new Set(SEED_KERNELS.map((k) => k.industry))];
}

/**
 * Get unique categories from kernels
 */
export function getCategories(): string[] {
  return [...new Set(SEED_KERNELS.map((k) => k.category))];
}
