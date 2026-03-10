import React, { useMemo, useEffect, useState } from 'react';
import { Button, Form, Tag, Space, Upload, FloatButton, Typography, Spin, Tooltip, Mentions } from 'antd';
import { PaperClipOutlined, DownOutlined, CloseCircleFilled, StopOutlined, FileExcelOutlined, UserOutlined, BarChartOutlined, SendOutlined, PartitionOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Attachment } from '../../../types/workbench.types';
import './ChatPanel.css'; // Import a CSS file for animations
import { getPersonaById } from '../../../config/personas';
import { useUserStore } from '../../../status/appStatusManager.ts';
import { userSkillService } from '../../../services/user-skill/userSkillService';
import type { TableSkillConfig } from '../../../services/llm/skills/types';
import { bizKernelService } from '../../../services/biz-kernels/bizKernelService';

interface ChatPanelProps {
  onSendMessage: (message: string) => void;
  isAnalyzing: boolean;
  isInitializing?: boolean;
  onCancel: () => void;
  suggestions?: string[];
  onFileUpload: (file: File) => Promise<boolean | void>;
  attachments: Attachment[];
  onDeleteAttachment: (attachmentId: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  showScrollToBottom: boolean;
  onScrollToBottom: () => void;
  showPersonaPrompt?: boolean;
  onPersonaSetupClick?: () => void;
  onPersonaPromptDismiss?: () => void;
  onPersonaBadgeClick?: () => void;
  initialMessage?: string;
  setInitialMessage?: (msg: string) => void;
  // new: inline persona hint text
  personaHint?: string | null;
  // new: upload hint text (light yellow), near action buttons
  uploadHint?: string | null;
  // new: whether LLM config is ready (from Workbench)
  isLlmReady?: boolean;
  // BI Sidebar control
  showInsightSidebar?: boolean;
  onToggleInsight?: () => void;
  // Flow button control
  onToggleFlow?: () => void;
  // Kernel @ mention
  onKernelSelected?: (kernelName: string) => void;
  kernelFlowHint?: string | null;
}

interface GroupedAttachment {
  fileName: string;
  file: File;
  sheetNames: string[];
  attachmentIds: string[];
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  onSendMessage,
  isAnalyzing,
  isInitializing = false,
  onCancel,
  // suggestions,
  onFileUpload,
  attachments,
  onDeleteAttachment,
  error,
  setError,
  showScrollToBottom,
  onScrollToBottom,
  onPersonaBadgeClick,
  initialMessage,
  setInitialMessage,
  personaHint,
  uploadHint,
  isLlmReady = true,
  showInsightSidebar = false,
  onToggleInsight,
  onToggleFlow,
  onKernelSelected,
  kernelFlowHint,
}) => {
  const [form] = Form.useForm();
  const { userProfile } = useUserStore();
  const [userSkillConfigs, setUserSkillConfigs] = useState<Record<string, TableSkillConfig>>({});

  // Kernel @ mention: options for dropdown + lookup map for kernelName
  const [kernelMentionOptions, setKernelMentionOptions] = useState<{ value: string; label: string }[]>([]);
  const [kernelNameByValue, setKernelNameByValue] = useState<Record<string, string>>({});
  useEffect(() => {
    try {
      const applied = bizKernelService.getAppliedKernels();
      const options = applied.map(k => ({
        value: `${k.category}/${k.displayName}`,
        label: `${k.category}/${k.displayName}`,
      }));
      const nameMap: Record<string, string> = {};
      applied.forEach(k => { nameMap[`${k.category}/${k.displayName}`] = k.name; });
      setKernelMentionOptions(options);
      setKernelNameByValue(nameMap);
    } catch {
      // service not yet initialized — options stay empty
    }
  }, []);

  // Load User Skill configurations and listen for updates
  useEffect(() => {
    const loadUserSkills = async () => {
      try {
        const config = await userSkillService.loadUserSkill();
        if (config) {
          setUserSkillConfigs(config.tables);
          console.log('[ChatPanel] User Skill configs loaded:', Object.keys(config.tables));
        }
      } catch (error) {
        console.error('[ChatPanel] Failed to load user skill configs:', error);
      }
    };
    
    // Initial load
    loadUserSkills();

    // Listen for User Skill configuration updates
    if (typeof chrome !== 'undefined' && chrome.storage?.session?.onChanged) {
      const handleStorageChange = (
        changes: { [key: string]: chrome.storage.StorageChange }
      ) => {
        // Check if userSkillConfig has changed
        if (changes.userSkillConfig) {
          console.log('[ChatPanel] User Skill config updated, reloading');
          loadUserSkills();
        }
      };

      chrome.storage.session.onChanged.addListener(handleStorageChange);

      // Cleanup listener on unmount
      return () => {
        chrome.storage.session.onChanged.removeListener(handleStorageChange);
      };
    }
  }, []);

  // 当 initialMessage 变化时，同步到表单输入框
  useEffect(() => {
    if (initialMessage !== undefined) {
      form.setFieldsValue({ message: initialMessage });
    }
  }, [initialMessage, form]);

  // When the user manually inputs text, if setInitialMessage is present,
  // update the parent state to maintain two-way synchronization (optional).
  // Mentions onChange passes text directly (not an event)
  const handleChangeMessage = (text: string) => {
    if (error) setError(null);
    if (setInitialMessage) setInitialMessage(text);
  };

  const groupedAttachments = useMemo((): GroupedAttachment[] => {
    const groups: Map<string, GroupedAttachment> = new Map();
    attachments.forEach(att => {
      const group = groups.get(att.file.name);
      if (group) {
        group.attachmentIds.push(att.id);
        if (att.sheetName) {
          group.sheetNames.push(att.sheetName);
        }
        if (att.status === 'error') group.status = 'error';
        if (att.status === 'uploading' && group.status !== 'error') group.status = 'uploading';
      } else {
        groups.set(att.file.name, {
          fileName: att.file.name,
          file: att.file,
          sheetNames: att.sheetName ? [att.sheetName] : [],
          attachmentIds: [att.id],
          status: att.status,
          error: att.error,
        });
      }
    });
    return Array.from(groups.values());
  }, [attachments]);

  const handleDeleteGroup = (attachmentIds: string[]) => {
    attachmentIds.forEach(id => onDeleteAttachment(id));
  };

  // Generate User Skill status text for attached tables
  const userSkillStatusText = useMemo(() => {
    if (attachments.length === 0) return null;
    
    const unconfiguredTables: Set<string> = new Set();
    
    attachments.forEach(att => {
      // Use tableName (e.g., "main_table_1") to check configuration
      const config = userSkillConfigs[att.tableName];
      if (!config) {
        // Show fileName for user-friendly display
        unconfiguredTables.add(att.file.name);
      }
    });
    
    // Only show warning for unconfigured tables
    if (unconfiguredTables.size === 0) return null;
    
    return `⚠ Not configured: ${Array.from(unconfiguredTables).join(', ')}`;
  }, [attachments, userSkillConfigs]);

  const handleFinish = (values: { message: string }) => {
    if (!values.message || !values.message.trim()) {
      setError('Please enter a prompt.');
      return;
    }
    setError(null);
    onSendMessage(values.message.trim());
    form.resetFields();
    if (setInitialMessage) setInitialMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isAnalyzing) {
      e.preventDefault();
      form.submit();
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    beforeUpload: async (file) => {
      // File upload is allowed even when LLM isn't configured.
      // LLM is only required for AI analysis.
      return onFileUpload(file);
    },
    showUploadList: false,
    accept: '.csv,.xls,.xlsx',
    disabled: isAnalyzing,
  };

  const defaultPlaceholder = [
    '1. Upload supported formats: Excel, CSV. Max file size: 200MB.',
    '2. Create analysis flow or enter your question or analysis instruction.',
    '3. Press Control+Enter to submit.',
  ].join('\n');
  const placeholderText = isInitializing ? 'Vaultmind 引擎初始化中...' : defaultPlaceholder;

  // Check if user has set a persona (skills[0] exists)
  const hasPersona = !!(userProfile?.skills?.[0]);
  const currentPersonaId = userProfile?.skills?.[0] || 'business_user';
  const currentPersona = getPersonaById(currentPersonaId);

  return (
    <div className="floating-chat-container" style={{
      position: 'absolute',
      bottom: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: '896px',
      zIndex: 10,
    }}>
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px', 
        position: 'relative', 
        maxWidth: '896px', 
        margin: '0 auto', 
        width: '100%',
        background: 'rgba(30, 32, 38, 0.95)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
      <FloatButton
        icon={<DownOutlined />}
        onClick={onScrollToBottom}
        style={{
          display: showScrollToBottom ? 'block' : 'none',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          top: '-50px',
          zIndex: 10,
          width: '40px',
          height: '40px',
          padding: 0,
          lineHeight: '40px'
        }}
      />

      {/* Suggestions */}
      {/*{suggestions && suggestions.length > 0 && (*/}
      {/*  <div style={{*/}
      {/*    padding: '8px 0',*/}
      {/*    overflowX: 'auto',*/}
      {/*  }}*/}
      {/*  className="no-scrollbar">*/}
      {/*    <Typography.Text type="secondary" style={{ marginBottom: '8px', display: 'block' }}>Suggestions:</Typography.Text>*/}
      {/*    <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap' }}>*/}
      {/*      {suggestions.map((s, i) => (*/}
      {/*        <Tag key={i} onClick={() => form.setFieldsValue({ message: s })} style={{ cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>*/}
      {/*          {s}*/}
      {/*        </Tag>*/}
      {/*      ))}*/}
      {/*    </div>*/}
      {/*  </div>*/}
      {/*)}*/}

      {/* Attachments Display */}
      {groupedAttachments.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0' }}>
          {groupedAttachments.map((group) => {
            const tooltipTitle = group.sheetNames.length > 1 ? `Loaded sheets: ${group.sheetNames.join(', ')}` : `Loaded from ${group.fileName}`;
            return (
              <Tooltip title={tooltipTitle} key={group.fileName}>
                <Tag
                  closable
                  onClose={() => handleDeleteGroup(group.attachmentIds)}
                  icon={group.status === 'uploading' ? <Spin size="small" /> : <FileExcelOutlined />}
                  color={group.status === 'error' ? 'error' : 'default'}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'default' }}
                >
                  {group.fileName}
                  {group.status === 'error' && <Tooltip title={group.error}><CloseCircleFilled /></Tooltip>}
                </Tag>
              </Tooltip>
            );
          })}
        </div>
      )}

      <Form form={form} onFinish={handleFinish} layout="vertical">
        <div style={{ position: 'relative' }}>
          <Form.Item name="message" noStyle>
            <Mentions
              prefix="/"
              options={kernelMentionOptions}
              onSelect={(option) => {
                const kernelName = kernelNameByValue[option.value ?? ''];
                if (kernelName) onKernelSelected?.(kernelName);
              }}
              placeholder={placeholderText}
              disabled={isAnalyzing || isInitializing}
              style={{ minHeight: 120, resize: 'none' }}
              className="chat-mentions"
              onKeyDown={handleKeyDown}
              onChange={handleChangeMessage}
            />
          </Form.Item>
          {/* Transparent overlay during initialization: blocks input but keeps UI visible */}
          {isInitializing && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0)', // transparent
                zIndex: 10,
                cursor: 'not-allowed',
                pointerEvents: 'auto',
              }}
            >
              <Space>
                <Spin size="small" />
                <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>Vaultmind 引擎初始化中...</Typography.Text>
              </Space>
            </div>
          )}
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              right: '48px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '4px',
            }}
          >
            {/* Action buttons row */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {/* Enhanced Persona Badge */}
              <Tooltip
                title={
                  hasPersona
                    ? `${currentPersona.displayName} - Expertise: ${currentPersona.expertise.join(', ')}`
                    : '👋 Set your role to get precise analysis suggestions'
                }
                placement="top"
              >
                <Button
                  icon={<UserOutlined />}
                  onClick={onPersonaBadgeClick}
                  className={!hasPersona ? 'persona-button-pulse' : ''}
                  style={{
                    padding: '4px 15px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: !hasPersona ? '2px solid #1890ff' : undefined,
                    boxShadow: !hasPersona ? '0 0 8px rgba(24, 144, 255, 0.5)' : undefined,
                  }}
                >
                  {hasPersona && <span style={{ marginLeft: 4 }}>Skills</span>}
                </Button>
              </Tooltip>
              <Upload {...uploadProps}>
                <Button icon={<PaperClipOutlined />} disabled={isAnalyzing} />
              </Upload>
              {/* Flow Button - show always but disabled when no attachments */}
              {onToggleFlow && (
                  <Tooltip title={
                    attachments.length === 0
                        ? "Please upload a file first"
                        : "Analysis Flow"
                  }>
                    <Button
                        icon={<PartitionOutlined />}
                        disabled={isAnalyzing || attachments.length === 0}
                        onClick={onToggleFlow}
                        type="default"
                    >
                    </Button>
                  </Tooltip>
              )}
              {/* Data Insight Button - show always but disabled when no attachments */}
              {onToggleInsight && (
                <Tooltip title={
                  attachments.length === 0
                    ? "Please upload a file first"
                    : showInsightSidebar ? "Hide Data Insights" : "Show Data Insights"
                }>
                  <Button
                    icon={<BarChartOutlined />}
                    disabled={isAnalyzing || attachments.length === 0}
                    onClick={onToggleInsight}
                    type={showInsightSidebar ? "default" : "default"}
                    style={{
                      background: showInsightSidebar ? 'rgba(255, 255, 255, 0.08)' : undefined,
                      borderColor: showInsightSidebar ? 'rgba(24, 144, 255, 0.5)' : undefined,
                    }}
                  />
                </Tooltip>
              )}
            </div>
            {/* Hints column — unified color, left-aligned, vertically stacked */}
            {(kernelFlowHint || !isLlmReady || userSkillStatusText || uploadHint || personaHint || error) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                {kernelFlowHint && (
                  <Typography.Text style={{ fontSize: 12, color: '#fa8c16' }}>
                    {kernelFlowHint}
                  </Typography.Text>
                )}
                {!isLlmReady && (
                  <Typography.Text style={{ fontSize: 12, color: '#fa8c16' }}>
                    Connect an LLM in Settings to enable analysis.
                  </Typography.Text>
                )}
                {userSkillStatusText && (
                  <Typography.Text style={{ fontSize: 12, color: '#fa8c16' }}>
                    {userSkillStatusText}
                  </Typography.Text>
                )}
                {uploadHint && (
                  <Typography.Text style={{ fontSize: 12, color: '#fa8c16' }}>
                    {uploadHint}
                  </Typography.Text>
                )}
                {personaHint && (
                  <Typography.Text style={{ fontSize: 12, color: '#fa8c16' }}>
                    {personaHint}
                  </Typography.Text>
                )}
                {error && (
                  <Typography.Text type="danger" style={{ fontSize: 12 }}>
                    {error}
                  </Typography.Text>
                )}
              </div>
            )}
          </div>
          {/* Send/Cancel Button - Always visible */}
          <Tooltip title={isAnalyzing ? "Cancel Analysis" : "Send (Ctrl+Enter)"}>
            <Button
              icon={isAnalyzing ? <StopOutlined /> : <SendOutlined />}
              onClick={isAnalyzing ? onCancel : () => form.submit()}
              className={isAnalyzing ? "cancel-button-pulse" : ""}
              disabled={!isAnalyzing && (isInitializing || !isLlmReady)}
              type={isAnalyzing ? "default" : "primary"}
              style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
              }}
            />
          </Tooltip>
        </div>
      </Form>
      </div>
    </div>
  );
};

export default ChatPanel;
