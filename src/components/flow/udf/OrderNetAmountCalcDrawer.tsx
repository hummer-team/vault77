/**
 * OrderNetAmountCalcDrawer
 *
 * Configuration drawer for fn_ecom_order_net_amount_calc (订单净额计算 — 退款后实收).
 *
 * Phase 0 stub — full implementation in Phase 2.
 */

import React from 'react';
import { Drawer, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { NetAmountCalcConfig } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

export interface OrderNetAmountCalcDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: NetAmountCalcConfig;
  kernelDisplayName?: string;
  kernelIndustry?: string;
  kernelCategory?: string;
  onConfirm: (config: NetAmountCalcConfig) => void;
  onCancel: () => void;
}

export const OrderNetAmountCalcDrawer: React.FC<OrderNetAmountCalcDrawerProps> = ({
  open,
  onCancel,
}) => {
  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: TOKEN.textPrimary }}>订单净额计算（退款后实收）</span>
        </div>
      }
      open={open}
      onClose={onCancel}
      width={480}
      closeIcon={<CloseOutlined style={{ color: TOKEN.textMuted }} />}
      styles={{
        header: { background: TOKEN.bgHeader, borderBottom: `1px solid ${TOKEN.borderSubtle}` },
        body: { background: TOKEN.bgBase, color: TOKEN.textPrimary, padding: '16px 20px' },
      }}
    >
      <Text style={{ fontSize: 12, color: TOKEN.textMuted }}>
        Phase 0 stub — full implementation in Phase 2.
      </Text>
    </Drawer>
  );
};

export default OrderNetAmountCalcDrawer;
