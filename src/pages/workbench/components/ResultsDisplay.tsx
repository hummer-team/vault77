import React, { useEffect, useState } from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider, Spin, Alert } from 'antd';
import { TableOutlined } from '@ant-design/icons';

const { Paragraph, Text } = Typography;

interface ResultsDisplayProps {
  query: string;
  status: 'analyzing' | 'resultsReady';
  data: any;
  thinkingSteps: { tool: string; params: any, thought?: string } | null;
}

const ThinkingSteps: React.FC<{ steps: { tool: string; params: any, thought?: string } }> = ({ steps }) => (
  <div style={{ marginBottom: 16 }}>
    <Paragraph><strong>AI 思考步骤:</strong></Paragraph>
    <Space direction="vertical" style={{ width: '100%' }}>
      {steps.thought && <Text><strong>思考:</strong> {steps.thought}</Text>}
      <Text>1. 决定调用工具: <Tag color="blue">{steps.tool}</Tag></Text>
      <Text>2. 准备了以下参数:</Text>
      <pre style={{ 
        border: '1px solid #e8e8e8',
        padding: '8px 12px', 
        borderRadius: 4, 
        whiteSpace: 'pre-wrap', 
        wordBreak: 'break-all' 
      }}>
        <code>{JSON.stringify(steps.params, null, 2)}</code>
      </pre>
    </Space>
  </div>
);

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ query, status, data, thinkingSteps }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (status === 'resultsReady') {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [status]);

  const renderContent = () => {
    if (status === 'analyzing') {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <Spin tip="AI 正在分析中..." />
        </div>
      );
    }

    if (status === 'resultsReady') {
      if (data && data.error) {
        return (
          <Alert
            message="分析失败"
            description={data.error}
            type="error"
            showIcon
          />
        );
      }

      if (!data) {
        return <Empty description="分析完成，但没有返回结果。" />;
      }

      const { columns: originalColumns, rows } = data;

      if (!originalColumns || !rows || rows.length === 0) {
        return <Empty description="分析完成，但没有返回结果。" />;
      }

      const tableColumns = originalColumns.map((colName: string, index: number) => ({
        title: colName,
        dataIndex: `col_${index}`,
        key: `col_${index}`,
      }));

      const tableDataSource = rows.map((row: any[], rowIndex: number) => {
        const rowObject: { [key: string]: any } = { key: `row-${rowIndex}` };
        originalColumns.forEach((_colName: string, colIndex: number) => {
          rowObject[`col_${colIndex}`] = row[colIndex];
        });
        return rowObject;
      });

      return (
        <>
          {thinkingSteps && (
            <>
              <ThinkingSteps steps={thinkingSteps} />
              <Divider />
            </>
          )}
          <Paragraph><strong>分析结果:</strong></Paragraph>
          <Table
            dataSource={tableDataSource}
            columns={tableColumns}
            pagination={{ pageSize: 5 }}
            size="small"
          />
        </>
      );
    }
    
    return <Empty image={<TableOutlined style={{ fontSize: 48 }} />} description="请在下方对话框中提出您的问题，开始分析。" />;
  };

  return (
    <div style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 0.5s ease-in-out', marginBottom: '24px' }}>
      <Card title={`Query: "${query}"`}>
        {renderContent()}
      </Card>
    </div>
  );
};

export default ResultsDisplay;
