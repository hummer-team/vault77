/**
 * RfmDrawer — configuration drawer for fn_ecom_rfm_profile (RFM 用户画像).
 *
 * Sections:
 *   1. Column mapping — auto-detects user_id / order_time / amount via regex;
 *      falls back to manual Select with warning if undetected.
 *   2. Algorithm parameters — nClusters (2–10) and scalingMode (0/1/2).
 *   3. Usage tips (collapsible).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Button,
  Select,
  Space,
  Typography,
  Collapse,
} from 'antd';
import {
  UserOutlined,
  SettingOutlined,
  BulbOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type { RfmProfileConfig } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';
import { vmMessage } from '../../../utils/vmDialog';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface RfmDrawerProps {
  open: boolean;
  /** Column names from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: RfmProfileConfig;
  /** Kernel display name for dynamic title */
  kernelDisplayName?: string;
  kernelIndustry?: string;
  kernelCategory?: string;
  onConfirm: (config: RfmProfileConfig) => void;
  onClose: () => void;
}

// ============================================================================
// Column auto-detection regexes (English-first, as per design doc)
// ============================================================================

const REGEX_USER_ID   = /(^|_)(user|customer|member|buyer|client)(id|_id)?($|_)/i;
const REGEX_ORDER_TIME = /(^|_)(order|purchase|buy|created|date|time|at)(_date|_time|_at)?($|_)/i;
const REGEX_AMOUNT    = /(^|_)(amount|price|total|revenue|sales|payment|gmv)($|_)/i;

function autoDetect(columns: string[], regex: RegExp): string {
  return columns.find((c) => regex.test(c)) ?? '';
}

// ============================================================================
// Default config
// ============================================================================

const DEFAULT_CONFIG: RfmProfileConfig = {
  userIdColumn: '',
  orderTimeColumn: '',
  amountColumn: '',
  nClusters: 5,
  scalingMode: 2,
};

// ============================================================================
// Section wrapper (consistent with InventoryForecastDrawer)
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
  width: 72,
};

const selectStyle: React.CSSProperties = { width: '100%' };

// ============================================================================
// nClusters options (2–10)
// ============================================================================

const N_CLUSTERS_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
  value: i + 2,
  label: `${i + 2} 个分群`,
}));

// ============================================================================
// scalingMode options
// ============================================================================

const SCALING_MODE_OPTIONS: { value: 0 | 1 | 2; label: string; desc: string }[] = [
  { value: 0, label: '无缩放', desc: '数据已标准化时使用' },
  { value: 1, label: 'MinMax', desc: '线性压缩到 [0,1]' },
  { value: 2, label: '标准化（推荐）', desc: 'Z-score，最适合 K-Means' },
];

// ============================================================================
// Main component
// ============================================================================

