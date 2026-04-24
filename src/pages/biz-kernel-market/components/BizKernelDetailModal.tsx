/**
 * @file BizKernelDetailModal.tsx
 * @description Business kernel detail modal component
 */

import React from 'react';
import {
  Modal,
  Descriptions,
  Tag,
  Space,
  Typography,
  Button,
  Divider,
  Card,
  Statistic,
  Row,
  Col,
} from 'antd';
import {
  StarOutlined,
  LikeOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import type { BizKernelMetadata } from '../../../services/biz-kernels/types';

const { Title, Paragraph } = Typography;

interface BizKernelDetailModalProps {
  kernel: BizKernelMetadata | null;
  isApplied: boolean;
  visible: boolean;
  onClose: () => void;
  onApply: () => void;
  onCancel: () => void;
}

const BizKernelDetailModal: React.FC<BizKernelDetailModalProps> = ({
  kernel,
  isApplied,
  visible,
  onClose,
  onApply,
  onCancel,
}) => {
  if (!kernel) return null;

  const AuthorIcon = kernel.author === 'official' ? StarOutlined : UserOutlined;
  const authorText = kernel.author === 'official' ? '官方发布' : '开发者提供';
  const authorColor = kernel.author === 'official' ? '#faad14' : '#52c41a';

  return (
    <Modal
      title={null}
      open={visible}
      onCancel={onClose}
      width={760}
      style={{
        background: 'linear-gradient(135deg, #1a1a1f 0%, #252530 100%)',
      }}
      bodyStyle={{
        background: 'transparent',
        paddingBottom: 12,
      }}
      footer={
        <Space>
          {isApplied ? (
            <>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled
                style={{
                  background: 'rgba(82,196,26,0.3)',
                  borderColor: '#52c41a',
                }}
              >
                已应用
              </Button>
              <Button
                onClick={onCancel}
                style={{
                  background: 'var(--vm-surface-inset)',
                  borderColor: 'var(--vm-text-muted)',
                }}
              >
                取消应用
              </Button>
            </>
          ) : (
            <Button
              type="primary"
              onClick={onApply}
              style={{
                background: 'var(--vm-primary)',
                borderColor: 'var(--vm-primary)',
              }}
            >
              应用算子
            </Button>
          )}
          <Button
            onClick={onClose}
            style={{
              background: 'var(--vm-surface-inset)',
              borderColor: 'var(--vm-text-muted)',
            }}
          >
            关闭
          </Button>
        </Space>
      }
    >
      {/* Header */}
      <Space direction="vertical" size={0} style={{ width: '100%', marginBottom: 12 }}>
        <Title level={4} style={{ margin: 0, color: 'var(--vm-text-primary)' }}>
          {kernel.displayName}
        </Title>
        <Space size={8} style={{ marginTop: 8 }} wrap>
          <Tag
            color={authorColor}
            style={{
              background: `${authorColor}20`,
              borderColor: authorColor,
              marginRight: 0,
            }}
          >
            <AuthorIcon style={{ marginRight: 4 }} />
            {authorText}
          </Tag>
          <Tag style={{ background: 'var(--vm-primary-light)', borderColor: 'var(--vm-primary)', color: 'var(--vm-primary)' }}>
            {kernel.industry}
          </Tag>
          <Tag color="blue" style={{ background: 'rgba(24,144,255,0.15)' }}>
            {kernel.category}
          </Tag>
          <Tag style={{ background: 'var(--vm-surface-inset)' }}>
            v{kernel.version}
          </Tag>
        </Space>
      </Space>

      {/* Description - 紧接标题，减少空白 */}
      <Paragraph style={{ color: 'var(--vm-text-secondary)', fontSize: 13, marginBottom: 8 }}>
        {kernel.description}
      </Paragraph>

      {/* Stats Cards */}
      <Row gutter={16} style={{ marginBottom: 8 }}>
        <Col span={6}>
          <Card
            size="small"
            style={{
              background: 'rgba(255,77,79,0.1)',
              borderColor: 'rgba(255,77,79,0.3)',
              textAlign: 'center',
            }}
            bodyStyle={{ padding: '6px' }}
          >
            <Statistic
              title={<span style={{ color: 'var(--vm-text-secondary)', fontSize: 11 }}>热度</span>}
              value={kernel.likes}
              prefix={<LikeOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: 'var(--vm-text-primary)', fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card
            size="small"
            style={{
              background: 'rgba(250,173,20,0.1)',
              borderColor: 'rgba(250,173,20,0.3)',
              textAlign: 'center',
            }}
            bodyStyle={{ padding: '6px' }}
          >
            <Statistic
              title={<span style={{ color: 'var(--vm-text-secondary)', fontSize: 11 }}>积分</span>}
              value={kernel.credits}
              prefix={<ThunderboltOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: 'var(--vm-text-primary)', fontSize: 14 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card
            size="small"
            style={{
              background: 'rgba(82,196,26,0.1)',
              borderColor: 'rgba(82,196,26,0.3)',
              textAlign: 'center',
            }}
            bodyStyle={{ padding: '6px' }}
          >
            <Statistic
              title={<span style={{ color: 'var(--vm-text-secondary)', fontSize: 11 }}>数据量</span>}
              value={kernel.dataVolume}
              prefix={<DatabaseOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: 'var(--vm-text-primary)', fontSize: 12 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card
            size="small"
            style={{
              background: 'rgba(24,144,255,0.1)',
              borderColor: 'rgba(24,144,255,0.3)',
              textAlign: 'center',
            }}
            bodyStyle={{ padding: '6px' }}
          >
            <Statistic
              title={<span style={{ color: 'var(--vm-text-secondary)', fontSize: 11 }}>预估耗时</span>}
              value={kernel.estimatedTime}
              prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: 'var(--vm-text-primary)', fontSize: 12 }}
            />
          </Card>
        </Col>
      </Row>

      <Divider style={{ borderColor: 'var(--vm-surface-inset)', margin: '8px 0' }} />

      {/* Description */}
      <Title level={5} style={{ color: 'var(--vm-text-primary)', marginBottom: 6 }}>解决痛点</Title>
      <Paragraph style={{ color: 'var(--vm-text-secondary)', fontSize: 14, marginBottom: 12 }}>
        {kernel.description}
      </Paragraph>

      {kernel.detailedDescription && (
        <>
          <Title level={5} style={{ color: 'var(--vm-text-primary)', marginTop: 12, marginBottom: 8 }}>核心洞察</Title>
          <Paragraph style={{ color: 'var(--vm-text-secondary)', fontSize: 13, marginBottom: 12 }}>
            {kernel.detailedDescription}
          </Paragraph>
        </>
      )}

      {/* Metadata */}
      {kernel.metadata && (
        <>
          <Divider style={{ borderColor: 'var(--vm-surface-inset)', margin: '12px 0' }} />
          <Title level={5} style={{ color: 'var(--vm-text-primary)', marginBottom: 8 }}>
            <CodeOutlined style={{ marginRight: 8 }} />
            配置需求
          </Title>
          <Card
            size="small"
            style={{
              background: 'rgba(0,0,0,0.2)',
              borderColor: 'var(--vm-surface-inset)',
            }}
            bodyStyle={{ padding: '12px' }}
          >
            {kernel.metadata.inputFields && (
              <Descriptions
                size="small"
                column={1}
                style={{ marginBottom: 8 }}
                labelStyle={{ color: 'var(--vm-text-secondary)' }}
                contentStyle={{ color: 'var(--vm-text-primary)' }}
              >
                <Descriptions.Item label="输入字段">
                  <Space wrap>
                    {kernel.metadata.inputFields.map((field) => (
                      <Tag key={field} style={{ background: 'rgba(24,144,255,0.15)' }}>
                        {field}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            )}
            {kernel.metadata.outputFields && (
              <Descriptions
                size="small"
                column={1}
                style={{ marginBottom: 8 }}
                labelStyle={{ color: 'var(--vm-text-secondary)' }}
                contentStyle={{ color: 'var(--vm-text-primary)' }}
              >
                <Descriptions.Item label="输出字段">
                  <Space wrap>
                    {kernel.metadata.outputFields.map((field) => (
                      <Tag key={field} style={{ background: 'rgba(82,196,26,0.15)' }}>
                        {field}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              </Descriptions>
            )}
            {kernel.metadata.constraints && (
              <Descriptions
                size="small"
                column={1}
                labelStyle={{ color: 'var(--vm-text-secondary)' }}
                contentStyle={{ color: 'var(--vm-text-primary)' }}
              >
                <Descriptions.Item label="约束条件">
                  {kernel.metadata.constraints.join('; ')}
                </Descriptions.Item>
              </Descriptions>
            )}
          </Card>
        </>
      )}
    </Modal>
  );
};

export default BizKernelDetailModal;
