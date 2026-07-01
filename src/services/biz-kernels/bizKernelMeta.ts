/**
 * @file bizKernelMeta.ts
 * @description Hardcoded business kernel metadata
 * Following naming convention: fn_[industry]_[kernel]_[function]
 * This file serves as the initial data source before backend integration
 */

import type { BizKernelMetadata } from './types';

/**
 * Seed business kernels - 11 initial operators
 * Based on suanzi.md business logic
 */
export const SEED_KERNELS: BizKernelMetadata[] = [
  // 数据清洗
  // done
  {
    name: 'fn_ecom_data_clean_replace_spec_column_value',
    displayName: '数据清洗，替换特定列值',
    industry: '电商/订单',
    category: '数据清洗',
    version: '1.0.0',
    description: '简单，快速替换指定列的值',
    detailedDescription:
        '简单，快速替换指定列的值，支持多列，动态绑定条件',
    author: 'official',
    likes: 234,
    credits: 100,
    dataVolume: '10w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['*'],
      outputFields: ['*'],
      constraints: ['单个、多个文'],
    },
  },
  // 数据清洗
  // done
  {
    name: 'fn_ecom_data_clean_up_lower',
    displayName: '数据清洗，转换大小写',
    industry: '电商/订单',
    category: '数据清洗',
    version: '1.0.0',
    description: '简单，快速转换列值大小写',
    detailedDescription:
        '简单，快速转换列值大小写，支持多列，动态绑定条件',
    author: 'official',
    likes: 234,
    credits: 100,
    dataVolume: '10w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['*'],
      outputFields: ['*'],
      constraints: ['单个、多个文档'],
    },
  },
  // 数据清洗
  // done
  {
    name: 'fn_ecom_data_clean_number_precision_control',
    displayName: '数据清洗，金额相关数字精度控制',
    industry: '电商/订单',
    category: '数据清洗',
    version: '1.0.0',
    description: '简单，快速金额相关数字精度控制',
    detailedDescription:
        '简单，快速金额相关数字精度控制，支持多列，动态绑定条件',
    author: 'official',
    likes: 234,
    credits: 100,
    dataVolume: '10w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['*'],
      outputFields: ['*'],
      constraints: ['单个、多个文档'],
    },
  },
  // 数据清洗
  // done
  {
    name: 'fn_ecom_data_clean_data_flag',
    displayName: '数据清洗，数据标记',
    industry: '电商/订单',
    category: '数据清洗',
    version: '1.0.0',
    description: '简单，快速自定义数据标记',
    detailedDescription:
        '简单，快速自定义数据标记，支持多列，动态绑定条件',
    author: 'official',
    likes: 234,
    credits: 100,
    dataVolume: '10w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['*'],
      outputFields: ['*'],
      constraints: ['单个、多个文档'],
    },
  },
  // 数据清洗
  // done
  {
    name: 'fn_ecom_data_format_date',
    displayName: '数据清洗，时间格式化',
    industry: '电商/订单',
    category: '数据清洗',
    version: '1.0.0',
    description: '简单，快速自定义时间列格式',
    detailedDescription:
        '简单，快速自定义时间列格式，支持多列，动态绑定条件',
    author: 'official',
    likes: 234,
    credits: 100,
    dataVolume: '10w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['*'],
      outputFields: ['*'],
      constraints: ['单个、多个文档'],
    },
  },
  // 基础洞察 - 关联查询（单表/多表查询）
  // done
  {
    name: 'fn_ecom_association_query',
    displayName: '关联查询',
    industry: '电商/订单',
    category: '基础洞察',
    version: '1.0.0',
    description: '寻找不同维度间的隐藏相关性，而非仅仅合并报表',
    detailedDescription:
      '当单表数据无法解释业务异动（如：销量下滑但流量没变）时，应关联用户信息或促销表进行多维交叉',
    author: 'official',
    likes: 234,
    credits: 100,
    dataVolume: '10w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['*'],
      outputFields: ['*'],
      constraints: ['至少需要一个数据表'],
    },
  },

  // 基础洞察 - 订单分布
  // done
  {
    name: 'fn_ecom_order_distribution',
    displayName: '订单分布分析',
    industry: '电商/订单',
    category: '运营复盘',
    version: '1.0.0',
    description: '分析订单在时间趋势、金额区间、地域三个维度的分布，支持同比/环比对比',
    detailedDescription:
      '基于订单数据，提供三维度分布分析：时间趋势（按日/周/月聚合）、金额区间分布（用户自定义分桶）、地域分布（用户选择地域列）。三个维度均支持同比（年同期）和环比（上一周期）对比分析。',
    author: 'official',
    likes: 120,
    credits: 100,
    dataVolume: '5w order',
    estimatedTime: '2s',
    group: 'fn_ecom_order_distribution',
    metadata: {
      inputFields: ['order_id', 'order_time', 'amount', '地域列(用户选择)'],
      outputFields: ['period/bucket/region', 'order_count', 'total_amount', 'avg_amount', 'cmp_*', 'change_pct'],
      constraints: ['需要订单时间字段', '需要订单金额字段', '时间趋势/地域分布的同比环比需指定时间范围'],
    },
  },

  // 基础洞察 - 基础统计
  // done
  {
    name: 'fn_basic_statis',
    displayName: '基础统计分析',
    industry: '通用',
    category: '基础洞察',
    version: '1.0.0',
    description: '对数据进行聚合统计分析，支持 COUNT、SUM、AVG、MAX、MIN、百分位等函数',
    detailedDescription:
      '提供数据的基础统计能力，包括计数、求和、平均值、最大最小值、百分位等。支持多维度分组统计，替代传统 Excel 透视表操作。',
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
  // done
  {
    name: 'fn_ecom_abnormal_amount',
    displayName: '异常金额监控',
    industry: '电商/订单',
    category: '风险风控',
    version: '1.0.0',
    description: '快速分析订单金额分布，洞察非正常订单',
    detailedDescription:
      '识别异常订单金额。可发现刷单、价格错误、优惠叠加异常等风险订单，帮助财务及时止损。',
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
  // done
  {
    name: 'fn_ecom_arbitrage_analyze',
    displayName: '价格套利分析',
    industry: '电商/订单',
    category: '风险风控',
    version: '1.0.0',
    description: '对比实付价格与成本红线',
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
      // reasoning_hints: {
      //   abnormal_margin_causes: ["营销活动规则冲突", "系统定价配置错误", "优惠券叠加漏洞"],
      //   correlation_map: {
      //     low_margin: ["check_coupon_stacking", "verify_cost_basis"],
      //     high_discount: ["validate_marketing_rule"]
      //   }
      // }
    },
  },

  // 用户增长 - RFM 画像
  // done
  {
    name: 'fn_ecom_rfm_profile',
    displayName: 'RFM 用户画像',
    industry: '电商/订单',
    category: '用户增长',
    version: '1.0.0',
    description: '识别“重要深耕”与“濒临流失”用户',
    detailedDescription:
      '不要对所有人发券。对高贡献用户做服务升级，对流失边缘用户做定向激励，实现 ROI 最大化',
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
  // done
  {
    name: 'fn_ecom_repurchase_cycle',
    displayName: '复购周期分析',
    industry: '电商/订单',
    category: '用户增长',
    group: 'fn_ecom_repurchase_cycle',
    version: '1.0.0',
    description: '计算品类的平均消耗时间',
    detailedDescription:
      '自动识别用户的首次下单时间、末次下单时间，计算平均下单间隔AOI（Average Order Interval）。实时标记处于"流失边缘"的用户名单，一键生成流失预警表。',
    author: 'official',
    likes: 178,
    credits: 150,
    dataVolume: '5w order',
    estimatedTime: '4s',
    metadata: {
      inputFields: ['user_id', 'order_time', 'category'],
      outputFields: ['user_id', 'category', 'first_order', 'last_order', 'order_count', 'avg_cycle_days', 'current_interval_days', 'risk_level'],
      constraints: ['需要用户ID、订单时间、商品类目字段'],
    },
  },

  // 经营决策 - 库存预测
  // done
  {
    name: 'fn_ecom_inventory_forecast',
    displayName: '库存预测分析',
    industry: '电商/商品',
    category: '经营决策',
    version: '1.0.0',
    description: '结合销售趋势与采购周期',
    detailedDescription:
      '基于历史销售数据和趋势分析，预测未来库存需求。帮助商家优化库存周转，避免缺货或积压。',
    author: 'official',
    likes: 134,
    credits: 180,
    dataVolume: '10w order',
    estimatedTime: '8s',
    metadata: {
      inputFields: ['order_id','product_id','product_name', 'quantity', 'order_time'],
      outputFields: ['product_id', 'avg_demand','total_demand','trand', 'safety_stock'],
      constraints: ['需要商品ID字段'],
    },
  },

  // 经营决策 - 关联销售建议
  // done
  {
    name: 'fn_ecom_market_basket',
    displayName: '关联销售建议',
    industry: '电商/商品',
    category: '经营决策',
    version: '1.0.0',
    description: '分析 A 产品与 B 产品的共同购买概率',
    detailedDescription:
      '发现“非直觉型”关联（如：买尿布的人常买啤酒）。基于此调整页面布局或套装组合，而非仅推荐同类品',
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
    description: '拆解从下单、出库到签收的全链路时长',
    detailedDescription:
      '若异常点集中在“出库”，重点优化仓储流程；若在“末端派送”，则需重新评估物流承运商。',
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
    description: '将非结构化的评价转化为情感标签',
    detailedDescription:
      '采样分析订单中的备注、商品描述，为用户自动打标签（如："精致妈妈"、"羊毛党"、"大宗团购商"）。',
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
  // 运营细节 - 业务指标复杂度评估
  {
    name: 'fn_ecom_biz_complexity_calc',
    displayName: '业务指标复杂度评估',
    industry: '电商/营销',
    category: '运营细节',
    version: '1.0.0',
    description: '对多维度业务指标进行综合评估',
    detailedDescription:
        '识别业务复杂度，如极度复杂，复杂，适中，简单等。帮助运营人员快速聚焦在“极度复杂”或“复杂”的指标上进行优化，而非平均分配精力在所有指标上。',
    author: 'official',
    likes: 167,
    credits: 250,
    dataVolume: '10w order',
    estimatedTime: '<5s',
    metadata: {
      inputFields: ['biz_type', 'score1', 'score2', 'score3','...'],
      outputFields: ['biz_type', 'complexity_range'],
      constraints: ['多维度业务指标数据，如订单金额、订单频次、用户活跃度等'],
    },
  },
  {
    name: 'fn_ecom_order_net_amount_calc',
    displayName: '订单净额计算（退款后实收）',
    industry: '电商/订单',
    category: '订单核算',
    version: '1.0.0',
    description: '自动计算退款/取消后真实营收净额',
    detailedDescription:
        '按电商标准口径计算：订单净额 = 实付金额 - 退款金额 - 拒签金额，自动剔除取消订单，支持按订单/用户/商品三级汇总，解决财务与运营口径不一致问题。',
    author: 'official',
    likes: 320,
    credits: 180,
    dataVolume: '10w order',
    estimatedTime: '2s',
    metadata: {
      inputFields: ['order_id','pay_amount','refund_amount','cancel_status','order_status'],
      outputFields: ['order_id','net_amount','is_valid','refund_rate'],
      constraints: ['需要实付金额、退款金额、订单状态字段']
    }
  },
  {
    name: 'fn_ecom_order_profit_margin_calc',
    displayName: '订单毛利/净利率自动计算',
    industry: '电商/订单',
    category: '订单核算',
    version: '1.0.0',
    description: '自动计算单品/整单毛利、毛利率、负毛利订单标记',
    detailedDescription:
        '毛利=净额-商品成本-运费-平台佣金-服务费，自动识别负毛利订单并标记风险，支持按SKU/类目/渠道汇总，是电商经营分析最核心算子。',
    author: 'official',
    likes: 380,
    credits: 200,
    dataVolume: '10w order',
    estimatedTime: '3s',
    metadata: {
      inputFields: ['net_amount','cost','shipping_fee','platform_fee','service_fee'],
      outputFields: ['gross_profit','gross_margin','is_negative_margin','risk_level'],
      constraints: ['需要成本、各类费用及净额字段']
    }
  },
  {
    name: 'fn_ecom_refund_order_classify',
    displayName: '退款订单智能归类',
    industry: '电商/订单',
    category: '订单核算',
    version: '1.0.0',
    description: '自动区分仅退款、退货退款、拒签、售后、恶意退款',
    detailedDescription:
        '基于退款状态、物流状态、退款原因自动打标分类，输出退款率、退款金额占比、各类型退款分布，用于售后效率与风控分析。',
    author: 'official',
    likes: 290,
    credits: 160,
    dataVolume: '5w order',
    estimatedTime: '3s',
    metadata: {
      inputFields: ['order_id','refund_status','logistics_status','refund_reason'],
      outputFields: ['order_id','refund_type','refund_amount','is_abnormal_refund'],
      constraints: ['需要退款状态与物流状态']
    }
  },
  {
    name: 'fn_ecom_platform_fee_allocate',
    displayName: '平台佣金/服务费自动分摊',
    industry: '电商/订单',
    category: '订单核算',
    version: '1.0.0',
    description: '按金额比例自动分摊佣金、服务费、广告费',
    detailedDescription:
        '解决多商品订单费用分摊难题，支持整单均摊、金额比例分摊、数量比例分摊，自动计算单品真实成本与真实毛利，财务直接可用。',
    author: 'official',
    likes: 260,
    credits: 180,
    dataVolume: '10w order',
    estimatedTime: '4s',
    metadata: {
      inputFields: ['order_id','product_amount','platform_fee','ad_fee','quantity'],
      outputFields: ['allocated_fee','product_net_profit'],
      constraints: ['需要订单费用与商品明细']
    }
  },

  // ==========================
  // 运营复盘类（日常高频）
  // ==========================
  // done
  {
    name: 'fn_ecom_order_channel_analysis',
    displayName: '订单渠道/来源/平台归因分析',
    industry: '电商/订单',
    category: '运营复盘',
    version: '1.0.0',
    description: '按渠道、来源、平台、直播间统计销量、销售额、毛利',
    detailedDescription:
        '自动聚合各渠道订单量、金额、毛利、客单、退款率，输出渠道ROI排名，识别高价值渠道与低效渠道，指导投放预算分配。',
    author: 'official',
    likes: 340,
    credits: 170,
    dataVolume: '10w order',
    estimatedTime: '3s',
    metadata: {
      inputFields: ['channel','source','platform','live_room_id','order_id','net_amount','gross_profit','is_refund','refund_amount'],
      outputFields: ['dimension_label','order_count','total_amount','total_profit','avg_order_value','roi','refund_rate'],
      constraints: ['需要渠道/来源/平台/直播间维度字段之一', '需要订单ID、销售额、毛利字段', '退款率需 is_refund 或 refund_amount 字段']
    }
  },
  {
    name: 'fn_ecom_order_funnel_analysis',
    displayName: '订单全链路漏斗转化分析',
    industry: '电商/订单',
    category: '运营复盘',
    version: '1.0.0',
    description: '自动构建下单→支付→发货→签收→复购转化漏斗',
    detailedDescription:
        '计算各环节流失率、转化率，识别瓶颈节点（如支付流失高、签收流失高），输出可执行优化方向，是运营每日必看。',
    author: 'official',
    likes: 310,
    credits: 160,
    dataVolume: '10w order',
    estimatedTime: '4s',
    metadata: {
      inputFields: ['order_id','create_time','pay_time','confirm_time','ship_time','receive_time','review_time','order_status','user_id'],
      outputFields: ['step','count','conversion_rate','drop_rate','abs_conversion_rate'],
      constraints: ['需要订单各关键时间节点', '复购步骤需要用户ID字段']
    }
  },
  {
    name: 'fn_ecom_activity_effect_split',
    displayName: '活动/优惠券/直播间效果拆分',
    industry: '电商/订单',
    category: '运营复盘',
    version: '1.0.0',
    description: '自动识别活动订单，统计销量、拉动金额、核销率、ROI',
    detailedDescription:
        '按活动、优惠券、直播间、满减、秒杀拆分订单，计算活动净增长、补贴成本、ROI，判断活动是否盈利，避免盲目投流。',
    author: 'official',
    likes: 350,
    credits: 200,
    dataVolume: '10w order',
    estimatedTime: '5s',
    metadata: {
      inputFields: ['activity_id','coupon_id','live_room_id','net_amount','cost'],
      outputFields: ['activity','order_count','lift_amount','roi','cost_rate'],
      constraints: ['需要活动/优惠券/直播间标识']
    }
  },

  // ==========================
  // 风险风控类（电商刚需）
  // ==========================
  {
    name: 'fn_ecom_suspicious_order_detect',
    displayName: '恶意订单/刷单/异常下单检测',
    industry: '电商/订单',
    category: '风险风控',
    version: '1.0.0',
    description: '识别密集下单、同地址/同手机、批量小号、改价异常',
    detailedDescription:
        '基于用户行为、地址、设备、下单频次、金额突变识别刷单、黄牛、恶意薅券、批量测试订单，输出风险等级与证据清单。',
    author: 'official',
    likes: 410,
    credits: 220,
    dataVolume: '10w order',
    estimatedTime: '6s',
    metadata: {
      inputFields: ['user_id','order_time','address','mobile','device_id','amount'],
      outputFields: ['user_id','risk_type','risk_level','order_count_abnormal'],
      constraints: ['需要用户ID、地址、下单时间']
    }
  },
  {
    name: 'fn_ecom_zero_negative_order_detect',
    displayName: '0元单/负单价/异常优惠检测',
    industry: '电商/订单',
    category: '风险风控',
    version: '1.0.0',
    description: '自动扫描0元支付、负金额、优惠叠加溢出、系统错误订单',
    detailedDescription:
        '识别规则冲突、优惠券叠加溢出、后台设置错误导致的异常订单，实时标记并汇总损失，用于财务止损与规则修复。',
    author: 'official',
    likes: 370,
    credits: 200,
    dataVolume: '10w order',
    estimatedTime: '3s',
    metadata: {
      inputFields: ['pay_amount','discount_total','product_amount'],
      outputFields: ['order_id','abnormal_type','loss_amount','risk_level'],
      constraints: ['需要支付金额与优惠金额']
    }
  },

  // ==========================
  // 经营指标类（老板视角）
  // ==========================
  {
    name: 'fn_ecom_daily_biz_summary',
    displayName: '店铺每日经营全景汇总',
    industry: '电商/订单',
    category: '经营决策',
    version: '1.0.0',
    description: '一键输出销售额、毛利、退款、费用、净利的日汇总',
    detailedDescription:
        '替代手工做日报，自动按天聚合核心经营指标，输出趋势、环比、同比，直接用于老板看板、经营会议、大促复盘。',
    author: 'official',
    likes: 420,
    credits: 200,
    dataVolume: '10w order',
    estimatedTime: '4s',
    metadata: {
      inputFields: ['order_date','net_amount','gross_profit','refund_amount','fee_total'],
      outputFields: ['date','order_cnt','sales','profit','refund_rate','net_profit'],
      constraints: ['需要订单日期与核心金额字段']
    }
  },
  {
    name: 'fn_ecom_sku_sales_analysis',
    displayName: 'SKU/SPU销量毛利排行分析',
    industry: '电商/商品',
    category: '经营决策',
    version: '1.0.0',
    description: '按SKU/SPU统计销量、销额、毛利、售罄、动销率',
    detailedDescription:
        '自动识别爆款、利润款、滞销款，计算售罄率、动销率、库存健康度，指导补货、清仓、下架、定价策略。',
    author: 'official',
    likes: 330,
    credits: 180,
    dataVolume: '10w order',
    estimatedTime: '5s',
    metadata: {
      inputFields: ['product_id','sku_id','category','net_amount','gross_profit','quantity'],
      outputFields: ['product_id','sales','profit','sell_through_rate','is_slow_moving'],
      constraints: ['需要商品ID、销量、金额']
    }
  },
  {
    "name": "fn_ecom_traffic_conversion_funnel",
    "displayName": "流量转化漏斗分析（曝光→下单）",
    "industry": "电商/流量",
    "category": "运营复盘",
    "version": "1.0.0",
    "description": "全链路转化漏斗：曝光→点击→加购→下单→支付成功",
    "detailedDescription": "自动统计各渠道/页面的流量漏斗转化率，包括曝光量、点击量、加购量、下单量、支付成功量。支持按日/小时维度输出，自动标记流失最严重的环节（如加购未支付、支付失败），帮助运营快速定位转化瓶颈。",
    "author": "official",
    "likes": 0,
    "credits": 200,
    "dataVolume": "10w 用户行为",
    "estimatedTime": "5s",
    "metadata": {
      "inputFields": ["user_id", "session_id", "event_type", "event_time", "page_url", "product_id", "amount"],
      "outputFields": ["date", "channel", "impression", "click", "add_to_cart", "order_created", "order_paid", "click_rate", "cart_rate", "order_rate", "payment_rate"],
      "constraints": ["需要埋点事件类型（impression/click/add_to_cart/create_order/pay_success）"]
    }
  },
  {
    "name": "fn_ecom_inventory_turnover",
    "displayName": "库存周转与滞销预警",
    "industry": "电商/商品",
    "category": "经营决策",
    "version": "1.0.0",
    "description": "计算SKU/类目的库存周转天数、库龄分布、滞销品自动标记",
    "detailedDescription": "基于销售出库数据和当前库存，自动计算各SKU/类目的库存周转天数（销售成本/平均库存）、库龄分布（30/60/90天以上未动销）。输出滞销品清单（如>60天无销售），并给出清仓建议优先级。帮助运营减少资金占用，优化补货决策。",
    "author": "official",
    "likes": 0,
    "credits": 180,
    "dataVolume": "10w 订单明细 + 库存快照",
    "estimatedTime": "6s",
    "metadata": {
      "inputFields": ["product_id", "sku_id", "category", "current_stock", "cost_price", "last_sale_date", "daily_sales_qty_30d", "stock_age_days"],
      "outputFields": ["product_id", "turnover_days", "stock_age_bucket", "is_slow_moving", "slow_moving_days", "suggested_action"],
      "constraints": ["需要当前库存、最近销售日期或近30天日均销量"]
    }
  },
  {
    "name": "fn_ecom_user_lifecycle_stage",
    "displayName": "用户生命周期阶段划分",
    "industry": "电商/用户",
    "category": "用户增长",
    "version": "1.0.0",
    "description": "将用户自动划分为新客、活跃、沉睡、流失、高价值等阶段",
    "detailedDescription": "基于用户最近下单时间、累计订单金额、购买频次，按照行业标准规则（可自定义阈值）将用户划分为：新客（首单30天内）、活跃（近30天有复购）、普通（30-90天未购）、沉睡（90-180天未购）、流失（>180天未购）、高价值（累计金额Top 10%）。输出各阶段人数、贡献销售额占比，并推荐运营动作（如发送唤醒券）。",
    "author": "official",
    "likes": 0,
    "credits": 150,
    "dataVolume": "5w 用户",
    "estimatedTime": "4s",
    "metadata": {
      "inputFields": ["user_id", "first_order_time", "last_order_time", "total_amount", "order_count", "avg_order_interval"],
      "outputFields": ["user_id", "lifecycle_stage", "days_since_last_order", "stage_suggested_action", "is_high_value"],
      "constraints": ["需要用户首次/末次下单时间、累计金额、订单频次"]
    }
  }
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
