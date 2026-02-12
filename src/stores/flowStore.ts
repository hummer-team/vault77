/**
 * Flow Store
 * Zustand store for managing analysis flow state
 */

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  FlowState,
  FlowNode,
  FlowEdge,
  FlowNodeData,
  ValidationError,
  OperatorType,
} from '../services/flow/types';
import { validateNode, validateFlow } from '../services/flow/validator';

// Initial state factory
const createInitialState = () => ({
  flowId: `flow_${Date.now()}`,
  flowName: '',
  operatorType: 'association' as OperatorType,
  nodes: [
    // Initialize with START NODE at center
    {
      id: 'start',
      type: 'start',
      position: { x: 400, y: 300 },
      data: {},
    },
  ] as FlowNode[],
  edges: [] as FlowEdge[],
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
      const state = get();
      const errors = validateFlow(state.nodes, state.edges);
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
