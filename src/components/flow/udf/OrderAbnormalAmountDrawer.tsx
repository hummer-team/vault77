/**
 * OrderAbnormalAmountDrawer
 *
 * Configuration drawer for fn_ecom_abnormal_amount (异常金额监控).
 * Allows users to map required/optional fields and configure detection parameters.
 *
 * Phase 3 will implement the full UI. This stub satisfies Phase 1 type registration.
 */

import React from 'react';
import { Drawer, Typography } from 'antd';
import type { AbnormalAmountConfig } from '../../../services/flow/types';

const { Text } = Typography;

interface OrderAbnormalAmountDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: AbnormalAmountConfig;
  kernelDisplayName?: string;
  kernelIndustry?: string;
  kernelCategory?: string;
  onConfirm: (config: AbnormalAmountConfig) => void;
  onCancel: () => void;
}

export const OrderAbnormalAmountDrawer: React.FC<OrderAbnormalAmountDrawerProps> = ({
  open,
  kernelDisplayName = '异常金额监控',
  kernelCategory = '风险风控',
  onCancel,
}) => {
  return (
    <Drawer
      title={
        <span>
          {kernelDisplayName}
          <Text
            type="secondary"
            style={{ fontSize: 12, marginLeft: 8, color: 'var(--vm-text-secondary)' }}
          >
            {kernelCategory}
          </Text>
        </span>
      }
      open={open}
      onClose={onCancel}
      width={480}
      styles={{ body: { background: 'var(--vm-bg-base)', color: 'var(--vm-text-primary)' } }}
    >
      <Text style={{ color: 'var(--vm-text-secondary)' }}>
        配置界面开发中（Phase 3）
      </Text>
    </Drawer>
  );
};

export default OrderAbnormalAmountDrawer;
