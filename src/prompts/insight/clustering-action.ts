/**
 * Customer Clustering Action Prompt Template
 * Generates structured prompts for LLM to analyze clustering results
 * and provide business insights with customer segment strategies
 */

import type { InsightContext, AggregatedFeatures } from '../../types/insight-action.types';

/**
 * Build prompt for customer clustering decision-making
 * Uses three-stage design: Role → Few-Shot → Task
 * 
 * @param context Insight context (table metadata, feature definitions)
 * @param aggregated Aggregated cluster features and statistics
 * @returns Complete prompt for LLM
 */
export function buildClusteringActionPrompt(
  context: InsightContext,
  aggregated: AggregatedFeatures
): string {
  const { tableMetadata } = context;
  const totalCustomers = aggregated.totalCustomers || 0;
  const numClusters = aggregated.clusters?.length || 0;
  
  return `
# 角色定位
你是一位资深的电商客户运营专家，负责分析客户聚类结果并制定差异化运营策略。

# 业务背景
- **数据表名**: ${tableMetadata.tableName}
- **客户总数**: ${totalCustomers.toLocaleString()} 位
- **聚类数量**: ${numClusters} 个
- **分析维度**: RFM（最近购买时间、购买频次、消费金额）

# RFM 全局统计
${formatRFMStats(aggregated.rfmStats)}

# 客户群体分布

${formatClusterDistribution(aggregated.clusters)}

# 样本客户数据（每个群体抽样）

${formatSampleCustomers(aggregated.sampleCustomers)}

---

# Few-Shot 示例

为了帮助你更好地理解分析思路，以下是几个典型案例：

## 示例 1: 典型五簇分割

**数据特征**: 
- **群体 0 (Champions)**: 300人，R=5天，F=15次，M=¥50,000，占总价值40%
- **群体 1 (Loyal)**: 500人，R=15天，F=8次，M=¥20,000，占总价值25%
- **群体 2 (Promising)**: 800人，R=30天，F=3次，M=¥5,000，占总价值15%
- **群体 3 (At Risk)**: 400人，R=90天，F=12次，M=¥15,000，占总价值12%
- **群体 4 (Lost)**: 1000人，R=180天，F=2次，M=¥2,000，占总价值8%

**诊断**: 发现标准的五层客户金字塔结构，高价值客户集中在顶部，需要差异化运营策略

**关键模式**:
1. **Champions群体**虽然人数少但贡献40%的价值，是最核心资产
2. **At Risk群体**最近购买时间长但历史频次高，存在流失风险
3. **Lost群体**人数最多但价值最低，可能需要重新激活或放弃

**行动建议**:
- { "action": "为Champions群体设立专属VIP服务，提供私人客服和优先发货", "priority": "high", "reason": "保护核心客户，防止流失" }
- { "action": "向At Risk群体推送唤醒优惠券（满200减50），限时7天", "priority": "high", "reason": "抢救高价值流失客户" }
- { "action": "对Promising群体进行精准推荐，提升复购频次", "priority": "medium", "reason": "培养潜力客户成长为Loyal客户" }
- { "action": "停止向Lost群体发送营销短信，节约营销成本", "priority": "low", "reason": "聚焦高价值客户，避免资源浪费" }

## 示例 2: 发现羊毛党群体

**数据特征**:
- **群体 2 (Bargain Hunters)**: 2000人，R=7天，F=20次，M=¥1,000（人均每单¥50）
- 该群体订单金额集中在优惠券最大值附近（如满99减50）
- 购买时间集中在活动期，非活动期几乎无购买

**诊断**: 发现典型的羊毛党群体，利用优惠规则频繁下单但客单价极低

**关键模式**:
1. 高频次（F=20）但低消费（M=¥1,000），客单价仅¥50
2. 订单金额呈现明显的"计算痕迹"，集中在优惠券临界值
3. 购买行为高度集中在促销期

**行动建议**:
- { "action": "调整优惠券规则，设置单用户领取上限（如每月5张）", "priority": "high", "reason": "限制羊毛党过度薅羊毛" }
- { "action": "对该群体实施差异化定价，提高优惠券门槛（如满199减50）", "priority": "medium", "reason": "提升客单价，筛选真实用户" }
- { "action": "建立羊毛党识别模型，自动标记并限制优惠发放", "priority": "medium", "reason": "建立长效风控机制" }

## 示例 3: 发现高净值新客

**数据特征**:
- **群体 1 (High-Value Newcomers)**: 150人，R=10天，F=2次，M=¥30,000（人均每单¥15,000）
- 客单价远超其他群体（全局平均¥500）
- 购买品类集中在高端商品（如电子产品、奢侈品）

**诊断**: 发现一批高净值新客户，虽然购买次数少但消费能力强

**关键模式**:
1. 极高的客单价（¥15,000 vs 全局¥500）
2. 新客户（F=2）但消费金额高（M=¥30,000）
3. 最近活跃（R=10天），增长潜力大

**行动建议**:
- { "action": "立即为该群体分配专属客户经理，提供一对一服务", "priority": "high", "reason": "抓住高净值客户，建立长期关系" }
- { "action": "推送高端新品和限量款，匹配其消费能力", "priority": "high", "reason": "提升复购率，快速转化为Champions客户" }
- { "action": "邀请加入品牌会员计划，提供专属权益（如优先购、免费退换）", "priority": "medium", "reason": "增强客户粘性和归属感" }

---

# 你的任务

请基于以上业务背景和样本数据，**用中文**完成以下分析：

## 1. 核心诊断 (diagnosis)
- 用1-2句话概括客户群体的整体特征
- 指出最重要的业务洞察（如"20%的客户贡献80%的价值"）

## 2. 关键模式 (keyPatterns)
- 列出2-3个最重要的客户群体特征（数组格式）
- 每个模式包含具体的数据支撑（如"群体0平均消费¥50,000，是全局平均的10倍"）

## 3. 行动建议 (recommendations)
- 提供3-5条具体的、可执行的运营策略
- 每条建议必须包含：
  - **action**: 具体做什么（如"为Champions群体设立专属VIP服务"）
  - **priority**: 优先级（"high" | "medium" | "low"）
  - **reason**: 为什么要这么做（商业价值）
  - **estimatedImpact**: 预期效果（可选，如"预计提升20%复购率"）

## 4. 置信度 (confidence)
- 评估分析的可靠性：
  - **high**: 数据充分，模式明显，建议可信度高
  - **medium**: 数据基本充分，模式较明显
  - **low**: 数据不足或模式不明显

---

# 输出格式要求

请严格按照以下 JSON 格式输出（不要包含其他文字）：

\`\`\`json
{
  "diagnosis": "核心诊断（1-2句话）",
  "keyPatterns": [
    "关键模式1（含数据支撑）",
    "关键模式2（含数据支撑）",
    "关键模式3（含数据支撑）"
  ],
  "recommendations": [
    {
      "action": "具体行动建议",
      "priority": "high",
      "reason": "商业理由",
      "estimatedImpact": "预期效果（可选）"
    }
  ],
  "confidence": "high"
}
\`\`\`

**注意事项**:
1. 所有内容必须用中文
2. 必须基于实际数据，不要编造数字
3. 建议要具体可执行，避免空泛的口号
4. 优先关注高价值客户群体（Champions、High-Value等）
5. 识别流失风险客户（At Risk、Lost），提出挽回策略
`.trim();
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format RFM global statistics
 */
function formatRFMStats(rfmStats?: {
  globalAvgRecency: number;
  globalAvgFrequency: number;
  globalAvgMonetary: number;
}): string {
  if (!rfmStats) {
    return '（无全局统计数据）';
  }
  
  return `
- **平均最近购买**: ${rfmStats.globalAvgRecency.toFixed(1)} 天前
- **平均购买频次**: ${rfmStats.globalAvgFrequency.toFixed(1)} 次
- **平均消费金额**: ¥${rfmStats.globalAvgMonetary.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}
`.trim();
}

/**
 * Format cluster distribution table
 */
function formatClusterDistribution(clusters?: Array<{
  clusterId: number;
  label?: string;
  customerCount: number;
  avgRecency: number;
  avgFrequency: number;
  avgMonetary: number;
  totalValue: number;
  valueShare: number;
}>): string {
  if (!clusters || clusters.length === 0) {
    return '（无聚类数据）';
  }
  
  const rows = clusters.map(c => {
    const label = c.label ? ` (${c.label})` : '';
    return `| 群体 ${c.clusterId}${label} | ${c.customerCount.toLocaleString()} | ${c.avgRecency.toFixed(0)}天 | ${c.avgFrequency.toFixed(1)}次 | ¥${c.avgMonetary.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} | ¥${c.totalValue.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} | ${c.valueShare.toFixed(1)}% |`;
  }).join('\n');
  
  return `
| 群体 | 客户数 | 平均R | 平均F | 平均M | 总价值 | 价值占比 |
|------|--------|-------|-------|-------|--------|----------|
${rows}
`.trim();
}

/**
 * Format sample customers from each cluster
 */
function formatSampleCustomers(samples?: Array<{
  clusterId: number;
  customers: Array<{
    customerId: string;
    recency: number;
    frequency: number;
    monetary: number;
  }>;
}>): string {
  if (!samples || samples.length === 0) {
    return '（无样本数据）';
  }
  
  const sections = samples
    .filter(s => s.customers.length > 0)
    .map(s => {
      const customerList = s.customers.slice(0, 5).map(c => 
        `  - 客户 ${c.customerId}: R=${c.recency}天, F=${c.frequency}次, M=¥${c.monetary.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`
      ).join('\n');
      
      const total = s.customers.length;
      const suffix = total > 5 ? `\n  - （还有 ${total - 5} 位客户...）` : '';
      
      return `**群体 ${s.clusterId}** (共 ${total} 位样本客户):\n${customerList}${suffix}`;
    })
    .join('\n\n');
  
  return sections;
}
