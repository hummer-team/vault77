/**
 * Flow Store
 * Zustand store for managing analysis flow state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import {
  FlowNodeType,
  ValidationSeverity,
  type FlowState,
  type FlowNode,
  type FlowEdge,
  type FlowNodeData,
  type ValidationError,
  type OperatorType,
} from '../services/flow/types';
import { validateNode, validateFlow, validateNodeRemoval } from '../services/flow/validator';

// Initial state factory
const createInitialState = () => ({
  flowId: `flow_${Date.now()}`,
  flowName: '',
  operatorType: 'association' as OperatorType,
  defaultKernelName: null as string | null,
  nodes: [
    // Initialize with START NODE at center
    {
      id: 'start',
      type: 'start',
      position: { x: 50, y: 300 },
      data: {},
    },
  ] as FlowNode[],
  edges: [] as FlowEdge[],
  placeholderValues: {} as Record<string, unknown>,
  selectedNodeId: null as string | null,
  detailPanelOpen: false,
  errorPanelOpen: false,
  validationErrors: [] as ValidationError[],
});

export const useFlowStore = create<FlowState>()(
  immer((set, get) => ({
    ...createInitialState(),

    // Flow name
    setFlowName: (name: string) => {
      set((state) => {
        state.flowName = name;
      });
    },

    // Operator type
    setOperatorType: (type: OperatorType) => {
      set((state) => {
        state.operatorType = type;
      });

      // Re-validate entire flow when operator type changes
      const state = get();
      const errors = validateFlow(state.nodes, state.edges);
      set((state) => {
        state.validationErrors = errors;
      });
    },

    // Set all nodes (for layout updates)
    setNodes: (nodes: FlowNode[]) => {
      set((state) => {
        state.nodes = nodes;
      });
    },

    // Add node
    addNode: (node: FlowNode) => {
      set((state) => {
        state.nodes.push(node);
      });
      
      // Re-validate entire flow after adding node
      const state = get();
      const errors = validateFlow(state.nodes, state.edges);
      set((state) => {
        state.validationErrors = errors;
      });
    },

    // Update node with real-time validation
    updateNode: (id: string, data: Partial<FlowNodeData>) => {
      set((state) => {
        const node = state.nodes.find((n) => n.id === id);
        if (node) {
          node.data = { ...node.data, ...data };
        }
      });
      
      // Validate the updated node in real-time
      const state = get();
      const updatedNode = state.nodes.find((n) => n.id === id);
      if (updatedNode) {
        const nodeErrors = validateNode(updatedNode, state.nodes, state.edges);
        
        // Remove old errors for this node
        const otherErrors = state.validationErrors.filter((e) => e.nodeId !== id);
        
        set((state) => {
          state.validationErrors = [...otherErrors, ...nodeErrors];
        });
      }
    },

    // Remove node and related edges
    removeNode: (id: string) => {
      const state = get();

      // Check if node can be safely removed (Q16)
      const removalValidation = validateNodeRemoval(id, state.nodes);
      if (!removalValidation.canRemove) {
        console.warn('[FlowStore] Cannot remove node:', removalValidation.error);
        // Add error to validation errors
        const targetNode = state.nodes.find((n) => n.id === id);
        const newError: ValidationError = {
          nodeId: id,
          nodeType: targetNode?.type || FlowNodeType.END,
          message: removalValidation.error || 'Node is referenced by other nodes',
          severity: ValidationSeverity.ERROR,
        };
        set((state) => {
          state.validationErrors.push(newError);
          state.errorPanelOpen = true;
        });
        return;
      }

      set((state) => {
        // Remove node
        state.nodes = state.nodes.filter((n) => n.id !== id);
        // Remove related edges
        state.edges = state.edges.filter(
          (e) => e.source !== id && e.target !== id
        );
        // Clear selection if removed node was selected
        if (state.selectedNodeId === id) {
          state.selectedNodeId = null;
          state.detailPanelOpen = false;
        }
      });

      // Re-validate entire flow after removing node
      const newState = get();
      const errors = validateFlow(newState.nodes, newState.edges);
      set((state) => {
        state.validationErrors = errors;
      });
    },

    // Add edge
    addEdge: (edge: FlowEdge) => {
      set((state) => {
        // Check if edge already exists
        const exists = state.edges.some(
          (e) => e.source === edge.source && e.target === edge.target
        );
        if (!exists) {
          state.edges.push(edge);
        }
      });
      
      // Re-validate entire flow after adding edge
      const state = get();
      const errors = validateFlow(state.nodes, state.edges);
      set((state) => {
        state.validationErrors = errors;
      });
    },

    // Remove edge
    removeEdge: (id: string) => {
      set((state) => {
        state.edges = state.edges.filter((e) => e.id !== id);
      });
    },

    // Set selected node
    setSelectedNode: (id: string | null) => {
      set((state) => {
        state.selectedNodeId = id;
        state.detailPanelOpen = id !== null;
      });
    },

    // Detail panel
    setDetailPanelOpen: (open: boolean) => {
      set((state) => {
        state.detailPanelOpen = open;
        if (!open) {
          state.selectedNodeId = null;
        }
      });
    },

    // Error panel
    setErrorPanelOpen: (open: boolean) => {
      set((state) => {
        state.errorPanelOpen = open;
      });
    },

    // Validation errors
    setValidationErrors: (errors: ValidationError[]) => {
      set((state) => {
        state.validationErrors = errors;
        state.errorPanelOpen = errors.length > 0;
      });
    },

    // Reset flow
    resetFlow: () => {
      set(() => createInitialState());
    },

    setDefaultKernelName: (name: string | null) => {
      set((state) => {
        state.defaultKernelName = name;
      });
    },

    // Placeholder value actions
    setPlaceholderValue: (placeholder: string, value: unknown) => {
      console.log('[FlowStore] setPlaceholderValue called:', placeholder, '=', value);
      set((state) => {
        state.placeholderValues[placeholder] = value;
      });
      console.log('[FlowStore] Current placeholderValues:', get().placeholderValues);
    },

    getPlaceholderValue: (placeholder: string) => {
      return get().placeholderValues[placeholder];
    },

    getAllPlaceholderValues: () => {
      return get().placeholderValues;
    },

    clearPlaceholderValues: () => {
      set((state) => {
        state.placeholderValues = {};
      });
    },
  }))
);

// Selector hooks for performance
export const useFlowNodes = () => useFlowStore((state) => state.nodes);
export const useFlowEdges = () => useFlowStore((state) => state.edges);
export const useSelectedNode = () =>
  useFlowStore((state) =>
    state.nodes.find((n) => n.id === state.selectedNodeId)
  );
export const useFlowValidation = () =>
  useFlowStore((state) => ({
    errors: state.validationErrors,
    hasErrors: state.validationErrors.length > 0,
  }));
