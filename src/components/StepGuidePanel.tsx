import React, { useMemo, useState } from 'react';
import { Upload, Tag, Tooltip, Spin, Popover } from 'antd';
import type { UploadProps } from 'antd';
import {
  PaperClipOutlined,
  PartitionOutlined,
  BarChartOutlined,
  CheckOutlined,
  FileExcelOutlined,
  CloseCircleFilled,
  PlusOutlined,
} from '@ant-design/icons';
import type { Attachment } from '../types/workbench.types';
import { vmConfirm } from '../utils/vmDialog';
import { bizKernelService } from '../services/biz-kernels/bizKernelService';
import KernelPickerPanel from './flow/KernelPickerPanel';

interface StepGuidePanelProps {
  /** Current active step (1=upload, 2=build flow, 3=insight) */
  currentStep: 1 | 2 | 3;
  attachments: Attachment[];
  selectedAttachmentIds: string[];
  onFileUpload: (file: File) => Promise<boolean | void>;
  onDeleteAttachment: (id: string) => void;
  onToggleAttachmentSelection: (ids: string[]) => void;
  /** Called when user chooses blank flow (no kernel selected) */
  onBuildFlow: () => void;
  /** Called when user picks a kernel from the dropdown; falls back to onBuildFlow if undefined */
  onKernelSelected?: (kernelName: string) => void;
  /** Whether the right insight sidebar is currently open */
  showInsightSidebar?: boolean;
  /** Toggle the right insight sidebar open/close */
  onToggleInsight?: () => void;
}

