/**
 * OrderFunnelAnalysisDrawer
 * Configuration drawer for fn_ecom_order_funnel_analysis (订单全链路漏斗转化分析).
 *
 * Sections:
 *   0. Order ID column (top-level required field)
 *   1. Funnel steps   — 7 toggleable steps, each with a column selector; '下单' locked ON
 *   2. Order filters  — order_status column + excluded statuses (comma-separated)
 *   3. Preferences    — reserved for future params
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Collapse,
  Drawer,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  BulbOutlined,
  ControlOutlined,
  FilterOutlined,
  FunnelPlotOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type {
  FunnelStepKey,
  FunnelStepConfig,
  OrderFunnelAnalysisConfig,
} from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface OrderFunnelAnalysisDrawerProps {
  open: boolean;
  /** All available columns from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: OrderFunnelAnalysisConfig;
  /** Kernel display name for dynamic title */
  kernelDisplayName?: string;
  /** Kernel industry label for dynamic subtitle */
  kernelIndustry?: string;
  /** Kernel category label for dynamic subtitle */
  kernelCategory?: string;
  onConfirm: (config: OrderFunnelAnalysisConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Regex auto-match patterns (English + Chinese identifiers)
// ============================================================================

const COLUMN_PATTERNS: Record<string, RegExp> = {
  order_id:     /^(order[_\s]?id|订单[_\s]?id|订单编号|order[_\s]?no|单号)$/i,
  create_time:  /^(create[_\s]?time|下单时间|创建时间|order[_\s]?time|下单日期)$/i,
  pay_time:     /^(pay[_\s]?time|支付时间|付款时间|payment[_\s]?time|支付日期)$/i,
  confirm_time: /^(confirm[_\s]?time|审核时间|确认时间|审核日期)$/i,
  ship_time:    /^(ship[_\s]?time|发货时间|出库时间|dispatch[_\s]?time|发货日期)$/i,
  receive_time: /^(receive[_\s]?time|签收时间|收货时间|delivery[_\s]?time|收货日期)$/i,
  review_time:  /^(review[_\s]?time|评价时间|comment[_\s]?time|评论时间)$/i,
  order_status: /^(order[_\s]?status|订单状态|status|状态)$/i,
  user_id:      /^(user[_\s]?id|用户[_\s]?id|用户编号|buyer[_\s]?id|买家id|member[_\s]?id)$/i,
};

function autoMatch(columns: string[], patternKey: string): string {
  return columns.find((c) => COLUMN_PATTERNS[patternKey]?.test(c)) ?? '';
}

// ============================================================================
// Step metadata — defines order, labels, defaults, and column pattern keys
// ============================================================================

interface StepMeta {
  key: FunnelStepKey;
  label: string;
  colPatternKey: string;
  defaultEnabled: boolean;
  locked: boolean;
  placeholder: string;
}

const STEP_META: StepMeta[] = [
  { key: 'order',      label: '下单',     colPatternKey: 'create_time',  defaultEnabled: true,  locked: true,  placeholder: '下单时间列（创建时间）' },
  { key: 'pay',        label: '支付',     colPatternKey: 'pay_time',     defaultEnabled: true,  locked: false, placeholder: '支付完成时间列' },
  { key: 'confirm',    label: '审核确认', colPatternKey: 'confirm_time', defaultEnabled: false, locked: false, placeholder: '订单审核/确认时间列' },
  { key: 'ship',       label: '发货',     colPatternKey: 'ship_time',    defaultEnabled: true,  locked: false, placeholder: '发货/出库时间列' },
  { key: 'receive',    label: '签收',     colPatternKey: 'receive_time', defaultEnabled: true,  locked: false, placeholder: '买家签收时间列' },
  { key: 'review',     label: '评价',     colPatternKey: 'review_time',  defaultEnabled: false, locked: false, placeholder: '评价/评论时间列' },
  { key: 'repurchase', label: '复购',     colPatternKey: 'user_id',      defaultEnabled: false, locked: false, placeholder: '开启后需选择用户ID列' },
];

// ============================================================================
// Per-step state helpers
// ============================================================================

type StepState = { enabled: boolean; colName: string };
type StepStates = Record<FunnelStepKey, StepState>;

function buildDefaultSteps(columns: string[]): StepStates {
  return Object.fromEntries(
    STEP_META.map((m) => [
      m.key,
      { enabled: m.defaultEnabled, colName: autoMatch(columns, m.colPatternKey) },
    ]),
  ) as StepStates;
}

// ============================================================================
// Section wrapper (matches style of other Drawers in the project)
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

const selectStyle: React.CSSProperties = { width: '100%' };

/** Common order status options (English + Chinese) for the exclude-status selector */
const STATUS_OPTIONS = [
  // English statuses
  'cancelled', 'refunded', 'closed', 'pending', 'failed', 'expired', 'rejected', 'void',
  // Chinese statuses
  '已取消', '已退款', '已关闭', '待付款', '待支付', '已失效', '已拒绝', '已作废',
].map((v) => ({ value: v, label: v }));

// ============================================================================
// Main component
// ============================================================================

export const OrderFunnelAnalysisDrawer: React.FC<OrderFunnelAnalysisDrawerProps> = ({
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

  const [stepStates, setStepStates]       = useState<StepStates>(() => buildDefaultSteps(columns));
  const [orderIdCol, setOrderIdCol]       = useState('');
  const [userIdCol, setUserIdCol]         = useState('');
  const [orderStatusCol, setOrderStatusCol] = useState('');
  const [excludeStatuses, setExcludeStatuses] = useState<string[]>(['cancelled', 'refunded', 'closed']);

  // Restore or initialise state whenever drawer opens
  useEffect(() => {
    if (!open) return;

    if (initialConfig) {
      const restored: StepStates = {} as StepStates;
      for (const m of STEP_META) {
        const saved = initialConfig.steps[m.key];
        restored[m.key] = saved
          ? { enabled: saved.enabled, colName: saved.colName }
          : { enabled: m.defaultEnabled, colName: autoMatch(columns, m.colPatternKey) };
      }
      setStepStates(restored);
      setOrderIdCol(initialConfig.orderIdCol || autoMatch(columns, 'order_id'));
      setUserIdCol(initialConfig.userIdCol   || autoMatch(columns, 'user_id'));
      setOrderStatusCol(initialConfig.orderStatusCol || autoMatch(columns, 'order_status'));
      setExcludeStatuses(
        initialConfig.excludeStatuses
          ? initialConfig.excludeStatuses.split(',').map((s) => s.trim()).filter(Boolean)
          : ['cancelled', 'refunded', 'closed'],
      );
    } else {
      setStepStates(buildDefaultSteps(columns));
      setOrderIdCol(autoMatch(columns, 'order_id'));
      setUserIdCol(autoMatch(columns, 'user_id'));
      setOrderStatusCol(autoMatch(columns, 'order_status'));
      setExcludeStatuses(['cancelled', 'refunded', 'closed']);
    }
  }, [open, initialConfig, columns]);

  const handleStepToggle = useCallback((key: FunnelStepKey, enabled: boolean) => {
    setStepStates((prev) => ({ ...prev, [key]: { ...prev[key], enabled } }));
  }, []);

  const handleStepCol = useCallback((key: FunnelStepKey, colName: string) => {
    setStepStates((prev) => ({ ...prev, [key]: { ...prev[key], colName } }));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!orderIdCol) {
      messageApi.warning('请选择订单 ID 列');
      return;
    }
    if (!stepStates.order?.colName) {
      messageApi.warning('请选择「下单时间」列');
      return;
    }
    const extraEnabled = STEP_META.slice(1).some((m) => stepStates[m.key]?.enabled);
    if (!extraEnabled) {
      messageApi.warning('请至少启用一个漏斗步骤（如：支付、发货等）');
      return;
    }
    if (stepStates.repurchase?.enabled && !userIdCol) {
      messageApi.warning('启用「复购」步骤需要选择用户 ID 列');
      return;
    }

    const config: OrderFunnelAnalysisConfig = {
      orderIdCol,
      steps: stepStates as Record<FunnelStepKey, FunnelStepConfig>,
      ...(userIdCol      ? { userIdCol }      : {}),
      ...(orderStatusCol ? { orderStatusCol } : {}),
      excludeStatuses: excludeStatuses.join(','),
    };
    onConfirm(config);
  }, [orderIdCol, stepStates, userIdCol, orderStatusCol, excludeStatuses, messageApi, onConfirm]);

  const colOptions = columns.map((c) => ({ value: c, label: c }));
  const title      = kernelDisplayName ?? '订单漏斗转化分析';
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
            <FunnelPlotOutlined style={{ color: TOKEN.primary, fontSize: 16 }} />
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
        {/* ── Order ID column (required, top-level) ─────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 72, flexShrink: 0 }}>
            订单 ID 列
          </Text>
          <span style={{ color: TOKEN.primary, fontSize: 10, flexShrink: 0 }}>*</span>
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

        {/* ── Section 1: Funnel steps ─────────────────────────────────── */}
        <Section icon={<FunnelPlotOutlined />} title="漏斗步骤配置" required>
          {STEP_META.map((meta) => {
            const state = stepStates[meta.key] ?? { enabled: meta.defaultEnabled, colName: '' };
            return (
              <div key={meta.key}>
                {/* Step row: toggle + label + column select */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: state.enabled ? 6 : 8,
                  }}
                >
                  <Tooltip title={meta.locked ? '下单步骤为必选锚点，不可关闭' : undefined}>
                    <Switch
                      size="small"
                      checked={state.enabled}
                      disabled={meta.locked}
                      onChange={(v) => handleStepToggle(meta.key, v)}
                    />
                  </Tooltip>
                  <Text
                    style={{
                      fontSize: 12,
                      color: state.enabled ? TOKEN.textPrimary : TOKEN.textMuted,
                      width: 56,
                      flexShrink: 0,
                    }}
                  >
                    {meta.label}
                  </Text>
                  {state.enabled && (
                    <Select
                      style={selectStyle}
                      value={state.colName || undefined}
                      placeholder={meta.placeholder}
                      options={colOptions}
                      onChange={(v) => handleStepCol(meta.key, v)}
                      showSearch
                      size="small"
                    />
                  )}
                </div>

                {/* Repurchase extra: user_id select */}
                {meta.key === 'repurchase' && state.enabled && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      paddingLeft: 40,
                    }}
                  >
                    <Text
                      style={{ fontSize: 12, color: TOKEN.textSecondary, width: 56, flexShrink: 0 }}
                    >
                      用户 ID 列
                    </Text>
                    <Tooltip title="复购判定：同一用户 ID 出现 ≥2 笔订单">
                      <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
                    </Tooltip>
                    <Select
                      style={selectStyle}
                      value={userIdCol || undefined}
                      placeholder="选择用户 ID 列"
                      options={colOptions}
                      onChange={setUserIdCol}
                      showSearch
                      size="small"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </Section>

        {/* ── Section 2: Anomaly order filter ────────────────────────── */}
        <Section icon={<FilterOutlined />} title="异常订单过滤">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Text style={{ fontSize: 12, color: TOKEN.textSecondary, width: 72, flexShrink: 0 }}>
              订单状态列
            </Text>
            <Select
              style={selectStyle}
              value={orderStatusCol || undefined}
              placeholder="选择订单状态列（可选）"
              options={[{ value: '', label: '—— 不配置' }, ...colOptions]}
              onChange={(v) => setOrderStatusCol(v === '' ? '' : v)}
              showSearch
              size="small"
              allowClear
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Text
              style={{
                fontSize: 12,
                color: TOKEN.textSecondary,
                width: 72,
                flexShrink: 0,
                paddingTop: 4,
              }}
            >
              排除状态
            </Text>
            <div style={{ flex: 1 }}>
              <Select
                mode="tags"
                showSearch
                size="small"
                style={selectStyle}
                value={excludeStatuses}
                onChange={setExcludeStatuses}
                options={STATUS_OPTIONS}
                placeholder="选择或输入要排除的状态值"
                allowClear
              />
              <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginTop: 3, display: 'block' }}>
                可选择预设值或直接输入，留空则不过滤
              </Text>
            </div>
          </div>
        </Section>

        {/* ── Section 3: Analysis preferences (reserved) ──────────────── */}
        <Section icon={<ControlOutlined />} title="分析偏好">
          <Text style={{ fontSize: 12, color: TOKEN.textMuted }}>
            暂无额外参数，后续版本可扩展（如最小支持订单数阈值）
          </Text>
        </Section>

        {/* ── Usage tips ─────────────────────────────────────────────── */}
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
                    <strong>环比转化率：</strong>
                    当前步骤 / 上一步骤订单数，反映每个环节的局部流失情况。
                  </p>
                  <p>
                    <strong>绝对转化率：</strong>
                    当前步骤 / 下单量，直接体现从下单到当前步骤的总体转化效率。
                  </p>
                  <p>
                    <strong>复购判定：</strong>
                    同一用户 ID 在数据集内出现 ≥2 笔订单，即计入复购用户。
                  </p>
                  <p>
                    <strong>排除状态：</strong>
                    填入需过滤的订单状态（逗号分隔），可减少取消/退款订单对漏斗数据的干扰。
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

export default OrderFunnelAnalysisDrawer;
