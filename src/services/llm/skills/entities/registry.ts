/**
 * @file registry.ts
 * @description Entity-based skill registry mapping business entity types to skill definitions.
 * Provides entity-specific NL2SQL skills for ORDER, USER, PRODUCT, etc.
 * 
 * Part of M11.0 Refactor3: Skill Framework - Phase 3
 */

import { BusinessEntityType } from './entityTypes';
import type { SkillDefinition, SkillContext, SkillResult } from '../types';
import { AgentExecutor } from '../../agentExecutor';

/**
 * Entity skill definition extends base SkillDefinition with entity type metadata.
 */
export interface EntitySkillDefinition extends SkillDefinition {
  /** Business entity type this skill handles */
  entityType: BusinessEntityType;
}

/**
 * Entity-based skill registry.
 * Maps each business entity type to its corresponding NL2SQL skill.
 * 
 * Design principle:
 * - Each entity gets its own skill ID (nl2sql.<entity>.v1)
 * - All skills currently delegate to the same AgentExecutor
 * - Future: Entity-specific skills can have custom logic
 */
export const ENTITY_SKILLS: Record<BusinessEntityType, EntitySkillDefinition> = {
  [BusinessEntityType.ORDER]: {
    id: 'nl2sql.order.v1',
    description: 'NL2SQL skill for Order/Transaction entity analysis. Handles order queries, payment status, transaction metrics.',
    entityType: BusinessEntityType.ORDER,
    async run(ctx: SkillContext): Promise<SkillResult> {
      return executeEntitySkill(ctx, BusinessEntityType.ORDER);
    },
  },

  [BusinessEntityType.USER]: {
    id: 'nl2sql.user.v1',
    description: 'NL2SQL skill for User/Customer entity analysis. Handles user behavior, retention, cohort analysis.',
    entityType: BusinessEntityType.USER,
    async run(ctx: SkillContext): Promise<SkillResult> {
      return executeEntitySkill(ctx, BusinessEntityType.USER);
    },
  },

  [BusinessEntityType.PRODUCT]: {
    id: 'nl2sql.product.v1',
    description: 'NL2SQL skill for Product/Item entity analysis. Handles product performance, inventory, pricing.',
    entityType: BusinessEntityType.PRODUCT,
    async run(ctx: SkillContext): Promise<SkillResult> {
      return executeEntitySkill(ctx, BusinessEntityType.PRODUCT);
    },
  },

  [BusinessEntityType.INVENTORY]: {
    id: 'nl2sql.inventory.v1',
    description: 'NL2SQL skill for Inventory/Stock entity analysis. Handles stock levels, warehouse operations, turnover.',
    entityType: BusinessEntityType.INVENTORY,
    async run(ctx: SkillContext): Promise<SkillResult> {
      return executeEntitySkill(ctx, BusinessEntityType.INVENTORY);
    },
  },

  [BusinessEntityType.FINANCE]: {
    id: 'nl2sql.finance.v1',
    description: 'NL2SQL skill for Finance/Accounting entity analysis. Handles revenue, profit, cash flow, financial metrics.',
    entityType: BusinessEntityType.FINANCE,
    async run(ctx: SkillContext): Promise<SkillResult> {
      return executeEntitySkill(ctx, BusinessEntityType.FINANCE);
    },
  },

  [BusinessEntityType.LOGISTICS]: {
    id: 'nl2sql.logistics.v1',
    description: 'NL2SQL skill for Logistics/Shipping entity analysis. Handles delivery, tracking, shipping performance.',
    entityType: BusinessEntityType.LOGISTICS,
    async run(ctx: SkillContext): Promise<SkillResult> {
      return executeEntitySkill(ctx, BusinessEntityType.LOGISTICS);
    },
  },

  [BusinessEntityType.GENERAL]: {
    id: 'nl2sql.general.v1',
    description: 'General fallback NL2SQL skill for unspecified or cross-entity analysis.',
    entityType: BusinessEntityType.GENERAL,
    async run(ctx: SkillContext): Promise<SkillResult> {
      return executeEntitySkill(ctx, BusinessEntityType.GENERAL);
    },
  },
};

/**
 * Execute entity skill using AgentExecutor.
 * Provides entity-aware context injection for better SQL generation.
 * 
 * @param ctx Skill context
 * @param _entityType Business entity type (reserved for future phases)
 * @returns Skill execution result
 */
async function executeEntitySkill(
  ctx: SkillContext,
  _entityType: BusinessEntityType
): Promise<SkillResult> {
  const executor = new AgentExecutor(
    ctx.runtime.llmConfig,
    ctx.runtime.executeQuery,
    ctx.attachments
  );

  // Execute with entity-aware context
  const res = await executor.execute(ctx.userInput, ctx.runtime.signal, {
    persona: ctx.personaId,
    sessionId: ctx.sessionId,
    industry: ctx.industry,
    userSkillConfig: ctx.userSkillConfig,
    activeTable: ctx.activeTable,
  });

  // AgentExecutor.execute returns object without stopReason, infer from cancelled flag
  return {
    stopReason: res.cancelled ? 'CANCELLED' : 'SUCCESS',
    tool: res.tool,
    params: res.params,
    result: res.result,
    schema: res.schema,
    thought: res.thought,
    llmDurationMs: res.llmDurationMs,
    queryDurationMs: res.queryDurationMs,
    cancelled: res.cancelled,
  };
}

/**
 * Get entity skill definition by business entity type.
 * @param entityType Business entity type
 * @returns Entity skill definition
 */
export function getEntitySkill(entityType: BusinessEntityType): EntitySkillDefinition {
  return ENTITY_SKILLS[entityType];
}

/**
 * Get all entity skills.
 * @returns Map of all entity skills indexed by entity type
 */
export function getAllEntitySkills(): Record<BusinessEntityType, EntitySkillDefinition> {
  return ENTITY_SKILLS;
}

/**
 * Get entity skill IDs for all entity types.
 * @returns Array of skill IDs
 */
export function getEntitySkillIds(): string[] {
  return Object.values(ENTITY_SKILLS).map((skill) => skill.id);
}

/**
 * Check if a skill ID belongs to an entity skill.
 * @param skillId Skill ID to check
 * @returns True if skill ID matches entity skill pattern
 */
export function isEntitySkillId(skillId: string): boolean {
  return /^nl2sql\.[a-z]+\.v1$/.test(skillId);
}
