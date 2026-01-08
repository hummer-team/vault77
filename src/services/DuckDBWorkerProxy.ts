import { v4 as uuidv4 } from 'uuid';

export class DuckDBWorkerProxy {
  private static instance: DuckDBWorkerProxy;
  private port: MessagePort | null = null;
  private messageCallbacks = new Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void }>();

  private constructor() {}

  public static getInstance(): DuckDBWorkerProxy {
    if (!DuckDBWorkerProxy.instance) {
      DuckDBWorkerProxy.instance = new DuckDBWorkerProxy();
    }
    return DuckDBWorkerProxy.instance;
  }

  public initialize(port: MessagePort): void {
    if (this.port) return;
    this.port = port;
    this.port.onmessage = this.handleMessage.bind(this);
  }

  private handleMessage(event: MessageEvent): void {
    const { id, type, error, result } = event.data;
    if (id && this.messageCallbacks.has(id)) {
      const callback = this.messageCallbacks.get(id)!;
      if (type.endsWith('_SUCCESS')) {
        callback.resolve(result);
      } else if (type.endsWith('_ERROR')) {
        callback.reject(new Error(error || 'Unknown worker error'));
      }
      this.messageCallbacks.delete(id);
    }
  }

  private sendMessageToWorker<T>(message: any, transferables?: Transferable[]): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.port) {
        return reject(new Error('MessagePort not initialized.'));
      }
      const id = uuidv4();
      this.messageCallbacks.set(id, { resolve, reject });
      this.port.postMessage({ ...message, id }, transferables || []);
    });
  }

  public loadData(tableName: string, buffer: Uint8Array): Promise<void> {
    return this.sendMessageToWorker({ type: 'DUCKDB_LOAD_DATA', tableName, buffer }, [buffer.buffer]);
  }

  public executeQuery(sql: string): Promise<any> {
    return this.sendMessageToWorker({ type: 'DUCKDB_EXECUTE_QUERY', sql });
  }

  public getTableSchema(tableName: string): Promise<any> {
    return this.sendMessageToWorker({ type: 'DUCKDB_GET_SCHEMA', tableName });
  }
}
