/**
 * RfmDrawer — configuration drawer for fn_ecom_rfm_profile kernel.
 *
 * Users select the user_id / order_time / amount columns, set nClusters (2–10)
 * and scalingMode.
 *
 * NOTE: Phase 1 skeleton — renders empty Drawer placeholder.
 *       Full UI implementation in Phase 3.
 */

import React from 'react';
import { Drawer } from 'antd';
import type { RfmProfileConfig, Field } from '../../../services/flow/types';

export interface RfmDrawerProps {
  open: boolean;
  columns: Field[];
  initialConfig?: RfmProfileConfig;
  onConfirm: (config: RfmProfileConfig) => void;
  onClose: () => void;
}

/**
 * Skeleton drawer — will be replaced with full form in Phase 3.
 */
const RfmDrawer: React.FC<RfmDrawerProps> = ({ open, onClose }) => {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="RFM 用户画像配置"
      width={480}
      destroyOnClose
    >
      {/* Phase 3: column mapping form + nClusters / scalingMode controls */}
      <span style={{ color: 'var(--vm-text-secondary)' }}>配置面板开发中…</span>
    </Drawer>
  );
};

export default RfmDrawer;
