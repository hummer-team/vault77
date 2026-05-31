/**
 * OrderChannelAnalysisDrawer
 * Configuration drawer for fn_ecom_order_channel_analysis (渠道归因分析).
 *
 * Sections:
 *   1. Dimension config  — dimension type (channel/source/platform/live_room) + column mapping
 *   2. Core metrics      — orderIdCol, netAmountCol, grossProfitCol (regex auto-fill)
 *   3. Refund rate       — Radio A (count-based) / B (amount-based) + conditional col mapping
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Collapse,
  Drawer,
  InputNumber,
  Radio,
  Select,
  Space,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  BulbOutlined,
  DatabaseOutlined,
  FundOutlined,
  InfoCircleOutlined,
  RiseOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import type { OrderChannelAnalysisConfig, ChannelDimension, RefundRateMode } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface OrderChannelAnalysisDrawerProps {
  open: boolean;
  /** All available columns from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: OrderChannelAnalysisConfig;
  /** Kernel display name for dynamic title */
  kernelDisplayName?: string;
  /** Kernel industry label for dynamic subtitle */
  kernelIndustry?: string;
  /** Kernel category label for dynamic subtitle */
  kernelCategory?: string;
  onConfirm: (config: OrderChannelAnalysisConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Defaults & options
// ============================================================================

const DEFAULT_CONFIG: OrderChannelAnalysisConfig = {
  dimension:       'channel',
  dimensionCol:    '',
  orderIdCol:      '',
  netAmountCol:    '',
  grossProfitCol:  '',
  refundRateMode:  'count',
  roiThreshold:    0.3,
  topN:            3,
};

const DIMENSION_OPTIONS: { value: ChannelDimension; label: string; hint: string }[] = [
  { value: 'channel',   label: '渠道',   hint: '如：直播、搜索、推荐、广告' },
  { value: 'source',    label: '来源',   hint: '如：自然流量、付费推广、社群' },
  { value: 'platform',  label: '平台',   hint: '如：淘宝、京东、抖音、快手' },
  { value: 'live_room', label: '直播间', hint: '直播间 ID 或名称' },
];

// Column regex auto-match patterns (English + Chinese identifiers)
const PATTERNS: Record<string, RegExp> = {
  channel:       /channel|渠道|来源|source/i,
  source:        /source|来源|流量来源|traffic/i,
  platform:      /platform|平台|site|shop/i,
  live_room:     /live[_\s]?room|直播间|room[_\s]?id/i,
  orderIdCol:    /^(order[_\s]?id|orderid|order[_\s]?no|orderno|transaction[_\s]?id|bill[_\s]?id)$|订单|单号|交易/i,
  netAmountCol:  /net[_\s]?amount|sales[_\s]?amount|actual[_\s]?amount|实收|净额|销售额|成交金额|amount/i,
  grossProfitCol:/gross[_\s]?profit|profit|毛利|利润|毛利润/i,
  isRefundCol:   /is[_\s]?refund|refund[_\s]?flag|退款[_\s]?标记|是否退款|refunded/i,
  refundAmountCol:/refund[_\s]?amount|退款金额|refund/i,
};

function autoMatch(columns: string[], key: string): string {
  return columns.find((c) => PATTERNS[key]?.test(c)) ?? '';
}

// ============================================================================
// Section wrapper (consistent with other drawers)
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
// Shared layout helpers
// ============================================================================

const selectStyle: React.CSSProperties = { width: '100%' };

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 8,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: TOKEN.textSecondary,
  flexShrink: 0,
  width: 88,
};

// ============================================================================
// Main component
// ============================================================================

