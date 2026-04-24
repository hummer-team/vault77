/**
 * NodeNextButton
 * A small 18×18 "+" circle that sits on the right edge of any flow node.
 * Appears when the parent node is hovered and shows an action overlay menu.
 *
 * Usage in a node component:
 *   const [isHovering, setIsHovering] = useState(false);
 *   // add onMouseEnter/onMouseLeave to root div
 *   // render at the end of root div:
 *   <NodeNextButton nodeId={id} nodeType={FlowNodeType.TABLE} visible={isHovering} />
 */

import React, { useCallback, useRef, useState } from 'react';
import { PlusOutlined, PlayCircleOutlined, TableOutlined, ApartmentOutlined, LinkOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useMergeActions } from '../hooks/useMergeActions';
import { FlowNodeType } from '../../../services/flow/types';
import { useFlowStore } from '../../../stores/flowStore';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const OVERLAY_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: '100%',
  right: 0,
  marginBottom: 6,
  background: 'rgba(20, 20, 24, 0.97)',
  border: '1px solid rgba(255, 107, 0, 0.45)',
  borderRadius: 6,
  padding: '4px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  whiteSpace: 'nowrap',
  backdropFilter: 'blur(8px)',
  boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
  zIndex: 100,
};

const DIVIDER_STYLE: React.CSSProperties = {
  height: 1,
  background: 'var(--vm-surface-inset)',
  margin: '2px 0',
};

