import React, { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { App, Button, Form, Tag, Space, Upload, FloatButton, Typography, Spin, Tooltip, Mentions, Popover } from 'antd';
import { PaperClipOutlined, DownOutlined, CloseCircleFilled, StopOutlined, FileExcelOutlined, UserOutlined, BarChartOutlined, SendOutlined, PartitionOutlined, ExclamationCircleOutlined, WarningFilled, CloseOutlined, ClearOutlined } from '@ant-design/icons';
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
  // Attachment selection
  selectedAttachmentIds?: string[];
  onToggleAttachmentSelection?: (ids: string[]) => void;
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
  selectedAttachmentIds = [],
  onToggleAttachmentSelection,
}) => {
  const [form] = Form.useForm();
  const { modal } = App.useApp();
  const { userProfile } = useUserStore();
  const [userSkillConfigs, setUserSkillConfigs] = useState<Record<string, TableSkillConfig>>({});

  // Error bubble state: accumulated error list + transient pill + bubble visibility
  const [errorList, setErrorList] = useState<string[]>([]);
  const [showErrorPill, setShowErrorPill] = useState(false);
  const [showErrorBubble, setShowErrorBubble] = useState(false);
  const [errorBubbleOpen, setErrorBubbleOpen] = useState(false);
  const pillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unified helper to append a message to errorList and trigger pill → bubble sequence
  const triggerErrorBubble = useCallback((msg: string) => {
    setErrorList(prev => {
      if (prev.includes(msg)) return prev; // deduplicate
      return [...prev, msg];
    });
    setShowErrorPill(true);
    setShowErrorBubble(false);
    if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    pillTimerRef.current = setTimeout(() => {
      setShowErrorPill(false);
      setShowErrorBubble(true);
    }, 1200);
  }, []);

  // When a new error arrives via prop, trigger bubble
  useEffect(() => {
    if (!error) return;
    triggerErrorBubble(error);
  }, [error, triggerErrorBubble]);

  const dismissError = useCallback((index: number) => {
    setErrorList(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length === 0) {
        setShowErrorBubble(false);
        setErrorBubbleOpen(false);
        setError(null);
      }
      return next;
    });
  }, [setError]);

  const clearAllErrors = useCallback(() => {
    setErrorList([]);
    setShowErrorBubble(false);
    setErrorBubbleOpen(false);
    setError(null);
  }, [setError]);

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

  // Watch userSkillStatusText — route to bubble instead of inline hints
  const prevSkillStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userSkillStatusText || userSkillStatusText === prevSkillStatusRef.current) return;
    prevSkillStatusRef.current = userSkillStatusText;
    triggerErrorBubble(userSkillStatusText);
  }, [userSkillStatusText, triggerErrorBubble]);

  // Watch attachment upload failures — route each new error to bubble
  const prevAttachmentErrorsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    attachments.forEach(att => {
      if (att.status === 'error' && att.error) {
        const key = `${att.file.name}: ${att.error}`;
        if (!prevAttachmentErrorsRef.current.has(key)) {
          prevAttachmentErrorsRef.current.add(key);
          triggerErrorBubble(key);
        }
      }
    });
  }, [attachments, triggerErrorBubble]);

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
        background: 'var(--vm-bg-card)',
        borderRadius: '12px',
        padding: '16px',
        border: '1px solid var(--vm-border-mid)'
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
            const isSelected = group.attachmentIds.some((id) => selectedAttachmentIds.includes(id));
            const sheetsInfo =
              group.sheetNames.length > 1
                ? `包含工作表: ${group.sheetNames.join(', ')}`
                : group.fileName;
            const tooltipTitle = isSelected
              ? `分析该文件（${sheetsInfo}）`
              : `点击选择分析 — ${sheetsInfo}`;
            return (
              <Tooltip title={tooltipTitle} key={group.fileName}>
                <Tag
                  closable
                  onClose={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    modal.confirm({
                      title: '删除附件',
                      icon: <ExclamationCircleOutlined style={{ color: 'var(--vm-warning-color)' }} />,
                      content: (
                        <div>
                          <p>确定要删除 <strong>{group.fileName}</strong> 吗？</p>
                          <p style={{ color: 'var(--vm-text-secondary)', fontSize: '12px', marginTop: '8px' }}>
                            此操作将同步清理关联的分析流，删除后无法恢复。
                          </p>
                        </div>
                      ),
                      okText: '删除',
                      okType: 'danger',
                      cancelText: '取消',
                      onOk: () => handleDeleteGroup(group.attachmentIds),
                    });
                  }}
                  onClick={() => onToggleAttachmentSelection?.(group.attachmentIds)}
                  icon={group.status === 'uploading' ? <Spin size="small" /> : <FileExcelOutlined />}
                  color={group.status === 'error' ? 'error' : 'default'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    border: isSelected ? '1.5px solid #ff6b35' : '1px solid #434343',
                    boxShadow: isSelected ? '0 0 0 2px var(--vm-primary-light)' : 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
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
                <Typography.Text style={{ color: 'var(--vm-text-primary)' }}>Vaultmind 引擎初始化中...</Typography.Text>
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
                    boxShadow: !hasPersona ? '0 0 8px var(--vm-flow-info-light)' : undefined,
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
                      background: showInsightSidebar ? 'var(--vm-surface-inset)' : undefined,
                      borderColor: showInsightSidebar ? 'var(--vm-flow-info-light)' : undefined,
                    }}
                  />
                </Tooltip>
              )}
            </div>
            {/* Hints column — unified color, left-aligned, vertically stacked */}
            {(kernelFlowHint || !isLlmReady || uploadHint || personaHint) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                {kernelFlowHint && (
                  <Typography.Text style={{ fontSize: 12, color: 'var(--vm-warning-color)' }}>
                    {kernelFlowHint}
                  </Typography.Text>
                )}
                {!isLlmReady && (
                  <Typography.Text style={{ fontSize: 12, color: 'var(--vm-warning-color)' }}>
                    Connect an LLM in Settings to enable analysis.
                  </Typography.Text>
                )}
                {uploadHint && (
                  <Typography.Text style={{ fontSize: 12, color: 'var(--vm-warning-color)' }}>
                    {uploadHint}
                  </Typography.Text>
                )}
                {personaHint && (
                  <Typography.Text style={{ fontSize: 12, color: 'var(--vm-warning-color)' }}>
                    {personaHint}
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

      {/* Error bubble (orange pulse) — anchored bottom-left of the card */}
      {showErrorBubble && errorList.length > 0 && (
        <Popover
          open={errorBubbleOpen}
          onOpenChange={setErrorBubbleOpen}
          placement="topLeft"
          trigger="click"
          overlayStyle={{ maxWidth: 340 }}
          overlayInnerStyle={{
            background: 'var(--vm-bg-base)',
            border: '1px solid var(--vm-warning-color)',
            borderRadius: 10,
            padding: '12px 14px',
          }}
          content={
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Typography.Text style={{ color: 'var(--vm-color-warning)', fontWeight: 600, fontSize: 13 }}>
                  错误信息 ({errorList.length})
                </Typography.Text>
                <Button
                  size="small"
                  type="text"
                  icon={<ClearOutlined />}
                  onClick={clearAllErrors}
                  style={{ color: 'var(--vm-text-secondary)', fontSize: 12 }}
                >
                  清除全部
                </Button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {errorList.map((msg, idx) => (
                  <Tooltip title={msg} placement="topLeft">
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '4px 0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: '2px' }}>
                        <WarningFilled style={{ color: 'var(--vm-warning-color)', fontSize: 13 }} />
                        <span style={{ color: 'var(--vm-error-color)', fontWeight: 600, fontSize: 12, minWidth: '16px', textAlign: 'center' }}>
                          {idx + 1}
                        </span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography.Text
                          style={{
                            color: 'var(--vm-text-primary)',
                            fontSize: 12,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          } as any}
                        >
                          {msg}
                        </Typography.Text>
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={() => dismissError(idx)}
                        style={{ color: 'var(--vm-text-muted)', padding: 0, height: 'auto', flexShrink: 0 }}
                      />
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          }
        >
          <div
            className="error-bubble-pulse"
            style={{
              position: 'absolute',
              bottom: -14,
              left: 16,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--vm-error-color)',
              opacity: 0.25,
              border: '1.5px solid var(--vm-error-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 20,
            }}
          >
            <WarningFilled style={{ color: 'var(--vm-error-color)', fontSize: 13 }} />
          </div>
        </Popover>
      )}
      </div>

      {/* Transient error pill — appears below the card, auto-fades after 1.2s */}
      <div
        className={`error-pill${showErrorPill ? ' error-pill-visible' : ''}`}
        style={{
          position: 'absolute',
          bottom: -32,
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}
      >
        <Typography.Text style={{ fontSize: 12, color: 'var(--vm-error-color)' }}>
          {error}
        </Typography.Text>
      </div>
    </div>
  );
};

export default ChatPanel;