const RfmDrawer: React.FC<RfmDrawerProps> = ({
  open,
  columns,
  initialConfig,
  kernelDisplayName,
  kernelIndustry,
  kernelCategory,
  onConfirm,
  onClose,
}) => {

  const [userIdColumn, setUserIdColumn]       = useState('');
  const [orderTimeColumn, setOrderTimeColumn] = useState('');
  const [amountColumn, setAmountColumn]       = useState('');
  const [nClusters, setNClusters]             = useState<number>(5);
  const [scalingMode, setScalingMode]         = useState<0 | 1 | 2>(2);

  // Track which columns were auto-detected so we can warn on misses
  const autoDetected = useMemo(() => ({
    userId:    autoDetect(columns, REGEX_USER_ID),
    orderTime: autoDetect(columns, REGEX_ORDER_TIME),
    amount:    autoDetect(columns, REGEX_AMOUNT),
  }), [columns]);

  // Restore or auto-fill on open
  useEffect(() => {
    if (!open) return;
    if (initialConfig?.userIdColumn) {
      // Restore saved config
      setUserIdColumn(initialConfig.userIdColumn);
      setOrderTimeColumn(initialConfig.orderTimeColumn);
      setAmountColumn(initialConfig.amountColumn);
      setNClusters(initialConfig.nClusters);
      setScalingMode(initialConfig.scalingMode);
    } else {
      // Auto-detect
      setUserIdColumn(autoDetected.userId);
      setOrderTimeColumn(autoDetected.orderTime);
      setAmountColumn(autoDetected.amount);
      setNClusters(DEFAULT_CONFIG.nClusters);
      setScalingMode(DEFAULT_CONFIG.scalingMode);
    }
  }, [open, initialConfig, autoDetected]);

  const colOptions = useMemo(
    () => columns.map((c) => ({ value: c, label: c })),
    [columns]
  );

  const handleConfirm = useCallback(() => {
    if (!userIdColumn || !orderTimeColumn || !amountColumn) {
      vmMessage.warning('请完整配置：用户ID列、下单时间列、金额列');
      return;
    }
    onConfirm({ userIdColumn, orderTimeColumn, amountColumn, nClusters, scalingMode });
  }, [userIdColumn, orderTimeColumn, amountColumn, nClusters, scalingMode, onConfirm]);

  return (
    <>
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                background: 'var(--vm-primary-light)',
                border: `1px solid var(--vm-primary-border)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <TeamOutlined style={{ color: TOKEN.primary, fontSize: 14 }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--vm-text-primary)' }}>
                {kernelDisplayName ?? 'RFM 用户画像'}
              </div>
              <div style={{ fontSize: 11, color: TOKEN.textMuted, fontWeight: 400 }}>
                {kernelIndustry && kernelCategory
                  ? `${kernelIndustry} · ${kernelCategory}`
                  : '电商 · 用户增长'}
              </div>
            </div>
          </div>
        }
        open={open}
        onClose={onClose}
        width={380}
        closable={false}
        destroyOnClose
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={onClose} style={{ color: TOKEN.textSecondary }}>
              取消
            </Button>
            <Button type="primary" onClick={handleConfirm}>
              确认
            </Button>
          </div>
        }
        styles={{
          body: {
            background: 'var(--vm-bg-base)',
            padding: '16px 16px 0',
            overflowY: 'auto',
          },
          header: {
            background: 'var(--vm-bg-base)',
            borderBottom: `1px solid ${TOKEN.borderSubtle}`,
          },
          footer: {
            background: 'var(--vm-bg-base)',
            borderTop: `1px solid ${TOKEN.borderSubtle}`,
          },
        }}
      >
        {/* ---- Section 1: Column mapping ---- */}
        <Section icon={<UserOutlined />} title="数据列配置" required>
          <div style={rowStyle}>
            <span style={labelStyle}>用户ID列</span>
            <Select
              style={selectStyle}
              placeholder="选择用户/客户标识列"
              value={userIdColumn || undefined}
              options={colOptions}
              onChange={setUserIdColumn}
              size="small"
              allowClear
              status={!userIdColumn ? 'error' : undefined}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>下单时间列</span>
            <Select
              style={selectStyle}
              placeholder="选择订单时间 / 日期列"
              value={orderTimeColumn || undefined}
              options={colOptions}
              onChange={setOrderTimeColumn}
              size="small"
              allowClear
              status={!orderTimeColumn ? 'error' : undefined}
            />
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>金额列</span>
            <Select
              style={selectStyle}
              placeholder="选择订单金额 / 消费列"
              value={amountColumn || undefined}
              options={colOptions}
              onChange={setAmountColumn}
              size="small"
              allowClear
              status={!amountColumn ? 'error' : undefined}
            />
          </div>
        </Section>

        {/* ---- Section 2: Algorithm parameters ---- */}
        <Section icon={<SettingOutlined />} title="算法参数">
          <div style={rowStyle}>
            <span style={labelStyle}>分群数量</span>
            <Select
              style={selectStyle}
              value={nClusters}
              options={N_CLUSTERS_OPTIONS}
              onChange={setNClusters}
              size="small"
            />
          </div>
          <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
            <span style={{ ...labelStyle, paddingTop: 4 }}>数据缩放</span>
            <Space direction="vertical" style={{ flex: 1 }} size={4}>
              {SCALING_MODE_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  onClick={() => setScalingMode(opt.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: TOKEN.radius,
                    border: `1px solid ${scalingMode === opt.value ? 'var(--vm-primary-border)' : TOKEN.borderSubtle}`,
                    background: scalingMode === opt.value ? 'var(--vm-primary-light)' : TOKEN.bgSection,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: scalingMode === opt.value ? TOKEN.primary : TOKEN.borderMid,
                        flexShrink: 0,
                        transition: 'background 0.15s',
                      }}
                    />
                    <Text style={{ fontSize: 12, color: TOKEN.textPrimary, fontWeight: scalingMode === opt.value ? 600 : 400 }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginLeft: 'auto' }}>
                      {opt.desc}
                    </Text>
                  </div>
                </div>
              ))}
            </Space>
          </div>
        </Section>

        {/* ---- Section 3: Tips ---- */}
        <Collapse
          ghost
          size="small"
          items={[{
            key: 'tips',
            label: (
              <span style={{ fontSize: 12, color: TOKEN.textMuted }}>
                <BulbOutlined style={{ marginRight: 6 }} />
                RFM 分析说明
              </span>
            ),
            children: (
              <div style={{ fontSize: 12, color: TOKEN.textMuted, lineHeight: 1.8 }}>
                <p style={{ margin: '0 0 6px' }}>
                  <strong style={{ color: TOKEN.textSecondary }}>R（最近购买）</strong>：距今最后一次下单天数，越小越活跃
                </p>
                <p style={{ margin: '0 0 6px' }}>
                  <strong style={{ color: TOKEN.textSecondary }}>F（购买频率）</strong>：累计下单次数，越高忠诚度越强
                </p>
                <p style={{ margin: '0 0 6px' }}>
                  <strong style={{ color: TOKEN.textSecondary }}>M（消费金额）</strong>：累计订单金额，越高贡献越大
                </p>
                <p style={{ margin: '0 0 6px' }}>
                  <strong style={{ color: TOKEN.textSecondary }}>分群数量</strong>：建议 3–7，过多分群难以区分业务含义
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={{ color: TOKEN.textSecondary }}>数据缩放</strong>：三个维度量纲不同，推荐使用「标准化」消除量纲影响
                </p>
              </div>
            ),
          }]}
          style={{ marginBottom: 16 }}
        />
      </Drawer>
    </>
  );
};

export default RfmDrawer;
