import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Breadcrumb, Layout, theme, Typography, Divider, Spin, Upload, App } from 'antd';
import AppLayout from '../../components/layout/AppLayout';
import { InboxOutlined } from '@ant-design/icons';
import Dragger, { DraggerProps } from 'antd/es/upload/Dragger';
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';
import { PromptManager } from '../../services/llm/PromptManager';
import { AgentExecutor } from '../../services/llm/AgentExecutor';
import { LLMConfig } from '../../services/llm/LLMClient';
import Sandbox from '../../components/layout/Sandbox';
import { useDuckDB } from '../../hooks/useDuckDB';
import { useFileParsing } from '../../hooks/useFileParsing';
import { WorkbenchState } from '../../types/workbench.types';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

const promptManager = new PromptManager();

const WorkbenchContent: React.FC = () => {
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { initializeDuckDB, loadData, executeQuery } = useDuckDB(iframeRef);
  const { parseFileToArrow } = useFileParsing(iframeRef);

  const [state, setState] = useState<WorkbenchState>('initializing');
  const [fileName, setFileName] = useState<string | null>(null);
  const [userRole] = useState('ecommerce');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [thinkingSteps, setThinkingSteps] = useState<any>(null);

  const [llmConfig] = useState<LLMConfig>({
    apiKey: 'sk-a85b9705bed1492495c88422b562f81b',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-turbo',
  });
  
  const agentExecutor = useMemo(() => {
    if (!executeQuery) return null;
    // 最终修正：现在 AgentExecutor 的构造函数接收 executeQuery，编译错误解决
    return new AgentExecutor(llmConfig, executeQuery);
  }, [llmConfig, executeQuery]);

  useEffect(() => {
    initializeDuckDB()
      .then(() => {
        setState('waitingForFile');
      })
      .catch(err => {
        console.error("DuckDB initialization failed:", err);
        message.error("Failed to initialize data engine.");
      });
  }, [initializeDuckDB]);

  const handleFileUpload: DraggerProps['beforeUpload'] = async (file) => {
    const allowedTypes = ['.csv', '.xls', '.xlsx'];
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!allowedTypes.includes(fileExtension)) {
      message.error('Unsupported file type.');
      return Upload.LIST_IGNORE;
    }
    const isLt1G = file.size / 1024 / 1024 / 1024 < 1;
    if (!isLt1G) {
      message.error('File must be smaller than 1GB!');
      return Upload.LIST_IGNORE;
    }

    setState('parsing');
    setFileName(file.name);

    try {
      const arrowBuffer = await parseFileToArrow(file);
      await loadData('main_table', arrowBuffer);
      
      const loadedSuggestions = await promptManager.getSuggestions(userRole);
      setSuggestions(loadedSuggestions);

      message.success(`${file.name} loaded and ready for analysis.`);
      setState('fileLoaded');
    } catch (error: any) {
      message.error(`Failed to process file: ${error.message}`);
      setState('waitingForFile');
    }
    return false;
  };

  const handleStartAnalysis = async (query: string) => {
    if (!agentExecutor) {
      message.error('Analysis engine is not ready.');
      return;
    }
    setState('analyzing');
    setAnalysisResult(null);
    setThinkingSteps(null);
    try {
      const { tool, params, result } = await agentExecutor.execute(query);
      setThinkingSteps({ tool, params });
      setAnalysisResult(result);
      setState('resultsReady');
    } catch (error: any) {
      message.error(`Analysis failed: ${error.message}`);
      setState('fileLoaded');
    }
  };

  const getLoadingTip = () => {
    if (state === 'initializing') return '正在初始化数据引擎...';
    if (state === 'parsing') return '正在解析文件...';
    if (state === 'analyzing') return 'AI 正在分析中...';
    return '';
  };

  const isSpinning = ['initializing', 'parsing', 'analyzing'].includes(state);

  const renderInitialView = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Dragger 
        {...{ name: "file", multiple: false, beforeUpload: handleFileUpload, showUploadList: false, accept: ".csv,.xls,.xlsx" }} 
        disabled={state !== 'waitingForFile'}
        style={{ padding: '48px', maxWidth: 500 }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">点击或拖拽文件到此区域以上传</p>
        <p className="ant-upload-hint">支持 Excel 和 CSV 格式，文件上限 1GB。</p>
      </Dragger>
    </div>
  );

  const renderAnalysisView = () => (
    <Layout style={{ background: 'transparent', height: 'calc(100vh - 200px)' }}>
      <Content style={{ overflow: 'auto', padding: '0 12px' }}>
        <ResultsDisplay state={state} fileName={fileName} data={analysisResult} thinkingSteps={thinkingSteps} />
      </Content>
      <Layout.Sider width="100%" style={{ background: 'transparent', padding: '12px' }}>
        <ChatPanel onSendMessage={handleStartAnalysis} isAnalyzing={state === 'analyzing'} suggestions={suggestions} />
      </Layout.Sider>
    </Layout>
  );

  return (
    <AppLayout>
      <Sandbox ref={iframeRef} />
      <Breadcrumb items={[{ title: 'Vaultmind' }, { title: 'Workbench' }]} style={{ margin: '16px 0' }} />
      <div style={{ padding: 24, minHeight: 'calc(100vh - 112px)', background: colorBgContainer, borderRadius: borderRadiusLG, display: 'flex', flexDirection: 'column' }}>
        <Title level={2}>智能数据工作台</Title>
        <Paragraph>
          {state === 'waitingForFile' 
            ? '欢迎来到 Vaultmind。请上传您的数据文件，然后通过对话开始您的分析之旅。' 
            : (fileName ? <>当前分析文件: <strong>{fileName}</strong></> : '引擎初始化中...')}
        </Paragraph>
        <Divider />
        <div style={{ flex: 1, position: 'relative' }}>
          <Spin spinning={isSpinning} tip={getLoadingTip()} size="large" style={{maxHeight: '100%'}}>
            {state === 'fileLoaded' || state === 'analyzing' || state === 'resultsReady' 
              ? renderAnalysisView() 
              : renderInitialView()
            }
          </Spin>
        </div>
      </div>
    </AppLayout>
  );
};

const Workbench: React.FC = () => (<App><WorkbenchContent /></App>);

export default Workbench;
