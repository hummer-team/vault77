/**
 * @file BizKernelCard.tsx
 * @description Business kernel card component displaying kernel metadata
 */

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
  const authorColor = kernel.author === 'official' ? '#faad14' : '#52c41a';

  return (
    <Card
      hoverable
      style={{
        height: 320,
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
      }}
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
        <Tag style={{ background: 'rgba(255,107,0,0.15)', borderColor: '#FF6B00', color: '#FF6B00' }}>
          {kernel.industry}
        </Tag>
        <Tag color="blue" style={{ background: 'rgba(24,144,255,0.15)' }}>
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
        style={{ marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.75)', minHeight: 40 }}
      >
        {kernel.description}
      </Paragraph>

      {/* Stats: Likes, Credits, Data Volume */}
      <Space
        wrap
        size="middle"
        style={{ marginBottom: 12, fontSize: 12, marginTop: 'auto' }}
      >
        <Tooltip title="热度">
          <Space size={4} style={{ color: 'rgba(255,255,255,0.65)' }}>
            <LikeOutlined style={{ color: '#ff4d4f' }} />
            <Text style={{ color: 'inherit' }}>{kernel.likes}</Text>
          </Space>
        </Tooltip>
        <Tooltip title="积分消耗">
          <Space size={4} style={{ color: 'rgba(255,255,255,0.65)' }}>
            <ThunderboltOutlined style={{ color: '#faad14' }} />
            <Text style={{ color: 'inherit' }}>{kernel.credits}</Text>
          </Space>
        </Tooltip>
        <Tooltip title="数据量">
          <Space size={4} style={{ color: 'rgba(255,255,255,0.65)' }}>
            <DatabaseOutlined style={{ color: '#52c41a' }} />
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
                background: 'rgba(82,196,26,0.3)',
                borderColor: '#52c41a',
              }}
            >
              已应用
            </Button>
            <Button
              onClick={onCancel}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.08)',
                borderColor: 'rgba(255,255,255,0.15)',
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
              background: '#FF6B00',
              borderColor: '#FF6B00',
            }}
          >
            应用算子
          </Button>
        )}
        <Button
          type="link"
          onClick={onViewDetail}
          style={{ color: 'rgba(255,255,255,0.65)' }}
        >
          详情
        </Button>
      </Space>
    </Card>
  );
};

export default BizKernelCard;
