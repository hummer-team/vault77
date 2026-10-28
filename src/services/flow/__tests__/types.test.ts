/**
 * Type Tests for Flow Service
 * Tests for type definitions and enums
 */

import { describe, it, expect } from 'vitest';
import {
  FlowNodeType,
  JoinType,
  OperatorType,
  LogicType,
  FieldType,
  ValidationSeverity,
  DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
  blockingValidationErrors,
  collectActivitySplitBlockers,
  type ValidationError,
} from '../types';

describe('Flow Enums', () => {
  describe('FlowNodeType', () => {
    it('should have correct node types', () => {
      expect(FlowNodeType.DATA_SOURCE).toBe('dataSource');
      expect(FlowNodeType.TABLE).toBe('table');
      expect(FlowNodeType.JOIN).toBe('join');
      expect(FlowNodeType.CONDITION).toBe('condition');
      expect(FlowNodeType.CONDITION_GROUP_RELATION).toBe('conditionGroupRelation');
      expect(FlowNodeType.CONDITION_GROUP_DEFINITION).toBe('conditionGroupDefinition');
      expect(FlowNodeType.SELECT).toBe('select');
      expect(FlowNodeType.SELECT_AGG).toBe('selectAgg');
      expect(FlowNodeType.END).toBe('end');
    });
  });

  describe('JoinType', () => {
    it('should have correct join types', () => {
      expect(JoinType.INNER).toBe('INNER');
      expect(JoinType.LEFT).toBe('LEFT');
      expect(JoinType.RIGHT).toBe('RIGHT');
      expect(JoinType.CROSS).toBe('CROSS');
    });
  });

  describe('OperatorType', () => {
    it('should have correct operator types', () => {
      expect(OperatorType.ASSOCIATION).toBe('association');
      expect(OperatorType.ANOMALY).toBe('anomaly');
      expect(OperatorType.CLUSTERING).toBe('clustering');
    });
  });

  describe('LogicType', () => {
    it('should have correct logic types', () => {
      expect(LogicType.AND).toBe('AND');
      expect(LogicType.OR).toBe('OR');
    });
  });

  describe('FieldType', () => {
    it('should have all field types defined', () => {
      expect(FieldType.INTEGER).toBe('INTEGER');
      expect(FieldType.VARCHAR).toBe('VARCHAR');
      expect(FieldType.TIMESTAMP).toBe('TIMESTAMP');
      expect(FieldType.BOOLEAN).toBe('BOOLEAN');
      expect(FieldType.UNKNOWN).toBe('UNKNOWN');
    });
  });

  describe('ValidationSeverity', () => {
    it('should have correct severity levels', () => {
      expect(ValidationSeverity.ERROR).toBe('error');
      expect(ValidationSeverity.WARNING).toBe('warning');
    });
  });
});

describe('blockingValidationErrors（阻断判据唯一真值）', () => {
  const err = (severity: ValidationSeverity, message: string): ValidationError => ({
    nodeId: 'n1',
    nodeType: FlowNodeType.SELECT,
    message,
    severity,
  });

  it('WARNING 不阻断执行，ERROR 阻断', () => {
    const warningsOnly = [err(ValidationSeverity.WARNING, '成本费用项均未选择')];
    expect(blockingValidationErrors(warningsOnly)).toHaveLength(0);
    const mixed = [...warningsOnly, err(ValidationSeverity.ERROR, '请指定订单实付金额列')];
    expect(blockingValidationErrors(mixed).map((e) => e.message)).toEqual(['请指定订单实付金额列']);
  });

  it('undefined / 空数组 → 无阻断', () => {
    expect(blockingValidationErrors(undefined)).toHaveLength(0);
    expect(blockingValidationErrors([])).toHaveLength(0);
  });
});

describe('collectActivitySplitBlockers（阻断判据三处同源）', () => {
  it('默认配置：三维度缺列 + 缺实付金额列，均带业务化中文文案', () => {
    const codes = collectActivitySplitBlockers(DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG).map((b) => b.code);
    expect(codes).toEqual(['missing-dimension-column', 'missing-dimension-column', 'missing-dimension-column', 'no-net-amount']);
    expect(collectActivitySplitBlockers(DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG)[0].message).toBe('活动维度尚未指定数据列');
  });

  it('规则 4 与两条补充规则纳入阻断判据（抽屉门禁与 isUdfConfigured 不再漏判）', () => {
    const base = {
      ...DEFAULT_ACTIVITY_EFFECT_SPLIT_CONFIG,
      dimensions: ['activity'] as const,
    };
    const cfg = {
      ...base,
      dimensions: ['activity' as const],
      fieldMapping: { ...base.fieldMapping, activityIdCol: '活动ID', netAmountCol: '实付金额' },
    };
    expect(collectActivitySplitBlockers(cfg)).toHaveLength(0);
    expect(
      collectActivitySplitBlockers({ ...cfg, liftCaliber: 'baseline_delta' }).map((b) => b.code),
    ).toEqual(['baseline-time-missing']);
    expect(
      collectActivitySplitBlockers({ ...cfg, liftCaliber: 'product_amount' }).map((b) => b.code),
    ).toEqual(['product-amount-missing']);
    expect(
      collectActivitySplitBlockers({ ...cfg, costCaliber: 'single_column' }).map((b) => b.code),
    ).toEqual(['single-column-missing']);
    // 维度全取消时缺列规则随之为空，只剩「请至少选择一个拆分维度」（实付金额已映射）
    expect(collectActivitySplitBlockers({ ...cfg, dimensions: [] }).map((b) => b.code)).toEqual(['no-dimension']);
  });

  it('未保存配置（undefined）按默认配置判定', () => {
    expect(collectActivitySplitBlockers(undefined).map((b) => b.code)).toContain('no-net-amount');
  });
});
