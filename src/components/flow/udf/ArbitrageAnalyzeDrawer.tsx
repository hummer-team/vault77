/**
 * ArbitrageAnalyzeDrawer
 *
 * Configuration drawer for fn_ecom_arbitrage_analyze (价格套利分析).
 * Allows users to map mandatory fields, configure risk thresholds, and arbitrage detection params.
 *
 * Layout — 3 groups:
 *   Group 1 (required): 4 core field mappings + 6 auto-detected optional fields
 *   Group 2 (collapsible): Risk rule toggles + numeric thresholds
 *   Group 3 (collapsible): Arbitrage detection config (grayed when no optional fields detected)
 *
 * Design principles:
 *   - All colors via CSS variables (var(--vm-*)) or TOKEN constants — no hardcoded colors
 *   - Thresholds stored as 0-1 decimals, displayed as 0-100% integers for UX clarity
 *   - Optional fields: auto-detected from column name patterns; user can override via Select
 *   - Arbitrage group disabled/grayed when none of the 5 required optional fields are available
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Drawer,
  InputNumber,
  Radio,
  Select,
  Switch,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  AlertOutlined,
  ApartmentOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  DatabaseOutlined,
  ExperimentOutlined,
  InfoCircleOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import type {
  ArbitrageAnalyzeConfig,
  ArbitrageAutoFieldMapping,
  ArbitrageDetectionConfig,
  ArbitrageFieldMapping,
  ArbitrageRuleToggles,
  ArbitrageThresholds,
} from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Default configuration (exported for reuse by strategy defaults)
// ============================================================================

export const DEFAULT_ARBITRAGE_THRESHOLDS: ArbitrageThresholds = {
  lowMarginRate: 0.05,
  extremeDiscountRate: 0.6,
  productDeviationRate: 0.3,
  categoryDeviationRate: 0.4,
  couponCostRatio: 0.9,
  couponDiscountRate: 0.5,
};

export const DEFAULT_ARBITRAGE_DETECTION: ArbitrageDetectionConfig = {
  hourlySpikeMethod: 'batch_avg',
  hourlySpikeMult: 3,
  purchaseLimit: 5,
  addressPrefixLength: 15,
  addressClusterThreshold: 5,
  deviceAccountThreshold: 3,
};

export const DEFAULT_ARBITRAGE_RULE_TOGGLES: ArbitrageRuleToggles = {
  marginRules: true,
  discountRules: true,
  priceDeviationRules: true,
  couponAnomalyRules: true,
  arbitrageRules: true,
  clearanceMarginExempt: false,
};

// ============================================================================
// Output column definitions — from design/fn_ecom_arbitrage_analyze.md §2.5
// ============================================================================

interface OutputColumnDef {
  key: string;
  /** Short Chinese display name shown in selected tags */
  label: string;
  /** Business meaning shown in the dropdown */
  desc: string;
  /** Implementation note shown in tooltip */
  note: string;
}

export const OUTPUT_COLUMN_DEFS: OutputColumnDef[] = [
  { key: 'order_id',           label: '订单ID',       desc: '订单唯一标识',       note: '原值透出，用于关联追溯' },
  { key: 'actual_payment',     label: '实际成交价',   desc: '订单实际成交价',     note: '自动计算保留6位小数' },
  { key: 'discount_rate',      label: '折扣比例',     desc: '折扣比例 0~1',       note: '实际价/挂牌价' },
  { key: 'gross_margin',       label: '订单毛利',     desc: '订单毛利',           note: '实际成交价-成本' },
  { key: 'margin_rate',        label: '毛利率',       desc: '毛利率',             note: '毛利/实际成交价' },
  { key: 'price_deviation',    label: '价格偏离度',   desc: '综合价格偏离度',     note: '合并商品/类目最严重偏离值' },
  { key: 'risk_score',         label: '风险评分',     desc: '风险评分 0~100',     note: '超出100自动封顶为100' },
  { key: 'risk_level',         label: '风险等级',     desc: '风险等级',           note: '严格按全局枚举：低/中/高/严重' },
  { key: 'risk_type',          label: '风险标签',     desc: '命中风险标签集合',   note: '去重、固定顺序输出（数组）' },
  { key: 'arbitrage_evidence', label: '套利依据',     desc: '套利判定依据',       note: '无套利则为空数组' },
  { key: 'data_quality_flag',  label: '数据质量标记', desc: '数据质量标记',       note: 'normal=正常 / dirty=脏数据' },
];

/** All output column keys — used as default selection */
export const DEFAULT_OUTPUT_COLUMNS: string[] = OUTPUT_COLUMN_DEFS.map((d) => d.key);

