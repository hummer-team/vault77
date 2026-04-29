/**
 * FlowAttachmentsContext
 *
 * PROBLEM SOLVED:
 * =================
 * When implementing table name mapping (displaying user-friendly file names instead of technical
 * names like 'main_table_1'), we faced a "prop drilling" challenge:
 *
 * 1. Multiple Flow components (DataSourceNode, JoinNode, TableJoinBuildPanel) need to access
 *    attachments data to compute display name mappings.
 *
 * 2. These components exist at different depths in the component tree:
 *    - DataSourceNode: Direct child of FlowCanvas
 *    - JoinNode: Direct child of FlowCanvas
 *    - TableJoinBuildPanel: Dynamically rendered in NodeToolbar, nested deeper
 *
 * 3. Without a shared context:
 *    - FlowCanvas would need to pass attachments through all intermediate components (prop drilling)
 *    - NodeToolbar would need attachments prop even though it doesn't use it
 *    - Components become tightly coupled to parent prop chain
 *    - Difficult to add new components that need attachments in the future
 *
 * SOLUTION:
 * ==========
 * This Context provides a clean, decoupled way for all Flow descendants to access attachments
 * without prop drilling:
 *
 * 1. FlowCanvas wraps its children with FlowAttachmentsProvider
 * 2. Any component can call useFlowAttachments() hook to get attachments
 * 3. No intermediate components need to know about attachments
 * 4. Scales well: adding new components that need attachments is trivial
 *
 * WHY NOT ALTERNATIVE APPROACHES:
 * - Store in Zustand flowStore? Attachments are UI layer concern, not persisted state
 * - Pass as prop to every component? Creates prop drilling, tight coupling
 * - Parent re-compute in each component? Redundant, violation of single responsibility
 *
 * DESIGN DETAILS:
 * - Minimal context value: only contains attachments array
 * - Zero performance overhead: context wrapped at FlowCanvas level (top of canvas tree)
 * - Graceful fallback: useFlowAttachments() returns empty array if context not found
 * - Used by: DataSourceNode, JoinNode, TableJoinBuildPanel for friendly name mapping
 */

import React, { createContext, useContext } from 'react';
import type { Attachment } from '../../../types/workbench.types';

interface FlowAttachmentsContextType {
  attachments: Attachment[];
}

const FlowAttachmentsContext = createContext<FlowAttachmentsContextType | undefined>(undefined);

export const FlowAttachmentsProvider: React.FC<{
  attachments: Attachment[];
  children: React.ReactNode;
}> = ({ attachments, children }) => {
  return (
    <FlowAttachmentsContext.Provider value={{ attachments }}>
      {children}
    </FlowAttachmentsContext.Provider>
  );
};

/**
 * Hook to access file attachments from within Flow components
 */
export const useFlowAttachments = (): Attachment[] => {
  const context = useContext(FlowAttachmentsContext);
  if (!context) {
    return [];
  }
  return context.attachments;
};
