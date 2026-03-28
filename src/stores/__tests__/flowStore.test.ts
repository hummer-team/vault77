/**
 * Flow Store Tests
 * Tests for Zustand flow store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useFlowStore } from '../flowStore';
import { FlowNodeType, OperatorType, JoinType } from '../../services/flow/types';

describe('Flow Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useFlowStore.getState().resetFlow();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useFlowStore.getState();
      expect(state.flowName).toBe('');
      expect(state.operatorType).toBe(OperatorType.ASSOCIATION);
      expect(state.nodes).toHaveLength(1); // Operator node is initialized by default
      expect(state.nodes[0].type).toBe(FlowNodeType.OPERATOR);
      expect(state.edges).toEqual([]);
      expect(state.selectedNodeId).toBeNull();
      expect(state.detailPanelOpen).toBe(false);
      expect(state.validationErrors).toEqual([]);
      expect(state.placeholderValues).toEqual({});
    });
  });

  describe('Flow Name', () => {
    it('should set flow name', () => {
      useFlowStore.getState().setFlowName('Test Flow');
      expect(useFlowStore.getState().flowName).toBe('Test Flow');
    });
  });

  describe('Operator Type', () => {
    it('should set operator type', () => {
      useFlowStore.getState().setOperatorType(OperatorType.ANOMALY);
      expect(useFlowStore.getState().operatorType).toBe(OperatorType.ANOMALY);
    });
  });

  describe('Nodes', () => {
    it('should add a node', () => {
      const node = {
        id: 'node-1',
        type: FlowNodeType.TABLE,
        position: { x: 100, y: 100 },
        data: {
          tableName: 'test_table',
          fields: [],
          expanded: false,
          alias: 't1',
        },
      };

      useFlowStore.getState().addNode(node as never);
      expect(useFlowStore.getState().nodes).toHaveLength(2); // Start node + added node
      expect(useFlowStore.getState().nodes[1].id).toBe('node-1');
    });

    it('should update a node', () => {
      const node = {
        id: 'node-1',
        type: FlowNodeType.TABLE,
        position: { x: 100, y: 100 },
        data: {
          tableName: 'test_table',
          fields: [],
          expanded: false,
          alias: 't1',
        },
      };

      useFlowStore.getState().addNode(node as never);
      useFlowStore.getState().updateNode('node-1', { alias: 'updated_alias' });

      const updatedNode = useFlowStore.getState().nodes.find((n) => n.id === 'node-1');
      expect((updatedNode?.data as { alias: string }).alias).toBe('updated_alias');
    });

    it('should remove a node', () => {
      const node = {
        id: 'node-1',
        type: FlowNodeType.TABLE,
        position: { x: 100, y: 100 },
        data: {
          tableName: 'test_table',
          fields: [],
          expanded: false,
          alias: 't1',
        },
      };

      useFlowStore.getState().addNode(node as never);
      useFlowStore.getState().removeNode('node-1');
      expect(useFlowStore.getState().nodes).toHaveLength(1); // Only operator node remains
    });

    it('should remove related edges when removing a node', () => {
      const node1 = {
        id: 'node-1',
        type: FlowNodeType.TABLE,
        position: { x: 100, y: 100 },
        data: { tableName: 'table1', fields: [], expanded: false, alias: 't1' },
      };
      const node2 = {
        id: 'node-2',
        type: FlowNodeType.TABLE,
        position: { x: 300, y: 100 },
        data: { tableName: 'table2', fields: [], expanded: false, alias: 't2' },
      };
      const edge = {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'smoothstep' as const,
      };

      useFlowStore.getState().addNode(node1 as never);
      useFlowStore.getState().addNode(node2 as never);
      useFlowStore.getState().addEdge(edge);

      useFlowStore.getState().removeNode('node-1');
      expect(useFlowStore.getState().edges).toHaveLength(0);
    });
  });

  describe('Edges', () => {
    it('should add an edge', () => {
      const edge = {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'smoothstep' as const,
      };

      useFlowStore.getState().addEdge(edge);
      expect(useFlowStore.getState().edges).toHaveLength(1);
    });

    it('should not add duplicate edges', () => {
      const edge = {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'smoothstep' as const,
      };

      useFlowStore.getState().addEdge(edge);
      useFlowStore.getState().addEdge(edge);
      expect(useFlowStore.getState().edges).toHaveLength(1);
    });

    it('should remove an edge', () => {
      const edge = {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'smoothstep' as const,
      };

      useFlowStore.getState().addEdge(edge);
      useFlowStore.getState().removeEdge('edge-1');
      expect(useFlowStore.getState().edges).toHaveLength(0);
    });
  });

  describe('Selection', () => {
    it('should set selected node', () => {
      useFlowStore.getState().setSelectedNode('node-1');
      expect(useFlowStore.getState().selectedNodeId).toBe('node-1');
      expect(useFlowStore.getState().detailPanelOpen).toBe(true);
    });

    it('should clear selection when setting null', () => {
      useFlowStore.getState().setSelectedNode('node-1');
      useFlowStore.getState().setSelectedNode(null);
      expect(useFlowStore.getState().selectedNodeId).toBeNull();
      expect(useFlowStore.getState().detailPanelOpen).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should set validation errors', () => {
      const errors = [
        {
          nodeId: 'node-1',
          nodeType: FlowNodeType.TABLE,
          message: 'Test error',
          severity: 'error' as const,
        },
      ];

      useFlowStore.getState().setValidationErrors(errors);
      expect(useFlowStore.getState().validationErrors).toEqual(errors);
      expect(useFlowStore.getState().errorPanelOpen).toBe(true);
    });
  });

  describe('Reset', () => {
    it('should reset flow to initial state', () => {
      useFlowStore.getState().setFlowName('Test Flow');
      useFlowStore.getState().setOperatorType(OperatorType.CLUSTERING);

      const node = {
        id: 'node-1',
        type: FlowNodeType.TABLE,
        position: { x: 100, y: 100 },
        data: { tableName: 'test', fields: [], expanded: false, alias: 't1' },
      };
      useFlowStore.getState().addNode(node as never);

      useFlowStore.getState().resetFlow();

      expect(useFlowStore.getState().flowName).toBe('');
      expect(useFlowStore.getState().operatorType).toBe(OperatorType.ASSOCIATION);
      expect(useFlowStore.getState().nodes).toHaveLength(1); // Only operator node remains
      expect(useFlowStore.getState().nodes[0].type).toBe(FlowNodeType.OPERATOR);
    });
  });

  describe('Placeholder Values', () => {
    it('should set placeholder value', () => {
      useFlowStore.getState().setPlaceholderValue('CG1_1', 'test_value');
      expect(useFlowStore.getState().placeholderValues['CG1_1']).toBe('test_value');
    });

    it('should get placeholder value', () => {
      useFlowStore.getState().setPlaceholderValue('CG1_1', 'test_value');
      const value = useFlowStore.getState().getPlaceholderValue('CG1_1');
      expect(value).toBe('test_value');
    });

    it('should return undefined for non-existent placeholder', () => {
      const value = useFlowStore.getState().getPlaceholderValue('NON_EXISTENT');
      expect(value).toBeUndefined();
    });

    it('should get all placeholder values', () => {
      useFlowStore.getState().setPlaceholderValue('CG1_1', 'value1');
      useFlowStore.getState().setPlaceholderValue('CG1_2', 'value2');
      const values = useFlowStore.getState().getAllPlaceholderValues();
      expect(values).toEqual({ CG1_1: 'value1', CG1_2: 'value2' });
    });

    it('should clear all placeholder values', () => {
      useFlowStore.getState().setPlaceholderValue('CG1_1', 'value1');
      useFlowStore.getState().clearPlaceholderValues();
      expect(useFlowStore.getState().placeholderValues).toEqual({});
    });

    it('should update existing placeholder value', () => {
      useFlowStore.getState().setPlaceholderValue('CG1_1', 'old_value');
      useFlowStore.getState().setPlaceholderValue('CG1_1', 'new_value');
      expect(useFlowStore.getState().placeholderValues['CG1_1']).toBe('new_value');
    });
  });
});
