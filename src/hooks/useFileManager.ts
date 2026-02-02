import { useEffect, useRef, useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import JSZip from 'jszip';
import { Attachment } from '../types/workbench.types';
import { getPersonaSuggestions } from '../config/personaSuggestions';

interface ParseMessage {
  type: string;
  id: string;
  [key: string]: any;
}

interface ParseResponse {
  type: string;
  id?: string;
  error?: string;
  data?: ArrayBuffer;
}

interface UserProfile {
  skills?: string[];
}

interface UseFileManagerProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  userProfile: UserProfile | null;
  setUiState: (state: string) => void;
  setChatError: (error: string | null) => void;
  setFileToLoad: (file: File | null) => void;
  setSheetsToSelect: (sheets: string[] | null) => void;
  setSuggestions: (suggestions: any[]) => void;
  dropTable: (tableName: string) => Promise<void>;
  cacheTableSchema: (tableName: string) => Promise<void>;
  removeTableSchemaFromCache: (tableName: string) => Promise<void>;
  persistAttachments: (attachments: Attachment[]) => Promise<void>;
  showUploadHint: (message: string) => void;
  MAX_FILES: number;
  MAX_SINGLE_FILE_BYTES: number;
  MAX_TOTAL_FILES_BYTES: number;
  analysisHistory: any[];
}

/**
 * Hook for managing file parsing, upload, and DuckDB operations
 * Extends original useFileParsing with business logic from Workbench
 */
