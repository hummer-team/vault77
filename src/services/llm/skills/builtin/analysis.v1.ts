import { z } from 'zod';
import type { SkillContext, SkillDefinition, SkillResult } from '../types';
import { AgentExecutor } from '../../agentExecutor';

type QueryType =
  | 'kpi_single'
  | 'kpi_grouped'
  | 'trend_time'
  | 'distribution'
  | 'comparison'
  | 'topn'
  | 'clarification_needed';

const classifyResultSchema = z.object({
  thought: z.string().optional(),
  queryType: z.enum(['kpi_single', 'kpi_grouped', 'trend_time', 'distribution', 'comparison', 'topn', 'clarification_needed']),
  /** Candidate columns chosen by the model (best-effort). */
  timeColumn: z.string().optional(),
  metricColumn: z.string().optional(),
  dimensionColumn: z.string().optional(),
  /** If clarification is required, ask these questions. */
  clarifyingQuestions: z.array(z.string()).default([]),
});

const buildClassificationPrompt = (ctx: SkillContext): string => {
  return [
    'You are a data analyst. Classify the user request into a query type and propose relevant columns.',
    'Rules:',
    '- Output strict JSON only.',
    '- Prefer existing column names from schemaDigest.',
    '- If uncertain about time window or key columns, set queryType=clarification_needed and ask concise questions.',
    '',
    `userInput: ${ctx.userInput}`,
    '',
    'schemaDigest:',
    ctx.schemaDigest.slice(0, 4000),
    '',
    'Return JSON with keys: queryType, timeColumn?, metricColumn?, dimensionColumn?, clarifyingQuestions[].',
  ].join('\n');
};

const buildFallbackClarificationMessage = (): SkillResult => {
  return {
    stopReason: 'NEED_CLARIFICATION',
    message: 'Need clarification:\n- 请补充你希望统计的时间范围（例如：最近7天/30天），以及用于过滤的时间字段名称。',
  };
};

