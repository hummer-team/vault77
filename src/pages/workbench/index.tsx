import React, { useState, useEffect, useMemo, useRef } from 'react';
import { theme, Spin, App } from 'antd'; // Removed FloatButton
import { DraggerProps } from 'antd/es/upload/Dragger'; // Removed DownOutlined
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';
import { PromptManager } from '../../services/llm/PromptManager';
import { AgentExecutor } from '../../services/llm/AgentExecutor';
import { LLMConfig } from '../../services/llm/LLMClient';
import Sandbox from '../../components/layout/Sandbox';
import { useDuckDB } from '../../hooks/useDuckDB';
import { useFileParsing } from '../../hooks/useFileParsing';
import { WorkbenchState } from '../../types/workbench.types';

interface AnalysisRecord {
  id: string;
  query: string;
  thinkingSteps: { tool: string; params: any, thought?: string } | null;
  result: any;
  status: 'analyzing' | 'resultsReady';
}

const promptManager = new PromptManager();

const Workbench: React.FC = () => {
  const { token: { borderRadiusLG } } = theme.useToken();
  const { message } = App.useApp();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); // Ref for the scrollable content area
  const { initializeDuckDB, executeQuery, isDBReady } = useDuckDB(iframeRef);
  const { loadFileInDuckDB, isSandboxReady } = useFileParsing(iframeRef);

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false); // State for the button

  const [llmConfig] = useState<LLMConfig>({
    provider: import.meta.env.VITE_LLM_PROVIDER as any,
    apiKey: import.meta.env.VITE_LLM_API_KEY as string,
    baseURL: import.meta.env.VITE_LLM_API_URL as string,
    modelName: import.meta.env.VITE_LLM_MODEL_NAME as string,
    mockEnabled: import.meta.env.VITE_LLM_MOCK === 'true',
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
      setUiState('fileLoaded'); 
    } else {
      setUiState('initializing');
    }
  }, [isDBReady, isSandboxReady]);

  // Effect for scroll button visibility
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
      
      console.log(`[ScrollCheck] scrollHeight: ${scrollHeight}, clientHeight: ${clientHeight}, scrollTop: ${scrollTop}, isAtBottom: ${isAtBottom}`);
      
      // Show button if content is scrollable and not at the bottom
      setShowScrollToBottom(scrollHeight > clientHeight && !isAtBottom);
    };

    // Use MutationObserver to detect when new content is added, which may change scrollHeight
    const observer = new MutationObserver(handleScroll);
    observer.observe(content, { childList: true, subtree: true });

    content.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll(); // Call once on mount/update to set initial state

    return () => {
      observer.disconnect();
      content.removeEventListener('scroll', handleScroll);
    };
  }, []); // Run only once on mount

  const handleFileUpload: DraggerProps['beforeUpload'] = async (file) => {
    setUiState('parsing');
    setAnalysisHistory([]);

    try {
      console.log(`[Workbench] Calling loadFileInDuckDB for file: ${file.name}`);
      await loadFileInDuckDB(file, 'main_table');
      console.log(`[Workbench] loadFileInDuckDB completed for file: ${file.name}`);

      const loadedSuggestions = promptManager.getSuggestions('ecommerce');
      setSuggestions(loadedSuggestions);

      message.success(`${file.name} loaded and ready for analysis.`);
      setUiState('fileLoaded');
    } catch (error: any) {
      console.error(`[Workbench] Error during file upload process:`, error);
      message.error(`Failed to process file: ${error.message}`);
      setUiState('fileLoaded'); 
    }
    return false;
  };

  const handleStartAnalysis = async (query: string) => {
    if (!agentExecutor) {
      message.error('Analysis engine is not ready.');
      return;
    }

    const newRecordId = `record-${Date.now()}`;
    const newRecord: AnalysisRecord = {
      id: newRecordId,
      query: query,
      thinkingSteps: null,
      result: null,
      status: 'analyzing',
    };
    setAnalysisHistory(prev => [...prev, newRecord]);
    setUiState('analyzing');

    try {
      const { tool, params, result, thought } = await agentExecutor.execute(query);
      
      setAnalysisHistory(prev => prev.map(rec => 
        rec.id === newRecordId 
          ? { ...rec, status: 'resultsReady', thinkingSteps: { tool, params, thought }, result } 
          : rec
      ));
      
    } catch (error: any) {
      console.error("Analysis failed, updating record with error:", error);
      setAnalysisHistory(prev => prev.map(rec => 
        rec.id === newRecordId 
          ? { ...rec, status: 'resultsReady', result: { error: error.message } } 
          : rec
      ));
    } finally {
      setUiState('fileLoaded');
    }
  };

  const handleScrollToBottom = () => {
    const content = contentRef.current;
    if (content) {
      content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
    }
  };

  const getLoadingTip = () => {
    if (uiState === 'initializing') return '正在初始化数据引擎...';
    if (uiState === 'parsing') return '正在解析文件...';
    return '';
  };

  const isSpinning = uiState === 'initializing' || uiState === 'parsing';

  const renderAnalysisView = () => (
    <div>
      {analysisHistory.map(record => (
        <ResultsDisplay
          key={record.id}
          query={record.query}
          status={record.status}
          data={record.result}
          thinkingSteps={record.thinkingSteps}
        />
      ))}
    </div>
  );

  return (
    <>
      <Sandbox ref={iframeRef} />
      <div style={{ 
        background: 'rgba(38, 38, 40, 0.6)', 
        borderRadius: borderRadiusLG, 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%', // Set height to 100% to constrain children
        position: 'relative',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
      }}>
        
        {isSpinning && (
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.05)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10
          }}>
            <Spin tip={getLoadingTip()} size="large" />
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '24px' }}>
          <div ref={contentRef} style={{ flex: 1, overflow: 'auto' }}> {/* Attach ref here */}
            {renderAnalysisView()}
          </div>
          <div style={{ flexShrink: 0, paddingTop: '12px' }}>
            <ChatPanel 
              onSendMessage={handleStartAnalysis} 
              isAnalyzing={uiState === 'analyzing'} 
              suggestions={suggestions} 
              onFileUpload={handleFileUpload}
              showScrollToBottom={showScrollToBottom} // Pass the state
              onScrollToBottom={handleScrollToBottom} // Pass the handler
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default Workbench;
