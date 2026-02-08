/**
 * Anomaly Detection Action Prompt Template
 * Generates structured prompts for LLM to analyze anomaly detection results
 * and provide business insights with actionable recommendations
 */

import type { InsightContext, AggregatedFeatures } from '../../types/insight-action.types';

/**
 * Build prompt for anomaly detection decision-making
 * Uses three-stage design: Role → Few-Shot → Task
 * 
 * @param context Insight context (table metadata, feature definitions)
 * @param aggregated Aggregated anomaly features and statistics
 * @returns Complete prompt for LLM
 */
export function buildAnomalyActionPrompt(
  context: InsightContext,
  aggregated: AggregatedFeatures
): string {
  const { tableMetadata, featureDefinitions } = context;
  const totalAnomalies = aggregated.totalAnomalies || 0;
  const averageScore = aggregated.averageScore || 0;
  const anomalyRate = tableMetadata.rowCount > 0 
    ? ((totalAnomalies / tableMetadata.rowCount) * 100).toFixed(2)
    : '0.00';
  
  return `
# 角色定位
你是一位资深的电商风控专家，负责分析异常订单并提供决策建议。

# 业务背景
- **数据表名**: ${tableMetadata.tableName}
- **总订单数**: ${tableMetadata.rowCount.toLocaleString()} 笔
- **异常订单数**: ${totalAnomalies.toLocaleString()} 笔
- **异常率**: ${anomalyRate}%
- **平均异常评分**: ${averageScore.toFixed(3)}

# 特征说明
${Object.entries(featureDefinitions)
  .map(([col, desc]) => `- **${col}**: ${desc}`)
  .join('\n')}

# 数据对比分析

## 数值特征对比（异常订单 vs 全局平均）
${formatNumericFeatures(aggregated.numericFeatures || {})}

## 异常模式发现
${formatTopPatterns(aggregated.topPatterns || {})}

## 可疑行为特征
${formatSuspiciousPatterns(aggregated.suspiciousPatterns || {})}

---

# Few-Shot 示例

为了帮助你更好地理解分析思路，以下是几个典型案例：

## 示例 1: 职业刷单团伙
**数据特征**: 
- 同一IP地址下出现10个不同姓名的订单
- 订单金额集中在200-300元（恰好卡在优惠券临界点）
- 下单时间集中在活动开始后的前5分钟

**诊断**: 发现疑似职业刷单团伙，利用活动规则漏洞批量下单套取优惠

**关键模式**:
1. IP地址复用率异常高
2. 订单金额呈现明显的"计算痕迹"
3. 下单时机高度集中

**行动建议**:
- { "action": "立即冻结该IP下所有未发货订单，人工审核后再处理", "priority": "high", "reason": "防止刷单团伙继续套取优惠" }
- { "action": "调整优惠券规则，增加单IP/单设备领取限制", "priority": "medium", "reason": "从规则层面堵住漏洞" }
- { "action": "启用设备指纹识别，追踪关联账号", "priority": "medium", "reason": "建立长效风控机制" }

## 示例 2: 恶意占库存
**数据特征**:
- 凌晨2-4点下单比例占60%
- 未支付比例高达80%
- 订单商品均为限量款或秒杀商品

**诊断**: 存在明显的"恶意占库存"行为，目的是阻止其他用户购买

**关键模式**:
1. 非正常交易时段（深夜）
2. 低支付转化率
3. 针对性选择高价值商品

**行动建议**:
- { "action": "对未支付订单执行快速自动清理（缩短超时时间至15分钟）", "priority": "high", "reason": "释放被占用的库存" }
- { "action": "限量商品启用'先付款后锁定'机制", "priority": "high", "reason": "防止恶意占库存" }
- { "action": "对凌晨时段订单增加验证码/滑块验证", "priority": "low", "reason": "提高恶意行为成本" }

## 示例 3: 海外转运诈骗
**数据特征**:
- 多个订单收货地址指向同一个集运仓库
- 订单金额较高（单均1000元以上）
- 使用新注册账号（注册时间<7天）

**诊断**: 发现疑似海外转运诈骗风险，可能涉及信用卡盗刷

**关键模式**:
1. 集运仓库地址集中
2. 高客单价 + 新账号的矛盾组合
3. 无历史购买记录

**行动建议**:
- { "action": "联系客户确认实名信息和支付凭证后再发货", "priority": "high", "reason": "防止盗刷导致拒付损失" }
- { "action": "对集运地址订单启用二次验证（短信/邮件确认）", "priority": "medium", "reason": "核实收货人真实性" }
- { "action": "与支付平台联动，核查支付账号风险评级", "priority": "medium", "reason": "从源头识别风险账户" }

---

# 分析任务

请基于以上业务背景和数据对比，找出这批异常订单**最显著的 2-3 个共性偏差**。

## 输出要求

**严格按照以下 JSON 格式输出**（不要输出其他内容）：

\`\`\`json
{
  "diagnosis": "简洁描述这批异常订单的核心问题（不超过100字）",
  "keyPatterns": [
    "关键异常模式1（具体、可量化）",
    "关键异常模式2（具体、可量化）",
    "关键异常模式3（具体、可量化）"
  ],
  "recommendations": [
    {
      "action": "具体行动措施（明确、可执行）",
      "priority": "high|medium|low",
      "reason": "为什么需要这样做（简短说明）"
    },
    {
      "action": "具体行动措施（明确、可执行）",
      "priority": "high|medium|low",
      "reason": "为什么需要这样做（简短说明）"
    },
    {
      "action": "具体行动措施（明确、可执行）",
      "priority": "high|medium|low",
      "reason": "为什么需要这样做（简短说明）"
    }
  ],
  "confidence": 0.85
}
\`\`\`

**重要提示**:
- recommendations 必须是对象数组，每个对象包含 action、priority、reason 三个字段
- priority 只能是 "high"、"medium" 或 "low" 之一
- 所有字段都必须填写，不能缺失

## 语言风格约束

请遵循以下规则：

✅ **应该这样说**:
- "我们发现这批订单中有60%集中在凌晨2-4点下单"
- "异常订单的平均金额比全局高出35%"
- "建议立即冻结涉及的15个IP地址"

❌ **不要这样说**:
- "根据数据显示..." "从统计学角度..."
- "建议进行进一步分析..." "需要持续监控..."
- "可能存在..." "或许是..." "大概..."

**核心原则**:
1. 直接说结论，像在给老板/同事汇报
2. 使用肯定句式，给出明确判断
3. 量化描述，用数字说话
4. 避免解释SQL逻辑或技术细节
5. 聚焦业务风险和行动方案

---

现在，请基于以上信息分析这批异常订单。
`;
}

