/**
 * Query Type Router & Skill Resolver (M10.4 Phase 1)
 * 
 * Unified routing system with two layers:
 * 1. Skill Layer: Route to appropriate skill (nl2sql.v1 or analysis.v1)
 * 2. Query Type Layer: Classify query into specific types for SQL generation
 * 
 * Mixed strategy: keyword matching (fast, 70%+ coverage) + LLM classification (fallback)
 * 
 * Confidence levels:
 * - 0.6: Single keyword match → trigger LLM confirmation
 * - 0.9: Multiple keywords → direct template routing
 * - 1.0: Keywords + domain terms → high confidence routing
 */

import type { LLMConfig } from '../llmClient';
import { LlmClient } from '../llmClient';
import { getFeatureFlags } from '../../flags/featureFlags';
import type { SkillContext, SkillDefinition } from './types';
import { getSkill } from './registry';

export type QueryType =
  | 'kpi_single'        // Single value statistics: total count, average
  | 'kpi_grouped'       // Grouped aggregation: group by dimension
  | 'trend_time'        // Time series trend: daily/weekly/monthly
  | 'distribution'      // Distribution and percentage
  | 'topn'              // Ranking / Top N
  | 'comparison'        // Comparison analysis
  | 'unknown';          // Unable to classify

export interface QueryTypeClassification {
  queryType: QueryType;
  confidence: number; // 0..1
  matchedKeywords: string[]; // Matched keywords
  method: 'keyword' | 'llm'; // Classification method
  topN?: number; // For topn queries, the N value extracted from user input
}

/**
 * Keyword rules for each query type.
 * Each rule contains primary keywords (strong signal) and secondary keywords (weak signal).
 */
const KEYWORD_RULES: Record<string, { primary: string[]; secondary: string[] }> = {
  // Single value statistics
  kpi_single: {
    primary: ['总共', '总数', '总计', '一共', '多少个', '有几个', '数量', 'count', 'total', '统计'],
    secondary: ['平均', '均值', 'average', 'avg', 'mean']
  },

  // Grouped aggregation
  kpi_grouped: {
    primary: ['按照', '按', '分组', '每个', '各个', 'group by', 'by', '各'],
    secondary: ['统计', '计算', '汇总', 'sum', '平均', '数量']
  },

  // Time series trend
  trend_time: {
    primary: ['趋势', '走势', '变化', '增长', '下降', 'trend', '按天', '按周', '按月', '按年', 'daily', 'monthly'],
    secondary: ['时间', '日期', '历史', 'time', 'date', 'over time']
  },

  // Distribution and percentage
  distribution: {
    primary: ['分布', '占比', '比例', '百分比', 'distribution', 'percentage', 'proportion', '构成'],
    secondary: ['各', '每个', '不同']
  },

  // TopN ranking
  topn: {
    primary: ['排名', '排行', '前', 'top', 'top n', '最多', '最少', '最高', '最低', 'highest', 'lowest'],
    secondary: ['前n', '前十', '前5', 'top 10', 'top 5']
  },

  // Comparison analysis
  comparison: {
    primary: ['对比', '比较', '差异', 'compare', 'vs', 'versus', '相比', '比'],
    secondary: ['和', '与', 'and', 'between']
  }
};

/**
 * Extract topN number from user input.
 * Supports patterns like: "top 10", "前10", "前十", "top10", "前10名", etc.
 * @param userInput User query string
 * @returns Extracted N value, or undefined if not found
 */
function extractTopN(userInput: string): number | undefined {
  const normalizedInput = userInput.toLowerCase();
  
  // Pattern 1: "top N" or "top N名/个/条"
  const topPattern = /top\s*(\d+)/i;
  const topMatch = normalizedInput.match(topPattern);
  if (topMatch) {
    return parseInt(topMatch[1], 10);
  }
  
  // Pattern 2: "前N" or "前N名/个/条"
  const qianPattern = /前\s*(\d+)/;
  const qianMatch = userInput.match(qianPattern);
  if (qianMatch) {
    return parseInt(qianMatch[1], 10);
  }
  
  // Pattern 3: Chinese number words (前十, 前五, etc.)
  const chineseNumbers: Record<string, number> = {
    '十': 10, '五': 5, '三': 3, '二十': 20, '五十': 50, '百': 100
  };
  for (const [chinese, num] of Object.entries(chineseNumbers)) {
    if (userInput.includes(`前${chinese}`)) {
      return num;
    }
  }
  
  return undefined;
}

