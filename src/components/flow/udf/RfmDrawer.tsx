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
// Column auto-detection — priority-ordered patterns (most specific → broadest)
// Supports both Chinese and English column names, with/without underscores.
// ============================================================================

/**
 * Auto-detect a column by trying patterns in priority order.
 * Returns the first column that matches the highest-priority pattern.
 */
function autoDetectPriority(columns: string[], patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = columns.find((c) => pattern.test(c));
    if (match) return match;
  }
  return '';
}

/** User ID column — ordered from exact to broad */
const USER_ID_PATTERNS: RegExp[] = [
  // Exact Chinese column names (highest priority)
  /^(用户ID|用户id|用户编号|用户号|顾客ID|顾客编号|客户ID|客户编号|会员ID|会员编号|会员号|买家ID|买家编号|账号|账户|用户账号)$/,
  // Exact English / shorthand (case-insensitive)
  /^(uid|user_id|userid|user_no|user_code|user_num)$/i,
  /^(customer_id|customerid|cust_id|custid|cust_no|cust_code)$/i,
  /^(member_id|memberid|buyer_id|buyerid|client_id|clientid)$/i,
  // Contains Chinese + id/no/编号
  /(用户|顾客|客户|会员|买家|账户|账号).*(id|编号|号)/i,
  // Contains English identifier keyword
  /(user|customer|member|buyer|client)[_\s]*(id|no|code|num)/i,
  // Broadest Chinese fallback
  /用户|顾客|客户|会员|买家/,
  // Broadest English fallback (require word boundary via underscore or start)
  /(^|_)(user|customer|member|buyer|client)($|_)/i,
];

/** Order date/time column — ordered from exact to broad */
const ORDER_TIME_PATTERNS: RegExp[] = [
  // Exact Chinese column names (highest priority)
  /^(下单时间|下单日期|购买时间|购买日期|订单时间|订单日期|交易时间|交易日期|成交时间|成交日期|消费时间|建单时间|下单_时间)$/,
  // Exact English common names
  /^(order_date|orderdate|order_time|ordertime|order_at|order_created_at)$/i,
  /^(created_at|create_time|createtime|create_date|createdate)$/i,
  /^(purchase_time|purchasetime|purchase_date|purchasedate|purchase_at)$/i,
  /^(transaction_time|transaction_date|trade_time|trade_date|pay_time|pay_date|payment_time)$/i,
  // Contains Chinese time keyword with context
  /(下单|购买|成交|交易|订单|支付|付款).*(时间|日期)/,
  // Contains English order/purchase + date/time
  /(order|purchase|transaction|trade|pay)[_\s]*(date|time|at|datetime)/i,
  // Broad Chinese time fallback (pure 时间/日期 columns)
  /^(时间|日期|下单|create_?time|created_?at)$/i,
  // Broadest English fallback
  /(^|_)(date|time|created|at)($|_)/i,
];

/** Order amount column — ordered from exact to broad */
const AMOUNT_PATTERNS: RegExp[] = [
  // Exact Chinese
  /^(订单金额|总金额|实付金额|应付金额|成交金额|支付金额|消费金额|金额|销售额|收入|总价|实付|实付款)$/,
  // Exact English
  /^(order_amount|orderamount|total_amount|totalamount|paid_amount|payment_amount|gmv)$/i,
  /^(amount|price|revenue|sales|total|cost|fee)$/i,
  // Contains Chinese amount keyword
  /金额|价格|实付|总额|收入|销售|支付.*金/,
  // Contains English amount keyword
  /(^|_)(amount|price|total|revenue|sales|payment|gmv)($|_)/i,
];

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

  // Track which columns were auto-detected so we can show badge and warn on misses
  const autoDetected = useMemo(() => ({
    userId:    autoDetectPriority(columns, USER_ID_PATTERNS),
    orderTime: autoDetectPriority(columns, ORDER_TIME_PATTERNS),
    amount:    autoDetectPriority(columns, AMOUNT_PATTERNS),
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
              showSearch
              filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
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
              showSearch
              filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
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
              showSearch
              filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
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
