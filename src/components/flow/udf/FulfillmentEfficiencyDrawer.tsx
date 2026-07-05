/**
 * FulfillmentEfficiencyDrawer
 * Configuration drawer for fn_ecom_fulfillment_efficiency (履约时效分析).
 *
 * Sections:
 *   1. Column mapping  — 5 required column selectors with auto-match
 *   2. Thresholds      — 3 configurable on-time threshold InputNumbers
 *
 * Auto-match: on open, uses FIELD_MATCH_PATTERNS regex to pre-fill columns.
 * Fallback: unmatched columns leave selector empty with business placeholder.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  InputNumber,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import {
  ClockCircleOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { FulfillmentEfficiencyConfig } from '../../../services/flow/types.ts';
import { FIELD_MATCH_PATTERNS } from '../../../services/flow/strategies/fulfillmentEfficiencyStrategy.ts';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface FulfillmentEfficiencyDrawerProps {
  open: boolean;
  /** All available columns from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: FulfillmentEfficiencyConfig;
  /** Kernel display name for dynamic title */
  kernelDisplayName?: string;
  /** Kernel industry label for dynamic subtitle */
  kernelIndustry?: string;
  /** Kernel category label for dynamic subtitle */
  kernelCategory?: string;
  onConfirm: (config: FulfillmentEfficiencyConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Auto-match helper
// ============================================================================

function autoMatch(columns: string[], patternKey: string): string {
  return columns.find((c) => FIELD_MATCH_PATTERNS[patternKey]?.test(c)) ?? '';
}

// ============================================================================
// Layout constants (Drawer UI spec)
// ============================================================================

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: TOKEN.textSecondary,
  width: 88,
  flexShrink: 0,
};

const selectStyle: React.CSSProperties = { width: '100%' };

