/**
 * InsightsPanel — pure rendering component for operator analysis insights.
 *
 * Responsibilities:
 * - Render SummaryOverview (metric bar) when summary is defined
 * - Render InsightItemList (card grid) driven by insights array
 * - Apply fallback behaviors for undefined/empty data
 * - Use CSS variables only — zero hardcoded colors
 * - Zero business logic — all data computed by operator postProcess()
 */

import React from 'react';
import {
  WarningFilled,
  ExclamationCircleFilled,
  BulbFilled,
  CheckCircleFilled,
  DatabaseFilled,
  TagFilled,
  UserOutlined,
  BarChartOutlined,
  ShoppingOutlined,
} from '@ant-design/icons';
import type { InsightItem, InsightMetric, InsightSummary, OperatorInsightsData } from '../../../services/flow/types';

// ============================================================================
// iconKey → { icon component, CSS variable color } mapping
// ============================================================================

type IconKey = InsightItem['iconKey'];

const ICON_MAP: Record<IconKey, { icon: React.ReactNode; color: string }> = {
  critical: { icon: <WarningFilled />,            color: 'var(--vm-color-error)' },
  warning:  { icon: <ExclamationCircleFilled />,  color: 'var(--vm-color-warning)' },
  insight:  { icon: <BulbFilled />,               color: 'var(--vm-primary)' },
  safe:     { icon: <CheckCircleFilled />,         color: 'var(--vm-color-success)' },
  quality:  { icon: <DatabaseFilled />,            color: 'var(--vm-text-secondary)' },
  price:    { icon: <TagFilled />,                 color: 'var(--vm-color-info)' },
  user:     { icon: <UserOutlined />,              color: 'var(--vm-primary)' },
  rfm:      { icon: <BarChartOutlined />,          color: 'var(--vm-color-warning)' },
  order:    { icon: <ShoppingOutlined />,          color: 'var(--vm-color-info)' },
};

// ============================================================================
// Metric value formatter
// Format rules driven by unit:
//   "%"  → multiply ×100, 2 decimals (backend sends raw decimal e.g. 0.15)
//   "元" → toLocaleString zh-CN with 2 decimals
//   others → integer locale string if whole number, else 2 decimals
// ============================================================================

