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
import { useReactFlow, useViewport } from '@xyflow/react';
import { TOKEN } from '../../../theme';

interface CustomControlsProps {
  className?: string;
}

export const CustomControls: React.FC<CustomControlsProps> = ({ className }) => {
  const { zoomIn, zoomOut, fitView, zoomTo } = useReactFlow();
  const { zoom } = useViewport();
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
        background: 'var(--vm-flow-node-bg)',
        border: '1px solid var(--vm-border-mid)',
        borderRadius: '10px',
        padding: '8px',
        boxShadow: 'var(--vm-flow-shadow-control)',
        zIndex: 10,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Zoom group: zoom-in / percentage / zoom-out — no dividers inside */}
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
            color: TOKEN.textSecondary,
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vm-primary-light)';
            e.currentTarget.style.color = 'var(--vm-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = TOKEN.textSecondary;
          }}
        />
      </Tooltip>

      {/* Zoom percentage — click to reset to 100% */}
      <Tooltip title="重置缩放" placement="right">
        <div
          onClick={() => zoomTo(1)}
          style={{
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: TOKEN.textSecondary,
            fontSize: '11px',
            fontVariantNumeric: 'tabular-nums',
            userSelect: 'none',
            borderRadius: '6px',
            transition: 'all 0.2s ease',
            padding: '0 4px',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'var(--vm-primary-light)';
            (e.currentTarget as HTMLDivElement).style.color = 'var(--vm-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            (e.currentTarget as HTMLDivElement).style.color = TOKEN.textSecondary;
          }}
        >
          {Math.round(zoom * 100)}%
        </div>
      </Tooltip>

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
            color: TOKEN.textSecondary,
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vm-primary-light)';
            e.currentTarget.style.color = 'var(--vm-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = TOKEN.textSecondary;
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: 'var(--vm-border-subtle)', margin: '2px 4px' }} />

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
            color: TOKEN.textSecondary,
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vm-primary-light)';
            e.currentTarget.style.color = 'var(--vm-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = TOKEN.textSecondary;
          }}
        />
      </Tooltip>

      <div style={{ height: '1px', background: 'var(--vm-border-subtle)', margin: '2px 4px' }} />

      <Tooltip title={isLocked ? '解锁画布' : '锁定画布'} placement="right">
        <Button
          type="text"
          icon={
            isLocked ? (
              <LockOutlined style={{ fontSize: '16px', color: 'var(--vm-primary)' }} />
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
            color: isLocked ? TOKEN.primary : TOKEN.textSecondary,
            borderRadius: '8px',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            if (!isLocked) {
              e.currentTarget.style.background = 'var(--vm-primary-light)';
              e.currentTarget.style.color = 'var(--vm-primary)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isLocked) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = TOKEN.textSecondary;
            }
          }}
        />
      </Tooltip>
    </div>
  );
};

export default CustomControls;
