/**
 * EcomPlatformFeeAllocateDrawer
 *
 * Configuration drawer for fn_ecom_platform_fee_allocate (平台佣金/服务费自动分摊).
 *
 * Sections:
 *   Group 1 — Required field mapping (6 required columns)
 *   Group 2 — Optional dimension columns (3 optional)
 *   Group 3 — Risk threshold configuration
 *
 * All colors use TOKEN (CSS variables) — no hardcoded hex values.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Space,
  Typography,
  Tooltip,
  Collapse,
  InputNumber,
} from 'antd';
import {
  CloseOutlined,
  ApartmentOutlined,
  FunctionOutlined,
  FilterOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { FeeAllocateConfig } from '../../../services/flow/types';
import { FIELD_MATCH_PATTERNS } from '../../../services/flow/strategies/ecomPlatformFeeAllocateStrategy';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Auto-match helper
// ============================================================================

function autoMatch(columns: string[], patternKey: string): string {
  return columns.find((c) => FIELD_MATCH_PATTERNS[patternKey]?.test(c)) ?? '';
}

// ============================================================================
// Section wrapper
// ============================================================================

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children: React.ReactNode;
}> = ({ icon, title, badge, children }) => (
  <div
    style={{
      marginBottom: 16,
      padding: '12px 14px',
      background: TOKEN.bgSection,
      borderRadius: TOKEN.radiusLg,
      border: `1px solid ${TOKEN.borderSubtle}`,
      borderLeft: `3px solid var(--vm-primary-border)`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <span style={{ color: TOKEN.textMuted, fontSize: 13 }}>{icon}</span>
      <Text style={{ fontSize: 11, color: TOKEN.textSecondary, fontWeight: 600, letterSpacing: '0.06em' }}>
        {title}
      </Text>
      {badge && (
        <span
          style={{
            fontSize: 10,
            color: TOKEN.primary,
            background: 'var(--vm-primary-glow)',
            border: `1px solid var(--vm-primary-border)`,
            borderRadius: 3,
            padding: '0 5px',
            lineHeight: '16px',
          }}
        >
          {badge}
        </span>
      )}
    </div>
    {children}
  </div>
);

// ============================================================================
// FieldRow — label + Select
// ============================================================================

const FieldRow: React.FC<{
  label: string;
  required?: boolean;
  tip?: string;
  value: string;
  columns: string[];
  onChange: (v: string) => void;
  status?: 'error';
  selectRef?: React.Ref<any>;
}> = ({ label, required, tip, value, columns, onChange, status, selectRef }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <div style={{ width: 140, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
      {required && <span style={{ color: TOKEN.primary, fontSize: 10 }}>*</span>}
      <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>{label}</Text>
      {tip && (
        <Tooltip title={tip} placement="top">
          <InfoCircleOutlined style={{ fontSize: 11, color: TOKEN.textMuted, cursor: 'help' }} />
        </Tooltip>
      )}
    </div>
    <Select
      size="small"
      allowClear
      ref={selectRef}
      status={status}
      style={{ flex: 1 }}
      value={value || undefined}
      placeholder={required ? '必填' : '可选 · 自动推断'}
      onChange={(v) => onChange(v ?? '')}
      options={columns.map((c) => ({ label: c, value: c }))}
      showSearch
      filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
      styles={{
        popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
      }}
    />
  </div>
);

// ============================================================================
// Props
// ============================================================================

export interface EcomPlatformFeeAllocateDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: FeeAllocateConfig;
  kernelDisplayName?: string;
  kernelIndustry?: string;
  kernelCategory?: string;
  onConfirm: (config: FeeAllocateConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Main component
// ============================================================================

export const EcomPlatformFeeAllocateDrawer: React.FC<EcomPlatformFeeAllocateDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName = '平台佣金/服务费自动分摊',
  onConfirm,
  onCancel,
}) => {
  // --- Group 1: Required fields ---
  const [orderIdCol, setOrderIdCol] = useState('');
  const [skuIdCol, setSkuIdCol] = useState('');
  const [orderNetAmountCol, setOrderNetAmountCol] = useState('');
  const [skuNetAmountCol, setSkuNetAmountCol] = useState('');
  const [platformFeeCol, setPlatformFeeCol] = useState('');
  const [serviceFeeCol, setServiceFeeCol] = useState('');

  const [orderIdError, setOrderIdError] = useState(false);
  const [skuIdError, setSkuIdError] = useState(false);
  const [orderNetAmountError, setOrderNetAmountError] = useState(false);
  const [skuNetAmountError, setSkuNetAmountError] = useState(false);
  const [platformFeeError, setPlatformFeeError] = useState(false);
  const [serviceFeeError, setServiceFeeError] = useState(false);

  const orderIdRef = useRef<any>(null);
  const skuIdRef = useRef<any>(null);
  const orderNetAmountRef = useRef<any>(null);
  const skuNetAmountRef = useRef<any>(null);
  const platformFeeRef = useRef<any>(null);
  const serviceFeeRef = useRef<any>(null);

  // --- Group 2: Optional dimension columns ---
  const [orderTimeCol, setOrderTimeCol] = useState('');
  const [categoryCol, setCategoryCol] = useState('');
  const [channelCol, setChannelCol] = useState('');

  // --- Group 3: Risk threshold ---
  const [warningThresholdPct, setWarningThresholdPct] = useState(15);

  // Restore or auto-fill when drawer opens
  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      const fm = initialConfig.fieldMapping;
      setOrderIdCol(fm.orderIdCol);
      setSkuIdCol(fm.skuIdCol);
      setOrderNetAmountCol(fm.orderNetAmountCol);
      setSkuNetAmountCol(fm.skuNetAmountCol);
      setPlatformFeeCol(fm.platformFeeCol);
      setServiceFeeCol(fm.serviceFeeCol);
      setOrderTimeCol(fm.orderTimeCol ?? '');
      setCategoryCol(fm.categoryCol ?? '');
      setChannelCol(fm.channelCol ?? '');
      setWarningThresholdPct(initialConfig.warningThresholdPct);
    } else {
      // Auto-fill from column names via regex
      const usedCols = new Set<string>();
      const autoMatchSkip = (cols: string[], patternKey: string): string => {
        const available = cols.filter(c => !usedCols.has(c));
        const matched = autoMatch(available, patternKey);
        if (matched) usedCols.add(matched);
        return matched;
      };

      setOrderIdCol(autoMatchSkip(columns, 'orderIdCol'));
      setSkuIdCol(autoMatchSkip(columns, 'skuIdCol'));
      setOrderNetAmountCol(autoMatchSkip(columns, 'orderNetAmountCol'));
      setSkuNetAmountCol(autoMatchSkip(columns, 'skuNetAmountCol'));
      setPlatformFeeCol(autoMatchSkip(columns, 'platformFeeCol'));
      setServiceFeeCol(autoMatchSkip(columns, 'serviceFeeCol'));
      setOrderTimeCol(autoMatchSkip(columns, 'orderTimeCol'));
      setCategoryCol(autoMatchSkip(columns, 'categoryCol'));
      setChannelCol(autoMatchSkip(columns, 'channelCol'));

      setWarningThresholdPct(15);
    }
  }, [open, columns, initialConfig]);

  // Change handlers with error clearing
  const handleOrderIdColChange = useCallback((v: string) => {
    setOrderIdCol(v);
    if (v) setOrderIdError(false);
  }, []);

  const handleSkuIdColChange = useCallback((v: string) => {
    setSkuIdCol(v);
    if (v) setSkuIdError(false);
  }, []);

  const handleOrderNetAmountColChange = useCallback((v: string) => {
    setOrderNetAmountCol(v);
    if (v) setOrderNetAmountError(false);
  }, []);

  const handleSkuNetAmountColChange = useCallback((v: string) => {
    setSkuNetAmountCol(v);
    if (v) setSkuNetAmountError(false);
  }, []);

  const handlePlatformFeeColChange = useCallback((v: string) => {
    setPlatformFeeCol(v);
    if (v) setPlatformFeeError(false);
  }, []);

  const handleServiceFeeColChange = useCallback((v: string) => {
    setServiceFeeCol(v);
    if (v) setServiceFeeError(false);
  }, []);

  const handleSubmit = useCallback(() => {
    const hasOrderId = !!orderIdCol;
    const hasSkuId = !!skuIdCol;
    const hasOrderNetAmount = !!orderNetAmountCol;
    const hasSkuNetAmount = !!skuNetAmountCol;
    const hasPlatformFee = !!platformFeeCol;
    const hasServiceFee = !!serviceFeeCol;

    setOrderIdError(!hasOrderId);
    setSkuIdError(!hasSkuId);
    setOrderNetAmountError(!hasOrderNetAmount);
    setSkuNetAmountError(!hasSkuNetAmount);
    setPlatformFeeError(!hasPlatformFee);
    setServiceFeeError(!hasServiceFee);

    if (!hasOrderId) {
      orderIdRef.current?.focus();
      return;
    }
    if (!hasSkuId) {
      skuIdRef.current?.focus();
      return;
    }
    if (!hasOrderNetAmount) {
      orderNetAmountRef.current?.focus();
      return;
    }
    if (!hasSkuNetAmount) {
      skuNetAmountRef.current?.focus();
      return;
    }
    if (!hasPlatformFee) {
      platformFeeRef.current?.focus();
      return;
    }
    if (!hasServiceFee) {
      serviceFeeRef.current?.focus();
      return;
    }

    // Assemble config
    const config: FeeAllocateConfig = {
      fieldMapping: {
        orderIdCol,
        skuIdCol,
        orderNetAmountCol,
        skuNetAmountCol,
        platformFeeCol,
        serviceFeeCol,
        ...(orderTimeCol && { orderTimeCol }),
        ...(categoryCol && { categoryCol }),
        ...(channelCol && { channelCol }),
      },
      warningThresholdPct,
    };

    onConfirm(config);
  }, [
    orderIdCol,
    skuIdCol,
    orderNetAmountCol,
    skuNetAmountCol,
    platformFeeCol,
    serviceFeeCol,
    orderTimeCol,
    categoryCol,
    channelCol,
    warningThresholdPct,
    onConfirm,
  ]);

  const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: TOKEN.textSecondary, width: 140, flexShrink: 0 };

  return (
    <>
      <Drawer
        open={open}
        onClose={onCancel}
        width={520}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FunctionOutlined style={{ color: TOKEN.primary }} />
            <Text style={{ fontSize: 14, fontWeight: 600 }}>{kernelDisplayName}</Text>
          </div>
        }
        styles={{
          body: {
            background: TOKEN.bgBase,
            padding: '16px 20px',
          },
          header: {
            background: TOKEN.bgBase,
            borderBottom: `1px solid ${TOKEN.borderMid}`,
            padding: '12px 20px',
          },
        }}
        extra={
          <Space>
            <Button size="small" icon={<CloseOutlined />} onClick={onCancel}>
              取消
            </Button>
            <Button size="small" type="primary" onClick={handleSubmit}>
              确认
            </Button>
          </Space>
        }
        closable={false}
      >
        {/* Allocation summary */}
        <div
          style={{
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--vm-primary-glow)',
            border: `1px solid var(--vm-primary-border)`,
            borderRadius: TOKEN.radius,
          }}
        >
          <Text style={{ fontSize: 12, color: TOKEN.textPrimary, fontWeight: 500 }}>
            💸 分摊逻辑预览：
          </Text>
          <div style={{ marginTop: 6, fontSize: 11, color: TOKEN.textSecondary, lineHeight: '18px' }}>
            平台佣金分摊 = 订单平台佣金 × (SKU净额 ÷ 订单净额)<br/>
            服务费分摊 = 订单服务费 × (SKU净额 ÷ 订单净额)
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: TOKEN.textMuted }}>
            💡 按订单分组，根据每个SKU的净额占比，将订单级的平台佣金和服务费分摊到每个SKU行
          </div>
        </div>

        {/* Group 1: Required Field Mapping */}
        <Section icon={<ApartmentOutlined />} title="必填字段映射" badge="Group 1">
          <FieldRow
            label="订单ID"
            required
            tip="订单唯一标识，用于分组"
            value={orderIdCol}
            columns={columns}
            onChange={handleOrderIdColChange}
            status={orderIdError ? 'error' : undefined}
            selectRef={orderIdRef}
          />
          <FieldRow
            label="SKU/商品行ID"
            required
            tip="订单内商品行的唯一标识"
            value={skuIdCol}
            columns={columns}
            onChange={handleSkuIdColChange}
            status={skuIdError ? 'error' : undefined}
            selectRef={skuIdRef}
          />
          <FieldRow
            label="订单净额"
            required
            tip="订单级的净额（退款后实收），作为分摊分母"
            value={orderNetAmountCol}
            columns={columns}
            onChange={handleOrderNetAmountColChange}
            status={orderNetAmountError ? 'error' : undefined}
            selectRef={orderNetAmountRef}
          />
          <FieldRow
            label="SKU净额"
            required
            tip="商品行级的净额，作为分摊分子"
            value={skuNetAmountCol}
            columns={columns}
            onChange={handleSkuNetAmountColChange}
            status={skuNetAmountError ? 'error' : undefined}
            selectRef={skuNetAmountRef}
          />
          <FieldRow
            label="平台佣金"
            required
            tip="订单级的平台佣金/手续费"
            value={platformFeeCol}
            columns={columns}
            onChange={handlePlatformFeeColChange}
            status={platformFeeError ? 'error' : undefined}
            selectRef={platformFeeRef}
          />
          <FieldRow
            label="服务费"
            required
            tip="订单级的其他服务费用"
            value={serviceFeeCol}
            columns={columns}
            onChange={handleServiceFeeColChange}
            status={serviceFeeError ? 'error' : undefined}
            selectRef={serviceFeeRef}
          />
        </Section>

        {/* Group 2: Optional dimension columns + Group 3: Risk threshold (in Collapse) */}
        <Collapse
          ghost
          size="small"
          defaultActiveKey={[]}
          style={{ marginBottom: 16 }}
          items={[
            {
              key: '1',
              label: (
                <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>
                  <ApartmentOutlined style={{ marginRight: 6 }} />
                  更多设置
                </span>
              ),
              children: (
                <>
                  {/* Optional dimension columns */}
                  <Section icon={<ApartmentOutlined />} title="维度透传（可选）" badge="Group 2">
                    <FieldRow label="下单时间" value={orderTimeCol} columns={columns} onChange={setOrderTimeCol} />
                    <FieldRow label="类目" value={categoryCol} columns={columns} onChange={setCategoryCol} />
                    <FieldRow label="渠道" value={channelCol} columns={columns} onChange={setChannelCol} />
                  </Section>

                  {/* Risk threshold */}
                  <Section icon={<FilterOutlined />} title="风险分级配置" badge="Group 3">
                    <div style={rowStyle}>
                      <Text style={labelStyle}>预警成本占比</Text>
                      <InputNumber
                        size="small"
                        style={{ width: 100 }}
                        value={warningThresholdPct}
                        min={0}
                        max={100}
                        step={0.5}
                        suffix="%"
                        onChange={(v) => setWarningThresholdPct(v ?? 15)}
                      />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: TOKEN.textMuted, lineHeight: '18px' }}>
                        风险等级判定：分摊后总成本占比（成本+佣金+服务费）÷ 净额 ≥ 预警值 → 预警；否则 → 健康
                      </Text>
                    </div>
                  </Section>
                </>
              ),
            },
          ]}
        />

        {/* Hint line */}
        <div
          style={{
            padding: '10px 14px',
            background: TOKEN.bgSection,
            borderRadius: TOKEN.radius,
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, lineHeight: '18px' }}>
            💡 <b>提示：</b>分摊逻辑按订单分组，将订单级的平台佣金和服务费按SKU净额占比分摊到每个商品行。如需剔除已取消订单，请在画布中添加「条件」节点过滤。
          </Text>
        </div>
      </Drawer>
    </>
  );
};

export default EcomPlatformFeeAllocateDrawer;
