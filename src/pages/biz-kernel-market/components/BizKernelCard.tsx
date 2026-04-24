/**
 * @file BizKernelCard.tsx
 * @description Business kernel card component displaying kernel metadata
 */

import './BizKernelCard.css';
import React from 'react';
import { Card, Tag, Button, Space, Typography, Tooltip, Badge } from 'antd';
import {
  StarOutlined,
  LikeOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import type { BizKernelMetadata } from '../../../services/biz-kernels/types';

const { Text, Paragraph } = Typography;

interface BizKernelCardProps {
  kernel: BizKernelMetadata;
  isApplied: boolean;
  onApply: () => void;
  onCancel: () => void;
  onViewDetail: () => void;
}

const BizKernelCard: React.FC<BizKernelCardProps> = ({
  kernel,
  isApplied,
  onApply,
  onCancel,
  onViewDetail,
}) => {
  // Author icon: star for official, user for developer
  const AuthorIcon = kernel.author === 'official' ? StarOutlined : UserOutlined;
  const authorColor = kernel.author === 'official' ? 'var(--vm-warning-color)' : 'var(--vm-success-color)';

  return (
    <Card
      hoverable
      style={{
        height: '100%',
        minHeight: 280,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
      }}
      className="biz-kernel-card"
      bodyStyle={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
      }}
      styles={{
        body: {
          background: 'rgba(30, 30, 35, 0.6)',
        },
      }}
    >
      {/* Header: Industry and Category */}
      <Space wrap size="small" style={{ marginBottom: 8 }}>
        <Tag style={{ background: 'var(--vm-primary-light)', borderColor: 'var(--vm-primary)', color: 'var(--vm-primary)' }}>
          {kernel.industry}
        </Tag>
        <Tag color="blue" style={{ background: 'var(--vm-primary-light)' }}>
          {kernel.category}
        </Tag>
      </Space>

      {/* Title with Author Badge */}
      <Space align="center" style={{ marginBottom: 4 }}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {kernel.displayName}
        </Typography.Title>
        <Tooltip title={kernel.author === 'official' ? '官方发布' : '开发者提供'}>
          <Badge
            count={<AuthorIcon style={{ color: authorColor, fontSize: 14 }} />}
            style={{ backgroundColor: 'transparent' }}
          />
        </Tooltip>
      </Space>

      {/* Version */}
      <Text type="secondary" style={{ fontSize: 11, marginBottom: 8 }}>
        v{kernel.version}
      </Text>

      {/* Description */}
      <Paragraph
        ellipsis={{ rows: 2 }}
        style={{ marginBottom: 8, fontSize: 13, color: 'var(--vm-text-secondary)', minHeight: 40 }}
      >
        {kernel.description}
      </Paragraph>

      {/* Stats: Likes, Credits, Data Volume */}
      <Space
        wrap
        size="middle"
        style={{ marginBottom: 8, fontSize: 12, marginTop: 'auto' }}
      >
        <Tooltip title="热度">
          <Space size={4} style={{ color: 'var(--vm-text-secondary)' }}>
            <LikeOutlined style={{ color: 'var(--vm-error-color)' }} />
            <Text style={{ color: 'inherit' }}>{kernel.likes}</Text>
          </Space>
        </Tooltip>
        <Tooltip title="积分消耗">
          <Space size={4} style={{ color: 'var(--vm-text-secondary)' }}>
            <ThunderboltOutlined style={{ color: 'var(--vm-warning-color)' }} />
            <Text style={{ color: 'inherit' }}>{kernel.credits}</Text>
          </Space>
        </Tooltip>
        <Tooltip title="数据量">
          <Space size={4} style={{ color: 'var(--vm-text-secondary)' }}>
            <DatabaseOutlined style={{ color: 'var(--vm-success-color)' }} />
            <Text style={{ color: 'inherit' }}>{kernel.dataVolume}</Text>
          </Space>
        </Tooltip>
      </Space>

      {/* Actions */}
      <Space style={{ width: '100%', marginTop: 'auto' }}>
        {isApplied ? (
          <>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled
              style={{
                flex: 1,
                background: 'var(--vm-success-color-light)',
                borderColor: 'var(--vm-success-color)',
              }}
            >
              已应用
            </Button>
            <Button
              onClick={onCancel}
              style={{
                flex: 1,
                background: 'var(--vm-surface-inset)',
                borderColor: 'var(--vm-text-muted)',
              }}
            >
              取消
            </Button>
          </>
        ) : (
          <Button
            type="primary"
            onClick={onApply}
            style={{
              flex: 1,
              background: 'var(--vm-primary)',
              borderColor: 'var(--vm-primary)',
            }}
          >
            应用算子
          </Button>
        )}
        <Button
          type="link"
          onClick={onViewDetail}
          style={{ color: 'var(--vm-text-secondary)' }}
        >
          详情
        </Button>
      </Space>
    </Card>
  );
};

export default BizKernelCard;
