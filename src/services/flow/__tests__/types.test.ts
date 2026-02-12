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
} from '../types';

describe('Flow Enums', () => {
  describe('FlowNodeType', () => {
    it('should have correct node types', () => {
      expect(FlowNodeType.START).toBe('start');
      expect(FlowNodeType.TABLE).toBe('table');
      expect(FlowNodeType.JOIN).toBe('join');
      expect(FlowNodeType.CONDITION).toBe('condition');
      expect(FlowNodeType.CONDITION_GROUP).toBe('conditionGroup');
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