// ============================================================================
// Auto-detection: keyword patterns for optional fields
// ============================================================================

/** Try to find a best-match column from a list of keyword patterns (case-insensitive) */
function autoDetectField(columns: string[], patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const found = columns.find((c) => re.test(c));
    if (found) return found;
  }
  return undefined;
}

function buildAutoMapping(columns: string[]): ArbitrageAutoFieldMapping {
  return {
    skuIdCol: autoDetectField(columns, [
      /^sku_?id$/i, /sku/i, /product_?id/i, /item_?id/i,
      /商品编码|商品ID|SKU编号|货品编码|商品编号/,
    ]),
    categoryIdCol: autoDetectField(columns, [
      /^cat(egory)?_?id$/i, /categor/i, /class/i,
      /类目|品类|分类|类别/,
    ]),
    orderTimeCol: autoDetectField(columns, [
      /order_?time/i, /created_?at/i, /order_?date/i, /purchase_?time/i,
      /pay_?time/i, /^time$/i, /timestamp/i,
      /下单时间|创建时间|订单时间|交易时间|付款时间|购买时间/,
    ]),
    userIdCol: autoDetectField(columns, [
      /user_?id/i, /member_?id/i, /buyer_?id/i, /customer_?id/i, /^uid$/i,
      /用户ID|会员ID|买家ID|客户ID|用户编号/,
    ]),
    deviceIdCol: autoDetectField(columns, [
      /device_?id/i, /terminal_?id/i, /equipment_?id/i, /client_?id/i,
      /设备ID|设备编号|终端ID/,
    ]),
    receiverAddrCol: autoDetectField(columns, [
      /receiver_?addr/i, /shipping_?addr/i, /delivery_?addr/i, /address/i, /^addr/i,
      /收货地址|收件地址|配送地址|收件人地址|地址/,
    ]),
    activityIdCol: autoDetectField(columns, [
      /activity_?id/i, /campaign_?id/i, /promotion_?id/i, /event_?id/i,
      /活动ID|活动编号|促销ID/,
    ]),
    activityTypeCol: autoDetectField(columns, [
      /activity_?type/i, /campaign_?type/i, /promo_?type/i, /event_?type/i,
      /活动类型|促销类型/,
    ]),
    activityStartCol: autoDetectField(columns, [
      /activity_?start/i, /promo_?start/i, /start_?time/i,
      /活动开始|促销开始|开始时间/,
    ]),
    activityEndCol: autoDetectField(columns, [
      /activity_?end/i, /promo_?end/i, /end_?time/i,
      /活动结束|促销结束|结束时间/,
    ]),
  };
}

// ============================================================================
// Shared styles
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
  flexShrink: 0,
  width: 96,
};

const selectStyle: React.CSSProperties = { width: '100%', flex: 1 };

const thresholdRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

// ============================================================================
// Sub-components
// ============================================================================

/** Collapsible section header */
const SectionHeader: React.FC<{
  icon: React.ReactNode;
  title: string;
  required?: boolean;
  open: boolean;
  collapsible?: boolean;
  badge?: string;
  onToggle?: () => void;
}> = ({ icon, title, required, open, collapsible, badge, onToggle }) => (
  <div
    role={collapsible ? 'button' : undefined}
    onClick={collapsible ? onToggle : undefined}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: open ? 12 : 0,
      cursor: collapsible ? 'pointer' : 'default',
      userSelect: 'none',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
      {required && <span style={{ color: TOKEN.primary, fontSize: 10 }}>*</span>}
      {badge && (
        <span
          style={{
            fontSize: 10,
            padding: '1px 6px',
            background: 'var(--vm-primary-light)',
            color: TOKEN.primary,
            borderRadius: 4,
            fontWeight: 500,
          }}
        >
          {badge}
        </span>
      )}
    </div>
    {collapsible && (
      <span style={{ color: TOKEN.textMuted, fontSize: 11 }}>
        {open ? <CaretDownOutlined /> : <CaretRightOutlined />}
      </span>
    )}
  </div>
);

/** Section card wrapper */
const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  required?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  badge?: string;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ icon, title, required, collapsible, defaultOpen = true, badge, disabled, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      style={{
        marginBottom: 14,
        padding: '12px 14px',
        background: disabled ? 'var(--vm-bg-row)' : TOKEN.bgSection,
        borderRadius: TOKEN.radiusLg,
        border: `1px solid ${TOKEN.borderSubtle}`,
        borderLeft: `3px solid ${disabled ? TOKEN.borderMid : 'var(--vm-primary-border)'}`,
        opacity: disabled ? 0.55 : 1,
        pointerEvents: disabled ? 'none' : undefined,
        transition: 'opacity 0.2s',
      }}
    >
      <SectionHeader
        icon={icon}
        title={title}
        required={required}
        open={open}
        collapsible={collapsible}
        badge={badge}
        onToggle={() => setOpen((v) => !v)}
      />
      {open && children}
    </div>
  );
};

