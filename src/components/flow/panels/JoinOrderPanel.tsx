/**
 * Join Order Panel Component
 * Right-side panel for controlling JOIN execution order
 * Supports drag-and-drop reordering
 */

import React, { useCallback, useMemo } from 'react';
import { Drawer, List, Tag, Space, Button, Empty } from 'antd';
import {
  DragOutlined,
  InfoCircleOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
} from '@ant-design/icons';
import { useFlowStore } from '../../../stores/flowStore';
import type { JoinNodeData, FlowNode } from '../../../services/flow/types';
import { JOIN_TYPE_LABELS } from '../../../services/flow/constants';

interface JoinOrderPanelProps {
  open: boolean;
  onClose: () => void;
}

// Join type colors
const JOIN_TYPE_COLORS: Record<string, string> = {
  INNER: '#52c41a',
  LEFT: '#1890ff',
  RIGHT: '#fa8c16',
  CROSS: '#722ed1',
};

export const JoinOrderPanel: React.FC<JoinOrderPanelProps> = ({
  open,
  onClose,
}) => {
  const nodes = useFlowStore((state) => state.nodes);
  const updateNode = useFlowStore((state) => state.updateNode);
  const setSelectedNode = useFlowStore((state) => state.setSelectedNode);

  // Get all join nodes sorted by order
  const joinNodes = useMemo(() => {
    const joins = nodes.filter((n) => n.type === 'join') as FlowNode[];
    return joins
      .map((node) => ({
        node,
        data: node.data as JoinNodeData,
      }))
      .sort((a, b) => a.data.order - b.data.order);
  }, [nodes]);

  // Move join up in order
  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;

      const current = joinNodes[index];
      const previous = joinNodes[index - 1];

      // Swap orders
      updateNode(current.node.id, { order: previous.data.order });
      updateNode(previous.node.id, { order: current.data.order });
    },
    [joinNodes, updateNode]
  );

  // Move join down in order
  const moveDown = useCallback(
    (index: number) => {
      if (index >= joinNodes.length - 1) return;

      const current = joinNodes[index];
      const next = joinNodes[index + 1];

      // Swap orders
      updateNode(current.node.id, { order: next.data.order });
      updateNode(next.node.id, { order: current.data.order });
    },
    [joinNodes, updateNode]
  );

  // Handle click on join item
  const handleJoinClick = useCallback(
    (nodeId: string) => {
      setSelectedNode(nodeId);
      onClose();
    },
    [setSelectedNode, onClose]
  );

  return (
    <Drawer
      title={
        <Space>
          <InfoCircleOutlined />
          <span>JOIN 执行顺序</span>
        </Space>
      }
      placement="right"
      width={360}
      open={open}
      onClose={onClose}
      mask={false}
      style={{
        background: '#141414',
      }}
      headerStyle={{
        background: '#1f1f1f',
        borderBottom: '1px solid #303030',
        color: '#fff',
      }}
      bodyStyle={{
        padding: '16px',
      }}
    >
      {joinNodes.length === 0 ? (
        <Empty
          description="暂无 JOIN 节点"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ color: '#8c8c8c' }}
        />
      ) : (
        <>
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: 'rgba(250, 140, 22, 0.1)',
              borderRadius: 4,
              border: '1px solid rgba(250, 140, 22, 0.3)',
            }}
          >
            <div style={{ color: '#fa8c16', fontSize: 12, marginBottom: 4 }}>
              提示
            </div>
            <div style={{ color: '#d9d9d9', fontSize: 12 }}>
              JOIN 按照顺序号从小到大依次执行。调整顺序可改变查询执行计划。
            </div>
          </div>

          <List
            dataSource={joinNodes}
            renderItem={({ node, data }, index) => (
              <List.Item
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  background: '#1f1f1f',
                  border: '1px solid #303030',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => handleJoinClick(node.id)}
              >
                <div style={{ width: '100%' }}>
                  {/* Header with order badge */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    {/* Order badge */}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: JOIN_TYPE_COLORS[data.joinType],
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 8,
                      }}
                    >
                      {data.order}
                    </div>

                    {/* Drag handle */}
                    <DragOutlined
                      style={{
                        color: '#8c8c8c',
                        marginRight: 8,
                        cursor: 'grab',
                      }}
                    />

                    {/* Join type */}
                    <Tag
                      color={JOIN_TYPE_COLORS[data.joinType]}
                      style={{ margin: 0 }}
                    >
                      {JOIN_TYPE_LABELS[data.joinType]}
                    </Tag>

                    {/* Spacer */}
                    <div style={{ flex: 1 }} />

                    {/* Move buttons */}
                    <Space size={4}>
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowUpOutlined />}
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveUp(index);
                        }}
                        style={{ color: index === 0 ? '#434343' : '#8c8c8c' }}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<ArrowDownOutlined />}
                        disabled={index === joinNodes.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveDown(index);
                        }}
                        style={{
                          color:
                            index === joinNodes.length - 1
                              ? '#434343'
                              : '#8c8c8c',
                        }}
                      />
                    </Space>
                  </div>

                  {/* Tables info */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <Tag
                      color="default"
                      style={{
                        fontSize: 11,
                        maxWidth: 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {data.leftTable}
                    </Tag>
                    <span style={{ color: '#8c8c8c', fontSize: 12 }}>→</span>
                    <Tag
                      color="default"
                      style={{
                        fontSize: 11,
                        maxWidth: 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {data.rightTable}
                    </Tag>
                  </div>

                  {/* Conditions count */}
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color:
                        data.conditions.length === 0 ? '#ff4d4f' : '#8c8c8c',
                    }}
                  >
                    {data.conditions.length === 0
                      ? '⚠️ 未配置关联条件'
                      : `${data.conditions.length} 个关联条件`}
                  </div>
                </div>
              </List.Item>
            )}
          />
        </>
      )}
    </Drawer>
  );
};

export default JoinOrderPanel;