export const OrderChannelAnalysisDrawer: React.FC<OrderChannelAnalysisDrawerProps> = ({
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

  const [dimension, setDimension]           = useState<ChannelDimension>(DEFAULT_CONFIG.dimension);
  const [dimensionCol, setDimensionCol]     = useState('');
  const [orderIdCol, setOrderIdCol]         = useState('');
  const [netAmountCol, setNetAmountCol]     = useState('');
  const [grossProfitCol, setGrossProfitCol] = useState('');
  const [refundRateMode, setRefundRateMode] = useState<RefundRateMode>('count');
  const [isRefundCol, setIsRefundCol]       = useState('');
  const [refundAmountCol, setRefundAmountCol] = useState('');
  const [roiThreshold, setRoiThreshold]     = useState<number>(0.3);
  const [topN, setTopN]                     = useState<number>(3);

  // Restore / reset on open; auto-match when no prior config
  useEffect(() => {
    if (!open) return;
    const cfg = initialConfig ?? DEFAULT_CONFIG;

    setDimension(cfg.dimension ?? 'channel');
    setRefundRateMode(cfg.refundRateMode ?? 'count');
    setIsRefundCol(cfg.isRefundCol ?? '');
    setRefundAmountCol(cfg.refundAmountCol ?? '');
    setRoiThreshold(cfg.roiThreshold ?? 0.3);
    setTopN(cfg.topN ?? 3);

    setDimensionCol(cfg.dimensionCol   || autoMatch(columns, cfg.dimension ?? 'channel'));
    setOrderIdCol(cfg.orderIdCol       || autoMatch(columns, 'orderIdCol'));
    setNetAmountCol(cfg.netAmountCol   || autoMatch(columns, 'netAmountCol'));
    setGrossProfitCol(cfg.grossProfitCol || autoMatch(columns, 'grossProfitCol'));
  }, [open, initialConfig, columns]);

  // When dimension type changes, re-auto-match dimensionCol if not yet set
  const handleDimensionChange = useCallback((val: ChannelDimension) => {
    setDimension(val);
    setDimensionCol((prev) => prev || autoMatch(columns, val));
  }, [columns]);

  const handleConfirm = useCallback(() => {
    if (!dimensionCol) {
      messageApi.warning(`请选择「${DIMENSION_OPTIONS.find((d) => d.value === dimension)?.label ?? '维度'}」对应的数据列`);
      return;
    }
    if (!orderIdCol) {
      messageApi.warning('请选择订单 ID 列');
      return;
    }
    if (!netAmountCol) {
      messageApi.warning('请选择销售额列');
      return;
    }
    if (!grossProfitCol) {
      messageApi.warning('请选择毛利润列');
      return;
    }
    if (refundRateMode === 'amount' && !refundAmountCol) {
      messageApi.warning('按金额计算退款率时，请选择退款金额列');
      return;
    }

    const config: OrderChannelAnalysisConfig = {
      dimension,
      dimensionCol,
      orderIdCol,
      netAmountCol,
      grossProfitCol,
      refundRateMode,
      roiThreshold,
      topN,
      ...(isRefundCol    ? { isRefundCol }    : {}),
      ...(refundAmountCol ? { refundAmountCol } : {}),
    };
    onConfirm(config);
  }, [
    dimension, dimensionCol, orderIdCol, netAmountCol, grossProfitCol,
    refundRateMode, isRefundCol, refundAmountCol, roiThreshold, topN,
    messageApi, onConfirm,
  ]);

  const colOptions = columns.map((c) => ({ value: c, label: c }));
  const dimInfo    = DIMENSION_OPTIONS.find((d) => d.value === dimension);
  const title      = kernelDisplayName ?? '渠道归因分析';
  const subtitle   = [kernelIndustry, kernelCategory].filter(Boolean).join(' / ');

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
            <RiseOutlined style={{ color: TOKEN.primary, fontSize: 16 }} />
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
        {/* ── Section 1: Dimension Config ─────────────────────────────── */}
        <Section icon={<FundOutlined />} title="分析维度" required>
          {/* Dimension type selector */}
          <div style={rowStyle}>
            <Text style={labelStyle}>维度类型</Text>
            <Select<ChannelDimension>
              style={selectStyle}
              value={dimension}
              options={DIMENSION_OPTIONS.map(({ value, label, hint }) => ({
                value,
                label: (
                  <span>
                    {label}
                    <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginLeft: 6 }}>
                      {hint}
                    </Text>
                  </span>
                ),
              }))}
              onChange={handleDimensionChange}
              size="small"
            />
          </div>

          {/* Dimension column mapping */}
          <div style={rowStyle}>
            <Text style={labelStyle}>{dimInfo?.label ?? '维度'}列</Text>
            <Select
              style={selectStyle}
              value={dimensionCol || undefined}
              placeholder={`选择${dimInfo?.label ?? '维度'}对应列`}
              options={colOptions}
              onChange={setDimensionCol}
              showSearch
              size="small"
            />
          </div>
        </Section>

        {/* ── Section 2: Core Metrics ─────────────────────────────────── */}
        <Section icon={<DatabaseOutlined />} title="核心指标列" required>
          <div style={rowStyle}>
            <Text style={labelStyle}>订单 ID 列</Text>
            <Select
              style={selectStyle}
              value={orderIdCol || undefined}
              placeholder="选择订单 ID 列"
              options={colOptions}
              onChange={setOrderIdCol}
              showSearch
              size="small"
            />
          </div>

          <div style={rowStyle}>
            <Text style={labelStyle}>销售额列</Text>
            <Tooltip title="净销售额（实收金额），用于计算 ROI 和客单价">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <Select
              style={selectStyle}
              value={netAmountCol || undefined}
              placeholder="选择净销售额列"
              options={colOptions}
              onChange={setNetAmountCol}
              showSearch
              size="small"
            />
          </div>

          <div style={rowStyle}>
            <Text style={labelStyle}>毛利润列</Text>
            <Tooltip title="毛利润（Gross Profit），用于计算 ROI = 毛利润 / 销售额">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <Select
              style={selectStyle}
              value={grossProfitCol || undefined}
              placeholder="选择毛利润列"
              options={colOptions}
              onChange={setGrossProfitCol}
              showSearch
              size="small"
            />
          </div>
        </Section>

        {/* ── Section 3: Refund Rate ──────────────────────────────────── */}
        <Section icon={<InfoCircleOutlined />} title="退款率配置">
          <div style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary }}>计算方式</Text>
            <Radio.Group
              value={refundRateMode}
              onChange={(e) => setRefundRateMode(e.target.value as RefundRateMode)}
              style={{ marginLeft: 12 }}
              size="small"
            >
              <Radio value="count">
                <Tooltip title="退款订单数 / 总订单数（默认）">
                  <span style={{ fontSize: 12 }}>按订单数</span>
                </Tooltip>
              </Radio>
              <Radio value="amount">
                <Tooltip title="退款金额合计 / 销售额合计">
                  <span style={{ fontSize: 12 }}>按金额</span>
                </Tooltip>
              </Radio>
            </Radio.Group>
          </div>

          {/* Mode A: is_refund flag column */}
          {refundRateMode === 'count' && (
            <div style={rowStyle}>
              <Text style={labelStyle}>退款标记列</Text>
              <Tooltip title="值为 1 时表示该订单已退款（0 表示正常），留空则退款率显示为 0">
                <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
              </Tooltip>
              <Select
                style={selectStyle}
                value={isRefundCol || undefined}
                placeholder="可选：退款标记列（0/1）"
                options={[{ value: '', label: '—— 不配置' }, ...colOptions]}
                onChange={(v) => setIsRefundCol(v === '' ? '' : v)}
                showSearch
                size="small"
                allowClear
              />
            </div>
          )}

          {/* Mode B: refund amount column */}
          {refundRateMode === 'amount' && (
            <div style={rowStyle}>
              <Text style={labelStyle}>退款金额列</Text>
              <Select
                style={selectStyle}
                value={refundAmountCol || undefined}
                placeholder="选择退款金额列"
                options={colOptions}
                onChange={setRefundAmountCol}
                showSearch
                size="small"
              />
            </div>
          )}
        </Section>

        {/* ── Section 4: Analysis Preferences ─────────────────────── */}
        <Section icon={<SettingOutlined />} title="分析偏好">
          {/* topN: how many top channels to surface */}
          <div style={rowStyle}>
            <Text style={labelStyle}>重点渠道数</Text>
            <Tooltip title="按销售额从高到低，生成前 N 个渠道的分析卡片，聚焦核心渠道表现">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <InputNumber
              min={1}
              max={10}
              value={topN}
              onChange={(v) => setTopN(v ?? 3)}
              size="small"
              style={{ width: 80 }}
              addonAfter="个"
            />
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginLeft: 6 }}>
              默认展示前 3 名
            </Text>
          </div>

          {/* roiThreshold: ROI health baseline */}
          <div style={rowStyle}>
            <Text style={labelStyle}>ROI 健康基准</Text>
            <Tooltip title="ROI 高于此值的渠道，将获得「加大投入」的优化建议；低于此值则提示关注盈利效率">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <InputNumber
              min={0}
              max={100}
              value={Math.round(roiThreshold * 100)}
              onChange={(v) => setRoiThreshold((v ?? 30) / 100)}
              size="small"
              style={{ width: 80 }}
              addonAfter="%"
            />
            <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginLeft: 6 }}>
              默认 30%
            </Text>
          </div>
        </Section>

        {/* ── Section 5: Usage tips (collapsible) ─────────────────────── */}
        <Collapse
          size="small"
          ghost
          style={{ marginBottom: 16 }}
          items={[
            {
              key: 'tips',
              label: (
                <span style={{ fontSize: 12, color: TOKEN.textMuted }}>
                  <BulbOutlined style={{ marginRight: 4 }} />
                  使用提示
                </span>
              ),
              children: (
                <div style={{ fontSize: 12, color: TOKEN.textSecondary, lineHeight: 1.7 }}>
                  <p>
                    <strong>ROI（投入产出比）：</strong>
                    毛利润 / 净销售额。ROI &gt; 0 表示该渠道盈利，越高表示渠道质量越好。
                  </p>
                  <p>
                    <strong>客单价（avg_order_value）：</strong>
                    净销售额 / 订单量，反映渠道带来的订单质量。
                  </p>
                  <p>
                    <strong>退款率计算：</strong>
                    「按订单数」适用于有退款标记列（0/1）的数据；
                    「按金额」适用于有退款金额字段的数据，更能反映真实资金损耗。
                  </p>
                  <p>
                    <strong>维度选择：</strong>
                    若数据中有多个维度列（如渠道 + 平台），请优先选择粒度最细的维度，
                    或通过上游条件节点进行预过滤后再分析。
                  </p>
                </div>
              ),
            },
          ]}
        />
      </Drawer>
    </>
  );
};

export default OrderChannelAnalysisDrawer;