/** Field row with label + select */
const FieldRow: React.FC<{
  label: string;
  required?: boolean;
  tooltip?: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  optional?: boolean;
}> = ({ label, required, tooltip, value, onChange, options, placeholder, optional }) => (
  <div style={rowStyle}>
    <span style={labelStyle}>
      {required && <span style={{ color: TOKEN.primary, marginRight: 2 }}>*</span>}
      {label}
      {optional && (
        <span style={{ fontSize: 9, color: TOKEN.textMuted, marginLeft: 2 }}>自动</span>
      )}
      {tooltip && (
        <Tooltip title={tooltip}>
          <InfoCircleOutlined style={{ marginLeft: 4, color: TOKEN.textMuted, fontSize: 10 }} />
        </Tooltip>
      )}
    </span>
    <Select
      value={value || undefined}
      onChange={onChange}
      placeholder={placeholder ?? (optional ? '（自动检测）' : '选择列')}
      style={selectStyle}
      size="small"
      allowClear
      showSearch
      optionFilterProp="children"
    >
      {options.map((c) => (
        <Select.Option key={c} value={c}>
          <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{c}</span>
        </Select.Option>
      ))}
    </Select>
  </div>
);

/** Threshold row: label + InputNumber (percent display, 0-1 storage) */
const ThresholdRow: React.FC<{
  label: string;
  tooltip: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  isPercent?: boolean;
  disabled?: boolean;
}> = ({ label, tooltip, value, onChange, min = 0, max = 100, step = 1, suffix = '%', isPercent = true, disabled }) => (
  <div style={{ ...thresholdRowStyle, opacity: disabled ? 0.45 : 1 }}>
    <Tooltip title={tooltip}>
      <span style={{ ...labelStyle, cursor: 'help', width: 150 }}>{label}</span>
    </Tooltip>
    <InputNumber
      size="small"
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      value={isPercent ? Math.round(value * 100) : value}
      onChange={(v) => {
        if (v == null) return;
        onChange(isPercent ? v / 100 : v);
      }}
      addonAfter={suffix}
      style={{ width: 120 }}
    />
  </div>
);

// ============================================================================
// Props
// ============================================================================

