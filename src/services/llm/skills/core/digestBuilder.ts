/**
 * @file digestBuilder.ts
 * @description Builds and trims User Skill Digest for prompt injection.
 * Implements deterministic Top-N/Top-K strategy to stay within budget constraints.
 */

import type {
  UserSkillConfig,
  TableSkillConfig,
  FilterExpr,
  MetricDefinition,
  FieldMapping,
  DigestBudget,
} from '../types';
import { DEFAULT_DIGEST_BUDGET } from '../types';

/**
 * Options for digest building.
 */
export interface DigestOptions {
  /** Budget constraints for digest length */
  budget?: DigestBudget;
  /** Max number of default filters to include (Top-N) */
  maxFilters?: number;
  /** Max number of metrics to include (Top-K) */
  maxMetrics?: number;
}

/**
 * Default digest options.
 */
const DEFAULT_DIGEST_OPTIONS: Required<DigestOptions> = {
  budget: DEFAULT_DIGEST_BUDGET,
  maxFilters: 5,
  maxMetrics: 8,
};

/**
 * Build field mapping section of digest.
 * @param fieldMapping Field mapping configuration
 * @returns Digest string
 */
function buildFieldMappingDigest(fieldMapping?: FieldMapping): string {
  if (!fieldMapping) {
    return '';
  }

  const lines: string[] = [];
  
  if (fieldMapping.orderIdColumn) {
    lines.push(`  - orderId: ${fieldMapping.orderIdColumn}`);
  }
  if (fieldMapping.userIdColumn) {
    lines.push(`  - userId: ${fieldMapping.userIdColumn}`);
  }
  if (fieldMapping.timeColumn) {
    lines.push(`  - time: ${fieldMapping.timeColumn}`);
  }
  if (fieldMapping.amountColumn) {
    lines.push(`  - amount: ${fieldMapping.amountColumn}`);
  }

  if (lines.length === 0) {
    return '';
  }

  return `Field mapping:\n${lines.join('\n')}`;
}

/**
 * Build default filters section of digest with Top-N truncation.
 * @param filters Filter expressions
 * @param maxFilters Max number of filters to include
 * @returns Digest string
 */
function buildFiltersDigest(filters?: FilterExpr[], maxFilters = 5): string {
  if (!filters || filters.length === 0) {
    return '';
  }

  const lines: string[] = [];
  const limitedFilters = filters.slice(0, maxFilters);

  for (const filter of limitedFilters) {
    const valueStr = typeof filter.value === 'object' && 'kind' in filter.value
      ? `relative_time(${filter.value.amount} ${filter.value.unit} ${filter.value.direction})`
      : JSON.stringify(filter.value);
    
    lines.push(`  - ${filter.column} ${filter.op} ${valueStr}`);
  }

  if (filters.length > maxFilters) {
    lines.push(`  - +${filters.length - maxFilters} more filters`);
  }

  return `Default filters:\n${lines.join('\n')}`;
}

/**
 * Build metrics section of digest with Top-K truncation.
 * @param metrics Metric definitions
 * @param maxMetrics Max number of metrics to include
 * @returns Digest string
 */
function buildMetricsDigest(
  metrics?: Record<string, MetricDefinition>,
  maxMetrics = 8
): string {
  if (!metrics || Object.keys(metrics).length === 0) {
    return '';
  }

  const lines: string[] = [];
  const entries = Object.entries(metrics);
  const limitedEntries = entries.slice(0, maxMetrics);

  for (const [name, metric] of limitedEntries) {
    const columnPart = metric.column ? `(${metric.column})` : '';
    const wherePart = metric.where ? ` WHERE ${metric.where.length} conditions` : '';
    lines.push(`  - ${name}: ${metric.aggregation}${columnPart}${wherePart}`);
  }

  if (entries.length > maxMetrics) {
    lines.push(`  - +${entries.length - maxMetrics} more metrics`);
  }

  return `Metrics overrides:\n${lines.join('\n')}`;
}

/**
 * Build User Skill Digest for a single table.
 * @param tableName Table name
 * @param tableConfig Table skill configuration
 * @param options Digest options
 * @returns Digest string
 */
export function buildTableSkillDigest(
  tableName: string,
  tableConfig: TableSkillConfig,
  options: DigestOptions = {}
): string {
  const opts = { ...DEFAULT_DIGEST_OPTIONS, ...options };
  
  const sections: string[] = [];
  sections.push(`Active table: ${tableName}`);

  // Field mapping (highest priority, always included)
  const fieldMappingDigest = buildFieldMappingDigest(tableConfig.fieldMapping);
  if (fieldMappingDigest) {
    sections.push(fieldMappingDigest);
  }

  // Default filters (Top-N)
  const filtersDigest = buildFiltersDigest(tableConfig.defaultFilters, opts.maxFilters);
  if (filtersDigest) {
    sections.push(filtersDigest);
  }

  // Metrics (Top-K)
  const metricsDigest = buildMetricsDigest(tableConfig.metrics, opts.maxMetrics);
  if (metricsDigest) {
    sections.push(metricsDigest);
  }

  return sections.join('\n\n');
}

/**
 * Build User Skill Digest for prompt injection.
 * @param userSkillConfig User skill configuration
 * @param activeTableName Active table name (e.g., "main_table_1")
 * @param options Digest options
 * @returns Digest string, trimmed to budget
 */
export function buildUserSkillDigest(
  userSkillConfig: UserSkillConfig | null,
  activeTableName: string | null,
  options: DigestOptions = {}
): string {
  if (!userSkillConfig || !activeTableName) {
    return '';
  }

  const opts = { ...DEFAULT_DIGEST_OPTIONS, ...options };
  const tableConfig = userSkillConfig.tables[activeTableName];

  if (!tableConfig) {
    return '';
  }

  // Build digest
  let digest = buildTableSkillDigest(activeTableName, tableConfig, opts);

  // Enforce budget (hard limit)
  const maxChars = opts.budget.userSkillDigestMaxChars;
  if (digest.length > maxChars) {
    digest = digest.slice(0, maxChars) + '\n... (truncated)';
    console.warn(
      `[DigestBuilder] User skill digest truncated from ${digest.length} to ${maxChars} chars`
    );
  }

  return digest;
}

/**
 * Calculate digest statistics.
 * @param digest Digest string
 * @returns { chars: number, lines: number }
 */
export function getDigestStats(digest: string): { chars: number; lines: number } {
  return {
    chars: digest.length,
    lines: digest.split('\n').length,
  };
}

/**
 * Check if digest is within budget.
 * @param digest Digest string
 * @param budget Budget constraints
 * @returns { withinBudget: boolean, chars: number, limit: number }
 */
export function checkDigestBudget(
  digest: string,
  budget: DigestBudget = DEFAULT_DIGEST_BUDGET
): { withinBudget: boolean; chars: number; limit: number } {
  const chars = digest.length;
  const limit = budget.userSkillDigestMaxChars;
  
  return {
    withinBudget: chars <= limit,
    chars,
    limit,
  };
}
