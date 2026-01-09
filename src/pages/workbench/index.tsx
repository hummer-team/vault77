import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Breadcrumb, Layout, theme, Typography, Divider, Spin, App } from 'antd';
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

// --- CRITICAL CHANGE: Remove dotenv imports and usage ---
// import dotenv from 'dotenv';

// // load .env file - THIS IS NOT NEEDED AND WILL NOT WORK IN BROWSER
// dotenv.config({ path: '.env' });

const { Content } = Layout;
const { Title, Paragraph } = Typography;

const promptManager = new PromptManager();

const WorkbenchContent: React.FC = () => {
  const { token: { colorBgContainer, borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { initializeDuckDB, executeQuery, isDBReady } = useDuckDB(iframeRef);
  const { loadFileInDuckDB, isSandboxReady } = useFileParsing(iframeRef);

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [fileName, setFileName] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [thinkingSteps, setThinkingSteps] = useState<any>(null);

  const [llmConfig] = useState<LLMConfig>({
    provider: import.meta.env.VITE_LLM_PROVIDER, // <-- Add this line
    apiKey: import.meta.env.VITE_LLM_API_KEY as string,
    baseURL: import.meta.env.VITE_LLM_API_URL as string,
    modelName: import.meta.env.VITE_LLM_MODEL_NAME as string,
  });
  
  const agentExecutor = useMemo(() => {
    if (!isDBReady || !executeQuery) return null;
    return new AgentExecutor(llmConfig, executeQuery);
  }, [llmConfig, executeQuery, isDBReady]);

  useEffect(() => {
    if (isSandboxReady) {
      initializeDuckDB().catch(err => {
        console.error("DuckDB initialization failed:", err);
        message.error("Failed to initialize data engine.");
      });
    }
  }, [isSandboxReady, initializeDuckDB]);

  useEffect(() => {
    if (isDBReady && isSandboxReady) {
      setUiState('waitingForFile');
    } else {
      setUiState('initializing');
    }
  }, [isDBReady, isSandboxReady]);

  const handleFileUpload: DraggerProps['beforeUpload'] = async (file) => {
    setUiState('parsing'); // Keep UI state for user feedback
    setFileName(file.name);

    try {
      // --- CRITICAL CHANGE 2: Replace old logic with a single call ---
      console.log(`[Workbench] Calling loadFileInDuckDB for file: ${file.name}`);
      await loadFileInDuckDB(file, 'main_table');
      console.log(`[Workbench] loadFileInDuckDB completed for file: ${file.name}`);

      // This part can now run after the file is loaded directly into DuckDB
      const loadedSuggestions = await promptManager.getSuggestions('ecommerce');
      setSuggestions(loadedSuggestions);

      message.success(`${file.name} loaded and ready for analysis.`);
      setUiState('fileLoaded');
    } catch (error: any) {
      console.error(`[Workbench] Error during file upload process:`, error); // Better logging
      message.error(`Failed to process file: ${error.message}`);
      setUiState('waitingForFile');
    }
    return false; // Prevent default upload behavior
  };

  const handleStartAnalysis = async (query: string) => {
    if (!agentExecutor) {
      message.error('Analysis engine is not ready.');
      return;
    }
    setUiState('analyzing');
    setAnalysisResult(null);
    setThinkingSteps(null);
    try {
      const { tool, params, result } = await agentExecutor.execute(query);
      setThinkingSteps({ tool, params });
      setAnalysisResult(result);
      setUiState('resultsReady');
    } catch (error: any) {
      message.error(`Analysis failed: ${error.message}`);
      setUiState('fileLoaded');
    }
  };

  const getLoadingTip = () => {
    if (uiState === 'initializing') return '正在初始化数据引擎...';
    if (uiState === 'parsing') return '正在解析文件...';
    if (uiState === 'analyzing') return 'AI 正在分析中...';
    return '';
  };

  const isSpinning = uiState === 'initializing' || uiState === 'parsing' || uiState === 'analyzing';

  const renderInitialView = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <Dragger 
        {...{ name: "file", multiple: false, beforeUpload: handleFileUpload, showUploadList: false, accept: ".csv,.xls,.xlsx" }} 
        disabled={uiState !== 'waitingForFile'}
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
        <ResultsDisplay state={uiState} fileName={fileName} data={analysisResult} thinkingSteps={thinkingSteps} />
      </Content>
      <Layout.Sider width="100%" style={{ background: 'transparent', padding: '12px' }}>
        <ChatPanel onSendMessage={handleStartAnalysis} isAnalyzing={uiState === 'analyzing'} suggestions={suggestions} />
      </Layout.Sider>
    </Layout>
  );

  return (
    <AppLayout>
      <Sandbox ref={iframeRef} />
      <Breadcrumb items={[{ title: 'Vaultmind' }, { title: 'Workbench' }]} style={{ margin: '16px 0' }} />
      <div style={{ padding: 24, minHeight: 'calc(100vh - 112px)', background: colorBgContainer, borderRadius: borderRadiusLG, display: 'flex', flexDirection: 'column' }}>
        <Spin spinning={isSpinning} tip={getLoadingTip()} size="large" style={{maxHeight: '100%'}}>
          <Title level={2}>智能数据工作台</Title>
          <Paragraph>
            {uiState === 'initializing'
              ? '引擎初始化中...'
              : (uiState === 'waitingForFile'
                ? '欢迎来到 Vaultmind。请上传您的数据文件，然后通过对话开始您的分析之旅。'
                : <>当前分析文件: <strong>{fileName}</strong></>)
            }
          </Paragraph>
          <Divider />
          <div style={{ flex: 1, position: 'relative' }}>
            {uiState === 'fileLoaded' || uiState === 'analyzing' || uiState === 'resultsReady' 
              ? renderAnalysisView() 
              : renderInitialView()
            }
          </div>
        </Spin>
      </div>
    </AppLayout>
  );
};

const Workbench: React.FC = () => (<App><WorkbenchContent /></App>);

export default Workbench;