/**
 * Domain-specific terms grouped by industry.
 * When detected alongside query type keywords, confidence increases to 1.0.
 */
const DOMAIN_TERMS_BY_INDUSTRY: Record<string, string[]> = {
  ecommerce: [
    '订单', '用户', '商品', '销售额', 'GMV', '客单价', '转化率', '复购',
    'order', 'user', 'product', 'sales', 'revenue', 'conversion', 'repurchase'
  ],
  finance: [
    '交易', '金额', '收入', '支出', '余额', '利润', '手续费', '流水',
    'transaction', 'amount', 'profit', 'balance', 'fee', 'flow'
  ],
  retail: [
    '销售', '库存', '门店', '客流', '坪效', '动销率', 'SKU', '周转',
    'sales', 'inventory', 'store', 'traffic', 'turnover', 'sku'
  ],
  general: [
    '数据', '记录', '条数', '统计', 'data', 'record', 'count', 'total'
  ]
};

/**
 * Keywords that indicate the need for analysis.v1 skill (advanced analytics).
 * Used for skill-level routing.
 */
const ANALYSIS_KEYWORDS = /统计|趋势|分布|对比|top\s*\d|Top\s*\d|group by|median|stddev/i;

/**
 * Get combined domain terms for an industry (industry-specific + general).
 * @param industry Industry identifier (optional)
 * @returns Array of domain terms
 */
function getDomainTerms(industry?: string): string[] {
  if (!industry || !DOMAIN_TERMS_BY_INDUSTRY[industry]) {
    // If no industry specified, return all terms
    return Object.values(DOMAIN_TERMS_BY_INDUSTRY).flat();
  }
  // Return industry-specific + general terms
  return [
    ...DOMAIN_TERMS_BY_INDUSTRY[industry],
    ...DOMAIN_TERMS_BY_INDUSTRY.general
  ];
}

/**
 * Classify query by keywords (Phase 1: fast path).
 * 
 * @param userInput User's natural language query
 * @param industry Optional industry identifier to filter domain terms
 * @returns Classification result with confidence
 */
export function classifyByKeywords(userInput: string, industry?: string): QueryTypeClassification {
  const lowerInput = userInput.toLowerCase();
  
  // Track matches for each query type
  const matches: Record<string, { primary: number; secondary: number; keywords: string[] }> = {};
  
  for (const [queryType, rules] of Object.entries(KEYWORD_RULES)) {
    matches[queryType] = { primary: 0, secondary: 0, keywords: [] };
    
    // Check primary keywords
    for (const keyword of rules.primary) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        matches[queryType].primary++;
        matches[queryType].keywords.push(keyword);
      }
    }
    
    // Check secondary keywords
    for (const keyword of rules.secondary) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        matches[queryType].secondary++;
        matches[queryType].keywords.push(keyword);
      }
    }
  }
  
  // Find best match
  let bestType: QueryType = 'unknown';
  let bestScore = 0;
  let matchedKeywords: string[] = [];
  
  for (const [queryType, match] of Object.entries(matches)) {
    // Scoring: primary keywords worth 2 points, secondary worth 1 point
    let score = match.primary * 2 + match.secondary * 1;
    
    // Special handling: if kpi_grouped has strong grouping keywords, boost priority
    // Only when there's also a secondary keyword
    if (queryType === 'kpi_grouped' && match.primary > 0 && match.secondary > 0) {
      score += 0.5; // Small boost to win over kpi_single when both match
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestType = queryType as QueryType;
      matchedKeywords = match.keywords;
    }
  }
  
  // Calculate confidence
  let confidence = 0;
  
  if (bestScore === 0) {
    // No keywords matched
    return {
      queryType: 'unknown',
      confidence: 0,
      matchedKeywords: [],
      method: 'keyword'
    };
  }
  
  // Check for domain terms (boost confidence)
  const domainTerms = getDomainTerms(industry);
  const hasDomainTerm = domainTerms.some(term => 
    lowerInput.includes(term.toLowerCase())
  );
  
  if (bestScore >= 4 || (bestScore >= 2 && hasDomainTerm)) {
    // Multiple keywords or keyword + domain term
    confidence = hasDomainTerm ? 1.0 : 0.9;
  } else if (bestScore >= 2) {
    // Multiple weak signals
    confidence = 0.75;
  } else {
    // Single keyword match
    confidence = 0.6;
  }
  
  return {
    queryType: bestType,
    confidence,
    matchedKeywords,
    method: 'keyword',
    topN: bestType === 'topn' ? extractTopN(userInput) : undefined
  };
}