// ============================================================================
// Section wrapper
// ============================================================================

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  required?: boolean;
  children: React.ReactNode;
}> = ({ icon, title, required, children }) => (
  <div
    style={{
      marginBottom: 18,
      padding: '12px 14px',
      background: TOKEN.bgSection,
      borderRadius: TOKEN.radiusLg,
      border: `1px solid ${TOKEN.borderSubtle}`,
      borderLeft: `3px solid var(--vm-primary-border)`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
      <span style={{ color: TOKEN.textMuted, fontSize: 13 }}>{icon}</span>
      <Text
        style={{
          fontSize: 11,
          color: TOKEN.textSecondary,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {required && (
        <span style={{ color: TOKEN.primary, fontSize: 10, lineHeight: 1 }}>*</span>
      )}
    </div>
    {children}
  </div>
);

// ============================================================================
// Column field metadata
// ============================================================================

interface ColumnField {
  key: keyof Pick<
    FulfillmentEfficiencyConfig,
    'payTimeColumn' | 'shipTimeColumn' | 'receiveTimeColumn' | 'regionColumn' | 'carrierColumn'
  >;
  label: string;
  placeholder: string;
  patternKey: string;
}

const COLUMN_FIELDS: ColumnField[] = [
  { key: 'payTimeColumn',     label: '支付时间列',   placeholder: '请选择订单支付时间',   patternKey: 'payTimeColumn' },
  { key: 'shipTimeColumn',    label: '发货时间列',   placeholder: '请选择订单发货时间',   patternKey: 'shipTimeColumn' },
  { key: 'receiveTimeColumn', label: '签收时间列',   placeholder: '请选择订单签收时间',   patternKey: 'receiveTimeColumn' },
  { key: 'regionColumn',     label: '地区列',       placeholder: '请选择收货地区列',     patternKey: 'regionColumn' },
  { key: 'carrierColumn',    label: '物流商列',     placeholder: '请选择物流商/快递公司列', patternKey: 'carrierColumn' },
];

// ============================================================================
// Main component
// ============================================================================

export const FulfillmentEfficiencyDrawer: React.FC<FulfillmentEfficiencyDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName,
  kernelIndustry,
  kernelCategory,
  onConfirm,
  onCancel,
}) => {
  const [messageApi, contextHolder] = message.useMessage();

  // Column state
  const [payTimeColumn, setPayTimeColumn] = useState('');
  const [shipTimeColumn, setShipTimeColumn] = useState('');
  const [receiveTimeColumn, setReceiveTimeColumn] = useState('');
  const [regionColumn, setRegionColumn] = useState('');
  const [carrierColumn, setCarrierColumn] = useState('');

  // Threshold state
  const [payToShipThreshold, setPayToShipThreshold] = useState(24);
  const [shipToReceiveThreshold, setShipToReceiveThreshold] = useState(48);
  const [onTimeThreshold, setOnTimeThreshold] = useState(72);

  // Column setters map for dynamic access
  const setters: Record<string, (v: string) => void> = {
    payTimeColumn: setPayTimeColumn,
    shipTimeColumn: setShipTimeColumn,
    receiveTimeColumn: setReceiveTimeColumn,
    regionColumn: setRegionColumn,
    carrierColumn: setCarrierColumn,
  };

  const values: Record<string, string> = {
    payTimeColumn,
    shipTimeColumn,
    receiveTimeColumn,
    regionColumn,
    carrierColumn,
  };

  // Restore or initialise state whenever drawer opens
  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      setPayTimeColumn(initialConfig.payTimeColumn || autoMatch(columns, 'payTimeColumn'));
      setShipTimeColumn(initialConfig.shipTimeColumn || autoMatch(columns, 'shipTimeColumn'));
      setReceiveTimeColumn(initialConfig.receiveTimeColumn || autoMatch(columns, 'receiveTimeColumn'));
      setRegionColumn(initialConfig.regionColumn || autoMatch(columns, 'regionColumn'));
      setCarrierColumn(initialConfig.carrierColumn || autoMatch(columns, 'carrierColumn'));
      setPayToShipThreshold(initialConfig.payToShipThreshold || 24);
      setShipToReceiveThreshold(initialConfig.shipToReceiveThreshold || 48);
      setOnTimeThreshold(initialConfig.onTimeThreshold || 72);
    } else {
      for (const field of COLUMN_FIELDS) {
        setters[field.key](autoMatch(columns, field.patternKey));
      }
      setPayToShipThreshold(24);
      setShipToReceiveThreshold(48);
      setOnTimeThreshold(72);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialConfig, columns]);

  const handleConfirm = useCallback(() => {
    // Validate required columns
    for (const field of COLUMN_FIELDS) {
      if (!values[field.key]) {
        messageApi.warning(`请选择${field.label}`);
        return;
      }
    }

    // Validate thresholds > 0
    if (payToShipThreshold <= 0 || shipToReceiveThreshold <= 0 || onTimeThreshold <= 0) {
      messageApi.warning('阈值必须大于 0');
      return;
    }

    const config: FulfillmentEfficiencyConfig = {
      tableName: '',  // filled by strategy from table node
      payTimeColumn,
      shipTimeColumn,
      receiveTimeColumn,
      regionColumn,
      carrierColumn,
      payToShipThreshold,
      shipToReceiveThreshold,
      onTimeThreshold,
    };
    onConfirm(config);
  }, [
    payTimeColumn, shipTimeColumn, receiveTimeColumn, regionColumn, carrierColumn,
    payToShipThreshold, shipToReceiveThreshold, onTimeThreshold,
    messageApi, onConfirm,
  ]);

  const colOptions = columns.map((c) => ({ value: c, label: c }));
  const title = kernelDisplayName ?? '履约时效分析';
  const subtitle = [kernelIndustry, kernelCategory].filter(Boolean).join(' / ');

  return (
    <>
      {contextHolder}
      <Drawer
        open={open}
        onClose={onCancel}
        width={420}
        closable
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockCircleOutlined style={{ color: TOKEN.primary, fontSize: 16 }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: TOKEN.textPrimary }}>
                {title}
              </div>
              {subtitle && (
                <div style={{ fontSize: 11, color: TOKEN.textMuted, marginTop: 1 }}>
                  {subtitle}
                </div>
              )}
            </div>
          </div>
        }
        footer={
          <Space style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" onClick={handleConfirm}>
              确认
            </Button>
          </Space>
        }
        styles={{
          body:   { padding: '16px 16px 0' },
          header: { padding: '12px 16px' },
          footer: { padding: '10px 16px' },
        }}
      >
        {/* ── Section 1: Column mapping ──────────────────────────────── */}
        <Section icon={<SettingOutlined />} title="列映射配置" required>
          {COLUMN_FIELDS.map((field) => (
            <div key={field.key} style={rowStyle}>
              <Text style={labelStyle}>{field.label}</Text>
              <span style={{ color: TOKEN.primary, fontSize: 10, flexShrink: 0 }}>*</span>
              <Select
                style={selectStyle}
                value={values[field.key] || undefined}
                placeholder={field.placeholder}
                options={colOptions}
                onChange={(v) => setters[field.key](v)}
                showSearch
                size="small"
              />
            </div>
          ))}
        </Section>

        {/* ── Section 2: Thresholds ──────────────────────────────────── */}
        <Section icon={<ClockCircleOutlined />} title="达标阈值（小时）">
          <div style={rowStyle}>
            <Text style={labelStyle}>支付→发货</Text>
            <InputNumber
              size="small"
              min={1}
              max={720}
              value={payToShipThreshold}
              onChange={(v) => setPayToShipThreshold(v ?? 24)}
              style={{ width: 100, marginLeft: 4 }}
              addonAfter="h"
            />
          </div>
          <div style={rowStyle}>
            <Text style={labelStyle}>发货→签收</Text>
            <InputNumber
              size="small"
              min={1}
              max={720}
              value={shipToReceiveThreshold}
              onChange={(v) => setShipToReceiveThreshold(v ?? 48)}
              style={{ width: 100, marginLeft: 4 }}
              addonAfter="h"
            />
          </div>
          <div style={rowStyle}>
            <Text style={labelStyle}>全链路时效</Text>
            <InputNumber
              size="small"
              min={1}
              max={720}
              value={onTimeThreshold}
              onChange={(v) => setOnTimeThreshold(v ?? 72)}
              style={{ width: 100, marginLeft: 4 }}
              addonAfter="h"
            />
          </div>
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginTop: 4, display: 'block' }}>
            超过阈值的订单将被视为不达标，影响达标率计算
          </Text>
        </Section>
      </Drawer>
    </>
  );
};

export default FulfillmentEfficiencyDrawer;
