import React from 'react';
import { Drawer, Form, Input, Button, Radio, Upload, App } from 'antd';
import { InboxOutlined } from '@ant-design/icons';

interface FeedbackDrawerProps {
  open: boolean;
  onClose: () => void;
}

const FeedbackDrawer: React.FC<FeedbackDrawerProps> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const onFinish = (values: any) => {
    console.log('Feedback submitted:', values);
    // Here you would typically send the data to your backend
    message.success('感谢您的反馈，我们会尽快处理！');
    form.resetFields();
    onClose();
  };

  return (
    <Drawer
      title="提供反馈"
      width={520}
      onClose={onClose}
      open={open}
      styles={{ body: { paddingBottom: 80 } }}
      footer={
        <div style={{ textAlign: 'right' }}>
          <Button onClick={onClose} style={{ marginRight: 8 }}>
            取消
          </Button>
          <Button onClick={() => form.submit()} type="primary">
            提交
          </Button>
        </div>
      }
    >
      <Form layout="vertical" form={form} onFinish={onFinish}>
        <Form.Item
          name="type"
          label="反馈类型"
          rules={[{ required: true, message: '请选择一个反馈类型' }]}
        >
          <Radio.Group>
            <Radio.Button value="bug">问题报告</Radio.Button>
            <Radio.Button value="feature">功能建议</Radio.Button>
            <Radio.Button value="design">UI/UX 建议</Radio.Button>
            <Radio.Button value="other">其他</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: '请输入一个简短的标题' }]}
        >
          <Input placeholder="例如：表格在某些情况下会崩溃" />
        </Form.Item>
        <Form.Item
          name="description"
          label="详细描述"
          rules={[{ required: true, message: '请详细描述您遇到的问题或建议' }]}
        >
          <Input.TextArea rows={6} placeholder="请提供尽可能多的细节，例如重现步骤、期望的结果等。" />
        </Form.Item>
        <Form.Item label="附件 (可选)">
          <Form.Item name="dragger" valuePropName="fileList" getValueFromEvent={(e) => Array.isArray(e) ? e : e?.fileList} noStyle>
            <Upload.Dragger name="files" action="/upload.do" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此区域以上传</p>
              <p className="ant-upload-hint">支持单个或批量上传截图或视频。</p>
            </Upload.Dragger>
          </Form.Item>
        </Form.Item>
      </Form>
    </Drawer>
  );
};

export default FeedbackDrawer;