export interface ArbitrageAnalyzeDrawerProps {
  open: boolean;
  columns: string[];
  initialConfig?: ArbitrageAnalyzeConfig;
  onConfirm: (config: ArbitrageAnalyzeConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Main component
// ============================================================================

export const ArbitrageAnalyzeDrawer: React.FC<ArbitrageAnalyzeDrawerProps> = ({
  open,
  columns,
  initialConfig,
  onConfirm,
  onCancel,
}) => {
  const [messageApi, contextHolder] = message.useMessage();

  // Group 1: mandatory field mapping
  const [orderIdCol, setOrderIdCol]       = useState('');
  const [amountCol, setAmountCol]         = useState('');
  const [costCol, setCostCol]             = useState('');
  const [couponAmountCol, setCouponAmountCol] = useState('');

  // Group 1: optional auto-detected fields
  const [skuIdCol, setSkuIdCol]           = useState('');
  const [categoryIdCol, setCategoryIdCol] = useState('');
  const [orderTimeCol, setOrderTimeCol]   = useState('');
  const [userIdCol, setUserIdCol]         = useState('');
  const [deviceIdCol, setDeviceIdCol]     = useState('');
  const [receiverAddrCol, setReceiverAddrCol] = useState('');
  const [activityIdCol, setActivityIdCol] = useState('');
  const [activityTypeCol, setActivityTypeCol] = useState('');
  const [activityStartCol, setActivityStartCol] = useState('');
  const [activityEndCol, setActivityEndCol]     = useState('');

  // Group 2: risk thresholds
  const [thresholds, setThresholds] = useState<ArbitrageThresholds>({ ...DEFAULT_ARBITRAGE_THRESHOLDS });

  // Group 2: rule toggles
  const [toggles, setToggles] = useState<ArbitrageRuleToggles>({ ...DEFAULT_ARBITRAGE_RULE_TOGGLES });

  // Output columns selection (defaults to all columns from §2.5)
  const [selectedOutputColumns, setSelectedOutputColumns] = useState<string[]>([...DEFAULT_OUTPUT_COLUMNS]);

  // Group 3: arbitrage detection
  const [detection, setDetection] = useState<ArbitrageDetectionConfig>({ ...DEFAULT_ARBITRAGE_DETECTION });

  // Arbitrage group is enabled only when the 5 key optional fields are available
  const arbFieldsAvailable = useMemo(
    () => !!(skuIdCol && orderTimeCol && userIdCol && receiverAddrCol && deviceIdCol),
    [skuIdCol, orderTimeCol, userIdCol, receiverAddrCol, deviceIdCol]
  );

  // Restore state when drawer opens
  useEffect(() => {
    if (!open) return;
    if (initialConfig) {
      const fm = initialConfig.fieldMapping;
      const am = initialConfig.autoFieldMapping ?? {};
      setOrderIdCol(fm.orderIdCol);
      setAmountCol(fm.amountCol);
      setCostCol(fm.costCol);
      setCouponAmountCol(fm.couponAmountCol);
      setSkuIdCol(am.skuIdCol ?? '');
      setCategoryIdCol(am.categoryIdCol ?? '');
      setOrderTimeCol(am.orderTimeCol ?? '');
      setUserIdCol(am.userIdCol ?? '');
      setDeviceIdCol(am.deviceIdCol ?? '');
      setReceiverAddrCol(am.receiverAddrCol ?? '');
      setActivityIdCol(am.activityIdCol ?? '');
      setActivityTypeCol(am.activityTypeCol ?? '');
      setActivityStartCol(am.activityStartCol ?? '');
      setActivityEndCol(am.activityEndCol ?? '');
      setThresholds({ ...initialConfig.thresholds });
      setToggles({ ...initialConfig.ruleToggles });
      setDetection({ ...initialConfig.arbitrage });
      setSelectedOutputColumns(initialConfig.selectedOutputColumns ?? [...DEFAULT_OUTPUT_COLUMNS]);
    } else {
      // Auto-detect optional fields from available columns
      const auto = buildAutoMapping(columns);
      setOrderIdCol('');
      setAmountCol('');
      setCostCol('');
      setCouponAmountCol('');
      setSkuIdCol(auto.skuIdCol ?? '');
      setCategoryIdCol(auto.categoryIdCol ?? '');
      setOrderTimeCol(auto.orderTimeCol ?? '');
      setUserIdCol(auto.userIdCol ?? '');
      setDeviceIdCol(auto.deviceIdCol ?? '');
      setReceiverAddrCol(auto.receiverAddrCol ?? '');
      setActivityIdCol(auto.activityIdCol ?? '');
      setActivityTypeCol(auto.activityTypeCol ?? '');
      setActivityStartCol(auto.activityStartCol ?? '');
      setActivityEndCol(auto.activityEndCol ?? '');
      setThresholds({ ...DEFAULT_ARBITRAGE_THRESHOLDS });
      setToggles({ ...DEFAULT_ARBITRAGE_RULE_TOGGLES });
      setDetection({ ...DEFAULT_ARBITRAGE_DETECTION });
      setSelectedOutputColumns([...DEFAULT_OUTPUT_COLUMNS]);
    }
  }, [open, initialConfig, columns]);

  const handleConfirm = useCallback(() => {
    if (!orderIdCol || !amountCol || !costCol || !couponAmountCol) {
      void messageApi.warning('请完成必填字段映射：订单ID、挂牌原价、成本、优惠券抵扣');
      return;
    }

    const fieldMapping: ArbitrageFieldMapping = { orderIdCol, amountCol, costCol, couponAmountCol };
    const autoFieldMapping: ArbitrageAutoFieldMapping = {
      ...(skuIdCol        && { skuIdCol }),
      ...(categoryIdCol   && { categoryIdCol }),
      ...(orderTimeCol    && { orderTimeCol }),
      ...(userIdCol       && { userIdCol }),
      ...(deviceIdCol     && { deviceIdCol }),
      ...(receiverAddrCol && { receiverAddrCol }),
      ...(activityIdCol   && { activityIdCol }),
      ...(activityTypeCol && { activityTypeCol }),
      ...(activityStartCol && { activityStartCol }),
      ...(activityEndCol   && { activityEndCol }),
    };

    const config: ArbitrageAnalyzeConfig = {
      fieldMapping,
      autoFieldMapping: Object.keys(autoFieldMapping).length > 0 ? autoFieldMapping : undefined,
      thresholds,
      arbitrage: detection,
      ruleToggles: toggles,
      selectedOutputColumns,
    };
    onConfirm(config);
  }, [
    orderIdCol, amountCol, costCol, couponAmountCol,
    skuIdCol, categoryIdCol, orderTimeCol, userIdCol, deviceIdCol,
    receiverAddrCol, activityIdCol, activityTypeCol, activityStartCol, activityEndCol,
    thresholds, detection, toggles, selectedOutputColumns, messageApi, onConfirm,
  ]);

  const setThreshold = useCallback(
    (key: keyof ArbitrageThresholds) => (v: number) =>
      setThresholds((prev) => ({ ...prev, [key]: v })),
    []
  );

  const setDetectionField = useCallback(
    (key: keyof ArbitrageDetectionConfig) => (v: number | string) =>
      setDetection((prev) => ({ ...prev, [key]: v })),
    []
  );

  const setToggle = useCallback(
    (key: keyof ArbitrageRuleToggles) => (v: boolean) =>
      setToggles((prev) => ({ ...prev, [key]: v })),
    []
  );

  return (
    <>
      {contextHolder}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: 'var(--vm-primary-light)',
                border: '1px solid var(--vm-primary-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <SafetyOutlined style={{ color: TOKEN.primary, fontSize: 14 }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--vm-text-primary)' }}>
                价格套利分析
              </div>
              <div style={{ fontSize: 11, color: TOKEN.textMuted, fontWeight: 400 }}>
                电商/订单 · 风险风控
              </div>
            </div>
          </div>
        }
        open={open}
        onClose={onCancel}
        width={580}
        styles={{
          body: {
            background: 'var(--vm-bg-base)',
            color: 'var(--vm-text-primary)',
            padding: 20,
            overflowY: 'auto',
          },
          header: {
            background: 'var(--vm-bg-base)',
            borderBottom: `1px solid ${TOKEN.borderSubtle}`,
            padding: '14px 20px',
          },
          footer: {
            background: 'var(--vm-bg-base)',
            borderTop: `1px solid ${TOKEN.borderSubtle}`,
            padding: '10px 20px',
          },
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={onCancel} size="small">
              取消
            </Button>
            <Button type="primary" onClick={handleConfirm} size="small">
              确认
            </Button>
          </div>
        }
      >
        {/* ── Group 1: Field Mapping ──────────────────────────────────── */}
        <Section icon={<DatabaseOutlined />} title="字段映射" required>
          {/* Mandatory fields */}
          <div
            style={{
              fontSize: 11,
              color: TOKEN.textMuted,
              marginBottom: 8,
              fontWeight: 500,
            }}
          >
            必填字段
          </div>
          <FieldRow
            label="订单ID"
            required
            tooltip="唯一标识每条订单的列"
            value={orderIdCol}
            onChange={setOrderIdCol}
            options={columns}
          />
          <FieldRow
            label="挂牌原价"
            required
            tooltip="商品原始标价（未扣除优惠券）"
            value={amountCol}
            onChange={setAmountCol}
            options={columns}
          />
          <FieldRow
            label="成本"
            required
            tooltip="商品进货成本，用于毛利计算"
            value={costCol}
            onChange={setCostCol}
            options={columns}
          />
          <FieldRow
            label="优惠券抵扣"
            required
            tooltip="本单优惠券抵扣金额，无优惠券时为0"
            value={couponAmountCol}
            onChange={setCouponAmountCol}
            options={columns}
          />

          {/* Output column selector */}
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${TOKEN.borderSubtle}`,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: TOKEN.textMuted,
                marginBottom: 8,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              输出列
              <Tooltip title="选择分析结果中需要保留的列；未选中的列不会出现在输出数据中">
                <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 11 }} />
              </Tooltip>
            </div>
            <Select
              mode="multiple"
              value={selectedOutputColumns}
              onChange={setSelectedOutputColumns}
              style={{ width: '100%' }}
              size="small"
              optionLabelProp="label"
              maxTagCount="responsive"
              placeholder="选择输出列（默认全部）"
              allowClear
              onClear={() => setSelectedOutputColumns([...DEFAULT_OUTPUT_COLUMNS])}
            >
              {OUTPUT_COLUMN_DEFS.map(({ key, label, desc, note }) => (
                <Select.Option key={key} value={key} label={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '1px 0' }}>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: 12,
                        color: 'var(--vm-primary)',
                        flexShrink: 0,
                        minWidth: 148,
                      }}
                    >
                      {key}
                    </span>
                    <span style={{ fontSize: 11, color: TOKEN.textSecondary, flex: 1 }}>{desc}</span>
                    <Tooltip title={note} placement="right">
                      <InfoCircleOutlined
                        style={{ fontSize: 10, color: TOKEN.textMuted, flexShrink: 0 }}
                      />
                    </Tooltip>
                  </div>
                  {/* Screen-reader label fallback */}
                  <span style={{ display: 'none' }}>{label}</span>
                </Select.Option>
              ))}
            </Select>
          </div>

        </Section>

        {/* ── Group 2: Risk Rule Configuration ───────────────────────── */}
        <Section
          icon={<AlertOutlined />}
          title="风险规则配置"
          collapsible
          defaultOpen
        >
          {/* Toggle rows */}
          {(
            [
              { key: 'marginRules',        label: '毛利异常检测',  desc: '检测负毛利、低毛利订单' },
              { key: 'discountRules',       label: '折扣异常检测',  desc: '检测极端折扣、异常折扣订单' },
              { key: 'priceDeviationRules', label: '价格偏离检测',  desc: '检测相对历史价格的异常偏离' },
              { key: 'couponAnomalyRules',  label: '优惠券叠加检测', desc: '检测优惠券异常叠加使用' },
            ] as { key: keyof ArbitrageRuleToggles; label: string; desc: string }[]
          ).map(({ key, label, desc }) => (
            <div key={key} style={{ ...rowStyle, justifyContent: 'space-between', marginBottom: 12 }}>
              <Tooltip title={desc} placement="left">
                <span style={{ fontSize: 12, color: TOKEN.textSecondary, cursor: 'help' }}>
                  {label}
                </span>
              </Tooltip>
              <Switch
                size="small"
                checked={toggles[key] as boolean}
                onChange={setToggle(key)}
              />
            </div>
          ))}

          {/* Clearance exemption (only relevant when margin rules enabled) */}
          {toggles.marginRules && (
            <div
              style={{
                padding: '6px 10px',
                background: 'var(--vm-bg-row)',
                borderRadius: 6,
                marginBottom: 10,
                border: `1px solid ${TOKEN.borderSubtle}`,
              }}
            >
              <Checkbox
                checked={toggles.clearanceMarginExempt}
                onChange={(e) => setToggle('clearanceMarginExempt')(e.target.checked)}
              >
                <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>
                  清仓订单免除毛利规则
                </Text>
              </Checkbox>
              <div style={{ fontSize: 11, color: TOKEN.textMuted, marginTop: 3, marginLeft: 24 }}>
                开启后，活动类型为 clearance 的订单跳过毛利异常检测
              </div>
            </div>
          )}

          {/* Threshold values */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${TOKEN.borderSubtle}` }}>
            <div style={{ fontSize: 11, color: TOKEN.textMuted, marginBottom: 8, fontWeight: 500 }}>
              阈值配置
            </div>
            <ThresholdRow
              label="低毛利率阈值"
              tooltip="毛利率低于此值视为低毛利（毛利 > 0 时生效）"
              value={thresholds.lowMarginRate}
              onChange={setThreshold('lowMarginRate')}
              min={0} max={100} step={1}
              disabled={!toggles.marginRules}
            />
            <ThresholdRow
              label="极端折扣率阈值"
              tooltip="非促销订单折扣率低于此值视为极端折扣"
              value={thresholds.extremeDiscountRate}
              onChange={setThreshold('extremeDiscountRate')}
              min={0} max={100} step={1}
              disabled={!toggles.discountRules}
            />
            <ThresholdRow
              label="商品价格偏离阈值"
              tooltip="实付价格低于SKU 30日均价的偏离比例阈值（负偏离）"
              value={thresholds.productDeviationRate}
              onChange={setThreshold('productDeviationRate')}
              min={0} max={100} step={1}
              disabled={!toggles.priceDeviationRules}
            />
            <ThresholdRow
              label="类目价格偏离阈值"
              tooltip="实付价格低于类目 7日均价的偏离比例阈值"
              value={thresholds.categoryDeviationRate}
              onChange={setThreshold('categoryDeviationRate')}
              min={0} max={100} step={1}
              disabled={!toggles.priceDeviationRules}
            />
            <ThresholdRow
              label="优惠券成本比阈值"
              tooltip="实付金额低于成本 × 此比例时触发优惠券叠加异常"
              value={thresholds.couponCostRatio}
              onChange={setThreshold('couponCostRatio')}
              min={0} max={100} step={1}
              disabled={!toggles.couponAnomalyRules}
            />
            <ThresholdRow
              label="优惠券折扣率阈值"
              tooltip="非促销订单折扣率低于此值时（有优惠券）触发异常"
              value={thresholds.couponDiscountRate}
              onChange={setThreshold('couponDiscountRate')}
              min={0} max={100} step={1}
              disabled={!toggles.couponAnomalyRules}
            />
          </div>
        </Section>

        {/* ── Group 3: Behavior Arbitrage Detection (fields + params merged) ── */}
        <Section
          icon={<ApartmentOutlined />}
          title="行为套利检测"
          collapsible
          defaultOpen={false}
        >
          {/* Intro: clarify what this section does and what fields are needed */}
          <div
            style={{
              fontSize: 11,
              color: TOKEN.textMuted,
              marginBottom: 12,
              lineHeight: 1.6,
              padding: '6px 9px',
              background: 'var(--vm-bg-row)',
              borderRadius: 5,
              border: `1px solid ${TOKEN.borderSubtle}`,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
            }}
          >
            <InfoCircleOutlined style={{ marginTop: 1, flexShrink: 0 }} />
            <span>配置以下字段后，系统可检测批量购买、地址聚集、设备多账号等套利行为</span>
          </div>

          {/* Extended field rows (auto-detected, optional) */}
          <FieldRow label="SKU ID"   optional tooltip="商品SKU标识，用于价格基准计算和套利检测" value={skuIdCol}   onChange={setSkuIdCol}   options={columns} />
          <FieldRow label="类目ID"   optional tooltip="商品类目，用于类目均价基准" value={categoryIdCol} onChange={setCategoryIdCol} options={columns} />
          <FieldRow label="订单时间" optional tooltip="订单创建时间（毫秒时间戳或日期字符串）" value={orderTimeCol} onChange={setOrderTimeCol} options={columns} />
          <FieldRow label="用户ID"   optional tooltip="用户唯一标识，用于套利行为检测" value={userIdCol}   onChange={setUserIdCol}   options={columns} />
          <FieldRow label="设备ID"   optional tooltip="下单设备ID，用于设备聚集套利检测" value={deviceIdCol}  onChange={setDeviceIdCol}  options={columns} />
          <FieldRow label="收货地址" optional tooltip="收货地址，用于地址聚集套利检测" value={receiverAddrCol} onChange={setReceiverAddrCol} options={columns} />
          <FieldRow label="活动ID"   optional tooltip="关联促销活动ID，用于区分正常促销与套利" value={activityIdCol}   onChange={setActivityIdCol}   options={columns} />
          <FieldRow label="活动类型" optional tooltip="活动类型（clearance=清仓，normal=正常）" value={activityTypeCol} onChange={setActivityTypeCol} options={columns} />
          <FieldRow label="活动开始" optional tooltip="活动开始时间（毫秒时间戳）" value={activityStartCol} onChange={setActivityStartCol} options={columns} />
          <FieldRow label="活动结束" optional tooltip="活动结束时间（毫秒时间戳）" value={activityEndCol}   onChange={setActivityEndCol}   options={columns} />

          {/* Detection params — grayed until the 5 key fields are configured */}
          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: `1px solid ${TOKEN.borderSubtle}`,
              opacity: arbFieldsAvailable ? 1 : 0.45,
              pointerEvents: arbFieldsAvailable ? undefined : 'none',
              transition: 'opacity 0.2s',
            }}
          >
            {/* Inline hint when key fields are not yet filled */}
            {!arbFieldsAvailable && (
              <div
                style={{
                  fontSize: 11,
                  color: TOKEN.textMuted,
                  marginBottom: 10,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 5,
                  lineHeight: 1.6,
                }}
              >
                <InfoCircleOutlined style={{ marginTop: 1, flexShrink: 0 }} />
                <span>请先配置上方 SKU ID、用户ID、设备ID、收货地址、订单时间，以启用以下检测参数</span>
              </div>
            )}

            {/* Master toggle */}
            <div style={{ ...rowStyle, justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: TOKEN.textSecondary }}>启用套利行为检测</span>
              <Switch
                size="small"
                checked={toggles.arbitrageRules}
                onChange={setToggle('arbitrageRules')}
              />
            </div>

            {/* Spike detection method */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: TOKEN.textMuted, marginBottom: 6, fontWeight: 500 }}>
                历史基准计算方式
                <Tooltip title="用于判断 1h 内同SKU订单是否异常突增的基准计算方法">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: TOKEN.textMuted, fontSize: 10 }} />
                </Tooltip>
              </div>
              <Radio.Group
                size="small"
                value={detection.hourlySpikeMethod}
                onChange={(e) => setDetectionField('hourlySpikeMethod')(e.target.value as string)}
                disabled={!toggles.arbitrageRules}
              >
                <Radio value="batch_avg">
                  <span style={{ fontSize: 12 }}>批次平均</span>
                  <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginLeft: 4 }}>
                    （全量 / 小时数，推荐）
                  </Text>
                </Radio>
                <Radio value="same_hour_avg" style={{ marginTop: 4 }}>
                  <span style={{ fontSize: 12 }}>同时段平均</span>
                  <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginLeft: 4 }}>
                    （相同小时历史均值）
                  </Text>
                </Radio>
              </Radio.Group>
            </div>

            {/* Numeric parameters */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${TOKEN.borderSubtle}` }}>
              <div style={{ fontSize: 11, color: TOKEN.textMuted, marginBottom: 8, fontWeight: 500 }}>
                参数配置
              </div>

              <div style={thresholdRowStyle}>
                <Tooltip title="1h内同SKU订单量超过基准 × 此倍数视为异常突增">
                  <span style={{ ...labelStyle, cursor: 'help', width: 150 }}>突增倍数阈值</span>
                </Tooltip>
                <InputNumber
                  size="small"
                  min={1} max={100} step={1}
                  value={detection.hourlySpikeMult}
                  onChange={(v) => v != null && setDetectionField('hourlySpikeMult')(v)}
                  addonAfter="倍"
                  style={{ width: 120 }}
                  disabled={!toggles.arbitrageRules}
                />
              </div>

              <div style={thresholdRowStyle}>
                <Tooltip title="单用户单日同SKU下单超过此次数视为可疑批量购买">
                  <span style={{ ...labelStyle, cursor: 'help', width: 150 }}>单日购买上限</span>
                </Tooltip>
                <InputNumber
                  size="small"
                  min={1} max={999} step={1}
                  value={detection.purchaseLimit}
                  onChange={(v) => v != null && setDetectionField('purchaseLimit')(v)}
                  addonAfter="次"
                  style={{ width: 120 }}
                  disabled={!toggles.arbitrageRules}
                />
              </div>

              <div style={thresholdRowStyle}>
                <Tooltip title="收货地址前缀截取长度，用于聚类相同地址区域">
                  <span style={{ ...labelStyle, cursor: 'help', width: 150 }}>地址前缀长度</span>
                </Tooltip>
                <InputNumber
                  size="small"
                  min={5} max={50} step={1}
                  value={detection.addressPrefixLength}
                  onChange={(v) => v != null && setDetectionField('addressPrefixLength')(v)}
                  addonAfter="字符"
                  style={{ width: 120 }}
                  disabled={!toggles.arbitrageRules}
                />
              </div>

              <div style={thresholdRowStyle}>
                <Tooltip title="同地址前缀+SKU在2小时内不同用户下单数超过此值视为地址聚集">
                  <span style={{ ...labelStyle, cursor: 'help', width: 150 }}>地址聚集阈值</span>
                </Tooltip>
                <InputNumber
                  size="small"
                  min={2} max={999} step={1}
                  value={detection.addressClusterThreshold}
                  onChange={(v) => v != null && setDetectionField('addressClusterThreshold')(v)}
                  addonAfter="人"
                  style={{ width: 120 }}
                  disabled={!toggles.arbitrageRules}
                />
              </div>

              <div style={thresholdRowStyle}>
                <Tooltip title="同设备+SKU在2小时内不同账号下单数超过此值视为设备多账号套利">
                  <span style={{ ...labelStyle, cursor: 'help', width: 150 }}>设备账号阈值</span>
                </Tooltip>
                <InputNumber
                  size="small"
                  min={2} max={999} step={1}
                  value={detection.deviceAccountThreshold}
                  onChange={(v) => v != null && setDetectionField('deviceAccountThreshold')(v)}
                  addonAfter="账号"
                  style={{ width: 120 }}
                  disabled={!toggles.arbitrageRules}
                />
              </div>
            </div>
          </div>
        </Section>

        {/* Risk score reference */}
        <div
          style={{
            padding: '10px 12px',
            background: 'var(--vm-bg-row)',
            borderRadius: 6,
            border: `1px solid ${TOKEN.borderSubtle}`,
            fontSize: 11,
            color: TOKEN.textMuted,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <ExperimentOutlined style={{ fontSize: 11 }} />
            <span style={{ fontWeight: 500, color: TOKEN.textSecondary }}>风险等级说明</span>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[
              { label: '严重', range: '≥ 80', color: 'var(--vm-color-error)' },
              { label: '高',   range: '60–79', color: 'var(--vm-color-warning)' },
              { label: '中',   range: '40–59', color: 'var(--vm-flow-warning)' },
              { label: '低',   range: '< 40',  color: TOKEN.textMuted },
            ].map(({ label, range, color }) => (
              <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: color,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                <span style={{ color }}>{label}</span>
                <span style={{ color: TOKEN.textMuted }}>{range}</span>
              </span>
            ))}
          </div>
        </div>
      </Drawer>
    </>
  );
};

export default ArbitrageAnalyzeDrawer;
