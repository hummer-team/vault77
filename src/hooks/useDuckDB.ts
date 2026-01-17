import { useCallback, useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getDuckDBResources } from './DuckDBEngineDefine';

interface AppMessage {
  type: string;
  id: string;
  [key: string]: any;
}

interface SandboxResponse {
  type: string;
  id?: string;
  error?: string;
  result?: any;
}

type MessageCallback = { resolve: (value: any) => void; reject: (reason?: any) => void };

export const useDuckDB = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  const messageCallbacks = useRef<Map<string, MessageCallback>>(new Map());
  const [isDBReady, setIsDBReady] = useState(false);
  const [isSandboxReady, setIsSandboxReady] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<SandboxResponse>) => {
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        if (event.data.type === 'SANDBOX_READY') {
          setIsSandboxReady(true);
          return;
        }

        const { id, type, error, result } = event.data;
        if (id && messageCallbacks.current.has(id)) {
          const callback = messageCallbacks.current.get(id)!;
          if (type.endsWith('_SUCCESS')) {
            if (type === 'DUCKDB_INIT_SUCCESS') {
              setIsDBReady(true);
            }
            callback.resolve(result);
          } else if (type.endsWith('_ERROR')) {
            callback.reject(new Error(error || 'Unknown sandbox error'));
          }
          messageCallbacks.current.delete(id);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [iframeRef]);
  
  const sendMessageToSandbox = useCallback(
    <T>(message: Omit<AppMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        if (!isSandboxReady || !iframeRef.current?.contentWindow) {
          return reject(new Error('Sandbox not ready.'));
        }
        const id = uuidv4();
        messageCallbacks.current.set(id, { resolve, reject });
        iframeRef.current.contentWindow.postMessage({ ...message, id }, '*', transferables || []);
      });
    },
    [isSandboxReady, iframeRef]
  );

  const initializeDuckDB = useCallback(async () => {
    if (!isSandboxReady) {
      await new Promise<void>(resolve => {
        const interval = setInterval(() => {
          if (isSandboxReady) {
            clearInterval(interval);
            resolve();
          }
        }, 100);
      });
    }

    console.log('[useDuckDB] Sandbox ready. Getting DuckDB resources...');
    const DUCKDB_RESOURCES = getDuckDBResources();
    
    const extensionOrigin = chrome.runtime.getURL('/');
    console.log('[useDuckDB] Calculated extensionOrigin:', extensionOrigin);

    console.log('[useDuckDB] Sending DUCKDB_INIT to sandbox...');
    const messageToSend = { type: 'DUCKDB_INIT', resources: JSON.parse(JSON.stringify(DUCKDB_RESOURCES)), extensionOrigin };
    return sendMessageToSandbox(messageToSend);
  }, [isSandboxReady, sendMessageToSandbox]);

  const loadData = useCallback(
    (tableName: string, buffer: Uint8Array) => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      return sendMessageToSandbox({ type: 'DUCKDB_LOAD_DATA', tableName, buffer }, [buffer.buffer]);
    },
    [sendMessageToSandbox, isDBReady]
  );

  const executeQuery = useCallback(
    (sql: string): Promise<{ data: any[], schema: any[] }> => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      return sendMessageToSandbox({ type: 'DUCKDB_EXECUTE_QUERY', sql });
    },
    [sendMessageToSandbox, isDBReady]
  );

  const dropTable = useCallback(
    (tableName: string) => {
      if (!isDBReady) return Promise.reject(new Error('DuckDB is not ready.'));
      const sql = `DROP TABLE IF EXISTS "${tableName}";`;
      return sendMessageToSandbox({ type: 'DUCKDB_EXECUTE_QUERY', sql });
    },
    [sendMessageToSandbox, isDBReady]
  );

  const getAllUserTables = useCallback(async (): Promise<string[]> => {
    if (!isDBReady) {
      console.warn('[useDuckDB] DB not ready, returning empty table list.');
      return [];
    }
    try {
      const result = await executeQuery("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'main_table_%';");
      const tableData = result.data || [];
      return tableData.map((row: any) => row.table_name);
    } catch (error) {
      console.error('[useDuckDB] Failed to get all user tables:', error);
      return [];
    }
  }, [executeQuery, isDBReady]);

  return { initializeDuckDB, loadData, executeQuery, dropTable, getAllUserTables, isDBReady };
};