export const useFileManager = ({
  iframeRef,
  attachments,
  setAttachments,
  userProfile,
  setUiState,
  setChatError,
  setFileToLoad,
  setSheetsToSelect,
  setSuggestions,
  dropTable,
  cacheTableSchema,
  removeTableSchemaFromCache,
  persistAttachments,
  showUploadHint,
  MAX_FILES,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_FILES_BYTES,
  analysisHistory,
}: UseFileManagerProps) => {
  const messageCallbacks = useRef<
    Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>
  >(new Map());
  const [isSandboxReady, setIsSandboxReady] = useState(false);

  // ===== Original useFileParsing logic =====
  useEffect(() => {
    const handleMessage = (event: MessageEvent<ParseResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        if (event.data.type === 'SANDBOX_READY') {
          setIsSandboxReady(true);
          return;
        }

        const { id, type, error, data } = event.data;
        if (id) {
          const callback = messageCallbacks.current.get(id);
          if (callback) {
            if (type.endsWith('_SUCCESS')) {
              callback.resolve(data);
            } else if (type.endsWith('_ERROR')) {
              callback.reject(new Error(error || 'Unknown parsing error'));
            }
            messageCallbacks.current.delete(id);
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef]);

  const sendMessageToSandbox = useCallback(
    <T>(message: Omit<ParseMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!isSandboxReady) {
          return reject(new Error('Sandbox not ready for parsing.'));
        }
        if (!iframeRef.current?.contentWindow) {
          return reject(new Error('Sandbox iframe not available.'));
        }

        const id = uuidv4();
        messageCallbacks.current.set(id, { resolve, reject });
        iframeRef.current.contentWindow.postMessage({ ...message, id }, '*', transferables || []);
      });
    },
    [iframeRef, isSandboxReady]
  );

  /**
   * Quickly get all sheet names of the Excel file
   */
  async function getExcelSheetNames(
    buffer: ArrayBuffer,
    fileType: 'xlsx' | 'csv',
    customCsvSheetName = 'Sheet1'
  ): Promise<string[]> {
    if (fileType === 'csv') {
      return [customCsvSheetName];
    }
    const zip = new JSZip();
    const zipData = await zip.loadAsync(buffer);

    const workbookXmlFile = zipData.file('xl/workbook.xml');
    if (!workbookXmlFile) {
      throw new Error('Invalid XLSX file xl/workbook.xml not found');
    }

    const xmlContent = await workbookXmlFile.async('string');
    const sheetNameReg = /<sheet name="([^"]+)"[^>]*\/>/g;
    const sheetNames: string[] = [];
    let match;
    while ((match = sheetNameReg.exec(xmlContent)) !== null) {
      sheetNames.push(match[1]);
    }
    return sheetNames;
  }

  const getSheetNamesFromExcel = useCallback(async (file: File): Promise<string[]> => {
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (fileExt !== 'xlsx' && fileExt !== 'csv') {
      throw new Error('Unsupported file format, only .xlsx and .csv are allowed');
    }
    const arrayBuffer = await file.arrayBuffer();
    const sheetNames = await getExcelSheetNames(arrayBuffer, fileExt);
    return sheetNames;
  }, []);

  const loadFileInDuckDB = useCallback(
    async (file: File, tableName: string, sheetName?: string): Promise<void> => {
      await sendMessageToSandbox<void>({
        type: 'LOAD_FILE',
        fileName: file.name,
        tableName,
        sheetName,
        file: file,
      });
    },
    [sendMessageToSandbox]
  );

  const loadSheetsInDuckDB = useCallback(
    async (file: File, selectedSheets: string[], existingAttachmentCount: number): Promise<Attachment[]> => {
      const newAttachments: Attachment[] = [];
      const loadPromises: Promise<void>[] = [];

      for (let i = 0; i < selectedSheets.length; i++) {
        const sheetName = selectedSheets[i];
        const tableIndex = existingAttachmentCount + i + 1;
        const tableName = `main_table_${tableIndex}`;

        newAttachments.push({
          id: uuidv4(),
          file,
          tableName,
          sheetName,
          status: 'uploading',
        });

        const promise = loadFileInDuckDB(file, tableName, sheetName);
        loadPromises.push(promise);
      }

      await Promise.all(loadPromises);
      return newAttachments.map((att) => ({ ...att, status: 'success' as const }));
    },
    [loadFileInDuckDB]
  );

  // ===== New business logic from Workbench =====

  /**
   * Handle file upload with validation, sheet detection, and loading
   */
  const handleFileUpload = useCallback(
    async (file: File): Promise<boolean> => {
      if (attachments.length >= MAX_FILES) {
        setChatError(`You can only upload a maximum of ${MAX_FILES} file(s).`);
        return false;
      }

      // Size guardrails
      const currentTotalBytes = attachments.reduce((sum, a) => sum + (a.file?.size ?? 0), 0);
      const nextTotalBytes = currentTotalBytes + (file.size ?? 0);

      if (file.size > MAX_SINGLE_FILE_BYTES) {
        showUploadHint('That file is a bit large for the browser. Please upload a smaller one (≤ 200MB).');
        return false;
      }

      if (nextTotalBytes > MAX_TOTAL_FILES_BYTES) {
        showUploadHint('Total uploads are getting heavy. Please remove a file or upload a smaller one (≤ 500MB total).');
        return false;
      }

      setChatError(null);
      setUiState('parsing');

      try {
        // Check for multiple sheets only for excel files
        const fileExtension = file.name.split('.').pop()?.toLowerCase();
        if (fileExtension === 'xlsx' || fileExtension === 'xls') {
          const sheetNames = await getSheetNamesFromExcel(file);
          if (sheetNames.length > 1) {
            setFileToLoad(file);
            setSheetsToSelect(sheetNames);
            setUiState('selectingSheet');
            return false;
          }
        }

        // Standard flow for single-sheet files (or non-excel files)
        const newAttachment: Attachment = {
          id: uuidv4(),
          file,
          tableName: `main_table_${attachments.length + 1}`,
          status: 'uploading',
        };
        setAttachments((prev) => [...prev, newAttachment]);
        console.log('[useFileManager] Loading file into DuckDB:', file.name);
        await loadFileInDuckDB(file, newAttachment.tableName);

        setAttachments((prev) => {
          const updated = prev.map((att) =>
            att.id === newAttachment.id ? { ...att, status: 'success' as const } : att
          );
          persistAttachments(updated);
          return updated;
        });

        await cacheTableSchema(newAttachment.tableName);

        // Load persona-specific suggestions
        const profilePersonaId = userProfile?.skills?.[0];
        const personaId = profilePersonaId || 'business_user';
        const loadedSuggestions = getPersonaSuggestions(personaId);
        setSuggestions(loadedSuggestions);
        setUiState('fileLoaded');
      } catch (error: any) {
        console.error(`[useFileManager] Error during file upload process:`, error);
        setUiState('error');
        setChatError(`Failed to load file: ${error.message}`);
      }
      return false;
    },
    [
      attachments,
      MAX_FILES,
      MAX_SINGLE_FILE_BYTES,
      MAX_TOTAL_FILES_BYTES,
      setChatError,
      setUiState,
      showUploadHint,
      getSheetNamesFromExcel,
      setFileToLoad,
      setSheetsToSelect,
      setAttachments,
      loadFileInDuckDB,
      cacheTableSchema,
      persistAttachments,
      userProfile,
      setSuggestions,
    ]
  );

  /**
   * Handle loading multiple sheets from Excel file
   */
  const handleLoadSheets = useCallback(
    async (fileToLoad: File | null, selectedSheets: string[]): Promise<void> => {
      if (!fileToLoad) return;

      setUiState('parsing');

      try {
        console.log('[useFileManager] Loading sheets:', selectedSheets);
        const loadedAttachments = await loadSheetsInDuckDB(fileToLoad, selectedSheets, attachments.length);
        setAttachments((prev) => {
          const updated = [...prev, ...loadedAttachments];
          persistAttachments(updated);
          return updated;
        });

        // Cache table schema for each loaded sheet
        for (const attachment of loadedAttachments) {
          await cacheTableSchema(attachment.tableName);
        }

        // Load persona-specific suggestions
        const profilePersonaId = userProfile?.skills?.[0];
        const personaId = profilePersonaId || 'business_user';
        const loadedSuggestions = getPersonaSuggestions(personaId);
        setSuggestions(loadedSuggestions);
        setSheetsToSelect(null);
        setFileToLoad(null);
        setUiState('fileLoaded');
      } catch (error: any) {
        console.error(`[useFileManager] Error loading sheets:`, error);
        setUiState('error');
        setChatError(`Failed to load sheets`);
        setSheetsToSelect(null);
        setFileToLoad(null);
      }
    },
    [
      setUiState,
      loadSheetsInDuckDB,
      attachments.length,
      setAttachments,
      persistAttachments,
      cacheTableSchema,
      userProfile,
      setSuggestions,
      setSheetsToSelect,
      setFileToLoad,
      setChatError,
    ]
  );

  /**
   * Handle attachment deletion with cleanup
   */
  const handleDeleteAttachment = useCallback(
    async (attachmentId: string): Promise<void> => {
      const attachmentToDelete = attachments.find((att) => att.id === attachmentId);
      if (!attachmentToDelete) return;

      const remainingAttachments = attachments.filter((att) => att.id !== attachmentId);
      setAttachments(remainingAttachments);

      await persistAttachments(remainingAttachments);

      if (remainingAttachments.length === 0 && analysisHistory.length === 0) {
        setUiState('waitingForFile');
      }

      if (attachmentToDelete.status === 'success') {
        try {
          await dropTable(attachmentToDelete.tableName);
          console.log(`[useFileManager] Dropped table: ${attachmentToDelete.tableName}`);

          await removeTableSchemaFromCache(attachmentToDelete.tableName);
        } catch (error) {
          console.error(`[useFileManager] Failed to drop table ${attachmentToDelete.tableName}:`, error);
        }
      }
    },
    [
      attachments,
      setAttachments,
      persistAttachments,
      analysisHistory.length,
      setUiState,
      dropTable,
      removeTableSchemaFromCache,
    ]
  );

  return {
    // Original low-level functions
    loadFileInDuckDB,
    getSheetNamesFromExcel,
    loadSheetsInDuckDB,
    isSandboxReady,

    // New business logic functions
    handleFileUpload,
    handleLoadSheets,
    handleDeleteAttachment,
  };
};
