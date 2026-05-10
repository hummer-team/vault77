/**
 * OrderAbnormalAmountDrawer
 *
 * Configuration drawer for fn_ecom_abnormal_amount (异常金额监控).
 * Three groups:
 *   Group 1 — Required field mapping  (orderIdCol, amountCol, originalAmountCol)
 *   Group 2 — Optional dimensions     (orderTimeCol, userIdCol, skuIdCol, categoryIdCol)
 *   Group 3 — Detection parameters   (threshold, scalingMode, riskThresholds, samplingRate, GPU)
 *
 * All colors use TOKEN (CSS variables) — no hardcoded hex values.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Slider,
  InputNumber,
  Radio,
  Space,
  Typography,
  message,
  Tooltip,
} from 'antd';
import {
  CloseOutlined,
  ThunderboltOutlined,
  ApartmentOutlined,
  ControlOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { AbnormalAmountConfig } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Default config values
// ============================================================================

const DEFAULT_CONFIG: AbnormalAmountConfig = {
  fieldMapping: {
    orderIdCol: '',
    amountCol: '',
    originalAmountCol: '',
  },
  anomalyThreshold: 0.8,
  scalingMode: 2,
  riskThresholds: { high: 0.9, medium: 0.7 },
  samplingRate: 0.75,
  samplingThreshold: 50_000,
  useGPU: 'auto',
};

// ============================================================================
// Column auto-match patterns
// ============================================================================

const PATTERNS = {
  orderId: /^(order[_\s]?id|orderid|order[_\s]?no|orderno|trans[_\s]?id|bill[_\s]?id)$|订单|单号|交易|流水/i,
  amount: /^(amount|pay[_\s]?amount|payment|sale[_\s]?amount|actual[_\s]?amount|final[_\s]?amount|price)$|实付|金额|付款|支付/i,
  originalAmount: /^(original[_\s]?amount|origin[_\s]?amount|list[_\s]?price|market[_\s]?price|retail[_\s]?price|msrp|tag[_\s]?price|face[_\s]?value)$|原价|定价|标价|原始金额|吊牌/i,
  orderTime: /^(order[_\s]?time|order[_\s]?date|created[_\s]?at|create[_\s]?time|transaction[_\s]?time|purchase[_\s]?time)$|下单|创建时间|交易时间/i,
  userId: /^(user[_\s]?id|userid|member[_\s]?id|memberid|customer[_\s]?id|buyer[_\s]?id|account[_\s]?id)$|用户|会员|买家/i,
  skuId: /^(sku[_\s]?id|skuid|product[_\s]?id|productid|item[_\s]?id|goods[_\s]?id)$|商品|产品|sku/i,
  categoryId: /^(category[_\s]?id|categoryid|cat[_\s]?id|catid|cate[_\s]?id|class[_\s]?id|type[_\s]?id)$|类目|分类|品类/i,
} as const;

function autoMatch(columns: string[], pattern: RegExp): string {
  return columns.find((c) => pattern.test(c)) ?? '';
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
      styles={{
        popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
      }}
    />
  </div>
);

// ============================================================================
// Props
// ============================================================================

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

// ============================================================================
// Main component
// ============================================================================

export const OrderAbnormalAmountDrawer: React.FC<OrderAbnormalAmountDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName = '异常金额监控',
  kernelCategory = '风险风控',
  onConfirm,
  onCancel,
}) => {
  const [messageApi, contextHolder] = message.useMessage();

  // --- Group 1: required fields ---
  const [orderIdCol, setOrderIdCol]           = useState('');
  const [amountCol, setAmountCol]             = useState('');
  const [originalAmountCol, setOriginalAmountCol] = useState('');

  // --- Group 2: optional dimensions ---
  const [orderTimeCol, setOrderTimeCol]       = useState('');
  const [userIdCol, setUserIdCol]             = useState('');
  const [skuIdCol, setSkuIdCol]               = useState('');
  const [categoryIdCol, setCategoryIdCol]     = useState('');

  // --- Group 3: detection params ---
  const [anomalyThreshold, setAnomalyThreshold] = useState(0.8);
  const [scalingMode, setScalingMode]           = useState<0 | 1 | 2>(2);
  const [riskHigh, setRiskHigh]                 = useState(0.9);
  const [riskMedium, setRiskMedium]             = useState(0.7);
  const [samplingRate, setSamplingRate]         = useState(0.75);
  const [useGPU, setUseGPU]                     = useState<'auto' | 'force' | 'disable'>('auto');

  // Restore or auto-fill when drawer opens
  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      const fm = initialConfig.fieldMapping;
      setOrderIdCol(fm.orderIdCol);
      setAmountCol(fm.amountCol);
      setOriginalAmountCol(fm.originalAmountCol);
      setOrderTimeCol(fm.orderTimeCol ?? '');
      setUserIdCol(fm.userIdCol ?? '');
      setSkuIdCol(fm.skuIdCol ?? '');
      setCategoryIdCol(fm.categoryIdCol ?? '');
      setAnomalyThreshold(initialConfig.anomalyThreshold);
      setScalingMode(initialConfig.scalingMode);
      setRiskHigh(initialConfig.riskThresholds.high);
      setRiskMedium(initialConfig.riskThresholds.medium);
      setSamplingRate(initialConfig.samplingRate);
      setUseGPU(initialConfig.useGPU);
    } else {
      // Auto-fill from column names via regex
      setOrderIdCol(autoMatch(columns, PATTERNS.orderId));
      setAmountCol(autoMatch(columns, PATTERNS.amount));
      setOriginalAmountCol(autoMatch(columns, PATTERNS.originalAmount));
      setOrderTimeCol(autoMatch(columns, PATTERNS.orderTime));
      setUserIdCol(autoMatch(columns, PATTERNS.userId));
      setSkuIdCol(autoMatch(columns, PATTERNS.skuId));
      setCategoryIdCol(autoMatch(columns, PATTERNS.categoryId));
      // Reset detection params to defaults
      setAnomalyThreshold(DEFAULT_CONFIG.anomalyThreshold);
      setScalingMode(DEFAULT_CONFIG.scalingMode);
      setRiskHigh(DEFAULT_CONFIG.riskThresholds.high);
      setRiskMedium(DEFAULT_CONFIG.riskThresholds.medium);
      setSamplingRate(DEFAULT_CONFIG.samplingRate);
      setUseGPU(DEFAULT_CONFIG.useGPU);
    }
  }, [open, columns, initialConfig]);

  // Dimension hint: show how many feature dims will be used
  const featureDimHint = useMemo(() => {
    let dims = 3; // core: amount, discount_rate, z_score
    if (orderTimeCol) dims += 1;
    if (orderTimeCol && userIdCol) dims += 1;
    const note = dims <= 2 ? '基础模式（2维）' : `${dims} 个特征维度`;
    return note;
  }, [orderTimeCol, userIdCol]);

  const handleConfirm = useCallback(() => {
    if (!orderIdCol) {
      messageApi.warning('请选择订单ID列');
      return;
    }
    if (!amountCol) {
      messageApi.warning('请选择实付金额列');
      return;
    }
    if (!originalAmountCol) {
      messageApi.warning('请选择原始金额列（用于计算折扣率特征）');
      return;
    }
    if (riskMedium >= riskHigh) {
      messageApi.warning('中风险阈值必须低于高风险阈值');
      return;
    }

    const config: AbnormalAmountConfig = {
      fieldMapping: {
        orderIdCol,
        amountCol,
        originalAmountCol,
        ...(orderTimeCol  ? { orderTimeCol }  : {}),
        ...(userIdCol     ? { userIdCol }     : {}),
        ...(skuIdCol      ? { skuIdCol }      : {}),
        ...(categoryIdCol ? { categoryIdCol } : {}),
      },
      anomalyThreshold,
      scalingMode,
      riskThresholds: { high: riskHigh, medium: riskMedium },
      samplingRate,
      samplingThreshold: DEFAULT_CONFIG.samplingThreshold,
      useGPU,
    };
    onConfirm(config);
  }, [
    orderIdCol, amountCol, originalAmountCol,
    orderTimeCol, userIdCol, skuIdCol, categoryIdCol,
    anomalyThreshold, scalingMode, riskHigh, riskMedium,
    samplingRate, useGPU, onConfirm, messageApi,
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
        {/* ── Group 1: Required fields ──────────────────────────────── */}
        <Section icon="🔑" title="必填字段映射" badge="REQUIRED">
          <FieldRow
            label="订单 ID"
            required
            tip="唯一标识每笔订单，用于结果关联"
            value={orderIdCol}
            columns={columns}
            onChange={setOrderIdCol}
          />
          <FieldRow
            label="实付金额"
            required
            tip="买家实际支付金额，异常检测的核心目标列"
            value={amountCol}
            columns={columns}
            onChange={setAmountCol}
          />
          <FieldRow
            label="原始金额"
            required
            tip="商品标价 / 原价，用于计算折扣率特征（discount_rate = 1 - amount / original_amount）"
            value={originalAmountCol}
            columns={columns}
            onChange={setOriginalAmountCol}
          />
        </Section>

        {/* ── Group 2: Optional dimensions ─────────────────────────── */}
        <Section
          icon={<ApartmentOutlined />}
          title="可选维度字段"
          badge={featureDimHint}
        >
          <Text style={{ fontSize: 11, color: TOKEN.textMuted, display: 'block', marginBottom: 8 }}>
            配置后自动启用更多特征维度，提升检测精度。系统会根据字段数选择最优特征集。
          </Text>
          <FieldRow
            label="下单时间"
            tip="启用后新增「日金额百分位」特征"
            value={orderTimeCol}
            columns={columns}
            onChange={setOrderTimeCol}
          />
          <FieldRow
            label="用户 ID"
            tip="需同时配置下单时间，启用「用户日均下单量」特征"
            value={userIdCol}
            columns={columns}
            onChange={setUserIdCol}
          />
          {!orderTimeCol && userIdCol && (
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginBottom: 4, display: 'block' }}>
              ⚠️ 用户 ID 特征需先配置下单时间列才能生效
            </Text>
          )}
          <FieldRow
            label="商品 SKU"
            tip="可选，选择后用于多维分析（如按商品 SKU 追踪异常集中度）"
            value={skuIdCol}
            columns={columns}
            onChange={setSkuIdCol}
          />
          <FieldRow
            label="品类 ID"
            tip="可选，选择后用于多维分析（如按品类追踪异常分布）"
            value={categoryIdCol}
            columns={columns}
            onChange={setCategoryIdCol}
          />
        </Section>

        {/* ── Group 3: Detection parameters ────────────────────────── */}
        <Section icon={<ControlOutlined />} title="检测参数配置">
          {/* Anomaly threshold */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>
                异常分数阈值
                <Tooltip title="检测分值越高表示该订单越可疑。超过此阈值将被标记为异常订单，建议设置在 0.70–0.95 之间">
                  <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11, color: TOKEN.textMuted }} />
                </Tooltip>
              </Text>
              <Text style={{ fontSize: 12, color: TOKEN.primary, fontWeight: 600 }}>
                {anomalyThreshold.toFixed(2)}
              </Text>
            </div>
            <Slider
              min={0.5}
              max={0.99}
              step={0.01}
              value={anomalyThreshold}
              onChange={(v) => setAnomalyThreshold(v)}
              styles={{ rail: { background: TOKEN.borderMid }, track: { background: TOKEN.primary } }}
            />
          </div>

          {/* Risk thresholds */}
          <div style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary, display: 'block', marginBottom: 6 }}>
              风险等级阈值
              <Tooltip title="风险等级划分：高风险（异常分 ≥ 高阈值 🔴）/ 中风险（在中值与高值之间 🟡）/ 低风险（其余异常订单 🟢）">
                <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11, color: TOKEN.textMuted }} />
              </Tooltip>
            </Text>
            <Space size={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12, color: TOKEN.textMuted, whiteSpace: 'nowrap' }}>高风险 ≥</Text>
                <InputNumber
                  size="small"
                  min={riskMedium + 0.01}
                  max={0.99}
                  step={0.01}
                  precision={2}
                  value={riskHigh}
                  onChange={(v) => setRiskHigh(v ?? 0.9)}
                  style={{ width: 72 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 12, color: TOKEN.textMuted, whiteSpace: 'nowrap' }}>中风险 ≥</Text>
                <InputNumber
                  size="small"
                  min={0.5}
                  max={riskHigh - 0.01}
                  step={0.01}
                  precision={2}
                  value={riskMedium}
                  onChange={(v) => setRiskMedium(v ?? 0.7)}
                  style={{ width: 72 }}
                />
              </div>
            </Space>
          </div>

          {/* Scaling mode */}
          <div style={{ marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary, display: 'block', marginBottom: 6 }}>
              特征归一化模式
              <Tooltip title="通常使用默认模式（Standard）即可；如遇大促等极端价格场景，可尝试 MinMax 模式">
                <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11, color: TOKEN.textMuted }} />
              </Tooltip>
            </Text>
            <Radio.Group
              size="small"
              value={scalingMode}
              onChange={(e) => setScalingMode(e.target.value as 0 | 1 | 2)}
            >
              <Radio.Button value={2}>Standard</Radio.Button>
              <Radio.Button value={1}>MinMax</Radio.Button>
              <Radio.Button value={0}>None</Radio.Button>
            </Radio.Group>
          </div>

          {/* Sampling rate */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>
                大数据加速比例（超过 5 万行时自动启用）
                <Tooltip title="数据量较大时按比例抽样分析，可加快检测速度；100% 表示全量检测不抽样">
                  <InfoCircleOutlined style={{ marginLeft: 4, fontSize: 11, color: TOKEN.textMuted }} />
                </Tooltip>
              </Text>
              <Text style={{ fontSize: 12, color: TOKEN.primary, fontWeight: 600 }}>
                {(samplingRate * 100).toFixed(0)}%
              </Text>
            </div>
            <Slider
              min={0.25}
              max={1.0}
              step={0.05}
              value={samplingRate}
              onChange={(v) => setSamplingRate(v)}
              marks={{ 0.25: '25%', 0.5: '50%', 0.75: '75%', 1.0: '100%' }}
              styles={{ rail: { background: TOKEN.borderMid }, track: { background: TOKEN.primary } }}
            />
          </div>

          {/* GPU mode */}
          <div style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary, display: 'block', marginBottom: 6 }}>
              <ThunderboltOutlined style={{ marginRight: 4 }} />
              计算加速模式
            </Text>
            <Select
              size="small"
              value={useGPU}
              onChange={(v) => setUseGPU(v)}
              style={{ width: '100%' }}
              options={[
                { label: '🤖 自动检测（推荐）', value: 'auto' },
                { label: '⚡ 优先加速', value: 'force' },
                { label: '🖥️ 标准计算', value: 'disable' },
              ]}
              styles={{
                popup: { root: { background: TOKEN.bgBase, borderColor: TOKEN.borderMid } },
              }}
            />
          </div>
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
            💡 <b>提示：</b>检测完成后，结果将包含每笔订单的异常分数、风险等级和建议处置说明。采样仅影响检测速度，不影响全量数据的最终输出。
          </Text>
        </div>
      </Drawer>
    </>
  );
};

export default OrderAbnormalAmountDrawer;
