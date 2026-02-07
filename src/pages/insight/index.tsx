/**
 * Insight Page
 * Main container for data insights visualization
 * Reuses DuckDB instance from Workbench via Context
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Alert, Divider, Typography, Space, Button, Tag, Card, Row, Col, Statistic, Slider, Dropdown, message } from 'antd';
import type { MenuProps } from 'antd';
import { 
  ReloadOutlined, 
  ClearOutlined, 
  InfoCircleOutlined, 
  ExclamationCircleOutlined,
  MoreOutlined,
  DownloadOutlined,
  EyeOutlined,
  BulbOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useInsight } from '../../hooks/insight/useInsight';
import { SummaryTable } from '../../components/insight/SummaryTable';
import { DistributionChart } from '../../components/insight/DistributionChart';
import { CategoricalChart } from '../../components/insight/CategoricalChart';
import { AnomalyScatterChart } from '../../components/insight/AnomalyScatterChart';
import { AnomalyHeatmapChart } from '../../components/insight/AnomalyHeatmapChart';
import { ActionPanel } from '../../components/insight/ActionPanel';
import { useDuckDBContext } from '../../contexts/DuckDBContext';
import { createInsightActionService } from '../../services/insight/insightActionService';
import { downloadReport } from '../../services/insight/reportGenerator';
import { settingsService } from '../../services/settingsService';
import type { AnomalyAnalysisOutput } from '../../types/anomaly.types';
import type { InsightAction } from '../../types/insight-action.types';
import { MAX_ANOMALIES_FOR_VISUALIZATION } from '../../constants/anomaly.constants';
import './index.css';

const { Title, Paragraph, Text } = Typography;

interface InsightPageProps {
  tableName: string;
  onNoValidColumns?: () => void; // Callback when no valid columns found
  anomalyResult?: AnomalyAnalysisOutput | null; // Anomaly detection result from Workbench
  onAnomalyThresholdChange?: (threshold: number) => void; // Callback to trigger re-detection
  onDownloadAnomalies?: (orderIds: string[]) => Promise<any[]>; // Callback to download anomalies
  onViewAnomalies?: (orderIds: string[], tableName: string) => Promise<void>; // Callback to view anomalies
}

export const InsightPage: React.FC<InsightPageProps> = ({ 
  tableName, 
  onNoValidColumns, 
  anomalyResult,
  onAnomalyThresholdChange,
  onDownloadAnomalies,
  onViewAnomalies,
}) => {
  const { executeQuery, isDBReady } = useDuckDBContext();
  
  // Local state for anomaly threshold adjustment (UI only)
  const [anomalyThreshold, setAnomalyThreshold] = useState(
    anomalyResult?.metadata.threshold ?? 0.8
  );

  // LLM Insight Action state
  const [insightAction, setInsightAction] = useState<InsightAction | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  // Sync threshold with anomalyResult when it changes
  React.useEffect(() => {
    if (anomalyResult?.metadata.threshold) {
      setAnomalyThreshold(anomalyResult.metadata.threshold);
    }
  }, [anomalyResult?.metadata.threshold]);

  /**
   * Generate LLM insights (extracted for reuse in retry)
   */
  const generateLLMInsights = React.useCallback(async () => {
    if (!anomalyResult || anomalyResult.anomalyCount === 0 || !isDBReady) {
      setInsightAction(null);
      setInsightError(null);
      return;
    }

    // Check if auto-generation is enabled
    const settings = await settingsService.getInsightActionSettings();
    if (!settings.autoGenerate) {
      console.log('[InsightPage] Insight action auto-generation disabled');
      return;
    }

    setInsightLoading(true);
    setInsightError(null);

    try {
      // Create service with DuckDB query executor
      const insightService = createInsightActionService(executeQuery);

      console.log('[InsightPage] Generating insights for', anomalyResult.anomalyCount, 'anomalies');

      const output = await insightService.generateInsight(
        {
          algorithmType: 'anomaly',
          tableName,
          analysisResult: anomalyResult,
        },
        settings
      );

      setInsightAction(output);
      console.log('[InsightPage] Insights generated:', output);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setInsightError(`Failed to generate insights: ${errorMsg}`);
      console.error('[InsightPage] Insight generation failed:', error);
    } finally {
      setInsightLoading(false);
    }
  }, [anomalyResult, tableName, isDBReady, executeQuery]);

  /**
   * Auto-generate insights when anomaly result changes
   */
  useEffect(() => {
    // Delay generation to avoid blocking UI thread
    const timer = setTimeout(generateLLMInsights, 500);
    return () => clearTimeout(timer);
  }, [generateLLMInsights]);

  /**
   * Retry insight generation (manual trigger)
   */
  const handleRetryInsight = React.useCallback(() => {
    console.log('[InsightPage] Manual retry triggered');
    generateLLMInsights();
  }, [generateLLMInsights]);

  // Handler for anomaly actions menu
  const handleMenuClick = async ({ key }: { key: string }) => {
    if (!anomalyResult) return;

    switch (key) {
      case 'download':
        await handleDownloadAnomalies();
        break;
      case 'view':
        await handleViewAnomalies();
        break;
      default:
        break;
    }
  };

  // Handler for Download action
  const handleDownloadAnomalies = async () => {
    if (!anomalyResult || !onDownloadAnomalies) return;

    const orderIds = anomalyResult.anomalies.map(a => a.orderId);
    
    if (orderIds.length === 0) {
      message.warning('No anomalies to download');
      return;
    }

    try {
      const loadingMsg = message.loading('Preparing CSV download...', 0);
      
      const fullData = await onDownloadAnomalies(orderIds);
      
      // Dynamically import CSV export utility
      const { exportToCSV } = await import('../../utils/csvExport');
      
      // Export to CSV
      exportToCSV(
        fullData,
        `anomalies-${tableName}-${Date.now()}`,
      );
      
      loadingMsg();
    } catch (error) {
      message.error('Failed to download anomalies: ' + (error as Error).message);
      console.error('[InsightPage] Download failed:', error);
    }
  };

  // Handler for View action
  const handleViewAnomalies = async () => {
    if (!anomalyResult || !onViewAnomalies) return;

    const orderIds = anomalyResult.anomalies.map(a => a.orderId);
    
    if (orderIds.length === 0) {
      message.warning('No anomalies to view');
      return;
    }

    try {
      const loadingMsg = message.loading('Loading anomalies in analysis panel...', 0);
      
      await onViewAnomalies(orderIds, tableName);
      
      loadingMsg();
    } catch (error) {
      message.error('Failed to view anomalies: ' + (error as Error).message);
      console.error('[InsightPage] View failed:', error);
    }
  };

  /**
   * Handler for downloading full report (ZIP with MD + CSV)
   */
  const handleDownloadReport = useCallback(async () => {
    if (!anomalyResult || !insightAction || !onDownloadAnomalies) {
      message.warning('Report not ready for download');
      return;
    }

    const orderIds = anomalyResult.anomalies.map(a => a.orderId);

    try {
      const hideLoading = message.loading('Preparing report...', 0);

      // Fetch full anomaly data
      const anomalyData = await onDownloadAnomalies(orderIds);

      // Download ZIP (markdown + CSV)
      await downloadReport({
        insightOutput: insightAction,
        anomalyData,
        tableName,
        algorithmType: 'anomaly',
      });

      hideLoading();
      // Silent success - no message popup
    } catch (error) {
      message.error('Failed to download report: ' + (error as Error).message);
      console.error('[InsightPage] Report download failed:', error);
    }
  }, [anomalyResult, insightAction, onDownloadAnomalies, tableName]);

  // Menu items for anomaly actions
  const anomalyMenuItems: MenuProps['items'] = [
    {
      key: 'download',
      icon: <DownloadOutlined />,
      label: 'CSV',
    },
    {
      key: 'view',
      icon: <EyeOutlined />,
      label: 'View',
    },
    {
      key: 'reason',
      icon: <BulbOutlined />,
      label: 'Analyze',
      disabled: true,  // Future feature
    },
  ];

  const {
    loading,
    loadingSummary,
    loadingDistribution,
    loadingCategorical,
    error,
    config,
    summary,
    distribution,
    categorical,
    cacheHit,
    generateInsights,
    clearCache,
    retry,
  } = useInsight({ 
    tableName, 
    autoLoad: isDBReady, 
    executeQuery,
    onNoValidColumns, // Pass callback to hook
  });

  // Show error state
  if (error) {
    return (
      <div className="insight-page">
        <Alert
          message="Failed to Generate Insights"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" type="primary" onClick={retry}>
              <ReloadOutlined /> Retry
            </Button>
          }
        />
      </div>
    );
  }

  // Show DuckDB initializing state
  if (!isDBReady) {
    return (
      <div className="insight-page">
        <div className="insight-loading">
          <Spin size="large" />
          <Text style={{ marginTop: 16, color: 'rgba(255, 255, 255, 0.65)' }}>
            Waiting for database connection...
          </Text>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading && !config) {
    return (
      <div className="insight-page">
        <div className="insight-loading">
          <Spin size="large" />
          <Text style={{ marginTop: 16, color: 'rgba(255, 255, 255, 0.65)' }}>
            Analyzing table structure...
          </Text>
        </div>
      </div>
    );
  }



  // Render cache hit indicators inline
  const renderCacheIndicator = () => {
    const hasCacheHit = cacheHit.summary || cacheHit.distribution || cacheHit.categorical;
    if (!hasCacheHit) return null;

    return (
      <Space style={{ marginLeft: 16, flexWrap: 'wrap' }} size={[8, 4]}>
        <Text style={{ color: 'rgba(255, 255, 255, 0.65)', whiteSpace: 'nowrap' }}>
          <InfoCircleOutlined /> Cache hits:
        </Text>
        {cacheHit.summary && <Tag color="green">Summary</Tag>}
        {cacheHit.distribution && <Tag color="green">Distribution</Tag>}
        {cacheHit.categorical && <Tag color="green">Categorical</Tag>}
      </Space>
    );
  };

  return (
    <div className="insight-page">
      {/* Header */}
      <div className="insight-header">
        <div style={{ flex: 1, minWidth: 250 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 16px' }}>
            <Title level={2} style={{ margin: 0 }}>
              Data Insights
            </Title>
            {renderCacheIndicator()}
          </div>
          <Paragraph style={{ margin: '8px 0 0 0', color: 'rgba(255, 255, 255, 0.65)' }}>
            Automatic analysis for <strong>{tableName}</strong>
            {config?.enableSampling && (
              <span>
                {' '}• Based on a 75% sample ({config.rowCount.toLocaleString()} total rows)
              </span>
            )}
          </Paragraph>
        </div>

        <Space wrap>
          <Button onClick={clearCache} icon={<ClearOutlined />}>
            Clear Cache
          </Button>
          <Button type="primary" onClick={generateInsights} icon={<ReloadOutlined />}>
            Refresh
          </Button>
        </Space>
      </div>

      <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />

      {/* Section 1: Global Summary */}
      <div className="insight-section">
        <div className="section-header">
          <Title level={4}>Global Summary</Title>
        </div>

        {loadingSummary ? (
          <div className="section-loading">
            <Spin />
            <Text style={{ marginLeft: 12 }}>Loading summary...</Text>
          </div>
        ) : (
          summary && (
            <div style={{ 
              background: '#2a2d30', 
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '16px'
            }}>
              <SummaryTable columns={summary.columns} />
            </div>
          )
        )}
      </div>

      <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />

      {/* Section 2: Distribution Overview */}
      {config && config.numericColumns.length > 0 && (
        <>
          <div className="insight-section">
            <div className="section-header">
              <Title level={4} style={{ margin: 0, display: 'inline' }}>
                Distribution Overview
                <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginLeft: 8 }}>
                  Histograms for top {Math.min(config.numericColumns.length, 5)} numeric columns
                </Text>
              </Title>
            </div>

            {loadingDistribution ? (
              <div className="section-loading">
                <Spin />
                <Text style={{ marginLeft: 12 }}>Loading distributions...</Text>
              </div>
            ) : (
              distribution && <DistributionChart data={distribution} height={400} />
            )}
          </div>

          <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
        </>
      )}

      {/* Section 3: Categorical Analysis */}
      {config && (config.statusColumns.length > 0 || config.categoryColumns.length > 0) && (
        <div className="insight-section">
          <div className="section-header">
            <Title level={4} style={{ margin: 0, display: 'inline' }}>
              Categorical Analysis
              <Text style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.45)', marginLeft: 8 }}>
                Distribution of status and category columns
              </Text>
            </Title>
          </div>

          {loadingCategorical ? (
            <div className="section-loading">
              <Spin />
              <Text style={{ marginLeft: 12 }}>Loading categorical data...</Text>
            </div>
          ) : (
            categorical && (
              <CategoricalChart
                statusColumns={categorical.status}
                categoryColumns={categorical.category}
                height={300}
              />
            )
          )}
        </div>
      )}

      {/* Section 4: Anomaly Detection (if available) */}
      {anomalyResult && (
        <>
          <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
          <div className="insight-section">
            <div className="section-header">
              <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                Anomaly Detection
                {anomalyResult.anomalyCount > 0 ? (
                  <>
                    {anomalyResult.anomalyCount > 1000 && (
                      <Tag color="orange" icon={<InfoCircleOutlined />}>
                        Large dataset - may impact performance
                      </Tag>
                    )}
                  </>
                ) : (
                  <Tag color="green" icon={<CheckCircleOutlined />}>
                    No Anomalies Detected
                  </Tag>
                )}
                {/* GPU Acceleration status indicator */}
                <span style={{ 
                  fontSize: '12px', 
                  color: 'rgba(255, 255, 255, 0.45)',
                  marginLeft: 'auto',
                  fontWeight: 'normal',
                }}>
                  GPU: {anomalyResult.metadata.gpuUsed ? 'Enabled' : 'Disabled'}
                </span>
              </Title>
            </div>

            {/* Anomaly Statistics */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
              {/* Card 1: Anomaly Rate */}
              <Col span={6}>
                <Card 
                  size="small" 
                  style={{ 
                    background: '#2a2d30', 
                    border: '2px solid #ff4d4f',  // Highlighted border
                    boxShadow: '0 0 12px rgba(255, 77, 79, 0.4)',  // Red glow
                    position: 'relative',
                  }}
                >
                  {/* Three-dot menu moved inside body with absolute positioning */}
                  <Dropdown 
                    menu={{ 
                      items: anomalyMenuItems, 
                      onClick: handleMenuClick,
                      style: {
                        background: '#2a2d30',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                      },
                    }} 
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <Button 
                      type="text" 
                      icon={<MoreOutlined style={{ fontSize: 16 }} />} 
                      size="small"
                      style={{ 
                        color: 'rgba(255, 255, 255, 0.85)',
                        position: 'absolute',
                        top: 12,
                        right: 12,
                        zIndex: 1,
                      }}
                    />
                  </Dropdown>
                  
                  <Statistic
                    title="Anomaly Rate"
                    value={(anomalyResult.anomalyRate * 100).toFixed(2)}
                    suffix="%"
                    valueStyle={{ color: '#ff4d4f', fontWeight: 'bold' }}
                  />
                </Card>
              </Col>

              {/* Card 2: Anomalous Orders */}
              <Col span={6}>
                <Card size="small" style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <Statistic
                    title="Anomalous Orders"
                    value={anomalyResult.anomalyCount}
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>

              {/* Card 3: Normal Orders */}
              <Col span={6}>
                <Card size="small" style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <Statistic
                    title="Normal Orders"
                    value={anomalyResult.totalProcessed - anomalyResult.anomalyCount}
                    valueStyle={{ color: '#52c41a' }}
                  />
                </Card>
              </Col>

              {/* Card 4: Total Processed */}
              <Col span={6}>
                <Card size="small" style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <Statistic
                    title="Total Processed"
                    value={anomalyResult.totalProcessed}
                    valueStyle={{ color: 'rgba(255, 255, 255, 0.85)' }}
                  />
                </Card>
              </Col>
            </Row>

            {/* Threshold Adjuster */}
            <div style={{ marginBottom: 24 }}>
              <Text style={{ color: 'rgba(255, 255, 255, 0.85)', marginRight: 16 }}>
                Anomaly Threshold: {anomalyThreshold.toFixed(2)}
              </Text>
              <Slider
                min={0.5}
                max={0.95}
                step={0.05}
                value={anomalyThreshold}
                onChange={(value) => {
                  setAnomalyThreshold(value);
                  // Trigger re-detection with new threshold
                  if (onAnomalyThresholdChange) {
                    onAnomalyThresholdChange(value);
                  }
                }}
                style={{ width: 300, display: 'inline-block' }}
                marks={{
                  0.5: '0.5',
                  0.7: '0.7',
                  0.8: '0.8',
                  0.9: '0.9',
                }}
              />
              <Text type="secondary" style={{ marginLeft: 16 }}>
                (Higher = More Strict)
              </Text>
            </div>

            {/* Visualizations */}
            <Row gutter={16}>
              <Col span={12}>
                <Card 
                  title={
                    anomalyResult.anomalyCount > MAX_ANOMALIES_FOR_VISUALIZATION
                      ? `Individual Anomalies (Top ${MAX_ANOMALIES_FOR_VISUALIZATION} of ${anomalyResult.anomalyCount})`
                      : 'Individual Anomalies (Scatter Plot)'
                  }
                  size="small"
                  style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                >
                  {anomalyResult.metadata.featureColumns.length > 0 && (
                    <AnomalyScatterChart
                      key={`scatter-${anomalyResult.anomalyCount}-${anomalyResult.metadata.threshold}`}
                      data={anomalyResult.anomalies}
                      xAxisFeature={anomalyResult.metadata.featureColumns[0]}
                      height={350}
                      totalCount={anomalyResult.anomalyCount}
                    />
                  )}
                </Card>
              </Col>
              <Col span={12}>
                <Card 
                  title={
                    anomalyResult.anomalyCount > MAX_ANOMALIES_FOR_VISUALIZATION
                      ? `Feature Correlation (Top ${MAX_ANOMALIES_FOR_VISUALIZATION} of ${anomalyResult.anomalyCount})`
                      : 'Feature Correlation (Heatmap)'
                  }
                  size="small"
                  style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                >
                  {anomalyResult.metadata.featureColumns.length >= 2 && (
                    <AnomalyHeatmapChart
                      key={`heatmap-${anomalyResult.anomalyCount}-${anomalyResult.metadata.threshold}`}
                      data={anomalyResult.anomalies}
                      feature1={anomalyResult.metadata.featureColumns[0]}
                      feature2={anomalyResult.metadata.featureColumns[1]}
                      height={350}
                      totalCount={anomalyResult.anomalyCount}
                    />
                  )}
                </Card>
              </Col>
            </Row>

            {/* LLM Insights & Recommendations Panel */}
            {anomalyResult.anomalyCount > 0 && (
              <ActionPanel
                insightAction={insightAction}
                loading={insightLoading}
                error={insightError}
                onDownloadReport={handleDownloadReport}
                onRetry={handleRetryInsight}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(InsightPage);