const safeQuoteIdent = (name: string): string => {
  const trimmed = name.trim();
  // Use backticks for DuckDB identifier quoting (consistent with existing code paths).
  return '`' + trimmed.replace(/`/g, '``') + '`';
};

const chooseFirstMatchingColumn = (schemaDigest: string, candidates: string[]): string | null => {
  const normalizedDigest = schemaDigest.toLowerCase();
  for (const c of candidates) {
    if (!c) continue;
    if (normalizedDigest.includes(c.toLowerCase())) return c;
  }
  return null;
};

const guessTimeColumn = (schemaDigest: string): string | null => {
  return (
    chooseFirstMatchingColumn(schemaDigest, ['下单时间', '支付时间', '创建时间', 'order_time', 'created_at', 'create_at', 'timestamp', 'date']) ||
    null
  );
};

const guessAmountColumn = (schemaDigest: string): string | null => {
  return chooseFirstMatchingColumn(schemaDigest, ['实付金额', '支付金额', '订单金额', 'amount', 'price', 'total']) || null;
};

const buildSqlByQueryType = (tableName: string, queryType: QueryType, cols: {
  timeColumn?: string;
  metricColumn?: string;
  dimensionColumn?: string;
}, maxRows: number): string | null => {
  const limit = Math.max(1, Math.min(500, maxRows));

  if (queryType === 'kpi_single') {
    return `SELECT COUNT(*) AS total_count FROM ${tableName} LIMIT ${limit}`;
  }

  if (queryType === 'kpi_grouped') {
    if (!cols.dimensionColumn) return null;
    const dim = safeQuoteIdent(cols.dimensionColumn);
    return [
      `SELECT ${dim} AS dimension, COUNT(*) AS total_count`,
      `FROM ${tableName}`,
      `GROUP BY ${dim}`,
      `ORDER BY total_count DESC`,
      `LIMIT ${limit}`,
    ].join('\n');
  }

  if (queryType === 'trend_time') {
    if (!cols.timeColumn) return null;
    const ts = safeQuoteIdent(cols.timeColumn);
    return [
      `SELECT DATE_TRUNC('day', CAST(${ts} AS TIMESTAMP)) AS day, COUNT(*) AS total_count`,
      `FROM ${tableName}`,
      `GROUP BY day`,
      `ORDER BY day`,
      `LIMIT ${limit}`,
    ].join('\n');
  }

  if (queryType === 'distribution') {
    if (!cols.metricColumn) return null;
    const x = safeQuoteIdent(cols.metricColumn);
    return [
      `SELECT`,
      `  AVG(${x}) AS mean_value,`,
      `  MEDIAN(${x}) AS median_value,`,
      `  STDDEV_POP(${x}) AS stddev_value,`,
      `  MIN(${x}) AS min_value,`,
      `  MAX(${x}) AS max_value`,
      `FROM ${tableName}`,
      `LIMIT ${limit}`,
    ].join('\n');
  }

  if (queryType === 'topn') {
    // Fallback: show first rows
    return `SELECT * FROM ${tableName} LIMIT ${limit}`;
  }

  // comparison: v1 keeps it simple ⇒ fallback to nl2sql.
  return null;
};

export const analysisV1Skill: SkillDefinition = {
  id: 'analysis.v1',
  description: 'General purpose data analysis skill (v1): classify → template SQL → execute → summarize.',
  async run(ctx: SkillContext): Promise<SkillResult> {
    // B1: analysis.v1 orchestrates but can fall back to existing nl2sql path.
    // We keep changes minimal: use a lightweight classifier prompt and deterministic SQL templates.

    const llmStart = performance.now();
    try {
      const prompt = buildClassificationPrompt(ctx);

      const executor = new AgentExecutor(ctx.runtime.llmConfig, ctx.runtime.executeQuery, ctx.attachments);

      // Reuse executor LLM client by directly calling its LlmClient is not exposed.
      // Minimal approach: call execute() only when we decide to fall back.
      // For classification we use a tiny one-shot OpenAI call via executor's llmClient indirectly is not available,
      // so we do classification heuristically first.

      // Heuristic classification first (no extra LLM call):
      const input = ctx.userInput;
      let queryType: QueryType = 'kpi_single';
      if (/分布|distribution|median|stddev|方差|标准差/i.test(input)) queryType = 'distribution';
      else if (/趋势|trend|按天|按日|按周|按月/i.test(input)) queryType = 'trend_time';
      else if (/按.*统计|group by|分组|top\s*\d|Top\s*\d/i.test(input)) queryType = 'kpi_grouped';
      else if (/对比|比较|A\/B|ab\s*test/i.test(input)) queryType = 'comparison';

      // Column guesses
      const timeColumn = guessTimeColumn(ctx.schemaDigest) ?? undefined;
      const metricColumn = guessAmountColumn(ctx.schemaDigest) ?? undefined;

      // If time-related query but no time column, ask for clarification.
      if (queryType === 'trend_time' && !timeColumn) {
        const llmDurationMs = performance.now() - llmStart;
        return {
          stopReason: 'NEED_CLARIFICATION',
          message: 'Need clarification:\n- 请选择用于趋势统计的时间字段（例如：下单时间/支付时间/创建时间）。',
          llmDurationMs,
        };
      }

      const sql = buildSqlByQueryType('main_table_1', queryType, {
        timeColumn,
        metricColumn,
        // dimension column: try to guess but keep conservative
        dimensionColumn: chooseFirstMatchingColumn(ctx.schemaDigest, ['渠道', '地区', '类目', 'category', 'channel', 'region']) ?? undefined,
      }, ctx.maxRows);

      // If we can't produce a safe template, fall back to nl2sql.
      if (!sql || queryType === 'comparison') {
        // Fallback: existing executor path (nl2sql) already includes rewrite/sql-debug/policy.
        const res = await executor.execute(ctx.userInput, ctx.runtime.signal, {
          persona: ctx.personaId,
          sessionId: ctx.sessionId,
        });
        const llmDurationMs = typeof res.llmDurationMs === 'number' ? res.llmDurationMs : performance.now() - llmStart;
        return {
          stopReason: 'SUCCESS',
          tool: res.tool,
          params: res.params,
          result: res.result,
          schema: res.schema,
          thought: res.thought,
          llmDurationMs,
          queryDurationMs: res.queryDurationMs,
          cancelled: res.cancelled,
        };
      }

      const queryStart = performance.now();
      const queryRes = await ctx.runtime.executeQuery(sql);
      const queryDurationMs = performance.now() - queryStart;
      const llmDurationMs = performance.now() - llmStart;

      return {
        stopReason: 'SUCCESS',
        tool: 'sql_query_tool',
        params: { query: sql },
        result: queryRes,
        schema: queryRes.schema,
        thought: prompt,
        llmDurationMs,
        queryDurationMs,
      };
    } catch (e: unknown) {
      const llmDurationMs = performance.now() - llmStart;
      if (e instanceof Error) {
        return {
          stopReason: /Need clarification/i.test(e.message) ? 'NEED_CLARIFICATION' : 'TOOL_ERROR',
          message: e.message,
          llmDurationMs,
        };
      }
      return { ...buildFallbackClarificationMessage(), llmDurationMs };
    }
  },
};

export const analysisV1ClassificationSchema = classifyResultSchema;
