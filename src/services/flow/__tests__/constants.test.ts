/**
 * Constants Tests for Flow Service
 * Tests for constants and configuration
 */

import { describe, it, expect } from 'vitest';
import {
  FLOW_COLORS,
  FLOW_LAYOUT,
  FIELD_TYPE_ICONS,
  OPERATOR_CONFIG,
  JOIN_TYPE_LABELS,
  SQL_OPERATORS,
  PERFORMANCE,
} from '../constants';

describe('Flow Constants', () => {
  describe('FLOW_COLORS', () => {
    it('should have correct node colors', () => {
      expect(FLOW_COLORS.node.table.background).toBe('#1f1f1f');
      expect(FLOW_COLORS.node.table.border).toBe('#434343');
      expect(FLOW_COLORS.node.join.border).toBe('#fa8c16');
      expect(FLOW_COLORS.node.condition.border).toBe('#1890ff');
      expect(FLOW_COLORS.node.select.border).toBe('#52c41a');
    });

    it('should have correct edge colors', () => {
      expect(FLOW_COLORS.edge.default).toBe('#8c8c8c');
      expect(FLOW_COLORS.edge.selected).toBe('#fa8c16');
      expect(FLOW_COLORS.edge.error).toBe('#ff4d4f');
    });

    it('should have correct condition group colors', () => {
      expect(FLOW_COLORS.conditionGroup.and.border).toBe('#fa8c16');
      expect(FLOW_COLORS.conditionGroup.or.border).toBe('#ff9c2b');
    });
  });

  describe('FLOW_LAYOUT', () => {
    it('should have correct dimensions', () => {
      expect(FLOW_LAYOUT.nodeWidth).toBe(240);
      expect(FLOW_LAYOUT.nodeHeight).toBe(48);
      expect(FLOW_LAYOUT.layerSpacing).toBe(300);
      expect(FLOW_LAYOUT.nodeSpacing).toBe(150);
    });

    it('should have correct snap grid', () => {
      expect(FLOW_LAYOUT.snapGrid).toEqual([15, 15]);
    });
  });

  describe('FIELD_TYPE_ICONS', () => {
    it('should have icons for common field types', () => {
      expect(FIELD_TYPE_ICONS.INTEGER).toBeDefined();
      expect(FIELD_TYPE_ICONS.VARCHAR).toBeDefined();
      expect(FIELD_TYPE_ICONS.TIMESTAMP).toBeDefined();
      expect(FIELD_TYPE_ICONS.BOOLEAN).toBeDefined();
    });

    it('should have icon and color properties', () => {
      const integerConfig = FIELD_TYPE_ICONS.INTEGER;
      expect(integerConfig.icon).toBeDefined();
      expect(integerConfig.color).toBeDefined();
    });
  });

  describe('OPERATOR_CONFIG', () => {
    it('should have all operator types configured', () => {
      expect(OPERATOR_CONFIG.association).toBeDefined();
      expect(OPERATOR_CONFIG.anomaly).toBeDefined();
      expect(OPERATOR_CONFIG.clustering).toBeDefined();
    });

    it('should have name, description, icon and color for each operator', () => {
      Object.values(OPERATOR_CONFIG).forEach((config) => {
        expect(config.name).toBeDefined();
        expect(config.description).toBeDefined();
        expect(config.icon).toBeDefined();
        expect(config.color).toBeDefined();
      });
    });
  });

  describe('JOIN_TYPE_LABELS', () => {
    it('should have labels for all join types', () => {
      expect(JOIN_TYPE_LABELS.INNER).toBe('内连');
      expect(JOIN_TYPE_LABELS.LEFT).toBe('左连');
      expect(JOIN_TYPE_LABELS.RIGHT).toBe('右连');
      expect(JOIN_TYPE_LABELS.CROSS).toBe('交叉连接');
    });
  });

  describe('SQL_OPERATORS', () => {
    it('should have comparison operators', () => {
      expect(SQL_OPERATORS.comparison.length).toBeGreaterThan(0);
      expect(SQL_OPERATORS.comparison.some((op) => op.value === '=')).toBe(true);
      expect(SQL_OPERATORS.comparison.some((op) => op.value === '>')).toBe(true);
    });

    it('should have string operators', () => {
      expect(SQL_OPERATORS.string.length).toBeGreaterThan(0);
      expect(SQL_OPERATORS.string.some((op) => op.value === 'LIKE')).toBe(true);
    });

    it('should have null operators', () => {
      expect(SQL_OPERATORS.null.length).toBe(2);
      expect(SQL_OPERATORS.null.some((op) => op.value === 'IS NULL')).toBe(true);
    });

    it('should have set operators', () => {
      expect(SQL_OPERATORS.set.length).toBe(2);
      expect(SQL_OPERATORS.set.some((op) => op.value === 'IN')).toBe(true);
    });
  });

  describe('PERFORMANCE', () => {
    it('should have virtual scroll threshold', () => {
      expect(PERFORMANCE.virtualScrollThreshold).toBe(50);
      expect(PERFORMANCE.virtualScrollItemHeight).toBe(32);
    });

    it('should have debounce values', () => {
      expect(PERFORMANCE.nodeUpdateDebounce).toBe(100);
      expect(PERFORMANCE.validationDebounce).toBe(300);
    });

    it('should have limits defined', () => {
      expect(PERFORMANCE.maxTables).toBe(20);
      expect(PERFORMANCE.maxFieldsDisplay).toBe(5);
      expect(PERFORMANCE.maxConditions).toBe(50);
    });
  });
});
