/**
 * ActionPanel Component
 * Displays LLM-generated insights and recommendations from anomaly detection
 */

import React from 'react';
import { Card, Button, Space, Typography, Tag, Alert, Spin, message } from 'antd';
import { CopyOutlined, DownloadOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { InsightAction } from '../../types/insight-action.types';
import './ActionPanel.css';

const { Title, Paragraph, Text } = Typography;

interface ActionPanelProps {
  /**
   * Insight action result from LLM
   */
  insightAction: InsightAction | null;

  /**
   * Loading state during LLM generation
   */
  loading?: boolean;

  /**
   * Error message if generation failed
   */
  error?: string | null;

  /**
   * Callback to download full report (ZIP with MD + CSV)
   */
  onDownloadReport?: () => Promise<void>;

  /**
   * Callback to retry LLM analysis
   */
  onRetry?: () => void;
}

/**
 * Priority icon mapping
 */
const PRIORITY_ICONS: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

/**
 * Priority color mapping for Tag component
 */
const PRIORITY_COLORS: Record<string, string> = {
  high: 'error',
  medium: 'warning',
  low: 'success',
};

export const ActionPanel: React.FC<ActionPanelProps> = ({
  insightAction,
  loading = false,
  error = null,
  onDownloadReport,
  onRetry,
}) => {
  const [isDownloading, setIsDownloading] = React.useState(false);

  /**
   * Copy diagnosis and recommendations to clipboard
   */
  const handleCopyToClipboard = async () => {
    if (!insightAction) return;

    try {
      const content = formatForClipboard(insightAction);
      await navigator.clipboard.writeText(content);
    } catch (err) {
      message.error('Failed to copy to clipboard');
      console.error('[ActionPanel] Copy failed:', err);
    }
  };

  /**
   * Trigger report download
   */
  const handleDownload = async () => {
    if (!onDownloadReport) {
      message.warning('Download function not available');
      return;
    }

    setIsDownloading(true);
    try {
      await onDownloadReport();
      // Silent success - no message popup (browser will show download)
    } catch (err) {
      message.error('Failed to download report');
      console.error('[ActionPanel] Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <Card
        className="action-panel"
        title="Analysis & Recommendations"
        bordered={false}
        style={{ marginTop: 16 }}
      >
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16, color: 'rgba(255, 255, 255, 0.45)' }}>
            AI is analyzing anomalies and generating insights...
          </Paragraph>
        </div>
      </Card>
    );
  }

  /**
   * Render error state
   */
  if (error) {
    return (
      <Card
        className="action-panel"
        title="Analysis & Recommendations"
        bordered={false}
        style={{ marginTop: 16 }}
        extra={
          <Space>
            {onRetry && (
              <Button
                icon={<ReloadOutlined />}
                onClick={onRetry}
                size="small"
              >
                Retry
              </Button>
            )}
            <Button
              icon={<DownloadOutlined />}
              onClick={handleDownload}
              loading={isDownloading}
              type="primary"
              size="small"
            >
              Raw Data
            </Button>
          </Space>
        }
      >
        <Alert
          message="AI Analysis Failed"
          description={`${error}. You can retry the analysis or download the anomaly data for manual review.`}
          type="warning"
          showIcon
        />
      </Card>
    );
  }

  /**
   * Render empty state (no insight generated yet)
   */
  if (!insightAction) {
    return null;
  }

  /**
   * Main content render
   */
  return (
    <Card
      className="action-panel"
      title="Analysis & Recommendations"
      bordered={false}
      style={{ marginTop: 16 }}
      extra={
        <Space>
          <Button
            icon={<CopyOutlined />}
            onClick={handleCopyToClipboard}
            size="small"
          >
            Copy
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            loading={isDownloading}
            type="primary"
            size="small"
          >
            Report
          </Button>
        </Space>
      }
    >
      {/* Diagnosis Section */}
      <div className="action-section">
        <Title level={5}>
          <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
          Diagnosis
        </Title>
        <Paragraph style={{ fontSize: 14, lineHeight: 1.6 }}>
          {insightAction.diagnosis}
        </Paragraph>
      </div>

      {/* Key Patterns Section */}
      {insightAction.keyPatterns && insightAction.keyPatterns.length > 0 && (
        <div className="action-section">
          <Title level={5}>Key Patterns Detected</Title>
          <ul className="pattern-list">
            {insightAction.keyPatterns.map((pattern, idx) => (
              <li key={idx}>
                <Text>{pattern}</Text>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations Section */}
      {insightAction.recommendations && insightAction.recommendations.length > 0 && (
        <div className="action-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <Title level={5} style={{ margin: 0 }}>Recommended Actions</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              System intelligently generates for reference.
            </Text>
          </div>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {insightAction.recommendations.map((rec, idx) => (
              <Card
                key={idx}
                size="small"
                className="recommendation-card"
                bordered={false}
              >
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div>
                    <Text strong style={{ fontSize: 14 }}>
                      {PRIORITY_ICONS[rec.priority]} {rec.action}
                    </Text>
                    <Tag
                      color={PRIORITY_COLORS[rec.priority]}
                      style={{ marginLeft: 8 }}
                    >
                      {rec.priority.toUpperCase()}
                    </Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    {rec.reason}
                  </Text>
                </Space>
              </Card>
            ))}
          </Space>
        </div>
      )}
    </Card>
  );
};

/**
 * Format insight action for clipboard
 */
function formatForClipboard(insight: InsightAction): string {
  const lines: string[] = [];

  lines.push('# Analysis & Recommendations\n');
  lines.push(`Generated: ${new Date(insight.timestamp).toLocaleString()}\n`);
  lines.push('---\n');

  lines.push('## Diagnosis\n');
  lines.push(`${insight.diagnosis}\n`);

  if (insight.keyPatterns && insight.keyPatterns.length > 0) {
    lines.push('## Key Patterns\n');
    insight.keyPatterns.forEach((pattern, idx) => {
      lines.push(`${idx + 1}. ${pattern}`);
    });
    lines.push('');
  }

  if (insight.recommendations && insight.recommendations.length > 0) {
    lines.push('## Recommendations\n');
    insight.recommendations.forEach((rec, idx) => {
      const icon = PRIORITY_ICONS[rec.priority];
      lines.push(`${idx + 1}. ${icon} [${rec.priority.toUpperCase()}] ${rec.action}`);
      lines.push(`   Reason: ${rec.reason}`);
      lines.push('');
    });
  }

  return lines.join('\n');
}

export default ActionPanel;
