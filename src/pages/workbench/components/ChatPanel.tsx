import React from 'react';
import { Input, Button, Form, Tag, Space, Upload, FloatButton } from 'antd';
import { PaperClipOutlined, DownOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';

interface ChatPanelProps {
  onSendMessage: (message: string) => void;
  isAnalyzing: boolean;
  suggestions?: string[];
  onFileUpload: UploadProps['beforeUpload'];
  showScrollToBottom: boolean; // Added prop
  onScrollToBottom: () => void; // Added prop
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  onSendMessage, 
  isAnalyzing, 
  suggestions, 
  onFileUpload,
  showScrollToBottom,
  onScrollToBottom
}) => {
  const [form] = Form.useForm();

  const handleFinish = (values: { message: string }) => {
    if (values.message && values.message.trim()) {
      onSendMessage(values.message.trim());
      form.resetFields();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    form.setFieldsValue({ message: suggestion });
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    beforeUpload: onFileUpload,
    showUploadList: false,
    accept: ".csv,.xls,.xlsx",
    disabled: isAnalyzing, // Disable upload when analyzing
  };

  const placeholderText = [
    '1.上传支持 Excel 和 CSV 格式，文件上限 1GB',
    '2.输入您的问题或分析指令',
    '3.Control+Enter提交',
  ].join('\n');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
      
      <FloatButton
        shape="circle" // Ensure the button is circular
        icon={<DownOutlined />}
        onClick={onScrollToBottom}
        style={{
          display: showScrollToBottom ? 'block' : 'none',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-50px', // Position it above the chat panel area
          zIndex: 10, // Ensure it's above other elements
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          padding: 0,
          lineHeight: '40px',
          overflow: 'hidden',
          textAlign: 'center'
        }}
      />

      {/* Suggestions at the top */}
      {suggestions && suggestions.length > 0 && (
        <Space size={[0, 8]} wrap>
          {suggestions.map((s, i) => (
            <Tag 
              key={i} 
              onClick={() => handleSuggestionClick(s)}
              style={{ cursor: 'pointer' }}
            >
              {s}
            </Tag>
          ))}
        </Space>
      )}

      <Form form={form} onFinish={handleFinish} layout="vertical">
        <div style={{ position: 'relative' }}>
          <Form.Item name="message" noStyle>
            <Input.TextArea
              placeholder={placeholderText}
              disabled={isAnalyzing}
              style={{ 
                height: 120, 
                resize: 'none',
                paddingBottom: '40px'
            }}
              onPressEnter={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !isAnalyzing) {
                  e.preventDefault();
                  form.submit();
                }
              }}
            />
          </Form.Item>
          <div style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            display: 'flex',
            gap: '8px'
          }}>
            <Upload {...uploadProps}>
              <Button icon={<PaperClipOutlined />} disabled={isAnalyzing} />
            </Upload>
          </div>
        </div>
      </Form>
    </div>
  );
};

export default ChatPanel;
