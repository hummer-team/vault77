/**
 * Unit tests for UdfReplaceColumnStrategy
 * Covers SQL building, validation, and edge cases.
 * Strategy supports both UDF_CONFIG node type (legacy) and SELECT node with udfFunctionName.
 */

import { describe, it, expect } from 'vitest';
import { UdfReplaceColumnStrategy } from '../udfReplaceColumnStrategy';
import {
  FlowNodeType,
  OperatorType,
  ValidationSeverity,
  type FlowNode,
  type SelectNodeData,
  type ReplaceRule,
} from '../../types';

// ============================================================================
// Helpers
// ============================================================================

/** Create a SelectNode with UDF routing fields (primary usage after unification) */
function makeUdfSelectNode(rules: ReplaceRule[]): FlowNode {
  return {
    id: 'select-udf-1',
    type: FlowNodeType.SELECT,
    position: { x: 0, y: 0 },
    data: {
      fields: [],
      selectAll: false,
      udfFunctionName: 'udf_replace_spec_column_value',
      udfKernelName: 'fn_ecom_data_clean_replace_spec_column_value',
      replacementRules: rules,
    } as SelectNodeData,
  };
}

/** Legacy UDF_CONFIG node — strategy should still handle it for backward compat */
function makeLegacyUdfConfigNode(rules: ReplaceRule[]): FlowNode {
  return {
    id: 'udf-config-legacy-1',
    type: FlowNodeType.UDF_CONFIG,
    position: { x: 0, y: 0 },
    data: {
      udfFunctionName: 'udf_replace_spec_column_value',
      kernelName: '替换特定列值',
      replacementRules: rules,
    } as { udfFunctionName: string; kernelName: string; replacementRules: ReplaceRule[] },
  };
}

function makeRule(overrides: Partial<ReplaceRule> = {}): ReplaceRule {
  return {
    id: 'rule-1',
    sourceTable: 'order_1',
    targetColumn: 'order_type',
    conditionType: 'all',
    conditionValue: '',
    originalValue: 'pre_pay',
    targetValue: 'room_pay_clean',
    addNewColumn: false,
    ...overrides,
  };
}

const strategy = new UdfReplaceColumnStrategy();

// ============================================================================
// Strategy metadata
// ============================================================================

describe('UdfReplaceColumnStrategy — metadata', () => {
  it('should have correct operator type', () => {
    expect(strategy.type).toBe(OperatorType.UDF_REPLACE_COLUMN);
  });

  it('should have correct display name', () => {
    expect(strategy.name).toBe('替换特定列值');
  });

  it('should require UDF_CONFIG node (legacy) or SELECT node with udfFunctionName', () => {
    // The required node type is still UDF_CONFIG for backward compat
    expect(strategy.getRequiredNodes()).toContain(FlowNodeType.UDF_CONFIG);
  });
});

// ============================================================================
// buildSql — backward compatibility with legacy UDF_CONFIG node type
// ============================================================================

describe('UdfReplaceColumnStrategy.buildSql — legacy UDF_CONFIG node', () => {
  it('should work with legacy UDF_CONFIG node type', () => {
    const rule = makeRule();
    const node = makeLegacyUdfConfigNode([rule]);
    const sql = strategy.buildSql([node], []);
    expect(sql).toContain('udf_replace_spec_column_value');
    expect(sql).toContain("'order_1'");
  });
});

// ============================================================================
// buildSql
// ============================================================================

