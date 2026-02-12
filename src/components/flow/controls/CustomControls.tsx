/**
 * Custom Controls Component
 * Custom zoom controls without React Flow watermark
 * Reference: design/img/img_8.png
 */

import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import {
  PlusOutlined,
  MinusOutlined,
  ExpandOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { useReactFlow } from '@xyflow/react';

interface CustomControlsProps {
  className?: string;
}

export const CustomControls: React.FC<CustomControlsProps> = ({ className }) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const [isLocked, setIsLocked] = useState(false);

  const toggleLock = () => {
    setIsLocked(!isLocked);
    // Note: React Flow v12 doesn't have setInteractive in useReactFlow
    // Lock functionality would need to be implemented via props on ReactFlow component
  };

  return (
    <div
      className={`custom-controls ${className || ''}`}
      style={{
        position: 'absolute',
        left: '16px',
        bottom: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        background: '#1f1f1f',
        border: '1px solid #434343',
        borderRadius: '4px',
        padding: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        zIndex: 10,
      }}
    >
      <Tooltip title="放大" placement="right">
        <Button
          type="text"
          icon={<PlusOutlined style={{ fontSize: '16px', color: '#fff' }} />}
          onClick={() => zoomIn()}
          style={{
            width: '32px',
            height: '32px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: '#434343', margin: '2px 0' }} />

      <Tooltip title="缩小" placement="right">
        <Button
          type="text"
          icon={<MinusOutlined style={{ fontSize: '16px', color: '#fff' }} />}
          onClick={() => zoomOut()}
          style={{
            width: '32px',
            height: '32px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: '#434343', margin: '2px 0' }} />

      <Tooltip title="适应屏幕" placement="right">
        <Button
          type="text"
          icon={<ExpandOutlined style={{ fontSize: '16px', color: '#fff' }} />}
          onClick={() => fitView({ padding: 0.2 })}
          style={{
            width: '32px',
            height: '32px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: '#434343', margin: '2px 0' }} />

      <Tooltip title={isLocked ? '解锁画布' : '锁定画布'} placement="right">
        <Button
          type="text"
          icon={
            isLocked ? (
              <LockOutlined style={{ fontSize: '16px', color: '#fa8c16' }} />
            ) : (
              <UnlockOutlined style={{ fontSize: '16px', color: '#fff' }} />
            )
          }
          onClick={toggleLock}
          style={{
            width: '32px',
            height: '32px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
          }}
        />
      </Tooltip>
    </div>
  );
};

export default CustomControls;
