/**
 * Customer Context Menu
 * Right-click context menu component for scatter plot customer points.
 * Current phase: Menu items are disabled, reserved for future expansion.
 */

import React, { useEffect } from 'react';
import { UserOutlined, BarChartOutlined } from '@ant-design/icons';

export interface CustomerContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  customerId: string;
  onClose: () => void;
  onViewDetails?: (customerId: string) => void;  // Future implementation
  onCompare?: (customerId: string) => void;      // Future implementation
}

export const CustomerContextMenu: React.FC<CustomerContextMenuProps> = ({
  visible,
  x,
  y,
  customerId,
  onClose,
  onViewDetails,
  onCompare,
}) => {
  // Calculate menu position with boundary detection to prevent overflow
  const menuWidth = 220;
  const menuHeight = 150;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 10);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 10);
  
  console.log('[CustomerContextMenu] Render:', { 
    visible, 
    original: { x, y }, 
    adjusted: { x: adjustedX, y: adjustedY },
    customerId 
  });

  // Close menu when clicking outside
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.customer-context-menu')) {
        console.log('[CustomerContextMenu] Click outside, closing menu');
        onClose();
      }
    };

    // Delay listener registration to prevent immediate trigger
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 200);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [visible, onClose]);

  // Close menu on ESC key press
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);

  if (!visible) return null;

  const isViewDisabled = !onViewDetails;
  const isCompareDisabled = !onCompare;

  return (
    <div
      className="customer-context-menu"
      style={{
        position: 'absolute',
        left: adjustedX,
        top: adjustedY,
        zIndex: 99999,
        background: 'linear-gradient(135deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.95))',
        border: '1px solid rgba(100, 100, 100, 0.3)',
        borderRadius: '8px',
        padding: '8px 0',
        minWidth: '200px',
        maxWidth: '240px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.7), 0 0 1px rgba(255, 255, 255, 0.1) inset',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Menu item 1: View customer details */}
      <div
        className="menu-item"
        onClick={isViewDisabled ? undefined : () => onViewDetails?.(customerId)}
        style={{
          padding: '12px 16px',
          color: isViewDisabled ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.9)',
          cursor: isViewDisabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!isViewDisabled) {
            e.currentTarget.style.background = 'rgba(64, 169, 255, 0.15)';
            e.currentTarget.style.color = 'rgba(100, 200, 255, 1)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = isViewDisabled ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.9)';
        }}
      >
        <UserOutlined style={{ marginRight: 12, fontSize: 14, opacity: 0.8 }} />
        <span>查看客户详情</span>
      </div>

      {/* Separator */}
      <div
        style={{
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.15), transparent)',
          margin: '6px 12px',
        }}
      />

      {/* Menu item 2: Compare with cluster average */}
      <div
        className="menu-item"
        onClick={isCompareDisabled ? undefined : () => onCompare?.(customerId)}
        style={{
          padding: '12px 16px',
          color: isCompareDisabled ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.9)',
          cursor: isCompareDisabled ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          if (!isCompareDisabled) {
            e.currentTarget.style.background = 'rgba(64, 169, 255, 0.15)';
            e.currentTarget.style.color = 'rgba(100, 200, 255, 1)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = isCompareDisabled ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.9)';
        }}
      >
        <BarChartOutlined style={{ marginRight: 12, fontSize: 14, opacity: 0.8 }} />
        <span>与分群平均对比</span>
      </div>

      {/* Customer ID display */}
      <div
        style={{
          padding: '10px 16px',
          fontSize: '11px',
          fontWeight: 500,
          color: 'rgba(255, 255, 255, 0.5)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          marginTop: '6px',
          background: 'rgba(0, 0, 0, 0.2)',
          letterSpacing: '0.5px',
        }}
      >
        <span style={{ opacity: 0.6 }}>ID:</span> {customerId}
      </div>
    </div>
  );
};
