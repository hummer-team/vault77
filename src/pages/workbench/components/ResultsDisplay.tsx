import React from 'react';
import { Card, Empty, Typography, Table, Tag, Space, Divider, Spin, Alert } from 'antd';

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
        background: '#1f2123', // A darker shade for contrast
        border: '1px solid rgba(255, 255, 255, 0.1)',
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
  // Removed isVisible state and useEffect for opacity transition

  const renderContent = () => {
    if (status === 'analyzing') {
      return (
        <Card 
          title={`Query: "${query}"`}
          style={{
            background: '#2a2d30',
            border: '1px solid rgba(255, 255, 255, 0.15)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '150px' }}>
            <Spin tip="AI 正在分析中..." size="large" /> {/* Added size="large" */}
          </div>
        </Card>
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
        <Card 
          title={`Query: "${query}"`}
          style={{
            background: '#2a2d30', // A slightly lighter, premium charcoal color
            border: '1px solid rgba(255, 255, 255, 0.15)', // A subtle "glow" border
          }}
        >
          {thinkingSteps && (
            <>
              <ThinkingSteps steps={thinkingSteps} />
              <Divider style={{ borderColor: 'rgba(255, 255, 255, 0.15)' }} />
            </>
          )}
          <Paragraph><strong>分析结果:</strong></Paragraph>
          <Table
            dataSource={tableDataSource}
            columns={tableColumns}
            pagination={{ pageSize: 5 }}
            size="small"
          />
        </Card>
      );
    }
    
    return null;
  };

  return (
    <div style={{ marginBottom: '24px' }}> {/* Removed opacity transition */}
      {renderContent()}
    </div>
  );
};

export default ResultsDisplay;
