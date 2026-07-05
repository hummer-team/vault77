/**
 * OrderNetAmountCalcDrawer
 *
 * Configuration drawer for fn_ecom_order_net_amount_calc (订单净额计算 — 退款后实收).
 *
 * Sections:
 *   Group 1 — Required field mapping (4 required + 4 optional) with auto-match
 *   Group 2 — Formula builder (3 slots with operator dropdowns + presets)
 *   Group 3 — Excluded status configuration (multi-select)
 *
 * All colors use TOKEN (CSS variables) — no hardcoded hex values.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Space,
  Typography,
  message,
  Tooltip,
} from 'antd';
import {
  CloseOutlined,
  ApartmentOutlined,
  FunctionOutlined,
  FilterOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { NetAmountCalcConfig, FormulaSlot } from '../../../services/flow/types';
import { FIELD_MATCH_PATTERNS } from '../../../services/flow/strategies/orderNetAmountCalcStrategy';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Auto-match helper
// ============================================================================

function autoMatch(columns: string[], patternKey: string): string {
  return columns.find((c) => FIELD_MATCH_PATTERNS[patternKey]?.test(c)) ?? '';
}

// ============================================================================
// Section wrapper (reuses OrderAbnormalAmountDrawer pattern)
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
}> = ({ label, required, tip, value, columns, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <div style={{ width: 110, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
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
// Formula slot row — operator dropdown + column dropdown
// ============================================================================

const FormulaSlotRow: React.FC<{
  label: string;
  slot: FormulaSlot;
  columns: string[];
  onOperatorChange: (op: '+' | '-') => void;
  onColumnChange: (col: string) => void;
}> = ({ label, slot, columns, onOperatorChange, onColumnChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 6 }}>
    <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 60, flexShrink: 0 }}>
      {label}
    </Text>
    <Select
      size="small"
      value={slot.operator}
      onChange={onOperatorChange}
      style={{ width: 56 }}
      options={[
        { label: '+', value: '+' },
        { label: '-', value: '-' },
      ]}
      styles={{
        popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
      }}
    />
    <Select
      size="small"
      allowClear
      style={{ flex: 1 }}
      value={slot.column || undefined}
      placeholder="选择列"
      onChange={(v) => onColumnChange(v ?? '')}
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
// Excluded status options
// ============================================================================

const STATUS_OPTIONS = [
  { label: 'PAID（已支付）', value: 'PAID' },
  { label: 'CANCELLED（已取消）', value: 'CANCELLED' },
  { label: 'REFUNDED（已退款）', value: 'REFUNDED' },
  { label: 'DELIVERED（已送达）', value: 'DELIVERED' },
];

// ============================================================================
// Props
// ============================================================================

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

// ============================================================================
// Main component
// ============================================================================

export const OrderNetAmountCalcDrawer: React.FC<OrderNetAmountCalcDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName = '订单净额计算（退款后实收）',
  kernelCategory = '订单核算',
  onConfirm,
  onCancel,
}) => {
  const [messageApi, contextHolder] = message.useMessage();

  // --- Group 1: Required fields ---
  const [payAmountCol, setPayAmountCol] = useState('');
  const [refundAmountCol, setRefundAmountCol] = useState('');
  const [rejectionAmountCol, setRejectionAmountCol] = useState('');
  const [orderStatusCol, setOrderStatusCol] = useState('');

  // --- Group 1: Optional fields ---
  const [orderIdCol, setOrderIdCol] = useState('');
  const [userIdCol, setUserIdCol] = useState('');
  const [skuIdCol, setSkuIdCol] = useState('');
  const [orderTimeCol, setOrderTimeCol] = useState('');

  // --- Group 2: Formula slots ---
  const [slot1, setSlot1] = useState<FormulaSlot>({ operator: '+', column: '' });
  const [slot2, setSlot2] = useState<FormulaSlot>({ operator: '-', column: '' });
  const [slot3, setSlot3] = useState<FormulaSlot>({ operator: '-', column: '' });

  // --- Group 3: Excluded statuses ---
  const [excludedStatuses, setExcludedStatuses] = useState<string[]>(['CANCELLED']);

  // Restore or auto-fill when drawer opens
  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      const fm = initialConfig.fieldMapping;
      setPayAmountCol(fm.payAmountCol);
      setRefundAmountCol(fm.refundAmountCol);
      setRejectionAmountCol(fm.rejectionAmountCol);
      setOrderStatusCol(fm.orderStatusCol);
      setOrderIdCol(fm.orderIdCol ?? '');
      setUserIdCol(fm.userIdCol ?? '');
      setSkuIdCol(fm.skuIdCol ?? '');
      setOrderTimeCol(fm.orderTimeCol ?? '');
      setSlot1(initialConfig.formulaSlots.slot1);
      setSlot2(initialConfig.formulaSlots.slot2);
      setSlot3(initialConfig.formulaSlots.slot3);
      setExcludedStatuses(
        initialConfig.excludedStatuses
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    } else {
      // Auto-fill from column names via regex
      const pay = autoMatch(columns, 'payAmountCol');
      const refund = autoMatch(columns, 'refundAmountCol');
      const reject = autoMatch(columns, 'rejectionAmountCol');
      const status = autoMatch(columns, 'orderStatusCol');

      setPayAmountCol(pay);
      setRefundAmountCol(refund);
      setRejectionAmountCol(reject);
      setOrderStatusCol(status);
      setOrderIdCol(autoMatch(columns, 'orderIdCol'));
      setUserIdCol(autoMatch(columns, 'userIdCol'));
      setSkuIdCol(autoMatch(columns, 'skuIdCol'));
      setOrderTimeCol(autoMatch(columns, 'orderTimeCol'));

      // Default formula slots linked to mapped columns
      setSlot1({ operator: '+', column: pay });
      setSlot2({ operator: '-', column: refund });
      setSlot3({ operator: '-', column: reject });
      setExcludedStatuses(['CANCELLED']);
    }
  }, [open, columns, initialConfig]);

  // Formula preview text
  const formulaPreview = useMemo(() => {
    const s1 = slot1.column ? `COALESCE("${slot1.column}", 0)` : 'COALESCE(?, 0)';
    const s2 = slot2.column ? `COALESCE("${slot2.column}", 0)` : 'COALESCE(?, 0)';
    const s3 = slot3.column ? `COALESCE("${slot3.column}", 0)` : 'COALESCE(?, 0)';
    return `${s1} ${slot2.operator} ${s2} ${slot3.operator} ${s3}`;
  }, [slot1, slot2, slot3]);

  // Preset: default formula (pay - refund - rejection)
  const applyPresetDefault = useCallback(() => {
    setSlot1({ operator: '+', column: payAmountCol });
    setSlot2({ operator: '-', column: refundAmountCol });
    setSlot3({ operator: '-', column: rejectionAmountCol });
  }, [payAmountCol, refundAmountCol, rejectionAmountCol]);

  // Preset: pay - refund only
  const applyPresetPayRefund = useCallback(() => {
    setSlot1({ operator: '+', column: payAmountCol });
    setSlot2({ operator: '-', column: refundAmountCol });
    setSlot3({ operator: '-', column: '' });
  }, [payAmountCol, refundAmountCol]);

  // Preset: pay - rejection only
  const applyPresetPayReject = useCallback(() => {
    setSlot1({ operator: '+', column: payAmountCol });
    setSlot2({ operator: '-', column: '' });
    setSlot3({ operator: '-', column: rejectionAmountCol });
  }, [payAmountCol, rejectionAmountCol]);

  const handleConfirm = useCallback(() => {
    // Validate 4 required fields
    if (!payAmountCol) {
      messageApi.warning('请选择实付金额列');
      return;
    }
    if (!refundAmountCol) {
      messageApi.warning('请选择退款金额列');
      return;
    }
    if (!rejectionAmountCol) {
      messageApi.warning('请选择拒签金额列');
      return;
    }
    if (!orderStatusCol) {
      messageApi.warning('请选择订单状态列');
      return;
    }

    const config: NetAmountCalcConfig = {
      fieldMapping: {
        payAmountCol,
        refundAmountCol,
        rejectionAmountCol,
        orderStatusCol,
        ...(orderIdCol ? { orderIdCol } : {}),
        ...(userIdCol ? { userIdCol } : {}),
        ...(skuIdCol ? { skuIdCol } : {}),
        ...(orderTimeCol ? { orderTimeCol } : {}),
      },
      formulaSlots: { slot1, slot2, slot3 },
      excludedStatuses: excludedStatuses.join(', '),
    };
    onConfirm(config);
  }, [
    payAmountCol, refundAmountCol, rejectionAmountCol, orderStatusCol,
    orderIdCol, userIdCol, skuIdCol, orderTimeCol,
    slot1, slot2, slot3, excludedStatuses,
    onConfirm, messageApi,
  ]);

  return (
    <>
      {contextHolder}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, color: TOKEN.textPrimary }}>{kernelDisplayName}</span>
            <span
              style={{
                fontSize: 11,
                color: TOKEN.primary,
                background: 'var(--vm-primary-glow)',
                border: `1px solid var(--vm-primary-border)`,
                borderRadius: 4,
                padding: '1px 6px',
              }}
            >
              {kernelCategory}
            </span>
          </div>
        }
        open={open}
        onClose={onCancel}
        width={480}
        closeIcon={<CloseOutlined style={{ color: TOKEN.textMuted }} />}
        styles={{
          header: { background: TOKEN.bgHeader, borderBottom: `1px solid ${TOKEN.borderSubtle}` },
          body: { background: TOKEN.bgBase, color: TOKEN.textPrimary, padding: '16px 20px' },
          footer: { background: TOKEN.bgHeader, borderTop: `1px solid ${TOKEN.borderSubtle}` },
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button size="small" onClick={onCancel} style={{ color: TOKEN.textSecondary }}>
              取消
            </Button>
            <Button size="small" type="primary" onClick={handleConfirm}>
              确认配置
            </Button>
          </div>
        }
      >
        {/* ── Group 1: Field mapping ──────────────────────────────── */}
        <Section icon="🔑" title="必填字段映射" badge="REQUIRED">
          <FieldRow
            label="实付金额"
            required
            tip="买家实际支付的金额，净额计算的基础列"
            value={payAmountCol}
            columns={columns}
            onChange={setPayAmountCol}
          />
          <FieldRow
            label="退款金额"
            required
            tip="订单退款金额，将从实付中扣除"
            value={refundAmountCol}
            columns={columns}
            onChange={setRefundAmountCol}
          />
          <FieldRow
            label="拒签金额"
            required
            tip="拒签/拒收产生的金额，将从实付中扣除"
            value={rejectionAmountCol}
            columns={columns}
            onChange={setRejectionAmountCol}
          />
          <FieldRow
            label="订单状态"
            required
            tip="订单当前状态，用于判断是否排除（如已取消订单净额归零）"
            value={orderStatusCol}
            columns={columns}
            onChange={setOrderStatusCol}
          />
        </Section>

        <Section
          icon={<ApartmentOutlined />}
          title="可选维度字段"
          badge="透传下游分组"
        >
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 8 }}>
            配置后透传至结果表，支持按用户/商品/时间维度进行下游汇总分析。
          </Text>
          <FieldRow
            label="订单 ID"
            tip="唯一标识每笔订单"
            value={orderIdCol}
            columns={columns}
            onChange={setOrderIdCol}
          />
          <FieldRow
            label="用户 ID"
            tip="买家/会员标识"
            value={userIdCol}
            columns={columns}
            onChange={setUserIdCol}
          />
          <FieldRow
            label="SKU ID"
            tip="商品/SKU 标识"
            value={skuIdCol}
            columns={columns}
            onChange={setSkuIdCol}
          />
          <FieldRow
            label="订单创建时间"
            tip="下单/创建时间"
            value={orderTimeCol}
            columns={columns}
            onChange={setOrderTimeCol}
          />
        </Section>

        {/* ── Group 2: Formula builder ────────────────────────────── */}
        <Section icon={<FunctionOutlined />} title="计算公式" badge="3 列线性组合">
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 8 }}>
            定义净额计算公式：每行 = 运算符 + 列名，系统自动包裹 COALESCE 防空值。
          </Text>

          <FormulaSlotRow
            label="项 1"
            slot={slot1}
            columns={columns}
            onOperatorChange={(op) => setSlot1((prev) => ({ ...prev, operator: op }))}
            onColumnChange={(col) => setSlot1((prev) => ({ ...prev, column: col }))}
          />
          <FormulaSlotRow
            label="项 2"
            slot={slot2}
            columns={columns}
            onOperatorChange={(op) => setSlot2((prev) => ({ ...prev, operator: op }))}
            onColumnChange={(col) => setSlot2((prev) => ({ ...prev, column: col }))}
          />
          <FormulaSlotRow
            label="项 3"
            slot={slot3}
            columns={columns}
            onOperatorChange={(op) => setSlot3((prev) => ({ ...prev, operator: op }))}
            onColumnChange={(col) => setSlot3((prev) => ({ ...prev, column: col }))}
          />

          {/* Formula preview */}
          <div
            style={{
              padding: '8px 10px',
              background: 'var(--vm-surface-hover)',
              borderRadius: TOKEN.radius,
              marginTop: 4,
              marginBottom: 10,
            }}
          >
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 4 }}>
              公式预览：
            </Text>
            <Text
              code
              style={{ fontSize: 11, color: TOKEN.textSecondary, wordBreak: 'break-all' }}
            >
              {formulaPreview}
            </Text>
          </div>

          {/* Preset buttons */}
          <Space size={6} wrap>
            <Button size="small" onClick={applyPresetDefault}>
              默认公式
            </Button>
            <Button size="small" onClick={applyPresetPayRefund}>
              实付-退款
            </Button>
            <Button size="small" onClick={applyPresetPayReject}>
              实付-拒签
            </Button>
          </Space>
        </Section>

        {/* ── Group 3: Excluded statuses ──────────────────────────── */}
        <Section icon={<FilterOutlined />} title="排除状态配置">
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 8 }}>
            选中的订单状态将被排除（净额归零，标记为无效）。默认排除「已取消」。
          </Text>
          <Select
            mode="multiple"
            size="small"
            style={{ width: '100%' }}
            value={excludedStatuses}
            onChange={(vals) => setExcludedStatuses(vals)}
            options={STATUS_OPTIONS}
            placeholder="选择要排除的订单状态"
            styles={{
              popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
            }}
          />
        </Section>

        {/* Tips */}
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--vm-primary-glow)',
            border: `1px solid var(--vm-primary-border)`,
            borderRadius: TOKEN.radius,
            marginTop: 4,
          }}
        >
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, lineHeight: '18px' }}>
            💡 <b>提示：</b>计算完成后，结果将包含净额、退款率、退款风险标签和异常订单标记。
            排除状态的订单净额强制归零，不参与有效订单统计。
          </Text>
        </div>
      </Drawer>
    </>
  );
};

export default OrderNetAmountCalcDrawer;
