/**
 * Insight Page
 * Main container for data insights visualization
 * Reuses DuckDB instance from Workbench via Context
 */

import React, { useState } from 'react';
import { Spin, Alert, Divider, Typography, Space, Button, Tag, Card, Row, Col, Statistic, Slider } from 'antd';
import { ReloadOutlined, ClearOutlined, InfoCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useInsight } from '../../hooks/insight/useInsight';
import { SummaryTable } from '../../components/insight/SummaryTable';
import { DistributionChart } from '../../components/insight/DistributionChart';
import { CategoricalChart } from '../../components/insight/CategoricalChart';
import { AnomalyScatterChart } from '../../components/insight/AnomalyScatterChart';
import { AnomalyHeatmapChart } from '../../components/insight/AnomalyHeatmapChart';
import { useDuckDBContext } from '../../contexts/DuckDBContext';
import type { AnomalyAnalysisOutput } from '../../types/anomaly.types';
import './index.css';

const { Title, Paragraph, Text } = Typography;

interface InsightPageProps {
  tableName: string;
  onNoValidColumns?: () => void; // Callback when no valid columns found
  anomalyResult?: AnomalyAnalysisOutput | null; // Anomaly detection result from Workbench
  onAnomalyThresholdChange?: (threshold: number) => void; // Callback to trigger re-detection
}

export const InsightPage: React.FC<InsightPageProps> = ({ 
  tableName, 
  onNoValidColumns, 
  anomalyResult,
  onAnomalyThresholdChange 
}) => {
  const { executeQuery, isDBReady } = useDuckDBContext();
  
  // Local state for anomaly threshold adjustment (UI only)
  const [anomalyThreshold, setAnomalyThreshold] = useState(
    anomalyResult?.metadata.threshold ?? 0.8
  );

  // Sync threshold with anomalyResult when it changes
  React.useEffect(() => {
    if (anomalyResult?.metadata.threshold) {
      setAnomalyThreshold(anomalyResult.metadata.threshold);
    }
  }, [anomalyResult?.metadata.threshold]);

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
      {anomalyResult && anomalyResult.anomalyCount > 0 && (
        <>
          <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />
          <div className="insight-section">
            <div className="section-header">
              <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                Anomaly Detection
                <Tag color="red">{anomalyResult.anomalyCount} Anomalies</Tag>
                {anomalyResult.anomalyCount > 1000 && (
                  <Tag color="orange" icon={<InfoCircleOutlined />}>
                    Large dataset - may impact performance
                  </Tag>
                )}
              </Title>
            </div>

            {/* Anomaly Statistics */}
            <Row gutter={16} style={{ marginBottom: 24 }}>
              <Col span={6}>
                <Card size="small" style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <Statistic
                    title="Anomaly Rate"
                    value={(anomalyResult.anomalyRate * 100).toFixed(2)}
                    suffix="%"
                    valueStyle={{ color: '#ff4d4f' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <Statistic
                    title="Total Processed"
                    value={anomalyResult.totalProcessed}
                    valueStyle={{ color: 'rgba(255, 255, 255, 0.85)' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <Statistic
                    title="GPU Acceleration"
                    value={anomalyResult.metadata.gpuUsed ? 'Enabled' : 'Disabled'}
                    valueStyle={{ color: anomalyResult.metadata.gpuUsed ? '#52c41a' : 'rgba(255, 255, 255, 0.65)' }}
                  />
                </Card>
              </Col>
              <Col span={6}>
                <Card size="small" style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                  <Statistic
                    title="Execution Time"
                    value={anomalyResult.metadata.durationMs.toFixed(0)}
                    suffix="ms"
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
                  title="Individual Anomalies (Scatter Plot)"
                  size="small"
                  style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                >
                  {anomalyResult.metadata.featureColumns.length > 0 && (
                    <AnomalyScatterChart
                      data={anomalyResult.anomalies}
                      xAxisFeature={anomalyResult.metadata.featureColumns[0]}
                      height={350}
                    />
                  )}
                </Card>
              </Col>
              <Col span={12}>
                <Card 
                  title="Feature Correlation (Heatmap)"
                  size="small"
                  style={{ background: '#2a2d30', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                >
                  {anomalyResult.metadata.featureColumns.length >= 2 && (
                    <AnomalyHeatmapChart
                      data={anomalyResult.anomalies}
                      feature1={anomalyResult.metadata.featureColumns[0]}
                      feature2={anomalyResult.metadata.featureColumns[1]}
                      height={350}
                    />
                  )}
                </Card>
              </Col>
            </Row>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="insight-footer">
        <Text type="secondary">
          Generated {new Date().toLocaleString()} • {config?.columns.length || 0} columns analyzed
        </Text>
      </div>
    </div>
  );
};

// Memoize to prevent unnecessary re-renders
export default React.memo(InsightPage);

