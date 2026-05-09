/**
 * MarketBasketDrawer
 * Configuration drawer for fn_ecom_market_basket (关联销售建议).
 *
 * Sections:
 *   1. Column mapping (orderIdCol, productIdCol)
 *   2. Rule parameters (minSupport, minConfidence, minLift, maxItemsPerOrder)
 *   3. Usage tips (collapsible)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  Collapse,
  Drawer,
  InputNumber,
  Select,
  Slider,
  Space,
  Switch,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { RefSelectProps } from 'antd';
import {
  ApartmentOutlined,
  BulbOutlined,
  DatabaseOutlined,
  InfoCircleOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import type { MarketBasketConfig } from '../../../services/flow/types';
import { TOKEN } from '../../../theme';

const { Text } = Typography;

// ============================================================================
// Types
// ============================================================================

export interface MarketBasketDrawerProps {
  open: boolean;
  /** All available columns from the upstream table */
  columns: string[];
  /** Pre-existing config to restore when reopening */
  initialConfig?: MarketBasketConfig;
  /** Kernel display name for dynamic title (falls back to '关联销售建议') */
  kernelDisplayName?: string;
  /** Kernel industry label for dynamic subtitle */
  kernelIndustry?: string;
  /** Kernel category label for dynamic subtitle */
  kernelCategory?: string;
  onConfirm: (config: MarketBasketConfig) => void;
  onCancel: () => void;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_CONFIG: Required<MarketBasketConfig> = {
  orderIdCol:       '',
  productIdCol:     '',
  minSupport:       0.01,
  minConfidence:    0.30,
  minLift:          1.2,
  maxItemsPerOrder: 50,
  topN:             500,
  topInsights:      5,
  enableTriples:    false,
};

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
// Helpers
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
  width: 100,
};

const LIFT_OPTIONS = [
  { value: 1.0, label: '1.0 — 无限制' },
  { value: 1.2, label: '1.2 — 弱关联（默认）' },
  { value: 1.5, label: '1.5 — 中等关联' },
  { value: 2.0, label: '2.0 — 强关联' },
];

// Column name auto-match patterns (English + Chinese)
const ORDER_ID_PATTERNS = /^(order[_\s]?id|orderid|order[_\s]?no|orderno|transaction[_\s]?id|trans[_\s]?id|bill[_\s]?id|receipt[_\s]?id|purchase[_\s]?id|sale[_\s]?id|消费[_\s]?id)$|订单|单号|交易|流水/i;
const PRODUCT_ID_PATTERNS = /^(product[_\s]?id|productid|sku[_\s]?id|skuid|item[_\s]?id|itemid|goods[_\s]?id|commodity[_\s]?id|merchandise[_\s]?id|article[_\s]?id|prod[_\s]?id|商品[_\s]?id|产品[_\s]?id)$|商品|产品|sku|物品|货品/i;

function autoMatchColumn(columns: string[], pattern: RegExp): string {
  return columns.find((c) => pattern.test(c)) ?? '';
}

// ============================================================================
// Main component
// ============================================================================

