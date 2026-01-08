import * as duckdb from '@duckdb/duckdb-wasm';

export class DuckDBService {
  private static instance: DuckDBService;
  private db: duckdb.AsyncDuckDB | null = null;
  private logger: duckdb.ConsoleLogger = new duckdb.ConsoleLogger();

  private constructor() {}

  public static getInstance(): DuckDBService {
    if (!DuckDBService.instance) {
      DuckDBService.instance = new DuckDBService();
    }
    return DuckDBService.instance;
  }

  // Modified: Accepts the worker instance (which will be 'self' when called from duckdb.worker.ts)
  public async initialize(bundle: duckdb.DuckDBBundle, workerInstance: Worker): Promise<void> { // 类型明确为 Worker
    if (this.db) {
      console.log('[DuckDBService] DB already initialized, skipping.');
      return;
    }

    console.log('[DuckDBService] Initializing DuckDB...');
    
    // Instantiate AsyncDuckDB with the provided worker instance
    this.db = new duckdb.AsyncDuckDB(this.logger, workerInstance);
    console.log('[DuckDBService] AsyncDuckDB instance created with workerInstance.');

    console.log('[DuckDBService] Attempting to instantiate DuckDB with bundle:', bundle);
    // The bundle.mainModule and bundle.pthreadWorker URLs should be absolute at this point
    try {
      await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker); 
      console.log('[DuckDBService] DuckDB instantiated successfully.');
    } catch (e) {
      console.error('[DuckDBService] Error during DuckDB instantiation:', e);
      throw e;
    }
    
    // Try to load arrow extension, assuming it's built-in or automatically available
    console.log('[DuckDBService] Attempting to connect for LOAD arrow...');
    const c = await this.db.connect();
    try {
      console.log('[DuckDBService] Executing LOAD arrow;');
      await c.query('LOAD arrow;'); // Keep LOAD
      console.log('[DuckDBService] LOAD arrow; executed successfully.');
    } catch (e) {
      console.error('[DuckDBService] Error executing LOAD arrow;:', e);
      throw e; // Re-throw to propagate the error
    } finally {
      await c.close();
      console.log('[DuckDBService] Connection closed after LOAD arrow.');
    }
    
    console.log('DuckDB initialized and Arrow extension loaded (if available).');
  }

  public async loadData(tableName: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    
    const c = await this.db.connect();
    try {
      const prepared = await c.prepare(`CREATE OR REPLACE TABLE "${tableName}" AS SELECT * FROM duckdb_arrow_ipc_scan(?);`);
      await prepared.query(buffer);
      await prepared.close();
    } finally {
      await c.close();
    }
    
    console.log(`Data loaded into table '${tableName}' from Arrow buffer.`);
  }

  public async executeQuery(sql: string): Promise<any> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    const c = await this.db.connect();
    try {
      const result = await c.query(sql);
      return result.toArray().map(row => row.toJSON());
    } finally {
      await c.close();
    }
  }

  public async getTableSchema(tableName: string): Promise<any> {
    return this.executeQuery(`DESCRIBE "${tableName}";`);
  }
}
