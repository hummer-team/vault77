import React, { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import { Spin, App, Typography, Space, Drawer, Modal } from 'antd';
import { 
  CodeOutlined, 
  BarChartOutlined, 
  StarOutlined,
  BulbOutlined,
  SafetyOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import FlowCanvas from '../../components/flow/FlowCanvas';
import ChatPanel from './components/ChatPanel';
import ResultsDisplay from './components/ResultsDisplay';
import { SheetSelector } from './components/SheetSelector';
import { LLMConfig } from '../../services/llm/llmClient.ts';
import Sandbox from '../../components/layout/Sandbox';
import { useDuckDB } from '../../hooks/useDuckDB';
import { useFileManager } from '../../hooks/useFileManager';
import { useTableSchema } from '../../hooks/useTableSchema';
import { useAnomaly } from '../../hooks/useAnomaly'; // Add anomaly detection hook
import { useClustering } from '../../hooks/useClustering'; // Add customer clustering hook
import { DEFAULT_K_VALUE } from '../../constants/clustering.constants'; // Clustering constants
import { WorkbenchState, Attachment } from '../../types/workbench.types';
import { settingsService } from '../../services/settingsService.ts';
import { resolveActiveLlmConfig, isValidLlmConfig } from '../../services/llm/runtimeLlmConfig.ts';
import { inferPersonaFromInput } from '../../utils/personaInferenceUtils.ts';
import { getPersonaById } from '../../config/personas';
import ProfilePage from "../settings/ProfilePage.tsx";
import { getPersonaSuggestions } from '../../config/personaSuggestions';
import { useUserStore } from '../../status/appStatusManager.ts';
import { runAgent } from '../../services/llm/agentRuntime.ts';
import { DuckDBProvider } from '../../contexts/DuckDBContext';
import { bizKernelService } from '../../services/biz-kernels/bizKernelService';
import { operatorBindingService } from '../../services/flow/operatorBindingService';
import type { FlowSummary } from '../../services/flow/flowSummary';
import { TOKEN } from '../../theme';
import './workbench.css';

const InsightPage = React.lazy(() => import('../insight'));

// Configuration
const MAX_FILES = Number(import.meta.env.VITE_MAX_FILES ?? 1); // Default to 1
// Cap analysis history to prevent unbounded memory growth (each record holds full query result data)
const MAX_HISTORY_RECORDS = 20;

interface AnalysisRecord {
  id: string;
  query: string;
  thinkingSteps: { 
    tool: string; 
    params: any; 
    thought?: string;
    // M10.5: Skill execution metadata
    skillName?: string;
    industry?: string;
    userSkillApplied?: boolean;
    userSkillDigestChars?: number;
    activeTable?: string;
    // Flow builder: human-readable summary
    flowSummary?: FlowSummary;
    // M10.5 Phase 3: Effective settings
    effectiveSettings?: {
      tableName: string;
      fieldMapping?: {
        timeColumn?: string;
        amountColumn?: string;
        orderIdColumn?: string;
        userIdColumn?: string;
      };
      defaultFilters?: Array<{
        column: string;
        op: string;
        value: unknown;
      }>;
      metrics?: Record<string, {
        label: string;
        aggregation: string;
        column?: string;
      }>;
    };
  } | null;
  data: any[] | { error: string } | null; // Changed from 'result' to 'data' and explicitly typed as array of any, now includes error object
  schema: any[] | null; // Added schema to the record
  status: 'analyzing' | 'resultsReady';
  llmDurationMs?: number;
  queryDurationMs?: number;
  // Snapshot of attachments at the time of this query
  attachmentsSnapshot?: Attachment[];
}

interface WorkbenchProps {
  isFeedbackDrawerOpen: boolean;
  setIsFeedbackDrawerOpen: (isOpen: boolean) => void;
  onNavigateToInsight?: (tableName: string) => void;
  onDuckDBReady?: (executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>, isReady: boolean) => void;
}

const InitialWelcomeView: React.FC = () => (
  <div style={{ 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    height: '100%', 
    overflowY: 'auto',
    padding: '40px 24px 24px 24px',
    gap: '24px'
  }}>
    {/* Logo Section - Simple Large Logo */}
    <div style={{ marginBottom: '8px' }}>
      <img 
        src="/icons/icon-512.png" 
        alt="Vaultmind Logo" 
        style={{ width: 256, height: 256 }} 
      />
    </div>

    {/* Title Section */}
    <div style={{ textAlign: 'center', maxWidth: 900 }}>
      <Typography.Title 
        level={2} 
        style={{ 
          margin: 0, 
          fontSize: 40,
          fontWeight: 800,
          lineHeight: 1.2,
          color: 'var(--vm-text-primary)'
        }}
      >
        <span style={{
          fontFamily: 'monospace', 
          color: 'var(--vm-primary)', 
          fontStyle: 'italic',
          textTransform: 'uppercase',
          padding: '0 8px'
        }} className="neon-glow-text">You Private BI</span> Buddy.
      </Typography.Title>
      <Typography.Text style={{ 
        fontSize: 12, 
        color: 'var(--vm-text-muted)', 
        fontWeight: 600,
        letterSpacing: '0.3em',
        textTransform: 'uppercase',
        marginTop: 12,
        display: 'block'
      }}>
        Analysis Without Boundaries.
      </Typography.Text>
    </div>

    {/* Capability Tags */}
    <Space size={[10, 10]} wrap style={{ justifyContent: 'center', maxWidth: 800 }}>
      <span className="capability-tag">
        <SafetyOutlined style={{ color: 'var(--vm-primary)', fontSize: 14 }} /> Security
      </span>
      <span className="capability-tag">
        <ThunderboltOutlined style={{ color: 'var(--vm-primary)', fontSize: 14 }} /> High Performance
      </span>
      <span className="capability-tag">
        <CodeOutlined style={{ color: 'var(--vm-primary)', fontSize: 14 }} /> Excel &amp; CSV Analysis
      </span>
      <span className="capability-tag">
        <BarChartOutlined style={{ color: 'var(--vm-primary)', fontSize: 14 }} /> Smart Charting
      </span>
      <span className="capability-tag">
        <BulbOutlined style={{ color: 'var(--vm-primary)', fontSize: 14 }} /> Data Insight
      </span>
      <span className="capability-tag">
        <StarOutlined style={{ color: 'var(--vm-primary)', fontSize: 14 }} /> AI Report Gen
      </span>
    </Space>
  </div>
);

const Workbench: React.FC<WorkbenchProps> = ({ setIsFeedbackDrawerOpen, onDuckDBReady }) => {
  const { message, notification } = App.useApp();
  const abortControllerRef = useRef<AbortController | null>(null);
  // timer for persona hint auto clear
  const personaHintTimerRef = useRef<number | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { initializeDuckDB, executeQuery, isDBReady, dropTable } = useDuckDB(iframeRef);
  
  // Initialize anomaly detection hook (depends on executeQuery)
  const anomalyDetection = useAnomaly(executeQuery);
  
  // Initialize customer clustering hook (depends on executeQuery)
  const clusteringAnalysis = useClustering(executeQuery);

  // Notify parent when DuckDB is ready
  useEffect(() => {
    if (isDBReady && onDuckDBReady) {
      console.log('[Workbench] DuckDB ready, notifying parent with executeQuery');
      onDuckDBReady(executeQuery, isDBReady);
    }
  }, [isDBReady, executeQuery, onDuckDBReady]);

  const { userProfile } = useUserStore();

  const [uiState, setUiState] = useState<WorkbenchState>('initializing');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);

  const [chatError, setChatError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisRecord[]>([]);

  // Append a new record and evict the oldest ones when the cap is exceeded.
  // Prevents unbounded memory growth since each record holds full query result data.
  const appendAnalysisRecord = useCallback((record: AnalysisRecord) => {
    setAnalysisHistory(prev => {
      const next = [...prev, record];
      return next.length > MAX_HISTORY_RECORDS ? next.slice(next.length - MAX_HISTORY_RECORDS) : next;
    });
  }, []);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [profileDrawerVisible, setProfileDrawerVisible] = useState(false);


  // BI Sidebar state
  const [showInsightSidebar, setShowInsightSidebar] = useState(false);
  const [insightTableName, setInsightTableName] = useState<string | null>(null);
  // Flow Modal state
  const [showFlowModal, setShowFlowModal] = useState(false);
  // Kernel @ mention: pending template save + hint text
  const [pendingKernelTemplate, setPendingKernelTemplate] = useState<string | null>(null);
  const [kernelFlowHint, setKernelFlowHint] = useState<string | null>(null);

  // Remove deleted attachments from the selection when attachments change.
  useEffect(() => {
    setSelectedAttachmentIds((prev) => {
      const currentIds = new Set(attachments.map((a) => a.id));
      return prev.filter((id) => currentIds.has(id));
    });
  }, [attachments]);

  // Toggle selection of a group of attachment IDs (all-or-none per group).
  const handleToggleAttachmentSelection = useCallback((ids: string[]) => {
    setSelectedAttachmentIds((prev) => {
      const allSelected = ids.every((id) => prev.includes(id));
      if (allSelected) {
        return prev.filter((id) => !ids.includes(id));
      }
      const merged = [...prev];
      ids.forEach((id) => { if (!merged.includes(id)) merged.push(id); });
      return merged;
    });
  }, []);

  // Table names corresponding to selected attachments — passed to FlowCanvas / DataSourceNode.
  const allowedTableNames = useMemo(
    () => attachments.filter((a) => selectedAttachmentIds.includes(a.id)).map((a) => a.tableName),
    [attachments, selectedAttachmentIds]
  );
  // 新增：当前输入框内容，用于“编辑”时回填
  const [sidebarAnimationState, setSidebarAnimationState] = useState<'entering' | 'visible' | 'exiting' | 'hidden'>('hidden');
  const [sidebarWidth, setSidebarWidth] = useState(50); // percentage (50% default)
  const [isDragging, setIsDragging] = useState(false);
  const [currentInput, setCurrentInput] = useState<string>('');
  // persona hint message to show near ChatPanel
  const [personaHint, setPersonaHint] = useState<string | null>(null);

  // File size limits (Chrome extension runs in constrained memory environment)
  const MAX_SINGLE_FILE_BYTES = 2000 * 1024 * 1024;
  const MAX_TOTAL_FILES_BYTES = 2000 * 1024 * 1024;
  const [uploadHint, setUploadHint] = useState<string | null>(null);
  const uploadHintTimerRef = useRef<number | null>(null);

  const showUploadHint = (msg: string) => {
    setUploadHint(msg);
    if (uploadHintTimerRef.current !== null) {
      window.clearTimeout(uploadHintTimerRef.current);
    }
    uploadHintTimerRef.current = window.setTimeout(() => {
      setUploadHint(null);
      uploadHintTimerRef.current = null;
    }, 4500);
  };

  const handlePersonaBadgeClick = () => {
    setProfileDrawerVisible(true);
  };

  const handleProfileDrawerClose = () => {
    setProfileDrawerVisible(false);
    // Recheck if persona has been set
    if (settingsService.hasSetPersona()) {
      const personaId = settingsService.getUserPersona();
      const personaSuggestions = getPersonaSuggestions(personaId || 'business_user');
      setSuggestions(personaSuggestions);
    }
  };

  // Toggle Insight Sidebar
  const toggleInsightSidebar = () => {
    // If no table data, try to trigger insight generation
    if (!showInsightSidebar && !insightTableName && attachments.length > 0) {
      // Get first attachment's table name
      const firstTable = attachments[0].tableName;
      if (firstTable) {
        handleShowInsight(firstTable);
        return;
      }
    }
    
    if (showInsightSidebar) {
      // Start exit animation
      setSidebarAnimationState('exiting');
      setTimeout(() => {
        setShowInsightSidebar(false);
        setSidebarAnimationState('hidden');
      }, 350); // Match CSS transition duration
    } else {
      // Start entry animation
      setShowInsightSidebar(true);
      setSidebarAnimationState('entering');
      // Trigger reflow to ensure entering state is applied
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setSidebarAnimationState('visible');
        });
      });
    }
  };

  // Handle navigation to insight from attachments
  const handleShowInsight = useCallback((tableName: string) => {
    setInsightTableName(tableName);
    setShowInsightSidebar(true);
    setSidebarAnimationState('entering');
    // Trigger reflow to ensure entering state is applied
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setSidebarAnimationState('visible');
      });
    });
  }, []);

  // Callback for when no valid columns found (stabilized with useCallback)
  const handleNoValidColumns = useCallback(() => {
    console.log('[Workbench] No valid columns, closing sidebar');
    setShowInsightSidebar(false);
  }, []);

  // Handle anomaly threshold change from InsightPage
  const handleAnomalyThresholdChange = useCallback(async (newThreshold: number) => {
    if (!insightTableName || !isDBReady) return;

    console.log('[Workbench] Re-detecting anomalies with new threshold:', newThreshold);
    
    try {
      await anomalyDetection.detectAnomalies({
        tableName: insightTableName,
        orderIdColumn: '', // Auto-infer
        featureColumns: [], // Auto-infer
        threshold: newThreshold,
      });
      console.log('[Workbench] Anomaly re-detection completed');
    } catch (error) {
      console.error('[Workbench] Anomaly re-detection failed:', error);
      message.error('Failed to re-detect anomalies with new threshold');
    }
  }, [insightTableName, isDBReady, anomalyDetection]);

  // Handle K value change from InsightPage (re-run clustering)
  const handleKValueChange = useCallback(async (newK: number) => {
    if (!insightTableName || !isDBReady) return;

    console.log('[Workbench] Re-running clustering with new K value:', newK);
    
    try {
      await clusteringAnalysis.performClustering({
        tableName: insightTableName,
        customerIdColumn: '', // Auto-detect
        orderDateColumn: '', // Auto-detect
        orderAmountColumn: '', // Auto-detect
        nClusters: newK,
      });
      console.log('[Workbench] Clustering re-run completed');
    } catch (error) {
      console.error('[Workbench] Clustering re-run failed:', error);
      message.error('Failed to re-run clustering with new K value');
    }
  }, [insightTableName, isDBReady, clusteringAnalysis]);

  // Auto-trigger clustering when Insight sidebar opens (async, non-blocking)
  React.useEffect(() => {
    if (!insightTableName || !isDBReady || !showInsightSidebar) return;

    // Only run if clustering hasn't been executed yet
    if (clusteringAnalysis.result === null && !clusteringAnalysis.isClustering && !clusteringAnalysis.error) {
      console.log('[Workbench] Auto-triggering clustering analysis for table:', insightTableName);
      
      // Async trigger (non-blocking UI)
      clusteringAnalysis.performClustering({
        tableName: insightTableName,
        customerIdColumn: '', // Auto-detect
        orderDateColumn: '', // Auto-detect
        orderAmountColumn: '', // Auto-detect
        nClusters: DEFAULT_K_VALUE,
      }).catch((error) => {
        console.error('[Workbench] Auto-clustering failed:', error);
        // Don't show error message here - InsightPage will handle it with retry button
      });
    }
  }, [insightTableName, isDBReady, showInsightSidebar, clusteringAnalysis]);

  // Handle download anomalies from InsightPage
  const handleDownloadAnomalies = useCallback(async (orderIds: string[]): Promise<any[]> => {
    if (!insightTableName || !isDBReady || orderIds.length === 0) {
      throw new Error('Database not ready or no order IDs provided');
    }

    console.log('[Workbench] Fetching full order data for download:', orderIds.length);

    // Build SQL to fetch full order data
    const orderIdList = orderIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    
    // Use anomaly metadata to get correct order ID column name
    const orderIdColumn = anomalyDetection.result?.metadata?.orderIdColumn || 'order_id';
    const sql = `SELECT * FROM ${insightTableName} WHERE ${orderIdColumn} IN (${orderIdList})`;

    const result = await executeQuery(sql);
    return result.data;
  }, [insightTableName, isDBReady, executeQuery, anomalyDetection.result?.metadata]);

  // Handle view anomalies in analysis panel from InsightPage
  const handleViewAnomalies = useCallback(async (orderIds: string[], tableName: string) => {
    if (!isDBReady || orderIds.length === 0) {
      throw new Error('Database not ready or no order IDs provided');
    }

    console.log('[Workbench] Viewing anomalies in analysis panel:', orderIds.length);

    // Limit to prevent timeout
    const limitedOrderIds = orderIds.slice(0, 10000);
    if (orderIds.length > 10000) {
      message.warning(`Showing top 10,000 out of ${orderIds.length} anomalies`);
    }

    // Build SQL to fetch full order data
    const orderIdList = limitedOrderIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',');
    
    // Use anomaly metadata to get correct order ID column name
    const orderIdColumn = anomalyDetection.result?.metadata?.orderIdColumn || 'order_id';
    const sql = `SELECT * FROM ${tableName} WHERE ${orderIdColumn} IN (${orderIdList})`;

    // Execute query
    const startTime = performance.now();
    const result = await executeQuery(sql);
    const queryDuration = performance.now() - startTime;

    // Create a new analysis record (similar to SQL query result)
    const newRecord: AnalysisRecord = {
      id: `anomaly-view-${Date.now()}`,
      query: `View ${limitedOrderIds.length} Anomalous Orders`,
      thinkingSteps: {
        tool: 'sql_query_tool',
        params: { query: sql },
        thought: `Filtered ${limitedOrderIds.length} anomalous orders from table ${tableName}`,
      },
      data: result.data,
      schema: result.schema,
      status: 'resultsReady',
      queryDurationMs: queryDuration,
      attachmentsSnapshot: attachments,
    };

    // Add to analysis history
    appendAnalysisRecord(newRecord);
    
    // Auto-scroll to bottom to show new result
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    }, 100);
  }, [isDBReady, executeQuery, attachments, anomalyDetection.result?.metadata, appendAnalysisRecord]);

  // Handle Flow SQL ready - execute and display results
  const handleFlowSqlReady = useCallback(async (sql: string, flowSummary?: FlowSummary) => {
    console.log('[Workbench] Flow SQL validated, executing query:', sql);
    
    // Close Flow Modal
    setShowFlowModal(false);

    // Save as kernel template if a kernel was pending
    if (pendingKernelTemplate) {
      bizKernelService.saveFlowTemplate(pendingKernelTemplate, sql);
      // Persist the operator → file binding so we can detect file changes next time.
      await operatorBindingService.saveBinding(
        pendingKernelTemplate,
        selectedAttachmentIds,
        allowedTableNames
      );
      setPendingKernelTemplate(null);
      setKernelFlowHint(null);
    }

    if (!isDBReady) {
      message.error('Database not ready');
      return;
    }

    try {
      // Execute SQL query
      const startTime = performance.now();
      const result = await executeQuery(sql);
      const queryDuration = performance.now() - startTime;

      console.log('[Workbench] Flow query executed, rows:', result.data.length);

      // Create analysis record (similar to handleViewAnomalies)
      const newRecord: AnalysisRecord = {
        id: `flow-${Date.now()}`,
        query: 'Flow Analysis Query',
        thinkingSteps: {
          tool: 'flow_builder',
          params: { query: sql },
          thought: 'Built query using visual flow editor',
          flowSummary,
        },
        data: result.data,
        schema: result.schema,
        status: 'resultsReady',
        queryDurationMs: queryDuration,
        attachmentsSnapshot: attachments,
      };

      // Add to analysis history
      appendAnalysisRecord(newRecord);

      // Auto-scroll to bottom to show new result
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      }, 100);
    } catch (error) {
      console.error('[Workbench] Flow query execution failed:', error);
      // message.error(`Query execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [isDBReady, executeQuery, attachments, appendAnalysisRecord, pendingKernelTemplate, selectedAttachmentIds, allowedTableNames]);

  // Handle kernel selected via @ mention in ChatPanel
  const handleKernelSelected = useCallback(async (kernelName: string) => {
    // Check if the files associated with the last-built flow have changed.
    const binding = await operatorBindingService.getBinding(kernelName);
    if (binding) {
      const currentTableNames = [...allowedTableNames].sort();
      const boundTableNames = [...binding.tableNames].sort();
      const filesChanged =
        currentTableNames.length !== boundTableNames.length ||
        currentTableNames.some((n, i) => n !== boundTableNames[i]);
      if (filesChanged) {
        bizKernelService.clearFlowTemplate(kernelName);
        await operatorBindingService.clearBinding(kernelName);
        setKernelFlowHint('检测到文件变更，已清空原分析流，请重新构建');
        setPendingKernelTemplate(kernelName);
        setTimeout(() => setShowFlowModal(true), 200);
        return;
      }
    }

    // Always open the canvas regardless of whether a template already exists.
    // Show a build hint only when no template is saved yet.
    if (!bizKernelService.hasFlowTemplate(kernelName)) {
      setKernelFlowHint('由于你选择的算子未构建模板，请先构建模板');
    } else {
      setKernelFlowHint(null);
    }
    setPendingKernelTemplate(kernelName);
    setTimeout(() => setShowFlowModal(true), 200);
  }, [allowedTableNames]);

  // Handle view customers from InsightPage
  const handleViewCustomers = useCallback(async (customerIds: string[], tableName: string) => {
    if (!isDBReady || customerIds.length === 0) {
      throw new Error('Database not ready or no customer IDs provided');
    }

    console.log('[Workbench] Viewing customers RFM analysis:', customerIds.length);

    // Use clustering result data directly (customer-level RFM)
    if (!clusteringAnalysis.result) {
      throw new Error('Clustering result not available');
    }

    // Transform clustering data to table format with cluster labels
    const rfmData = clusteringAnalysis.result.customers.map(customer => {
      const cluster = clusteringAnalysis.result!.clusters.find(
        c => c.clusterId === customer.clusterId
      );
      
      return {
        customer_id: customer.customerId,
        cluster_id: customer.clusterId,
        cluster_label: cluster?.label || `Cluster ${customer.clusterId}`,
        recency_days: customer.recency,
        frequency_orders: customer.frequency,
        monetary_amount: customer.monetary,
        avg_order_value: customer.aov,
        churn_risk: customer.churnRisk,
      };
    });

    console.log('[Workbench] Built RFM customer records:', rfmData.length);

    // Create schema for ResultsDisplay
    const schema = [
      { name: 'customer_id', type: 'String' },
      { name: 'cluster_id', type: 'Int32' },
      { name: 'cluster_label', type: 'String' },
      { name: 'recency_days', type: 'Double' },
      { name: 'frequency_orders', type: 'Double' },
      { name: 'monetary_amount', type: 'Double' },
      { name: 'avg_order_value', type: 'Double' },
      { name: 'churn_risk', type: 'Double' },
    ];

    // Create a new analysis record
    const newRecord: AnalysisRecord = {
      id: `customer-rfm-${Date.now()}`,
      query: `View ${rfmData.length} Customers' RFM Analysis`,
      thinkingSteps: {
        tool: 'clustering_analysis',
        params: { table: tableName, nClusters: clusteringAnalysis.result.metadata.nClusters },
        thought: `Displaying RFM (Recency, Frequency, Monetary) analysis for ${rfmData.length} customers with cluster assignments`,
      },
      data: rfmData,
      schema: schema,
      status: 'resultsReady',
      queryDurationMs: 0, // No query, data already in memory
      attachmentsSnapshot: attachments,
    };

    // Add to analysis history
    appendAnalysisRecord(newRecord);
    
    // Auto-scroll to bottom to show new result
    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    }, 100);
  }, [isDBReady, attachments, clusteringAnalysis.result, appendAnalysisRecord]);

  // Draggable divider handlers
  const tempWidthRef = useRef<number>(sidebarWidth);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const sidebarSectionRef = useRef<HTMLDivElement>(null);

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    tempWidthRef.current = sidebarWidth;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.workbench-container') as HTMLElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const newWidth = ((containerRect.right - e.clientX) / containerRect.width) * 100;
      
      // Constrain between 20% and 70%
      const constrainedWidth = Math.min(Math.max(newWidth, 20), 70);
      tempWidthRef.current = constrainedWidth;

      // Directly update DOM styles without triggering React re-render
      const chatSection = chatSectionRef.current;
      const sidebarSection = sidebarSectionRef.current;
      
      if (chatSection && sidebarSection) {
        chatSection.style.flex = `1 1 ${100 - constrainedWidth}%`;
        sidebarSection.style.flex = `0 0 ${constrainedWidth}%`;
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Only update React state once when drag ends
      setSidebarWidth(tempWidthRef.current);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Trigger chart resize after drag ends
  useEffect(() => {
    if (!isDragging && showInsightSidebar) {
      // Trigger window resize event to make ECharts redraw
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 50);
    }
  }, [isDragging, showInsightSidebar]);

  // Table schema caching hook (self-contained, no need to pass getTableSchema)
  const { cacheTableSchema, removeTableSchemaFromCache } = useTableSchema(iframeRef);

  /**
   * Persist attachments metadata to chrome.storage.session
   * Note: File objects are not serializable, so we only store metadata
   */
  const persistAttachments = async (attachmentList: Attachment[]): Promise<void> => {
    try {
      const serializable = attachmentList.map(att => ({
        id: att.id,
        fileName: att.file?.name || 'unknown',
        tableName: att.tableName,
        status: att.status,
      }));
      await chrome.storage.session.set({ attachments: serializable });
      console.log('[Workbench] Persisted attachments:', serializable.length);
    } catch (error) {
      console.error('[Workbench] Failed to persist attachments:', error);
    }
  };

  // Initialize suggestions on component mount so users see tips immediately
  useEffect(() => {
    try {
      // Get persona from user profile skills (first skill) or fallback to business_user
      const profilePersonaId = userProfile?.skills?.[0];
      const personaId = profilePersonaId || 'business_user';

      const initial = getPersonaSuggestions(personaId);
      if (initial && initial.length > 0) setSuggestions(initial);
    } catch (e) {
      console.warn('[Workbench] Failed to load initial suggestions:', e);
    }
  }, [userProfile]);

  // State for multi-sheet handling
  const [sheetsToSelect, setSheetsToSelect] = useState<string[] | null>(null);
  const [fileToLoad, setFileToLoad] = useState<File | null>(null);

  // File manager hook (combines parsing + upload business logic)
  const {
    isSandboxReady,
    handleFileUpload,
    handleLoadSheets: handleLoadSheetsBase,
    handleDeleteAttachment,
  } = useFileManager({
    iframeRef,
    attachments,
    setAttachments,
    userProfile,
    setUiState: (state: string) => setUiState(state as WorkbenchState),
    setChatError,
    setFileToLoad,
    setSheetsToSelect,
    setSuggestions,
    dropTable: async (tableName: string) => { await dropTable(tableName); },
    cacheTableSchema,
    removeTableSchemaFromCache,
    persistAttachments,
    showUploadHint,
    MAX_FILES,
    MAX_SINGLE_FILE_BYTES,
    MAX_TOTAL_FILES_BYTES,
    analysisHistory,
    onFilesLoaded: (attachmentIds: string[]) => {
      // Auto-select the batch of attachments that just finished uploading.
      setSelectedAttachmentIds(attachmentIds);
    },
    onFileLoaded: (tableName: string) => {
      // Auto-show insight sidebar after file loaded
      console.log('[Workbench] Auto-showing insight for table:', tableName);
      handleShowInsight(tableName);
      
      // Auto-trigger anomaly detection (async, non-blocking)
      (async () => {
        try {
          const settings = await settingsService.getAnomalyDetectionSettings();
          if (settings.autoRun && isDBReady) {
            console.log('[Workbench] Auto-triggering anomaly detection for:', tableName);
            await anomalyDetection.detectAnomalies({
              tableName,
              orderIdColumn: '', // Auto-infer
              featureColumns: [], // Auto-infer
              threshold: settings.threshold, // Use default threshold from settings
            });
            console.log('[Workbench] Anomaly detection completed');
          }
        } catch (error) {
          console.error('[Workbench] Anomaly detection failed:', error);
          // Non-blocking: don't show error to user, just log
        }
      })();
    },
  });

  const handleDeleteAttachmentWithCleanup = useCallback(async (attachmentId: string) => {
    // 1. Find all operator bindings that reference this attachment
    const allBindings = await operatorBindingService.getAllBindings();
    const affectedKernels = Object.values(allBindings)
      .filter((b) => b.attachmentIds.includes(attachmentId))
      .map((b) => b.kernelName);

    // 2. Delete the attachment (drops DuckDB table, cleans schema cache, updates state)
    try {
      await handleDeleteAttachment(attachmentId);
    } finally {
      // 3. Clear flow templates for affected kernels (always runs, even on error)
      for (const kernelName of affectedKernels) {
        bizKernelService.clearFlowTemplate(kernelName);
        await operatorBindingService.clearBinding(kernelName);
      }

      // 4. Notify user if any templates were cleared
      if (affectedKernels.length > 0) {
        notification.warning({
          message: '分析流已自动清理',
          description: `已清理与该附件关联的 ${affectedKernels.length} 个分析流模板，如需使用请重新构建。`,
          placement: 'topRight',
          duration: 5,
        });
      }
    }
  }, [handleDeleteAttachment]);

  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => ({
    provider: import.meta.env.VITE_LLM_PROVIDER as any,
    apiKey: import.meta.env.VITE_LLM_API_KEY as string,
    baseURL: import.meta.env.VITE_LLM_API_URL as string,
    modelName: import.meta.env.VITE_LLM_MODEL_NAME as string,
    mockEnabled: import.meta.env.VITE_LLM_MOCK === 'true',
  }));

  const [isLlmReady, setIsLlmReady] = useState<boolean>(isValidLlmConfig(llmConfig));

  useEffect(() => {
    let isMounted = true;
    const refresh = async () => {
      try {
        const { config, isReady } = await resolveActiveLlmConfig();
        if (!isMounted || !config) return;
        setLlmConfig(config);
        setIsLlmReady(isReady);
      } catch (error) {
        console.error('[Workbench] Failed to resolve active LLM config:', error);
        if (!isMounted) return;
        setIsLlmReady(false);
      }
    };

    // initial load
    refresh();
    // subscribe changes
    const unsubscribe = settingsService.subscribeLlmConfigChanges(() => {
      refresh();
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const ensureLlmConfigured = (): boolean => {
    if (isLlmReady) return true;
    const hint = 'To enable AI analysis, please connect an LLM in Settings first.';
    showUploadHint(hint);
    setChatError(hint);
    return false;
  };

  useEffect(() => {
    if (isSandboxReady) {
      initializeDuckDB().catch((err) => {
        console.error('DuckDB initialization failed:', err);
        setUiState('error');
      });
    }
  }, [isSandboxReady, initializeDuckDB]);

  useEffect(() => {
    if (isDBReady && isSandboxReady) {
      if (sheetsToSelect) {
        setUiState('selectingSheet');
      } else {
        setUiState(attachments.length > 0 ? 'fileLoaded' : 'waitingForFile');
      }
    } else {
      setUiState('initializing');
    }
  }, [isDBReady, isSandboxReady, attachments.length, sheetsToSelect]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = content;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
      setShowScrollToBottom(scrollHeight > clientHeight && !isAtBottom);
    };

    const observer = new MutationObserver(handleScroll);
    observer.observe(content, { childList: true, subtree: true });

    content.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      content.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // clear persona hint timer on unmount
  useEffect(() => {
    return () => {
      if (personaHintTimerRef.current !== null) {
        window.clearTimeout(personaHintTimerRef.current);
        personaHintTimerRef.current = null;
      }
    };
  }, []);

  // Wrapper for handleLoadSheets to match existing signature
  const handleLoadSheets = async (selectedSheets: string[]) => {
    await handleLoadSheetsBase(fileToLoad, selectedSheets);
  };

  const handleStartAnalysis = async (query: string) => {
    if (!ensureLlmConfigured()) {
      return;
    }
    if (!executeQuery) {
      setChatError('Analysis engine is not ready.');
      return;
    }
    if (attachments.length === 0) {
      setChatError('Please upload a file before starting the analysis.');
      return;
    }
    setChatError(null);

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const newRecordId = `record-${Date.now()}`;
    const newRecord: AnalysisRecord = {
      id: newRecordId,
      query,
      thinkingSteps: null,
      data: null,
      schema: null,
      status: 'analyzing',
      llmDurationMs: undefined,
      queryDurationMs: undefined,
      // take snapshot of current attachments
      attachmentsSnapshot: attachments,
    };
    appendAnalysisRecord(newRecord); // add 'analyzing' placeholder, respects MAX_HISTORY_RECORDS cap
    setUiState('analyzing');

    try {
      const profilePersonaId = userProfile?.skills?.[0];
      const inferredPersonaId = inferPersonaFromInput(query);
      const effectivePersonaId = inferredPersonaId || profilePersonaId || 'business_user';
      const effectivePersona = getPersonaById(effectivePersonaId);

      console.log('[Workbench] Persona inference:', {
        profile: profilePersonaId,
        inferred: inferredPersonaId,
        effective: effectivePersonaId
      });

      if (inferredPersonaId && inferredPersonaId !== profilePersonaId) {
        const hintText = `检测到你更像「${effectivePersona.displayName}」，已按该角色优化分析。`;
        setPersonaHint(hintText);
        if (personaHintTimerRef.current !== null) {
          window.clearTimeout(personaHintTimerRef.current);
        }
        personaHintTimerRef.current = window.setTimeout(() => {
          setPersonaHint(null);
          personaHintTimerRef.current = null;
        }, 2000);
      }

      const runtimeResult = await runAgent(
        {
          llmConfig,
          executeQuery,
          attachments,
        },
        query,
        signal,
        {
          personaId: effectivePersonaId,
          budget: {
            maxSteps: 2,
            maxToolCalls: 2,
            maxDurationMs: 20_000,
          },
        }
      );

      if (runtimeResult.cancelled) {
        setAnalysisHistory((prev) => prev.filter((rec) => rec.id !== newRecordId));
        setUiState('fileLoaded');
        return;
      }

      if (runtimeResult.stopReason !== 'SUCCESS') {
        const buildUserFacingError = (): string => {
          if (runtimeResult.stopReason === 'NEED_CLARIFICATION') {
            const raw = runtimeResult.message || '需要你补充一些信息后我才能继续分析。';
            // Normalize the internal prefix for better UX.
            return raw.replace(/^Need clarification:\s*/i, '需要你补充信息：\n');
          }
          if (runtimeResult.stopReason === 'POLICY_DENIED') {
            return '出于安全原因，这个请求不允许执行。你可以改为只读查询（SELECT）并限定范围。';
          }
          if (runtimeResult.stopReason === 'BUDGET_EXCEEDED') {
            return '本次分析超时了，请尝试缩小问题范围后重试。';
          }

          return runtimeResult.message || `分析失败：${runtimeResult.stopReason}`;
        };

        const msg = buildUserFacingError();
        setAnalysisHistory((prev) =>
          prev.map((rec) =>
            rec.id === newRecordId
              ? {
                ...rec,
                status: 'resultsReady',
                data: { error: msg },
                schema: null,
                llmDurationMs: runtimeResult.llmDurationMs,
                queryDurationMs: runtimeResult.queryDurationMs,
              }
              : rec
          )
        );
        return;
      }

      const resultPayload = runtimeResult.result as { data?: unknown; schema?: unknown } | null;
      const resultData = Array.isArray(resultPayload?.data) ? (resultPayload?.data as any[]) : null;
      const resultSchema = Array.isArray(resultPayload?.schema) ? (resultPayload?.schema as any[]) : null;

      const llmDurationMs: number | undefined = runtimeResult.llmDurationMs;
      const queryDurationMs: number | undefined = runtimeResult.queryDurationMs;

      setAnalysisHistory((prev) =>
        prev.map((rec) =>
          rec.id === newRecordId ? {
            ...rec,
            status: 'resultsReady',
            thinkingSteps: runtimeResult.tool
              ? { 
                  tool: runtimeResult.tool, 
                  params: runtimeResult.params, 
                  thought: runtimeResult.thought,
                  // M10.5 Phase 1: Add metadata to thinkingSteps
                  skillName: runtimeResult.skillName,
                  industry: runtimeResult.industry,
                  userSkillApplied: runtimeResult.userSkillApplied,
                  userSkillDigestChars: runtimeResult.userSkillDigestChars,
                  activeTable: runtimeResult.activeTable,
                  // M10.5 Phase 3: Add effective settings
                  effectiveSettings: runtimeResult.effectiveSettings,
                }
              : null,
            data: resultData,
            schema: resultSchema,
            llmDurationMs,
            queryDurationMs,
          } : rec
        )
      );
    } catch (error: any) {
      console.error('Analysis failed, updating record with error:', error);
      setAnalysisHistory((prev) =>
        prev.map((rec) =>
          rec.id === newRecordId ? { ...rec, status: 'resultsReady', data: { error: error.message }, schema: null } : rec
        )
      );
    } finally {
      setUiState('fileLoaded');
      abortControllerRef.current = null;
    }
  };

  // 新增：从结果卡片点“编辑”，把查询填回输入框
  const handleEditQuery = (query: string) => {
    setCurrentInput(query);
    // 滚动到底部，方便用户看到输入框
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
  };

  // 新增：从结果卡片点“复制”
  const handleCopyQuery = async (query: string) => {
    try {
      await navigator.clipboard.writeText(query);
      // success toast removed, UI 已足够明确
      // message.success('提示词已复制到剪贴板');
    } catch (e) {
      console.error('复制失败:', e);
      message.error('复制失败，请手动复制');
    }
  };

  const handleCancelAnalysis = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('[Workbench] Analysis cancellation requested.');
    }
  };

  const handleUpvote = (query: string) => {
    console.log(`Upvoted query: "${query}". Backend call would be here.`);
    // 非关键 success 提示移除，避免打断
    // message.success('Thanks for your feedback!');
    return Promise.resolve({ status: 'success' });
  };

  const handleDownvote = (query: string) => {
    console.log(`Downvoted query: "${query}". Opening feedback drawer.`);
    setIsFeedbackDrawerOpen(true);
  };

  const handleRetry = (query: string) => {
    console.log(`Retrying query: "${query}".`);
    handleStartAnalysis(query);
  };

  const handleDeleteRecord = (recordId: string) => {
    setAnalysisHistory((prev) => prev.filter((rec) => rec.id !== recordId));
    // 卡片消失即为最直观反馈，这里去掉 success 提示
    // message.success('分析记录已删除');
  };

  const handleScrollToBottom = () => {
    contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight, behavior: 'smooth' });
  };

  const getLoadingTip = () => {
    if (uiState === 'initializing') return 'Initializing data engine...';
    if (uiState === 'parsing') return 'Parsing file(s)...';
    return '';
  };


  const renderAnalysisView = () => {
    if (uiState === 'selectingSheet' && sheetsToSelect) {
      return (
        <SheetSelector
          sheets={sheetsToSelect}
          onLoad={handleLoadSheets}
          onCancel={() => {
            setSheetsToSelect(null);
            setFileToLoad(null);
            setUiState('waitingForFile');
          }}
        />
      );
    }

    if (analysisHistory.length === 0) {
      return <InitialWelcomeView />;
    }

    return analysisHistory.map((record) => (
      <ResultsDisplay
        key={record.id}
        query={record.query}
        status={record.status}
        data={record.data} // Pass data array
        schema={record.schema} // Pass schema array
        thinkingSteps={record.thinkingSteps}
        onUpvote={handleUpvote}
        onDownvote={handleDownvote}
        onRetry={handleRetry}
        onDelete={() => handleDeleteRecord(record.id)} // Pass delete handler
        llmDurationMs={record.llmDurationMs}
        queryDurationMs={record.queryDurationMs}
        // 新增：编辑 / 复制 回调
        onEditQuery={handleEditQuery}
        onCopyQuery={handleCopyQuery}
        // pass attachment snapshot for this record
        attachments={record.attachmentsSnapshot}
      />
    ));
  };

  return (
  <>
    <Sandbox ref={iframeRef} />
    <div 
      className={`workbench-container ${isDragging ? 'dragging' : ''}`}
      style={{ 
        background: 'transparent', 
        borderRadius: 0, 
        display: 'flex', 
        flexDirection: 'row', 
        height: '100%', 
        position: 'relative', 
        border: 'none', 
        backdropFilter: 'none',
        overflow: 'hidden'
      }}>
      {/* Left side: Chat flow */}
      <div 
        ref={chatSectionRef}
        className="workbench-chat-section"
        style={{ 
          flex: showInsightSidebar ? `1 1 ${100 - sidebarWidth}%` : '1', 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
        {/* Non-blocking top hint - only render when needed */}
        {(uiState === 'initializing' || uiState === 'parsing') && (
          <div style={{ padding: '12px 16px' }}>
            {uiState === 'initializing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spin size="small" />
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>Vaultmind 引擎初始化中...</span>
              </div>
            )}
            {uiState === 'parsing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Spin size="small" />
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>{getLoadingTip()}</span>
              </div>
            )}
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '0', paddingBottom: '200px' }} ref={contentRef}>
            {renderAnalysisView()}
          </div>
          
          {/* ChatPanel with floating input */}
          <ChatPanel
            onSendMessage={handleStartAnalysis}
            isAnalyzing={uiState === 'analyzing'}
            isInitializing={uiState === 'initializing'}
            onCancel={handleCancelAnalysis}
            suggestions={suggestions}
            onFileUpload={handleFileUpload}
            attachments={attachments}
            onDeleteAttachment={handleDeleteAttachmentWithCleanup}
            error={chatError}
            setError={setChatError}
            showScrollToBottom={showScrollToBottom}
            onScrollToBottom={handleScrollToBottom}
            onPersonaBadgeClick={handlePersonaBadgeClick}
            initialMessage={currentInput}
            setInitialMessage={setCurrentInput}
            personaHint={personaHint}
            uploadHint={uploadHint}
            isLlmReady={isLlmReady}
            showInsightSidebar={showInsightSidebar}
            onToggleInsight={toggleInsightSidebar}
            onToggleFlow={() => setShowFlowModal(true)}
            onKernelSelected={handleKernelSelected}
            kernelFlowHint={kernelFlowHint}
            selectedAttachmentIds={selectedAttachmentIds}
            onToggleAttachmentSelection={handleToggleAttachmentSelection}
          />
        </div>
      </div>
      
      {/* Draggable divider */}
      {showInsightSidebar && insightTableName && (
        <div
          onMouseDown={handleDividerMouseDown}
          style={{
            width: '4px',
            cursor: 'col-resize',
            backgroundColor: isDragging ? 'rgba(24, 144, 255, 0.5)' : 'transparent',
            transition: isDragging ? 'none' : 'background-color 0.2s',
            position: 'relative',
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLElement).style.backgroundColor = 'rgba(24, 144, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            if (!isDragging) {
              (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }
          }}
        />
      )}
      
      {/* Right side: Insight Sidebar */}
      {showInsightSidebar && insightTableName && (
        <div 
          ref={sidebarSectionRef}
          className={`workbench-insight-sidebar ${sidebarAnimationState === 'entering' ? 'entering' : sidebarAnimationState === 'exiting' ? 'exiting' : ''}`}
          style={{
            flex: `0 0 ${sidebarWidth}%`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
          <Suspense
            fallback={
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Spin tip="Loading Insights..." />
              </div>
            }
          >
            <DuckDBProvider executeQuery={executeQuery} isDBReady={isDBReady}>
              <InsightPage 
                tableName={insightTableName}
                anomalyResult={anomalyDetection.result}
                clusteringResult={clusteringAnalysis.result}
                onNoValidColumns={handleNoValidColumns}
                onAnomalyThresholdChange={handleAnomalyThresholdChange}
                onKValueChange={handleKValueChange}
                onDownloadAnomalies={handleDownloadAnomalies}
                onViewAnomalies={handleViewAnomalies}
                onViewCustomers={handleViewCustomers}
              />
            </DuckDBProvider>
          </Suspense>
        </div>
      )}
    </div>
    
    {/* Drawer - Global Level */}
    <Drawer
      title="用户角色设置"
      placement="right"
      onClose={handleProfileDrawerClose}
      open={profileDrawerVisible}
      width={600}
      maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
      style={{
        background: 'rgba(24, 24, 28, 0.98)',
      }}
      bodyStyle={{
        padding: 24,
        background: 'rgba(24, 24, 28, 0.98)',
      }}
    >
      <ProfilePage />
    </Drawer>

    {/* Flow Modal - Analysis Flow Canvas */}
    <Modal
      title={
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          flexWrap: 'wrap',
          padding: '4px 0',
          justifyContent: "center"
        }}>
          {/* Title with accent line */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '4px',
              height: '24px',
              background: 'linear-gradient(180deg, var(--vm-primary) 0%, var(--vm-primary-hover) 100%)',
              borderRadius: '2px',
            }} />
            <span style={{
              fontWeight: 700,
              fontSize: '16px',
              background: 'linear-gradient(90deg, #FFFFFF 0%, rgba(255,255,255,0.85) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.5px',
            }}>分析流</span>
          </div>

          {/* Steps with connector lines */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0',
            fontSize: '12px',
            fontWeight: 500,
          }}>
            {[
              { num: 1, text: '选择数据源', icon: '📊' },
              { num: 2, text: '创建关系', icon: '🔗' },
              { num: 3, text: '选择算子', icon: '⚙️' },
              { num: 4, text: '选择列', icon: '☰' },
              { num: 5, text: '构建条件', icon: '🔍' },
              { num: 6, text: '执行', icon: '▶' },
            ].map((step, index) => (
              <React.Fragment key={step.num}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'transparent',
                  border: '1px solid transparent',
                  transition: 'all 0.2s ease',
                }}>
                  {/* Step number with glow effect */}
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--vm-primary) 0%, var(--vm-primary-hover) 100%)',
                    border: 'none',
                    color: 'var(--vm-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    boxShadow: '0 0 12px rgba(255, 107, 0, 0.4)',
                  }}>{step.num}</div>
                  <span style={{
                    color: 'var(--vm-text-primary)',
                    whiteSpace: 'nowrap',
                  }}>{step.text}</span>
                </div>
                {/* Connector arrow */}
                {index < 5 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 4px',
                    color: 'var(--vm-surface-lighter)',
                  }}>→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      }
      open={showFlowModal}
      onCancel={() => setShowFlowModal(false)}
      footer={null}
      width="90vw"
      style={{ top: 20 }}
      bodyStyle={{
        height: '90vh',
        padding: 0,
        background: TOKEN.bgSection,
      }}
    >
      <DuckDBProvider executeQuery={executeQuery} isDBReady={isDBReady} refreshKey={showFlowModal ? Date.now() : 0}>
        <FlowCanvas
          onSqlValidated={handleFlowSqlReady}
          defaultKernelName={pendingKernelTemplate ?? undefined}
          onKernelChange={(name) => setPendingKernelTemplate(name)}
          allowedTableNames={allowedTableNames}
        />
      </DuckDBProvider>
    </Modal>
  </>
);
};

export default Workbench;
