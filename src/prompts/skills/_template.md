# Industry Skill Pack Template

## Purpose
This template helps you create a new industry skill pack for Vaultmind.

## File Naming Convention
`{industry}_basic_skill.v{version}.md`

Examples:
- `finance_basic_skill.v1.md`
- `healthcare_basic_skill.v1.md`
- `retail_basic_skill.v1.md`

## Template Structure

```markdown
# {Industry Name} Basic Skill Pack (v{version})

## Industry Context
Brief description of the industry and what this skill pack provides.

## Common Terminology

### Key Concepts
List of industry-specific terms and their definitions.

### Key Fields Mapping

| User Term | Common Column Names | Alternative Names |
|-----------|---------------------|-------------------|
| Term 1 | column_1, alt_1 | Chinese/other translations |
| Term 2 | column_2, alt_2 | ... |

## Common Metrics

### Category 1 Metrics
- **Metric Name**: Description
  - Calculation: SQL formula or approach

### Category 2 Metrics
...

## Common Analysis Patterns

### 1. Pattern Name
**User Intent**: Example user questions

**Approach**:
- Step 1
- Step 2
- Step 3

**Example SQL Template**:
```sql
SELECT ...
FROM {table_name}
WHERE ...
```

### 2. Another Pattern
...

## SQL Best Practices

### Industry-Specific Considerations
- Point 1
- Point 2

### Safety Constraints
- Always use LIMIT
- Read-only queries only
- Table whitelist patterns

## Output Structure

### Summary Format
How to format the summary for this industry.

### Assumptions
Common assumptions to document.

## Clarification Triggers

When to ask for clarification in this industry context:
1. Trigger 1
2. Trigger 2

## Version History

- **v1 (YYYY-MM-DD)**: Initial release
  - Feature 1
  - Feature 2
```

## Steps to Add a New Industry

### 1. Create Metrics File
Location: `src/services/llm/industry/{industry}/metrics.v1.ts`

```typescript
import type { MetricDefinition } from '../../skills/types';

export const {industry}MetricsV1: Record<string, MetricDefinition> = {
  metric_name: {
    label: 'Metric Label',
    aggregation: 'sum', // or count, avg, etc.
    column: 'column_name',
    where: [ /* optional filters */ ],
  },
  // ... more metrics
};

export function get{Industry}Metric(name: string): MetricDefinition | undefined {
  return {industry}MetricsV1[name];
}

export function list{Industry}Metrics(): string[] {
  return Object.keys({industry}MetricsV1);
}

export function getAll{Industry}Metrics(): Record<string, MetricDefinition> {
  return { ...{industry}MetricsV1 };
}
```

### 2. Create Skill Pack File
Location: `src/prompts/skills/{industry}_basic_skill.v1.md`

Use this template to fill in industry-specific content.

### 3. Register in Prompt Pack Loader
Update `src/services/llm/promptPackLoader.ts` to include the new industry:

```typescript
// Add to industryPackMap
'{industry}': {
  v1: () => import('../prompts/skills/{industry}_basic_skill.v1.md?raw'),
},
```

### 4. Update Types (if needed)
If adding a new industry ID, update the type definition in `src/services/llm/skills/types.ts`:

```typescript
export interface UserSkillConfig {
  industryId: 'ecommerce' | 'finance' | '{new_industry}' | 'custom';
  // ...
}
```

### 5. Test
- Verify the pack loads correctly
- Test with sample queries
- Ensure metrics compile to valid SQL
- Check that pack stays within 2000 char budget

## Example: Finance Industry

### Metrics to Consider
- **AUM (Assets Under Management)**: Total value of managed assets
- **ROI (Return on Investment)**: Performance metric
- **Transaction Volume**: Number of trades/transactions
- **Portfolio Value**: Current value of investment portfolio
- **Average Trade Size**: Mean transaction amount

### Common Analysis Patterns
1. Portfolio Performance Over Time
2. Asset Allocation Breakdown
3. Risk-Adjusted Returns
4. Transaction Activity Analysis
5. Comparison Across Portfolios

### Key Fields
- account_id, portfolio_id
- transaction_date, settlement_date
- amount, quantity, price
- asset_type, security_id
- transaction_type (buy/sell/transfer)

## Notes

- Keep skill packs focused and concise (<2000 chars for system pack injection)
- Use clear, business-friendly language
- Provide realistic examples
- Document assumptions explicitly
- Support both English and Chinese terminology
- Follow DuckDB SQL syntax conventions
