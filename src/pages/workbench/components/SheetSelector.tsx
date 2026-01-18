import React from 'react';
import { Button, Card, Checkbox, Col, Row, Space, Typography } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface SheetSelectorProps {
  sheets: string[];
  onLoad: (selectedSheets: string[]) => void | Promise<void>;
  onCancel: () => void;
}

export const SheetSelector: React.FC<SheetSelectorProps> = ({ sheets, onLoad, onCancel }) => {
  const [selectedSheets, setSelectedSheets] = React.useState<string[]>(sheets);
  // loading state for load action
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLoadClick = async () => {
    if (selectedSheets.length === 0 || isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      // support async or sync onLoad
      await Promise.resolve(onLoad(selectedSheets));
    } finally {
      // always reset loading flag
      setIsLoading(false);
    }
  };

  const onCheckboxChange = (checkedValues: any[]) => {
    setSelectedSheets(checkedValues);
  };

  const onSelectAll = () => {
    setSelectedSheets(sheets);
  };

  const onDeselectAll = () => {
    setSelectedSheets([]);
  };

  return (
    <Card bordered={false} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', margin: '20px 0' }}>
        <InboxOutlined style={{ fontSize: '48px', color: '#1677ff' }} />
        <Title level={4}>Excel File Detected</Title>
        <Text type="secondary">
          This file contains multiple sheets. Please select the sheets you want to load.
        </Text>
      </div>

      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '0 24px' }}>
        <Checkbox.Group style={{ width: '100%' }} value={selectedSheets} onChange={onCheckboxChange}>
          <Row gutter={[16, 16]}>
            {sheets.map((sheet) => (
              <Col span={24} key={sheet}>
                <Checkbox value={sheet}>{sheet}</Checkbox>
              </Col>
            ))}
          </Row>
        </Checkbox.Group>
      </div>

      <div style={{ padding: '20px 24px 0', borderTop: '1px solid #f0f0f0', marginTop: 'auto' }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Button type="link" onClick={onSelectAll} style={{ paddingLeft: 0 }} disabled={isLoading}>
                Select All
              </Button>
              <Button type="link" onClick={onDeselectAll} disabled={isLoading}>
                Deselect All
              </Button>
            </Space>
          </Col>
          <Col>
            <Space align="center">
              {/* loading text hint */}
              {isLoading && (
                <Text type="secondary" style={{ marginRight: 8 }}>
                  数据载入中...
                </Text>
              )}
              <Space>
                <Button onClick={onCancel} disabled={isLoading}>
                  Cancel
                </Button>
                <Button
                  type="primary"
                  onClick={handleLoadClick}
                  disabled={selectedSheets.length === 0 || isLoading}
                  loading={isLoading}
                >
                  Load Selected ({selectedSheets.length})
                </Button>
              </Space>
            </Space>
          </Col>
        </Row>
      </div>
    </Card>
  );
};