export const MarketBasketDrawer: React.FC<MarketBasketDrawerProps> = ({
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

  const orderIdRef = useRef<RefSelectProps>(null);
  const productIdRef = useRef<RefSelectProps>(null);

  const [orderIdCol, setOrderIdCol] = useState('');
  const [productIdCol, setProductIdCol] = useState('');
  const [minSupport, setMinSupport] = useState<number>(DEFAULT_CONFIG.minSupport);
  const [minConfidence, setMinConfidence] = useState<number>(DEFAULT_CONFIG.minConfidence);
  const [minLift, setMinLift] = useState<number>(DEFAULT_CONFIG.minLift);
  const [maxItemsPerOrder, setMaxItemsPerOrder] = useState<number>(DEFAULT_CONFIG.maxItemsPerOrder);
  const [topN, setTopN] = useState<number>(DEFAULT_CONFIG.topN);
  const [topInsights, setTopInsights] = useState<number>(DEFAULT_CONFIG.topInsights);
  const [enableTriples, setEnableTriples] = useState<boolean>(DEFAULT_CONFIG.enableTriples);

  // Restore / reset when drawer opens; auto-match columns when no prior config
  useEffect(() => {
    if (!open) return;
    const cfg = initialConfig ?? DEFAULT_CONFIG;
    setMinSupport(cfg.minSupport);
    setMinConfidence(cfg.minConfidence);
    setMinLift(cfg.minLift);
    setMaxItemsPerOrder(cfg.maxItemsPerOrder);
    setTopN(cfg.topN ?? DEFAULT_CONFIG.topN);
    setTopInsights(cfg.topInsights ?? DEFAULT_CONFIG.topInsights);
    setEnableTriples(cfg.enableTriples ?? false);

    // Auto-match columns when no prior selection
    const savedOrder = cfg.orderIdCol || autoMatchColumn(columns, ORDER_ID_PATTERNS);
    const savedProduct = cfg.productIdCol || autoMatchColumn(columns, PRODUCT_ID_PATTERNS);
    setOrderIdCol(savedOrder);
    setProductIdCol(savedProduct !== savedOrder ? savedProduct : '');
  }, [open, initialConfig, columns]);

  const handleConfirm = useCallback(() => {
    if (!orderIdCol) {
      orderIdRef.current?.focus();
      return;
    }
    if (!productIdCol) {
      productIdRef.current?.focus();
      return;
    }
    if (orderIdCol === productIdCol) {
      messageApi.warning('订单 ID 列与商品 ID 列不能相同');
      return;
    }
    onConfirm({
      orderIdCol,
      productIdCol,
      minSupport,
      minConfidence,
      minLift,
      maxItemsPerOrder,
      topN,
      topInsights,
      enableTriples,
    });
  }, [orderIdCol, productIdCol, minSupport, minConfidence, minLift, maxItemsPerOrder, topN, topInsights, enableTriples, onConfirm, messageApi]);

  const columnOptions = columns.map((c) => ({ value: c, label: c }));

  const title = kernelDisplayName ?? '关联销售建议';
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
            <ShoppingOutlined style={{ color: TOKEN.primary, fontSize: 16 }} />
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
          body: { padding: '16px 16px 0' },
          header: { padding: '12px 16px' },
          footer: { padding: '10px 16px' },
        }}
      >
        {/* ── Section 1: Column Mapping ───────────────────────────────── */}
        <Section icon={<DatabaseOutlined />} title="字段映射" required>
          <div style={rowStyle}>
            <Text style={labelStyle}>订单 ID 列</Text>
            <Select
              ref={orderIdRef}
              style={selectStyle}
              value={orderIdCol || undefined}
              placeholder="选择订单 ID 列"
              options={columnOptions}
              onChange={setOrderIdCol}
              showSearch
              size="small"
            />
          </div>
          <div style={rowStyle}>
            <Text style={labelStyle}>商品 ID 列</Text>
            <Select
              ref={productIdRef}
              style={selectStyle}
              value={productIdCol || undefined}
              placeholder="选择商品 ID 列"
              options={columnOptions}
              onChange={setProductIdCol}
              showSearch
              size="small"
            />
          </div>
        </Section>

        {/* ── Section 2: Rule Parameters ─────────────────────────────── */}
        <Section icon={<ApartmentOutlined />} title="规则参数">
          {/* minSupport */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...rowStyle, marginBottom: 4 }}>
              <Text style={labelStyle}>最小支持度</Text>
              <Tooltip title="共购商品对在所有订单中出现的比例下限，越低挖掘规则越多">
                <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
              </Tooltip>
              <Text style={{ fontSize: 12, color: TOKEN.primary, marginLeft: 'auto' }}>
                {(minSupport * 100).toFixed(1)}%
              </Text>
            </div>
            <Slider
              min={0.005}
              max={0.05}
              step={0.005}
              value={minSupport}
              onChange={setMinSupport}
              tooltip={{ formatter: (v) => `${((v ?? 0) * 100).toFixed(1)}%` }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -4 }}>
              <Text style={{ fontSize: 10, color: TOKEN.textMuted }}>0.5%</Text>
              <Text style={{ fontSize: 10, color: TOKEN.textMuted }}>5%</Text>
            </div>
          </div>

          {/* minConfidence */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...rowStyle, marginBottom: 4 }}>
              <Text style={labelStyle}>最小置信度</Text>
              <Tooltip title="购买商品 A 的订单中，同时购买商品 B 的比例下限">
                <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
              </Tooltip>
              <Text style={{ fontSize: 12, color: TOKEN.primary, marginLeft: 'auto' }}>
                {(minConfidence * 100).toFixed(0)}%
              </Text>
            </div>
            <Slider
              min={0.1}
              max={0.8}
              step={0.05}
              value={minConfidence}
              onChange={setMinConfidence}
              tooltip={{ formatter: (v) => `${((v ?? 0) * 100).toFixed(0)}%` }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: -4 }}>
              <Text style={{ fontSize: 10, color: TOKEN.textMuted }}>10%</Text>
              <Text style={{ fontSize: 10, color: TOKEN.textMuted }}>80%</Text>
            </div>
          </div>

          {/* minLift */}
          <div style={rowStyle}>
            <Text style={labelStyle}>最小提升度</Text>
            <Tooltip title="提升度 > 1 表示正向关联；越高越有价值，建议 ≥ 1.2">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <Select
              style={{ ...selectStyle, marginLeft: 4 }}
              value={minLift}
              options={LIFT_OPTIONS}
              onChange={setMinLift}
              size="small"
            />
          </div>

          {/* maxItemsPerOrder */}
          <div style={rowStyle}>
            <Text style={labelStyle}>最大单量件数</Text>
            <Tooltip title="超出此件数的订单被视为 B2B 大单并排除，防止数据污染（默认 50）">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <InputNumber
              min={5}
              max={200}
              step={5}
              value={maxItemsPerOrder}
              onChange={(v) => setMaxItemsPerOrder(v ?? 50)}
              size="small"
              style={{ width: 90 }}
              addonAfter="件"
            />
          </div>

          {/* topN: max output rules */}
          <div style={{ ...rowStyle, marginTop: 4 }}>
            <Text style={labelStyle}>最大输出规则数</Text>
            <Tooltip title="关联规则按关联强度降序排列后，最多输出该数量的规则。数值越大覆盖更多商品对，但展示行数也会增加（默认 500）">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <InputNumber
              min={10}
              max={5000}
              step={100}
              value={topN}
              onChange={(v) => setTopN(v ?? 500)}
              size="small"
              style={{ width: 100, marginLeft: 4 }}
              addonAfter="条"
            />
          </div>

          {/* topInsights: number of insight cards to display */}
          <div style={{ ...rowStyle, marginTop: 4 }}>
            <Text style={labelStyle}>结果卡片数量</Text>
            <Tooltip title="分析完成后，在顶部显示的热门搭配卡片数量（按关联强度排序，默认展示 5 张）">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <InputNumber
              min={1}
              max={10}
              step={1}
              value={topInsights}
              onChange={(v) => setTopInsights(v ?? 5)}
              size="small"
              style={{ width: 100, marginLeft: 4 }}
              addonAfter="张"
            />
          </div>

          {/* enableTriples */}
          <div style={{ ...rowStyle, marginTop: 10, paddingTop: 10, borderTop: `1px solid var(--vm-border-subtle)` }}>
            <Text style={labelStyle}>挖掘三品组合</Text>
            <Tooltip title="开启后使用 FP-Growth 算法挖掘 3-item 关联规则（套装推荐）。分析时间会增加，建议数据量 < 5 万订单时使用">
              <InfoCircleOutlined style={{ color: TOKEN.textMuted, fontSize: 12 }} />
            </Tooltip>
            <Switch
              size="small"
              checked={enableTriples}
              onChange={setEnableTriples}
              style={{ marginLeft: 4 }}
            />
            {enableTriples && (
              <Text style={{ fontSize: 11, color: TOKEN.textMuted, marginLeft: 6 }}>
                已启用 FP-Growth
              </Text>
            )}
          </div>
        </Section>

        {/* ── Section 3: Usage Tips ──────────────────────────────────── */}
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
                    <strong>支持度（Support）：</strong>
                    两商品同时出现在订单中的概率。例如 2% 表示每 100 笔订单中有 2 笔同时购买了两者。
                  </p>
                  <p>
                    <strong>置信度（Confidence A→B）：</strong>
                    购买了商品 A 的订单中，有多少比例也购买了商品 B。置信度高 = 推荐价值高。
                  </p>
                  <p>
                    <strong>提升度（Lift）：</strong>
                    实际共购概率 / 独立购买概率之比。
                    Lift &gt; 1 表示正向关联；Lift ≈ 1 表示随机；Lift &lt; 1 表示负相关。
                    建议仅关注 Lift ≥ 1.2 的规则。
                  </p>
                  <p>
                    <strong>大单过滤：</strong>
                    单笔订单含有超多品类（B2B 采购单）会虚高关联频次，建议保持默认 50 件上限。
                  </p>
                  <p>
                    <strong>三品组合（FP-Growth）：</strong>
                    开启后挖掘 3-item 套装规则，适合分析"买A+B 的顾客大概率也买 C"的捆绑场景。
                    算法时间随数据量增大，建议订单量 &lt; 5 万时启用。
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

export default MarketBasketDrawer;