function formatMetricValue(value: number, unit?: string): string {
  if (unit === '%') return `${(value * 100).toFixed(2)}%`;
  if (unit === '元') {
    return value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (Number.isInteger(value)) return value.toLocaleString('zh-CN');
  return value.toFixed(2);
}

// ============================================================================
// SummaryOverview — horizontal metric bar, hidden when summary is undefined
// ============================================================================

interface SummaryOverviewProps {
  summary: InsightSummary;
}

/**
 * Renders a row of summary metric tiles from the InsightSummary object.
 * Only non-undefined fields are rendered — operators control visibility by omitting fields.
 * Max 5 tiles per row; auto-wraps on smaller viewports via flex-wrap.
 * Hidden entirely when all core fields are zero (no meaningful data to show).
 */
const SummaryOverview: React.FC<SummaryOverviewProps> = ({ summary }) => {
  // Per spec 4.2: hide the entire section when all core fields are at default zero values
  if (
    summary.totalRecordCount === 0 &&
    summary.totalFilterRecordCount === 0 &&
    (summary.riskRecordCount === undefined || summary.riskRecordCount === 0) &&
    (summary.criticalRecordCount === undefined || summary.criticalRecordCount === 0) &&
    (summary.estimatedLoss === undefined || summary.estimatedLoss === 0)
  ) {
    return null;
  }

  // Build the list of summary tiles from defined fields only
  const tiles: Array<{ label: string; value: string; highlight?: boolean }> = [];

  // Common fields — always present when summary is defined
  // When totalOrderCount is present (order-based operators), show "总订单数" instead of "总记录数"
  if (summary.totalOrderCount !== undefined) {
    tiles.push({ label: '总订单数', value: summary.totalOrderCount.toLocaleString('zh-CN') });
  } else {
    tiles.push({ label: '总记录数', value: summary.totalRecordCount.toLocaleString('zh-CN') });
  }
  // Per spec 4.3: label is "符合条件记录数"
  tiles.push({ label: '符合条件记录数', value: summary.totalFilterRecordCount.toLocaleString('zh-CN') });

  // Arbitrage-specific fields
  if (summary.riskRecordCount !== undefined) {
    tiles.push({
      label: '风险记录数',
      value: summary.riskRecordCount.toLocaleString('zh-CN'),
      highlight: summary.riskRecordCount > 0,
    });
  }
  if (summary.criticalRecordCount !== undefined) {
    tiles.push({
      label: '严重风险数',
      value: summary.criticalRecordCount.toLocaleString('zh-CN'),
      highlight: summary.criticalRecordCount > 0,
    });
  }
  if (summary.estimatedLoss !== undefined) {
    tiles.push({
      label: '预估损失',
      value: summary.estimatedLoss.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + ' 元',
      highlight: summary.estimatedLoss > 0,
    });
  }

  // Repurchase-specific fields
  if (summary.repurchaseUserCount !== undefined) {
    tiles.push({ label: '复购用户数', value: summary.repurchaseUserCount.toLocaleString('zh-CN') });
  }
  if (summary.avgRepurchaseDays !== undefined) {
    tiles.push({ label: '平均复购周期', value: `${summary.avgRepurchaseDays} 天` });
  }

  // OrderDistribution-specific fields
  if (summary.peakPeriod !== undefined) {
    tiles.push({ label: '峰值时段', value: summary.peakPeriod });
  }
  if (summary.topRegion !== undefined) {
    tiles.push({ label: '头部地区', value: summary.topRegion });
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 12,
      marginBottom: 16,
    }}>
      {tiles.map((tile, idx) => (
        <div
          key={idx}
          style={{
            flex: '1 1 140px',
            minWidth: 120,
            maxWidth: 200,
            padding: '12px 16px',
            background: 'var(--vm-bg-card)',
            border: '1px solid var(--vm-border-subtle)',
            borderRadius: 8,
          }}
        >
          <div style={{
            fontSize: 12,
            color: 'var(--vm-text-secondary)',
            marginBottom: 4,
            lineHeight: 1.4,
          }}>
            {tile.label}
          </div>
          <div style={{
            fontSize: 18,
            fontWeight: 600,
            color: tile.highlight ? 'var(--vm-color-error)' : 'var(--vm-text-primary)',
            lineHeight: 1.3,
          }}>
            {tile.value}
          </div>
        </div>
      ))}
    </div>
  );
};

// ============================================================================
// MetricRow — a single metric line inside an InsightItemView
// ============================================================================

interface MetricRowProps {
  metric: InsightMetric;
}

const MetricRow: React.FC<MetricRowProps> = ({ metric }) => {
  const formattedValue = formatMetricValue(metric.value, metric.unit);
  // Show unit label only for non-% units (% is already embedded in formattedValue)
  const unitLabel = metric.unit && metric.unit !== '%' ? ` ${metric.unit}` : '';

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 0',
      borderBottom: '1px solid var(--vm-border-subtle)',
    }}>
      <span style={{
        fontSize: 12,
        color: 'var(--vm-text-secondary)',
      }}>
        {metric.label}
      </span>
      <span style={{
        fontSize: 13,
        fontWeight: metric.highlight ? 700 : 500,
        color: metric.highlight ? 'var(--vm-primary)' : 'var(--vm-text-primary)',
      }}>
        {formattedValue}{unitLabel}
      </span>
    </div>
  );
};

// ============================================================================
// InsightItemView — a single insight card
// ============================================================================

interface InsightItemViewProps {
  item: InsightItem;
  onItemClick?: (payload: { id: string; metadata?: InsightItem['metadata'] }) => void;
}

