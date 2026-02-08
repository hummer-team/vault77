/**
 * Error Boundary for Clustering Components
 * Catches errors in clustering visualization and provides fallback UI
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { Alert, Button, Space } from 'antd';
import { ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ClusteringErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ClusteringErrorBoundary] Caught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { error } = this.state;
      
      return (
        <div style={{ padding: '24px' }}>
          <Alert
            message="聚类分析出错"
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <strong>错误详情：</strong>
                  <div style={{ 
                    marginTop: 8, 
                    padding: 8, 
                    backgroundColor: 'rgba(0, 0, 0, 0.1)',
                    borderRadius: 4,
                    fontFamily: 'monospace',
                    fontSize: 12,
                  }}>
                    {error?.message || '未知错误'}
                  </div>
                </div>
                
                <div>
                  <strong>可能的原因：</strong>
                  <ul style={{ marginTop: 8, marginBottom: 8 }}>
                    <li>数据格式不符合要求（需要 customer_id, order_date, amount 列）</li>
                    <li>客户数量不足（最少需要 10 位客户）</li>
                    <li>数据中存在异常值（如负数金额或未来日期）</li>
                    <li>浏览器内存不足</li>
                  </ul>
                </div>
                
                <div>
                  <strong>建议操作：</strong>
                  <ul style={{ marginTop: 8, marginBottom: 0 }}>
                    <li>检查数据是否包含必需的列（customer_id, order_date, amount）</li>
                    <li>确保数据量符合要求（10+ 客户）</li>
                    <li>清理数据中的异常值</li>
                    <li>尝试刷新页面重新加载</li>
                  </ul>
                </div>
              </Space>
            }
            type="error"
            icon={<ExclamationCircleOutlined />}
            showIcon
            action={
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                onClick={this.handleReset}
              >
                重新尝试
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