interface GroupedAttachment {
  fileName: string;
  file: File;
  sheetNames: string[];
  attachmentIds: string[];
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

type StepState = 'completed' | 'active' | 'disabled';

const STEPS = [
  {
    num: 1 as const,
    title: '选择数据源',
    desc: '上传 Excel 或 CSV 文件',
    Icon: PaperClipOutlined,
  },
  {
    num: 2 as const,
    title: '构建分析流',
    desc: '配置数据处理节点',
    Icon: PartitionOutlined,
  },
  {
    num: 3 as const,
    title: '洞察分析',
    desc: '探索数据洞察与决策推演',
    Icon: BarChartOutlined,
  },
];

/** Resolve color tokens based on step state */
function resolveColors(state: StepState): {
  circleColor: string;
  circleBg: string;
  iconColor: string;
  labelColor: string;
} {
  switch (state) {
    case 'completed':
      return {
        circleColor: 'var(--vm-color-success)',
        circleBg: 'rgba(82, 196, 26, 0.1)',
        iconColor: 'var(--vm-color-success)',
        labelColor: 'var(--vm-text-primary)',
      };
    case 'active':
      return {
        circleColor: 'var(--vm-primary)',
        circleBg: 'var(--vm-primary-light)',
        iconColor: 'var(--vm-primary)',
        labelColor: 'var(--vm-text-primary)',
      };
    case 'disabled':
      return {
        // Visible enough to preview upcoming steps (65% brightness), not dead gray
        circleColor: 'var(--vm-border-mid)',
        circleBg: 'transparent',
        iconColor: 'var(--vm-text-secondary)',
        labelColor: 'var(--vm-text-secondary)',
      };
  }
}

const StepGuidePanel: React.FC<StepGuidePanelProps> = ({
  currentStep,
  attachments,
  selectedAttachmentIds,
  onFileUpload,
  onDeleteAttachment,
  onToggleAttachmentSelection,
  onBuildFlow,
  onKernelSelected,
  showInsightSidebar = false,
  onToggleInsight,
}) => {
  const [isCardHovered, setIsCardHovered] = useState(false);

  // True while any attachment is still being parsed — disables the build-flow action
  const isAnyUploading = attachments.some(a => a.status === 'uploading');
  const groupedAttachments = useMemo((): GroupedAttachment[] => {
    const groups: Map<string, GroupedAttachment> = new Map();
    attachments.forEach(att => {
      const group = groups.get(att.file.name);
      if (group) {
        group.attachmentIds.push(att.id);
        if (att.sheetName) group.sheetNames.push(att.sheetName);
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

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    beforeUpload: async (file) => onFileUpload(file),
    showUploadList: false,
    accept: '.csv,.xls,.xlsx',
  };

  const getStepState = (stepNum: number): StepState => {
    if (stepNum < currentStep) return 'completed';
    if (stepNum === currentStep) return 'active';
    return 'disabled';
  };

  /** Returns connector line style based on the state of the step to the left */
  const getConnectorStyle = (rightStepNum: number): React.CSSProperties => {
    const leftState = getStepState(rightStepNum - 1);
    if (leftState === 'completed') {
      return { background: 'var(--vm-primary)', opacity: 0.75 };
    }
    if (leftState === 'active') {
      return {
        background: 'linear-gradient(to right, var(--vm-primary-border), var(--vm-border-subtle))',
      };
    }
    return { background: 'var(--vm-border-subtle)' };
  };

  const handleDeleteGroup = (attachmentIds: string[]) => {
    attachmentIds.forEach(id => onDeleteAttachment(id));
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '100%',
        maxWidth: '896px',
        zIndex: 10,
      }}
    >
      <div
        onMouseEnter={() => setIsCardHovered(true)}
        onMouseLeave={() => setIsCardHovered(false)}
        style={{
          background: 'var(--vm-bg-card)',
          borderRadius: '12px',
          padding: '20px 24px 16px',
          border: isCardHovered
            ? '1px solid var(--vm-primary)'
            : '1px solid var(--vm-border-mid)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          position: 'relative',
          transition: 'border-color 0.25s, box-shadow 0.25s',
          cursor: 'default',
        }}
      >
        {/* Card top-right: insight sidebar toggle — only visible when files are loaded or sidebar is open */}
        {onToggleInsight && (attachments.length > 0 || showInsightSidebar) && (
          <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <Tooltip title={showInsightSidebar ? '隐藏洞察面板' : '打开洞察面板'}>
              <div
                onClick={onToggleInsight}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: showInsightSidebar ? 'var(--vm-primary-light)' : 'transparent',
                  border: showInsightSidebar
                    ? '1px solid var(--vm-primary)'
                    : '1px solid var(--vm-border-subtle)',
                  color: showInsightSidebar ? 'var(--vm-primary)' : 'var(--vm-text-muted)',
                  transition: 'all 0.2s',
                }}
              >
                <BarChartOutlined style={{ fontSize: 13 }} />
              </div>
            </Tooltip>
          </div>
        )}
        {/* Horizontal step columns */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {STEPS.map((step, idx) => {
            const state = getStepState(step.num);
            const colors = resolveColors(state);
            const isDisabled = state === 'disabled';
            const isCompleted = state === 'completed';
            const isActive = state === 'active';

            return (
              <React.Fragment key={step.num}>
                {/* Connector line between columns — color adapts to left step state */}
                {idx > 0 && (
                  <div
                    style={{
                      flex: 1,
                      height: '2px',
                      borderRadius: '1px',
                      margin: '0 8px',
                      marginBottom: '40px',
                      transition: 'background 0.3s',
                      ...getConnectorStyle(step.num),
                    }}
                  />
                )}

                {/* Step column */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    minWidth: '160px',
                    // Disabled: 0.65 (still readable/preview-able) instead of 0.45 (dead gray)
                    opacity: isDisabled ? 0.65 : 1,
                    transition: 'opacity 0.25s',
                    cursor: isDisabled ? 'not-allowed' : 'default',
                  }}
                >
                  {/* Number circle — dashed border for future steps, pulse for active */}
                  <div
                    className={isActive ? 'vm-step-circle-active' : undefined}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      border: `2px ${isDisabled ? 'dashed' : 'solid'} ${colors.circleColor}`,
                      background: colors.circleBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.25s',
                      flexShrink: 0,
                    }}
                  >
                    {isCompleted ? (
                      <CheckOutlined style={{ color: colors.circleColor, fontSize: 16, fontWeight: 700 }} />
                    ) : (
                      <span
                        style={{
                          color: colors.circleColor,
                          fontSize: '18px',
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {step.num}
                      </span>
                    )}
                  </div>

                  {/* Action icon — clickable only when active */}
                  <StepIconButton
                    step={step}
                    state={state}
                    iconColor={colors.iconColor}
                    uploadProps={uploadProps}
                    onBuildFlow={onBuildFlow}
                    onKernelSelected={onKernelSelected}
                    isActive={isActive}
                    isDisabled={isDisabled}
                    isAnyUploading={isAnyUploading}
                  />

                  {/* Title */}
                  <div
                    style={{
                      color: colors.labelColor,
                      fontWeight: 600,
                      fontSize: 13,
                      lineHeight: 1.4,
                      textAlign: 'center',
                      transition: 'color 0.25s',
                    }}
                  >
                    {step.title}
                  </div>

                  {/* Description */}
                  <div
                    style={{
                      color: 'var(--vm-text-secondary)',
                      fontSize: 11,
                      lineHeight: 1.4,
                      textAlign: 'center',
                    }}
                  >
                    {step.desc}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Attachment list — always visible when attachments exist */}
        {groupedAttachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {groupedAttachments.map(group => {
              const isSelected = group.attachmentIds.some(id => selectedAttachmentIds.includes(id));
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
                    onClose={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      vmConfirm({
                        title: '删除附件',
                        content: `确定要删除 ${group.fileName} 吗？此操作将同步清理关联的分析流，删除后无法恢复。`,
                        okText: '删除',
                        cancelText: '取消',
                        type: 'warning',
                        onOk: () => handleDeleteGroup(group.attachmentIds),
                      });
                    }}
                    onClick={() => onToggleAttachmentSelection(group.attachmentIds)}
                    icon={group.status === 'uploading' ? <Spin size="small" /> : <FileExcelOutlined />}
                    color={group.status === 'error' ? 'error' : 'default'}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer',
                      border: isSelected
                        ? '1.5px solid var(--vm-primary)'
                        : '1px solid var(--vm-border-mid)',
                      boxShadow: isSelected ? '0 0 0 2px var(--vm-primary-light)' : 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                  >
                    {group.fileName}
                    {group.status === 'error' && (
                      <Tooltip title={group.error}>
                        <CloseCircleFilled />
                      </Tooltip>
                    )}
                  </Tag>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/** Renders the clickable icon area for each step */
interface StepIconButtonProps {
  step: (typeof STEPS)[number];
  state: StepState;
  iconColor: string;
  uploadProps: UploadProps;
  onBuildFlow: () => void;
  onKernelSelected?: (kernelName: string) => void;
  isActive: boolean;
  isDisabled: boolean;
  /** True when any attachment is still being parsed — disables the step-2 build action */
  isAnyUploading: boolean;
}

const StepIconButton: React.FC<StepIconButtonProps> = ({
  step,
  iconColor,
  uploadProps,
  onBuildFlow,
  onKernelSelected,
  isActive,
  isDisabled,
  isAnyUploading,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const appliedKernels = useMemo(() => bizKernelService.getAppliedKernels(), []);

  // Step 2 should also be non-interactive while attachments are still being parsed
  const step2Blocked = step.num === 2 && isAnyUploading;

  const iconBoxStyle: React.CSSProperties = {
    width: '48px',
    height: '48px',
    borderRadius: '10px',
    border: `1.5px solid ${isActive && !step2Blocked ? 'var(--vm-primary)' : 'var(--vm-border-mid)'}`,
    background: isActive && !step2Blocked ? 'var(--vm-primary-light)' : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    cursor: isActive && !step2Blocked ? 'pointer' : isDisabled || step2Blocked ? 'not-allowed' : 'default',
    pointerEvents: isDisabled ? 'none' : 'auto',
    opacity: step2Blocked ? 0.45 : 1,
  };

  const iconStyle: React.CSSProperties = {
    fontSize: '20px',
    color: iconColor,
    transition: 'color 0.2s',
  };

  // Step 1: always wrap with Upload (active = primary style, completed = allow adding more files)
  if (step.num === 1) {
    if (isDisabled) {
      return (
        <div style={iconBoxStyle}>
          <step.Icon style={iconStyle} />
        </div>
      );
    }
    const tooltipTitle = isActive ? '点击上传 Excel / CSV 文件' : '添加更多文件';
    return (
      <Tooltip title={tooltipTitle}>
        <Upload {...uploadProps}>
          <div className="step-icon-box" style={iconBoxStyle}>
            {isActive ? (
              <step.Icon style={iconStyle} />
            ) : (
              // Completed: show a small "+" overlay to hint that more uploads are allowed
              <div style={{ position: 'relative', display: 'flex' }}>
                <step.Icon style={iconStyle} />
                <PlusOutlined
                  style={{
                    position: 'absolute',
                    bottom: -4,
                    right: -6,
                    fontSize: 10,
                    color: 'var(--vm-primary)',
                    background: 'var(--vm-bg-card)',
                    borderRadius: '50%',
                    padding: 1,
                  }}
                />
              </div>
            )}
          </div>
        </Upload>
      </Tooltip>
    );
  }

  // Step 2: show kernel picker dropdown if kernels are applied, else open blank flow
  if (step.num === 2) {
    if (!isActive) {
      return (
        <div style={iconBoxStyle}>
          <step.Icon style={iconStyle} />
        </div>
      );
    }

    // Blocked while attachments are still parsing
    if (step2Blocked) {
      return (
        <Tooltip title="请等待文件解析完成">
          <div style={iconBoxStyle}>
            <Spin size="small" />
          </div>
        </Tooltip>
      );
    }

    const kernelOptions = appliedKernels;

    // No kernels applied — open blank flow directly
    if (kernelOptions.length === 0 || !onKernelSelected) {
      return (
        <Tooltip title="点击构建分析流">
          <div className="step-icon-box" style={iconBoxStyle} onClick={onBuildFlow}>
            <step.Icon style={iconStyle} />
          </div>
        </Tooltip>
      );
    }

    // Kernels available — show KernelPickerPanel inside a Popover
    return (
      <Popover
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        trigger="click"
        placement="top"
        arrow={false}
        styles={{ content: { padding: 0 }, root: { padding: 0 } }}
        content={
          <KernelPickerPanel
            naked
            kernels={appliedKernels}
            onSelect={(kernelName) => {
              setPickerOpen(false);
              onKernelSelected(kernelName);
            }}
          />
        }
      >
        <Tooltip title="点击选择分析模板">
          <div className="step-icon-box" style={iconBoxStyle}>
            <step.Icon style={iconStyle} />
          </div>
        </Tooltip>
      </Popover>
    );
  }

  // Step 3: no action (permanently disabled)
  return (
    <Tooltip title="完成前两步后解锁">
      <div style={{ ...iconBoxStyle, cursor: 'not-allowed' }}>
        <step.Icon style={iconStyle} />
      </div>
    </Tooltip>
  );
};

export default StepGuidePanel;