/**
 * Classify query by LLM (Phase 2: fallback when confidence < threshold).
 * 
 * @param llmConfig LLM configuration
 * @param userInput User's natural language query
 * @param schemaDigest Schema information (compact)
 * @returns Classification result
 */
export async function classifyByLLM(
  llmConfig: LLMConfig,
  userInput: string,
  schemaDigest: string
): Promise<QueryTypeClassification> {
  const llm = new LlmClient(llmConfig);
  
  const systemPrompt = `You are a query type classifier. Classify the user's query into ONE of these types:
- kpi_single: single value statistics (total, count, average)
- kpi_grouped: grouped aggregation (group by dimension)
- trend_time: time series trend (daily, monthly trends)
- distribution: distribution/percentage analysis
- topn: ranking/top N queries
- comparison: comparison between entities
- unknown: cannot classify

Return ONLY a JSON object with keys: queryType (string), confidence (0-1), reasoning (brief).`;

  const userPrompt = `Classify this query:
"${userInput}"

Schema context (first 500 chars):
${schemaDigest.slice(0, 500)}

Return JSON only.`;

  try {
    const response = await llm.chatCompletions({
      model: llm.modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for classification
      max_tokens: 150
    });
    
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty LLM response');
    }
    
    // Parse JSON response
    const parsed = JSON.parse(content) as {
      queryType?: string;
      confidence?: number;
      reasoning?: string;
    };
    
    const queryType = parsed.queryType as QueryType || 'unknown';
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.7;
    
    return {
      queryType,
      confidence,
      matchedKeywords: [`LLM: ${parsed.reasoning || 'classified'}`],
      method: 'llm'
    };
  } catch (error) {
    console.error('[QueryTypeRouter] LLM classification failed:', error);
    // Fallback to unknown with low confidence
    return {
      queryType: 'unknown',
      confidence: 0.3,
      matchedKeywords: ['LLM failed'],
      method: 'llm'
    };
  }
}

/**
 * Main router: hybrid strategy (keyword + LLM fallback).
 * 
 * @param userInput User's natural language query
 * @param industry Optional industry identifier for domain term filtering
 * @param llmConfig LLM configuration (optional, only used if confidence < 0.7)
 * @param schemaDigest Schema information (optional, for LLM fallback)
 * @returns Classification result
 */
export async function classifyQueryType(
  userInput: string,
  industry?: string,
  llmConfig?: LLMConfig,
  schemaDigest?: string
): Promise<QueryTypeClassification> {
  // Phase 1: Fast keyword matching
  const keywordResult = classifyByKeywords(userInput, industry);
  
  console.log('[QueryTypeRouter] Keyword result:', keywordResult);
  
  // If confidence is high enough, return immediately
  if (keywordResult.confidence >= 0.7 || !llmConfig) {
    return keywordResult;
  }
  
  // Phase 2: LLM classification fallback
  console.log('[QueryTypeRouter] Low confidence, falling back to LLM classification');
  
  const llmResult = await classifyByLLM(
    llmConfig,
    userInput,
    schemaDigest || ''
  );
  
  console.log('[QueryTypeRouter] LLM result:', llmResult);
  
  // Return LLM result if it has higher confidence
  if (llmResult.confidence > keywordResult.confidence) {
    return llmResult;
  }
  
  return keywordResult;
}

// ============================================================================
// Skill-Level Router (Layer 1)
// ============================================================================

/**
 * Resolve skill ID based on query context.
 * 
 * Strategy: analysis.v1 is an orchestrator which can fall back to nl2sql.
 * Therefore, routing only decides whether to wrap with analysis.v1.
 * 
 * @param ctx Skill context with user input and runtime config
 * @returns Skill ID ('nl2sql.v1' or 'analysis.v1')
 */
export const resolveSkillId = (ctx: SkillContext): string => {
  const flags = getFeatureFlags();
  if (!flags.enableSkillRouter) return 'nl2sql.v1';

  if (flags.enableAnalysisSkillV1) {
    // Prefer analysis.v1 for common analytics expressions
    if (ANALYSIS_KEYWORDS.test(ctx.userInput)) {
      return 'analysis.v1';
    }
  }
  return 'nl2sql.v1';
};

/**
 * Resolve skill definition based on query context.
 * 
 * @param ctx Skill context with user input and runtime config
 * @returns Skill definition or null if not found
 */
export const resolveSkill = (ctx: SkillContext): SkillDefinition | null => {
  const id = resolveSkillId(ctx);
  const skill = getSkill(id);
  return skill ?? null;
};