/**
 * Format numeric features comparison
 */
function formatNumericFeatures(features: Record<string, any>): string {
  if (Object.keys(features).length === 0) {
    return '（暂无数值特征对比数据）';
  }
  
  const lines = Object.entries(features).map(([col, stats]) => {
    const deviation = stats.globalAvg 
      ? ((stats.avg - stats.globalAvg) / stats.globalAvg * 100).toFixed(1)
      : 'N/A';
    
    const trend = stats.globalAvg 
      ? (stats.avg > stats.globalAvg ? '↑' : '↓')
      : '';
    
    return `- **${col}**: 异常订单平均 ${stats.avg.toFixed(2)}, 全局平均 ${stats.globalAvg?.toFixed(2) || 'N/A'} ${trend} (偏差 ${deviation}%)`;
  });
  
  return lines.join('\n');
}

/**
 * Format top patterns
 */
function formatTopPatterns(patterns: any): string {
  const sections: string[] = [];
  
  if (patterns.addresses && patterns.addresses.length > 0) {
    const top3 = patterns.addresses.slice(0, 3);
    sections.push(`### Top 收货地址\n${top3.map((a: any) => `- ${a.value} (${a.count}笔)`).join('\n')}`);
  }
  
  if (patterns.timeSlots && patterns.timeSlots.length > 0) {
    const topHours = patterns.timeSlots
      .filter((t: any) => t.count > 0)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 5);
    
    if (topHours.length > 0) {
      sections.push(`### 高频下单时段\n${topHours.map((t: any) => `- ${t.hour}:00 (${t.count}笔)`).join('\n')}`);
    }
  }
  
  if (patterns.categories && patterns.categories.length > 0) {
    const top3 = patterns.categories.slice(0, 3);
    sections.push(`### Top 商品分类\n${top3.map((c: any) => `- ${c.value} (${c.count}笔)`).join('\n')}`);
  }
  
  return sections.length > 0 ? sections.join('\n\n') : '（暂无明显模式）';
}

/**
 * Format suspicious patterns
 */
function formatSuspiciousPatterns(patterns: any): string {
  const alerts: string[] = [];
  
  if (patterns.midnightOrders && patterns.midnightOrders > 0) {
    alerts.push(`- ⚠️ **凌晨订单**: ${patterns.midnightOrders} 笔订单在凌晨2-4点下单`);
  }
  
  if (patterns.sameIPMultiOrders && patterns.sameIPMultiOrders > 0) {
    alerts.push(`- ⚠️ **IP复用**: ${patterns.sameIPMultiOrders} 个IP地址有多笔订单`);
  }
  
  if (patterns.warehouseAddresses && patterns.warehouseAddresses > 0) {
    alerts.push(`- ⚠️ **集运地址**: ${patterns.warehouseAddresses} 笔订单疑似发往仓库/转运地址`);
  }
  
  return alerts.length > 0 ? alerts.join('\n') : '（暂无可疑特征）';
}

/**
 * Export for testing
 */
export const __testing__ = {
  formatNumericFeatures,
  formatTopPatterns,
  formatSuspiciousPatterns,
};
