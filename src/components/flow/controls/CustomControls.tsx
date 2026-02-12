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
        left: '20px',
        bottom: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        background: 'rgba(28, 25, 23, 0.95)',
        border: '1px solid rgba(68, 64, 60, 0.6)',
        borderRadius: '10px',
        padding: '8px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 107, 0, 0.1)',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}
    >
      <Tooltip title="放大" placement="right">
        <Button
          type="text"
          icon={<PlusOutlined style={{ fontSize: '16px' }} />}
          onClick={() => zoomIn()}
          style={{
            width: '36px',
            height: '36px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 107, 0, 0.15)';
            e.currentTarget.style.color = '#FF6B00';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: 'rgba(68, 64, 60, 0.5)', margin: '2px 4px' }} />

      <Tooltip title="缩小" placement="right">
        <Button
          type="text"
          icon={<MinusOutlined style={{ fontSize: '16px' }} />}
          onClick={() => zoomOut()}
          style={{
            width: '36px',
            height: '36px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 107, 0, 0.15)';
            e.currentTarget.style.color = '#FF6B00';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: 'rgba(68, 64, 60, 0.5)', margin: '2px 4px' }} />

      <Tooltip title="适应屏幕" placement="right">
        <Button
          type="text"
          icon={<ExpandOutlined style={{ fontSize: '16px' }} />}
          onClick={() => fitView({ padding: 0.2 })}
          style={{
            width: '36px',
            height: '36px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: 'rgba(255, 255, 255, 0.7)',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 107, 0, 0.15)';
            e.currentTarget.style.color = '#FF6B00';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: 'rgba(68, 64, 60, 0.5)', margin: '2px 4px' }} />

      <Tooltip title={isLocked ? '解锁画布' : '锁定画布'} placement="right">
        <Button
          type="text"
          icon={
            isLocked ? (
              <LockOutlined style={{ fontSize: '16px', color: '#FF6B00' }} />
            ) : (
              <UnlockOutlined style={{ fontSize: '16px' }} />
            )
          }
          onClick={toggleLock}
          style={{
            width: '36px',
            height: '36px',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            background: 'transparent',
            color: isLocked ? '#FF6B00' : 'rgba(255, 255, 255, 0.7)',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!isLocked) {
              e.currentTarget.style.background = 'rgba(255, 107, 0, 0.15)';
              e.currentTarget.style.color = '#FF6B00';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLocked) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }
          }}
        />
      </Tooltip>
    </div>
  );
};

export default CustomControls;
