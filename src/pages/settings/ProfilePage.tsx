import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Select,
  Table,
  Switch,
  Popconfirm,
  Modal,
  App,
  Space,
  Typography,
  Upload,
} from 'antd';
import type { UploadProps } from 'antd';
import { UserOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { settingsService, LLMProviderConfig } from '../../services/SettingsService';
import { useUserStore } from '../../status/AppStatusManager.ts';

const { Title } = Typography;

const getBase64 = (img: File, callback: (url: string) => void) => {
  const reader = new FileReader();
  reader.addEventListener('load', () => callback(reader.result as string));
  reader.readAsDataURL(img);
};

const ProfilePage: React.FC = () => {
  const { message } = App.useApp();
  const [profileForm] = Form.useForm();
  const [llmForm] = Form.useForm();

  const { userProfile, setUserProfile } = useUserStore();

  const [llmConfigs, setLlmConfigs] = useState<LLMProviderConfig[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<LLMProviderConfig | null>(null);

  useEffect(() => {
    if (userProfile) {
      profileForm.setFieldsValue(userProfile);
    }
  }, [userProfile, profileForm]);

  useEffect(() => {
    const loadLlmConfigs = async () => {
      try {
        const configs = await settingsService.getLlmConfigs();
        setLlmConfigs(configs);
      } catch (error) {
        message.error('Failed to load LLM configurations.');
        console.error('[ProfilePage] Error loading LLM configs:', error);
      }
    };
    loadLlmConfigs();
  }, []);

  const handleProfileUpdate = async (values: any) => {
    if (!userProfile) return;
    try {
      const updatedProfile = { ...userProfile, ...values };
      await settingsService.saveUserProfile(updatedProfile);
      // No need to call setUserProfile here, as it's already updated optimistically
      message.success('Profile updated successfully!');
    } catch (error) {
      message.error('Failed to update profile.');
      console.error('[ProfilePage] Error updating profile:', error);
    }
  };

  const handleShowModal = (config?: LLMProviderConfig) => {
    setEditingConfig(config || null);
    llmForm.setFieldsValue(config || {});
    setIsModalVisible(true);
  };

  const handleLlmConfigSave = async () => {
    if (!userProfile) return;
    try {
      const values = await llmForm.validateFields();
      let updatedConfigs;
      if (editingConfig) {
        updatedConfigs = await settingsService.updateLlmConfig(editingConfig.id, values);
        message.success('LLM config updated successfully!');
      } else {
        updatedConfigs = await settingsService.addLlmConfig({ ...values, isEnabled: true });
        message.success('LLM config added successfully!');
      }
      setLlmConfigs(updatedConfigs);
      setIsModalVisible(false);
    } catch (error) {
      message.error('Failed to save LLM config.');
      console.error('[ProfilePage] Error saving LLM config:', error);
    }
  };

  const handleLlmConfigToggle = async (configId: string, isEnabled: boolean) => {
    try {
      const updatedConfigs = await settingsService.updateLlmConfig(configId, { isEnabled });
      setLlmConfigs(updatedConfigs);
      message.success(`LLM config ${isEnabled ? 'enabled' : 'disabled'}.`);
    } catch (error) {
      message.error('Failed to toggle LLM config status.');
    }
  };

  const handleLlmConfigDelete = async (configId: string) => {
    try {
      const updatedConfigs = await settingsService.deleteLlmConfig(configId);
      setLlmConfigs(updatedConfigs);
      message.success('LLM config deleted.');
    } catch (error) {
      message.error('Failed to delete LLM config.');
    }
  };

  const uploadProps: UploadProps = {
    name: 'avatar',
    showUploadList: false,
    beforeUpload: (file) => {
      if (!userProfile) return false;
      const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png';
      if (!isJpgOrPng) {
        message.error('You may only upload images in JPG/PNG format!');
      }
      const isLt200K = file.size / 1024 < 200;
      if (!isLt200K) {
        message.error('Images must be smaller than 200KB!');
      }
      if (isJpgOrPng && isLt200K) {
        getBase64(file, (url) => {
          const updatedProfile = { ...userProfile, avatar: url };
          setUserProfile(updatedProfile); // This updates the global state immediately
        });
      }
      return false;
    },
  };

  const columns = [
    { title: 'URL', dataIndex: 'url', key: 'url' },
    {
      title: 'API Key',
      dataIndex: 'apiKey',
      key: 'apiKey',
      render: (text: string) => `sk-**********...${text.slice(-4)}`,
    },
    {
      title: 'Status',
      dataIndex: 'isEnabled',
      key: 'isEnabled',
      render: (isEnabled: boolean, record: LLMProviderConfig) => (
        <Switch checked={isEnabled} onChange={(checked) => handleLlmConfigToggle(record.id, checked)} />
      ),
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: LLMProviderConfig) => (
        <Space size="middle">
          <Button icon={<EditOutlined />} onClick={() => handleShowModal(record)}>Edit</Button>
          <Popconfirm
            title="Are you sure you want to delete this config?"
            onConfirm={() => handleLlmConfigDelete(record.id)}
            okText="Yes"
            cancelText="No"
          >
            <Button icon={<DeleteOutlined />} danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', background: 'transparent' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          {userProfile && (
            <Form form={profileForm} layout="vertical" onFinish={handleProfileUpdate} initialValues={userProfile}>
              <Form.Item label="Avatar" name="avatar">
                <Upload {...uploadProps}>
                  <Avatar size={64} src={userProfile.avatar} icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
                </Upload>
              </Form.Item>
              <Form.Item label="Nickname" name="nickname"><Input /></Form.Item>
              <Form.Item label="Occupation" name="occupation"><Input /></Form.Item>
              <Form.Item label="Skills" name="skills">
                <Select mode="tags" placeholder="Add skills and press Enter" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit">Update Profile</Button>
              </Form.Item>
            </Form>
          )}
        </Card>

        <Card>
          <Title level={4}>LLM Provider Configurations</Title>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleShowModal()} style={{ marginBottom: 16 }}>
            Add New Config
          </Button>
          <Table columns={columns} dataSource={llmConfigs} rowKey="id" />
        </Card>
      </Space>

      <Modal
        title={editingConfig ? 'Edit LLM Config' : 'Add New LLM Config'}
        open={isModalVisible}
        onOk={handleLlmConfigSave}
        onCancel={() => setIsModalVisible(false)}
        destroyOnClose
      >
        <Form form={llmForm} layout="vertical" name="llm_config_form">
          <Form.Item name="url" label="URL" rules={[{ required: true, message: 'Please input the API URL!' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="apiKey" label="API Key" rules={[{ required: true, message: 'Please input the API Key!' }]}>
            <Input.Password placeholder="Enter your API Key" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProfilePage;
