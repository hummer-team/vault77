import type { Attachment } from '../../../types/workbench.types';
import type { ExecuteQueryFunc } from '../agentExecutor';
import type { LLMConfig } from '../llmClient';
import { z } from 'zod';

export const skillStopReasonSchema = z.enum([
  'SUCCESS',
  'NEED_CLARIFICATION',
  'BUDGET_EXCEEDED',
  'POLICY_DENIED',
  'TOOL_ERROR',
  'CANCELLED',
  'UNKNOWN',
]);

export type SkillStopReason = z.infer<typeof skillStopReasonSchema>;

export interface SkillRuntime {
  llmConfig: LLMConfig;
  executeQuery: ExecuteQueryFunc;
  signal?: AbortSignal;
}

export interface SkillContext {
  userInput: string;
  attachments: Attachment[];
  personaId?: string;
  sessionId?: string;
  /** A compact schema digest to help the skill pick columns/tables. */
  schemaDigest: string;
  /** max rows expected in result rendering (UI constraint). */
  maxRows: number;
  runtime: SkillRuntime;
}

export interface SkillResult {
  stopReason: SkillStopReason;
  message?: string;
  tool?: string;
  params?: unknown;
  result?: unknown;
  schema?: unknown[];
  thought?: string;
  llmDurationMs?: number;
  queryDurationMs?: number;
  cancelled?: boolean;
}

export interface SkillDefinition {
  /** e.g. "analysis.v1" */
  id: string;
  description: string;
  run(context: SkillContext): Promise<SkillResult>;
}