const InsightItemView: React.FC<InsightItemViewProps> = ({ item, onItemClick }) => {
  const iconConfig = ICON_MAP[item.iconKey];
  // cardType="custom" overrides icon accent color via metadata.customColor
  const iconColor = item.cardType === 'custom' && item.metadata?.customColor
    ? (item.metadata.customColor as string)
    : iconConfig.color;

  const handleClick = () => {
    // Reserved for future drill-down feature — currently only logs
    console.log('[InsightsPanel] InsightItem clicked:', { id: item.id, metadata: item.metadata });
    onItemClick?.({ id: item.id, metadata: item.metadata });
  };

  return (
    <div
      onClick={handleClick}
      style={{
        padding: '14px 16px',
        background: 'var(--vm-bg-card)',
        border: '1px solid var(--vm-border-subtle)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--vm-primary-border)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--vm-border-subtle)';
      }}
    >
      {/* Header: icon + title */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 16, color: iconColor, flexShrink: 0 }}>
          {iconConfig.icon}
        </span>
        <span style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--vm-text-primary)',
          lineHeight: 1.4,
        }}>
          {item.title}
        </span>
      </div>

      {/* Description — max 3 lines via CSS line-clamp */}
      {item.description && (
        <div style={{
          fontSize: 12,
          color: 'var(--vm-text-secondary)',
          marginBottom: item.metrics && item.metrics.length > 0 ? 10 : 0,
          lineHeight: 1.6,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}>
          {item.description}
        </div>
      )}

      {/* Metrics list — max 4 rows, enforced by spec (operators comply at data level) */}
      {item.metrics && item.metrics.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {item.metrics.slice(0, 4).map((metric, idx) => (
            <MetricRow key={idx} metric={metric} />
          ))}
        </div>
      )}

      {/* Suggestion — business action recommendation */}
      {item.suggestion && (
        <div style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid var(--vm-border-subtle)',
          fontSize: 12,
          color: 'var(--vm-color-success)',
          lineHeight: 1.6,
        }}>
          <span style={{ fontWeight: 600, marginRight: 4 }}>💡 建议：</span>
          {item.suggestion}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// InsightItemList — 2-column grid of InsightItemView cards
// Falls back to a default "暂无洞察" card when insights array is empty
// ============================================================================

const FALLBACK_ITEM: InsightItem = {
  id: '__fallback__',
  cardType: 'standard',
  iconKey: 'insight',
  title: '暂无洞察',
  description: '本次分析未生成洞察结论，可查看明细数据。',
  sortOrder: 0,
};

interface InsightItemListProps {
  items: InsightItem[];
  onItemClick?: (payload: { id: string; metadata?: InsightItem['metadata'] }) => void;
}

const InsightItemList: React.FC<InsightItemListProps> = ({ items, onItemClick }) => {
  // Use fallback when operator returns empty array
  const displayItems = items.length > 0 ? items : [FALLBACK_ITEM];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: 12,
    }}>
      {displayItems.map((item) => (
        <InsightItemView
          key={item.id}
          item={item}
          onItemClick={onItemClick}
        />
      ))}
    </div>
  );
};

// ============================================================================
// InsightsPanel — top-level exported component
// ============================================================================

interface InsightsPanelProps {
  /** Full insights payload from operator postProcess(). Undefined → nothing rendered. */
  insightsData: OperatorInsightsData;
  /** Optional click handler for InsightItem — reserved for future drill-down feature */
  onItemClick?: (payload: { id: string; metadata?: InsightItem['metadata'] }) => void;
}

/**
 * InsightsPanel renders above the data table in ResultsDisplay.
 *
 * Layout:
 *   [SummaryOverview]  ← hidden when summary=undefined
 *   [InsightItemList]  ← 2-column grid; shows fallback card when insights=[]
 *
 * All colors use CSS variables — compatible with all 3 themes (Light/OrangeDark/CyanDark).
 * This component contains zero business logic; all data is computed by operators.
 */
const InsightsPanel: React.FC<InsightsPanelProps> = ({ insightsData, onItemClick }) => {
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Summary overview bar — only rendered when operator provides summary */}
      {insightsData.summary && (
        <SummaryOverview summary={insightsData.summary} />
      )}

      {/* Insight cards grid */}
      <InsightItemList
        items={insightsData.insights}
        onItemClick={onItemClick}
      />
    </div>
  );
};

export default InsightsPanel;
