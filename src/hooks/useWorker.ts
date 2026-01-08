import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import DuckDBWorker from '../workers/duckdb.worker.ts?worker';

const worker = new DuckDBWorker();

interface AppMessage {
  type: string;
  id: string;
  [key: string]: any;
}

interface WorkerResponse {
  type: string;
  id?: string;
  error?: string;
  result?: any;
  data?: ArrayBuffer;
}

const messageCallbacks = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
  const { id, type, error, result, data } = event.data;
  if (id && messageCallbacks.has(id)) {
    const callback = messageCallbacks.get(id)!;
    if (type.endsWith('_SUCCESS')) {
      callback.resolve(data || result);
    } else if (type.endsWith('_ERROR')) {
      callback.reject(new Error(error || 'Unknown worker error'));
    }
    messageCallbacks.delete(id);
  }
};

export const useWorker = () => {
  const sendMessage = useCallback(
    <T>(message: Omit<AppMessage, 'id'>, transferables?: Transferable[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        const id = uuidv4();
        messageCallbacks.set(id, { resolve, reject });
        worker.postMessage({ ...message, id }, transferables || []);
      });
    },
    []
  );

  return { sendMessage };
};
