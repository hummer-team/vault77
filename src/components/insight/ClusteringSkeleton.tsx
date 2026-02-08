/**
 * Skeleton Loader for Clustering Components
 * Displays loading placeholders while clustering is in progress
 */

import React from 'react';
import { Card, Skeleton, Row, Col, Space } from 'antd';

interface ClusteringSkeletonProps {
  showCharts?: boolean;
  showStats?: boolean;
  showSlider?: boolean;
}

export const ClusteringSkeleton: React.FC<ClusteringSkeletonProps> = ({
  showCharts = true,
  showStats = true,
  showSlider = true,
}) => {
  return (
    <div style={{ padding: '24px 0' }}>
      {/* Statistics Skeleton */}
      {showStats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <Col span={6} key={i}>
              <Card bordered={false}>
                <Skeleton.Input active size="small" style={{ width: 100, marginBottom: 8 }} />
                <Skeleton.Input active size="large" style={{ width: 120 }} />
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* Slider Skeleton */}
      {showSlider && (
        <div style={{ marginBottom: 24 }}>
          <Space>
            <Skeleton.Input active size="small" style={{ width: 150 }} />
            <Skeleton.Input active style={{ width: 300 }} />
          </Space>
        </div>
      )}

      {/* Charts Skeleton */}
      {showCharts && (
        <Row gutter={24}>
          <Col span={12}>
            <Card title={<Skeleton.Input active size="small" style={{ width: 150 }} />} bordered={false}>
              <Skeleton.Node active style={{ width: '100%', height: 400 }}>
                <div style={{ 
                  width: '100%', 
                  height: 400, 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  color: 'rgba(255, 255, 255, 0.45)',
                }}>
                  Loading scatter plot...
                </div>
              </Skeleton.Node>
            </Card>
          </Col>
          <Col span={12}>
            <Card title={<Skeleton.Input active size="small" style={{ width: 150 }} />} bordered={false}>
              <Skeleton.Node active style={{ width: '100%', height: 400 }}>
                <div style={{ 
                  width: '100%', 
                  height: 400, 
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  color: 'rgba(255, 255, 255, 0.45)',
                }}>
                  Loading radar chart...
                </div>
              </Skeleton.Node>
            </Card>
          </Col>
        </Row>
      )}

      {/* LLM Report Skeleton */}
      <Card 
        style={{ marginTop: 24 }}
        title={<Skeleton.Input active size="small" style={{ width: 200 }} />}
        bordered={false}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Skeleton active paragraph={{ rows: 2 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 2 }} />
        </Space>
      </Card>
    </div>
  );
};
