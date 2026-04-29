/**
 * Reusable hooks for resolving joined tables from the canvas topology.
 *
 * Two variants are provided:
 *
 * - `useUpstreamJoinedTables(nodeId)` — traces backwards from a specific node
 *   (e.g. SelectNode / UdfConfigNode) through flow edges to find upstream table
 *   nodes, then expands via configured join edges. Best when the calling node
 *   has direct upstream edges to table nodes.
 *
 * - `useCanvasJoinedTables()` — returns all tables connected via at least one
 *   configured join edge on the entire canvas. Use this for nodes that may NOT
 *   have direct upstream connections to table nodes (e.g. ConditionGroupDefinitionNode).
 *
 * Both hooks are backed by `flowService` utilities and recalculate automatically
 * when the flow store's nodes/edges change (no manual cache invalidation needed).
 */

import { useMemo } from 'react';
import { useFlowStore } from '../../../stores/flowStore';
import {
  getUpstreamConfiguredJoinedTables,
  getCanvasJoinedTables,
} from '../../../services/flow/flowService';

/**
 * Returns the list of tables upstream of the given node that participate in
 * configured join edges. Recalculates whenever nodes or edges change.
 *
 * @param nodeId  The node ID to trace upstream from (SelectNode / UdfConfigNode).
 */
export function useUpstreamJoinedTables(nodeId: string): string[] {
  const nodes = useFlowStore((state) => state.nodes);
  const edges = useFlowStore((state) => state.edges);
  return useMemo(
    () => getUpstreamConfiguredJoinedTables(nodeId, nodes, edges),
    [nodeId, nodes, edges]
  );
}

/**
 * Returns ALL tables connected via configured join edges anywhere on the canvas.
 * Does not require a specific starting node — use for ConditionGroupDefinitionNode
 * and any other node that isn't directly connected upstream to table nodes.
 */
export function useCanvasJoinedTables(): string[] {
  const edges = useFlowStore((state) => state.edges);
  return useMemo(() => getCanvasJoinedTables(edges), [edges]);
}