describe('UdfReplaceColumnStrategy.buildSql', () => {
  it('should generate correct SQL for a single replacement rule', () => {
    const rule = makeRule();
    const node = makeUdfSelectNode([rule]);
    const sql = strategy.buildSql([node], []);

    expect(sql).toContain("udf_replace_spec_column_value");
    expect(sql).toContain("'order_1'");
    expect(sql).toContain('swap_map');
    expect(sql).toContain('"order_type"');
    expect(sql).toContain('"pre_pay"');
    expect(sql).toContain('"room_pay_clean"');
    // No condition when conditionType is 'all'
    expect(sql).not.toContain('condition :=');
  });

  it('should produce swap_map with correct JSON shape [originalValue, targetValue]', () => {
    const rule = makeRule({ targetColumn: 'status', originalValue: 'A', targetValue: 'B' });
    const node = makeUdfSelectNode([rule]);
    const sql = strategy.buildSql([node], []);

    const swapMapMatch = sql.match(/swap_map\s*:=\s*'([^']+)'/);
    expect(swapMapMatch).not.toBeNull();
    const swapMap = JSON.parse(swapMapMatch![1]) as Record<string, [string, string]>;
    expect(swapMap).toEqual({ status: ['A', 'B'] });
  });

  it('should include condition clause when conditionType is "contains"', () => {
    const rule = makeRule({
      conditionType: 'contains',
      conditionValue: "order_no = '123'",
    });
    const node = makeUdfSelectNode([rule]);
    const sql = strategy.buildSql([node], []);

    expect(sql).toContain('condition :=');
    expect(sql).toContain("order_no = ''123''");
  });

  it('should group multiple rules on the same table into one SQL call', () => {
    const rules = [
      makeRule({ id: 'r1', targetColumn: 'col_a', originalValue: 'x', targetValue: 'y' }),
      makeRule({ id: 'r2', targetColumn: 'col_b', originalValue: 'foo', targetValue: 'bar' }),
    ];
    const node = makeUdfSelectNode(rules);
    const sql = strategy.buildSql([node], []);

    // Both columns should appear in a single UDF call
    const callCount = (sql.match(/udf_replace_spec_column_value/g) ?? []).length;
    expect(callCount).toBe(1);

    const swapMapMatch = sql.match(/swap_map\s*:=\s*'([^']+)'/);
    expect(swapMapMatch).not.toBeNull();
    const swapMap = JSON.parse(swapMapMatch![1]) as Record<string, [string, string]>;
    expect(swapMap).toHaveProperty('col_a', ['x', 'y']);
    expect(swapMap).toHaveProperty('col_b', ['foo', 'bar']);
  });

  it('should escape single quotes in table name', () => {
    const rule = makeRule({ sourceTable: "o'rder" });
    const node = makeUdfSelectNode([rule]);
    const sql = strategy.buildSql([node], []);
    expect(sql).toContain("'o''rder'");
  });

  it('should throw when no UDF config node exists', () => {
    expect(() => strategy.buildSql([], [])).toThrow();
  });

  it('should throw when replacement rules array is empty', () => {
    const node = makeUdfSelectNode([]);
    expect(() => strategy.buildSql([node], [])).toThrow();
  });
});

// ============================================================================
// validate
// ============================================================================

describe('UdfReplaceColumnStrategy.validate', () => {
  it('should return no errors for a valid complete rule', () => {
    const node = makeUdfSelectNode([makeRule()]);
    const errors = strategy.validate([node], []);
    expect(errors).toHaveLength(0);
  });

  it('should return an error when UDF config node is missing', () => {
    const errors = strategy.validate([], []);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].severity).toBe(ValidationSeverity.ERROR);
  });

  it('should return an error when replacement rules array is empty', () => {
    const node = makeUdfSelectNode([]);
    const errors = strategy.validate([node], []);
    expect(errors.length).toBeGreaterThan(0);
    const ruleEmptyError = errors.find((e) => e.message.includes('替换规则'));
    expect(ruleEmptyError).toBeDefined();
  });

  it('should return an error for an incomplete rule missing targetColumn', () => {
    const incompleteRule = makeRule({ targetColumn: '' });
    const node = makeUdfSelectNode([incompleteRule]);
    const errors = strategy.validate([node], []);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should return an error for a rule with empty originalValue', () => {
    const incompleteRule = makeRule({ originalValue: '' });
    const node = makeUdfSelectNode([incompleteRule]);
    const errors = strategy.validate([node], []);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should not flag empty conditionValue as an error (condition is optional)', () => {
    const ruleNoCondition = makeRule({ conditionType: 'all', conditionValue: '' });
    const node = makeUdfSelectNode([ruleNoCondition]);
    const errors = strategy.validate([node], []);
    expect(errors).toHaveLength(0);
  });

  it('should return the count of incomplete rules in the error message', () => {
    const incomplete = [
      makeRule({ id: 'r1', targetColumn: '' }),
      makeRule({ id: 'r2', originalValue: '' }),
    ];
    const node = makeUdfSelectNode(incomplete);
    const errors = strategy.validate([node], []);
    const countError = errors.find((e) => e.message.includes('2'));
    expect(countError).toBeDefined();
  });
});

// ============================================================================
// postProcess
// ============================================================================

describe('UdfReplaceColumnStrategy.postProcess', () => {
  it('should return a result with type UDF_REPLACE_COLUMN', async () => {
    const result = await strategy.postProcess({ data: [{ id: 1 }], schema: [] });
    expect(result.type).toBe(OperatorType.UDF_REPLACE_COLUMN);
  });

  it('should pass through data unchanged', async () => {
    const mockData = [{ order_type: 'room_pay_clean' }];
    const result = await strategy.postProcess({ data: mockData, schema: [] });
    expect(result.data).toEqual(mockData);
  });

  it('should include a table visualization config', async () => {
    const result = await strategy.postProcess({ data: [], schema: [] });
    expect(result.visualizations).toHaveLength(1);
    expect(result.visualizations[0].type).toBe('table');
  });
});
