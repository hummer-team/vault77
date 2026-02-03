/**
 * Insight Page
 * Main container for data insights visualization
 * Reuses DuckDB instance from Workbench via Context
 */

import React from 'react';
import { Spin, Alert, Divider, Typography, Space, Button, Tag } from 'antd';
import { ReloadOutlined, ClearOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useInsight } from '../../hooks/insight/useInsight';
import { SummaryTable } from '../../components/insight/SummaryTable';
import { DistributionChart } from '../../components/insight/DistributionChart';
import { CategoricalChart } from '../../components/insight/CategoricalChart';
import { useDuckDBContext } from '../../contexts/DuckDBContext';
import './index.css';

const { Title, Paragraph, Text } = Typography;

interface InsightPageProps {
  tableName: string;
  onNoValidColumns?: () => void; // Callback when no valid columns found
}

export const InsightPage: React.FC<InsightPageProps> = ({ tableName, onNoValidColumns }) => {
  const { executeQuery, isDBReady } = useDuckDBContext();

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

