/**
 * Canvas Toolbar Component
 * Toolbar for canvas-level operations: delete all nodes and auto-format layout
 */

import React from 'react';
import { Button, Tooltip } from 'antd';
import { DeleteOutlined, LayoutOutlined } from '@ant-design/icons';
import { useReactFlow, Position } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { useFlowStore } from '../../../stores/flowStore';
import type { FlowNode, FlowEdge } from '../../../services/flow/types';

// Node dimensions for layout calculation - optimized for visual compactness
const NODE_WIDTH = 180; // Reduced from 240 for tighter layout
const NODE_HEIGHT = 60; // Slightly larger for better visibility
const LAYER_SPACING = 200; // Reduced from 300 for closer horizontal spacing
const NODE_SPACING = 80; // Reduced from 150 for closer vertical spacing

/**
 * Calculate layouted positions using dagre algorithm
 * Arranges nodes in a hierarchical left-to-right layout
 */
const getLayoutedElements = (
  nodes: FlowNode[],
  edges: FlowEdge[],
  direction: 'LR' | 'TB' = 'LR'
) => {
  // Create a new dagre graph instance for each layout calculation
  const dagreGraph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const isHorizontal = direction === 'LR';

  dagreGraph.setGraph({
    rankdir: direction,
    ranksep: LAYER_SPACING, // Horizontal spacing between layers
    nodesep: NODE_SPACING,   // Vertical spacing between nodes in same layer
    edgesep: 30,             // Edge separation
    marginx: 30,             // Horizontal margin
    marginy: 30,             // Vertical margin
    align: 'DL',             // Align down-left for compact layout
    acyclicer: 'greedy',     // Use greedy algorithm for better edge routing
    ranker: 'network-simplex', // Algorithm for rank assignment
  });

  // Add nodes to dagre graph with dimensions
  // Use fixed dimensions for consistent layout
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
  });

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Run dagre layout algorithm
  dagre.layout(dagreGraph);

  // Map dagre results back to React Flow nodes
  const layoutedNodes: FlowNode[] = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // Calculate position (dagre returns center point, React Flow uses top-left)
    const newX = nodeWithPosition.x - NODE_WIDTH / 2;
    const newY = nodeWithPosition.y - NODE_HEIGHT / 2;

    return {
      ...node,
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
      position: {
        x: newX,
        y: newY,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export const CanvasToolbar: React.FC = () => {
  const { fitView, setNodes: setReactFlowNodes, getNodes, getEdges } = useReactFlow();
  const storeNodes = useFlowStore((state) => state.nodes);
  const removeNode = useFlowStore((state) => state.removeNode);
  const setStoreNodes = useFlowStore((state) => state.setNodes);

  /**
   * Delete all nodes except the start node
   */
  const handleDeleteAll = () => {
    storeNodes.forEach((node) => {
      if (node.type !== 'start') {
        removeNode(node.id);
      }
    });
  };

  /**
   * Auto-format node layout using dagre algorithm
   * Arranges nodes in a hierarchical left-to-right layout
   */
  const handleFormatLayout = () => {
    // Get current nodes and edges from React Flow
    const currentNodes = getNodes() as FlowNode[];
    const currentEdges = getEdges() as FlowEdge[];

    if (currentNodes.length <= 1) return;

    // eslint-disable-next-line no-console
    console.log('[CanvasToolbar] Before layout:', currentNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })));

    // Calculate layouted positions
    const { nodes: layoutedNodes } = getLayoutedElements(currentNodes, currentEdges, 'LR');

    // eslint-disable-next-line no-console
    console.log('[CanvasToolbar] After layout:', layoutedNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })));

    // Update React Flow nodes directly with new positions
    // Force update by creating completely new node objects
    const updatedNodes = layoutedNodes.map(node => ({
      ...node,
      // Force React Flow to recognize the change
      position: { ...node.position },
    }));

    setReactFlowNodes(updatedNodes);

    // Also update store to persist the layout
    setStoreNodes([...updatedNodes]);

    // Fit view after layout adjustment with animation
    // Use larger padding to keep nodes at comfortable zoom level
    setTimeout(() => {
      fitView({
        padding: 0.05,          // Smaller padding = closer zoom
        minZoom: 0.5,           // Prevent zooming out too much
        maxZoom: 1.5,           // Prevent zooming in too much
        duration: 400,
        includeHiddenNodes: false,
      });
    }, 100);
  };

  // Check if there are any deletable nodes
  const hasDeletableNodes = storeNodes.some((node) => node.type !== 'start');

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(28, 25, 23, 0.95)',
        border: '1px solid rgba(68, 64, 60, 0.6)',
        borderRadius: '10px',
        padding: '8px 16px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 107, 0, 0.1)',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}
    >
      <Tooltip title="Delete All Nodes (except Start)" placement="bottom">
        <Button
          type="text"
          icon={<DeleteOutlined style={{ fontSize: '16px' }} />}
          onClick={handleDeleteAll}
          disabled={!hasDeletableNodes}
          style={{
            width: '36px',
            height: '36px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: hasDeletableNodes ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (hasDeletableNodes) {
              e.currentTarget.style.background = 'rgba(255, 77, 79, 0.15)';
              e.currentTarget.style.color = '#ff4d4f';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(255, 77, 79, 0.2)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = hasDeletableNodes
              ? 'rgba(255, 255, 255, 0.7)'
              : 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </Tooltip>

      <div
        style={{
          width: '1px',
          height: '20px',
          background: 'rgba(68, 64, 60, 0.5)',
        }}
      />

      <Tooltip title="Auto Format Layout" placement="bottom">
        <Button
          type="text"
          icon={<LayoutOutlined style={{ fontSize: '16px' }} />}
          onClick={handleFormatLayout}
          disabled={storeNodes.length <= 1}
          style={{
            width: '36px',
            height: '36px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: storeNodes.length > 1 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.3)',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (storeNodes.length > 1) {
              e.currentTarget.style.background = 'rgba(255, 107, 0, 0.15)';
              e.currentTarget.style.color = '#FF6B00';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(255, 107, 0, 0.2)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color =
              storeNodes.length > 1 ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
      </Tooltip>
    </div>
  );
};

export default CanvasToolbar;