const MENU_BUTTON_BASE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'var(--vm-text-primary)',
  fontSize: 12,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  transition: 'background 0.15s ease',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NodeNextButtonProps {
  /** ID of the source node — used to create edges from it */
  nodeId: string;
  /** Type of the source node — determines which downstream node to create */
  nodeType: FlowNodeType;
  /** Whether the parent node is currently hovered */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NodeNextButton: React.FC<NodeNextButtonProps> = ({
  nodeId,
  nodeType,
  visible,
}) => {
  const { hintText, showDirectExecute, showExecuteSave, showSelectAction, showJoinAction, showBindAction, bindActionDisabled, handleCreateNextNode, handleDirectExecute, handleExecuteSave, handleCreateSelectNode, handleCreateJoinEdge } =
    useMergeActions(nodeId, nodeType);
  const setPendingConnectionSource = useFlowStore((state) => state.setPendingConnectionSource);

  const [showOverlay, setShowOverlay] = useState(false);
  const [buttonHovered, setButtonHovered] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    hideTimerRef.current = setTimeout(() => {
      setShowOverlay(false);
      setButtonHovered(false);
    }, 150);
  }, []);

  const handleButtonMouseEnter = useCallback(() => {
    cancelHide();
    setButtonHovered(true);
    setShowOverlay(true);
  }, [cancelHide]);

  const handleButtonMouseLeave = useCallback(() => {
    scheduleHide();
    setButtonHovered(false);
  }, [scheduleHide]);

  const handleOverlayMouseEnter = useCallback(() => {
    cancelHide();
  }, [cancelHide]);

  const handleOverlayMouseLeave = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  const onSelectCreate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleCreateSelectNode();
      setShowOverlay(false);
    },
    [handleCreateSelectNode]
  );

  const onJoinCreate = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleCreateJoinEdge();
      setShowOverlay(false);
    },
    [handleCreateJoinEdge]
  );

  const onPrimary = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleCreateNextNode();
      setShowOverlay(false);
    },
    [handleCreateNextNode]
  );

  const onDirectExecute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleDirectExecute();
      setShowOverlay(false);
    },
    [handleDirectExecute]
  );

  const onExecuteSave = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      handleExecuteSave();
      setShowOverlay(false);
    },
    [handleExecuteSave]
  );

  /**
   * Sets this node as the pending connection source so the user can click
   * on a ConditionGroupNode to complete the "bind relation" edge.
   */
  const onBindRelation = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setShowOverlay(false);
      setPendingConnectionSource(nodeId);
    },
    [nodeId, setPendingConnectionSource]
  );

  // Only mount when relevant
  if (!visible && !showOverlay) return null;

  return (
    // Outer wrapper anchors the button to the right edge of the parent node.
    // The parent must have position: relative (all flow nodes do).
    <div
      className="nodrag nopan"
      style={{
        position: 'absolute',
        right: -9,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 20,
      }}
    >
      {/* "+" circle button */}
      <div
        role="button"
        aria-label="添加下一步"
        onMouseEnter={handleButtonMouseEnter}
        onMouseLeave={handleButtonMouseLeave}
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: buttonHovered ? 'var(--vm-primary-hover)' : 'var(--vm-primary)',
          border: '2px solid var(--vm-text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: buttonHovered
            ? '0 0 10px rgba(255, 107, 0, 0.7)'
            : '0 2px 6px rgba(255, 107, 0, 0.4)',
          transform: buttonHovered ? 'scale(1.15)' : 'scale(1)',
          transition: 'all 0.15s ease',
        }}
      >
        <PlusOutlined style={{ fontSize: 9, color: 'var(--vm-text-primary)', lineHeight: 1 }} />
      </div>

      {/* Overlay action menu */}
      {showOverlay && (
        <div
          style={OVERLAY_STYLE}
          className="nodrag nopan"
          onMouseEnter={handleOverlayMouseEnter}
          onMouseLeave={handleOverlayMouseLeave}
        >
          {/* Primary action */}
          <button
            style={MENU_BUTTON_BASE}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'rgba(255, 107, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            }}
            onClick={onPrimary}
          >
            <PlusOutlined style={{ fontSize: 10 }} />
            <span>{hintText}</span>
          </button>

          {/* Select action — JOIN type only */}
          {showSelectAction && (
            <>
              <div style={DIVIDER_STYLE} />
              <button
                style={MENU_BUTTON_BASE}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(82, 196, 26, 0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
                onClick={onSelectCreate}
              >
                <TableOutlined style={{ fontSize: 10, color: '#52c41a' }} />
                <span>选择列</span>
              </button>
            </>
          )}

          {/* Join action — TABLE type only, when other tables exist */}
          {showJoinAction && (
            <>
              <div style={DIVIDER_STYLE} />
              <button
                style={MENU_BUTTON_BASE}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(24, 144, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
                onClick={onJoinCreate}
              >
                <ApartmentOutlined style={{ fontSize: 10, color: '#1890ff' }} />
                <span>表关联</span>
              </button>
            </>
          )}

          {/* Bind relation — CONDITION_DEFINITION type only.
              Disabled when no ConditionGroupNode exists on the canvas.
              Clicking closes the menu; the user then manually drags the
              source handle to the desired relation node. */}
          {showBindAction && (
            <>
              <div style={DIVIDER_STYLE} />
              <button
                disabled={bindActionDisabled}
                style={{
                  ...MENU_BUTTON_BASE,
                  opacity: bindActionDisabled ? 0.35 : 1,
                  cursor: bindActionDisabled ? 'not-allowed' : 'pointer',
                }}
                onMouseEnter={(e) => {
                  if (bindActionDisabled) return;
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(124, 58, 237, 0.12)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
                onClick={(e) => {
                  if (bindActionDisabled) return;
                  onBindRelation(e);
                }}
              >
                <LinkOutlined style={{ fontSize: 10, color: bindActionDisabled ? 'var(--vm-text-muted)' : '#7c3aed' }} />
                <span>绑定关系</span>
              </button>
            </>
          )}

          {/* Execute or Save — fast path for sole ConditionDefinitionNode (no CG nodes yet) */}
          {showExecuteSave && (
            <>
              <div style={DIVIDER_STYLE} />
              <button
                style={MENU_BUTTON_BASE}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(124, 58, 237, 0.12)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
                onClick={onExecuteSave}
              >
                <CheckCircleOutlined style={{ fontSize: 10, color: '#7c3aed' }} />
                <span>执行OR保存</span>
              </button>
            </>
          )}
          {/* Direct execute */}
          {showDirectExecute && (
            <>
              <div style={DIVIDER_STYLE} />
              <button
                style={MENU_BUTTON_BASE}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    'rgba(82, 196, 26, 0.1)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
                onClick={onDirectExecute}
              >
                <PlayCircleOutlined style={{ fontSize: 10, color: '#52c41a' }} />
                <span>直接执行</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NodeNextButton;
