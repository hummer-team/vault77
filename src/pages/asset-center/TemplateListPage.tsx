import React from 'react';
import { Card, Table, Typography, Collapse, Space, Tooltip, App } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;
const { Panel } = Collapse;

// --- Data Structures (for future API integration) ---
interface Template {
  id: string;
  name: string;
  description: string;
  columns: { title: string; dataIndex: string; key: string }[];
  sampleData: Record<string, any>[];
  recommendedPrompt: string;
}

interface TemplateCategory {
  id: string;
  name: string;
  templates: Template[];
}

// --- Static Data ---
const templateCategories: TemplateCategory[] = [
  {
    id: 'cat1',
    name: 'Sales & Marketing',
    templates: [
      {
        id: 'sales1',
        name: 'Sales Performance Analysis',
        description: 'Analyze sales data to understand performance and product trends.',
        columns: [
          { title: 'Date', dataIndex: 'Date', key: 'Date' },
          { title: 'ProductID', dataIndex: 'ProductID', key: 'ProductID' },
          { title: 'ProductName', dataIndex: 'ProductName', key: 'ProductName' },
          { title: 'Category', dataIndex: 'Category', key: 'Category' },
          { title: 'UnitsSold', dataIndex: 'UnitsSold', key: 'UnitsSold' },
          { title: 'UnitPrice', dataIndex: 'UnitPrice', key: 'UnitPrice' },
          { title: 'TotalRevenue', dataIndex: 'TotalRevenue', key: 'TotalRevenue' },
        ],
        sampleData: [
          {
            key: '1',
            Date: '2023-10-26',
            ProductID: 'P001',
            ProductName: 'Wireless Mouse',
            Category: 'Electronics',
            UnitsSold: 50,
            UnitPrice: 25.99,
            TotalRevenue: 1299.5,
          },
        ],
        recommendedPrompt:
          'Analyze the sales data to identify the top 5 best-selling products by revenue. Also, show the monthly sales trend for the last quarter.',
      },
    ],
  },
  {
    id: 'cat2',
    name: 'Customer Insights',
    templates: [
      {
        id: 'cust1',
        name: 'Customer Segmentation',
        description: 'Segment customers based on their behavior for targeted marketing.',
        columns: [
          { title: 'CustomerID', dataIndex: 'CustomerID', key: 'CustomerID' },
          { title: 'JoinDate', dataIndex: 'JoinDate', key: 'JoinDate' },
          { title: 'LastPurchaseDate', dataIndex: 'LastPurchaseDate', key: 'LastPurchaseDate' },
          { title: 'TotalSpent', dataIndex: 'TotalSpent', key: 'TotalSpent' },
          { title: 'PurchaseFrequency', dataIndex: 'PurchaseFrequency', key: 'PurchaseFrequency' },
          { title: 'City', dataIndex: 'City', key: 'City' },
          { title: 'AgeGroup', dataIndex: 'AgeGroup', key: 'AgeGroup' },
        ],
        sampleData: [
          {
            key: '1',
            CustomerID: 'C001',
            JoinDate: '2022-01-15',
            LastPurchaseDate: '2023-10-15',
            TotalSpent: 1500.75,
            PurchaseFrequency: 12,
            City: 'New York',
            AgeGroup: '25-34',
          },
        ],
        recommendedPrompt:
          "Segment customers into 'High-Value', 'Medium-Value', and 'Low-Value' groups based on their TotalSpent and PurchaseFrequency. Show the distribution of customers across these segments.",
      },
    ],
  },
  {
    id: 'cat3',
    name: 'Digital Marketing',
    templates: [
      {
        id: 'digi1',
        name: 'Website Traffic Analysis',
        description: 'Gain insights into website traffic sources and user behavior.',
        columns: [
          { title: 'Date', dataIndex: 'Date', key: 'Date' },
          { title: 'PagePath', dataIndex: 'PagePath', key: 'PagePath' },
          { title: 'Sessions', dataIndex: 'Sessions', key: 'Sessions' },
          { title: 'Users', dataIndex: 'Users', key: 'Users' },
          { title: 'BounceRate', dataIndex: 'BounceRate', key: 'BounceRate' },
          { title: 'AvgSessionDuration', dataIndex: 'AvgSessionDuration', key: 'AvgSessionDuration' },
          { title: 'Source', dataIndex: 'Source', key: 'Source' },
        ],
        sampleData: [
          {
            key: '1',
            Date: '2023-10-26',
            PagePath: '/products/wireless-mouse',
            Sessions: 1200,
            Users: 950,
            BounceRate: 0.45,
            AvgSessionDuration: 180,
            Source: 'google',
          },
        ],
        recommendedPrompt:
          'Analyze the website traffic to find the top 3 traffic sources by the number of sessions. Also, create a chart showing the daily sessions for the past week.',
      },
    ],
  },
];

const TemplateListPage: React.FC = () => {
  const { message } = App.useApp();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        message.success('Prompt copied to clipboard!');
      },
      (err) => {
        message.error('Failed to copy prompt.');
        console.error('Could not copy text: ', err);
      }
    );
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={3}>Template Data And Prompt</Title>
      <Paragraph type="secondary">
        Here are some standard data formats to get you started. Ensure your file's column headers match the template for the best analysis results.
      </Paragraph>

      <Collapse defaultActiveKey={['cat1']} accordion>
        {templateCategories.map((category) => (
          <Panel header={<Title level={5} style={{ margin: 0 }}>{category.name}</Title>} key={category.id}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {category.templates.map((template) => (
                <Card key={template.id} title={template.name} bordered={false} style={{ background: '#2d2d2f' }}>
                  <Paragraph type="secondary">{template.description}</Paragraph>
                  <Table
                    columns={template.columns}
                    dataSource={template.sampleData}
                    pagination={false}
                    size="small"
                    bordered
                  />
                  <div style={{ marginTop: '16px' }}>
                    <Text strong>Recommended Prompt:</Text>
                    <div
                      style={{
                        background: '#1f1f1f',
                        padding: '12px',
                        borderRadius: '6px',
                        marginTop: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <Paragraph style={{ margin: 0, flex: 1 }}>
                        <code>{template.recommendedPrompt}</code>
                      </Paragraph>
                      <Tooltip title="Copy Prompt">
                        <CopyOutlined
                          style={{ cursor: 'pointer', marginLeft: '12px', color: '#888' }}
                          onClick={() => handleCopy(template.recommendedPrompt)}
                        />
                      </Tooltip>
                    </div>
                  </div>
                </Card>
              ))}
            </Space>
          </Panel>
        ))}
      </Collapse>
    </div>
  );
};

export default TemplateListPage;
