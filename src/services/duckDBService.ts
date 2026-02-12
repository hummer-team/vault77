import * as duckdb from '@duckdb/duckdb-wasm';
import { DuckDBDataProtocol } from '@duckdb/duckdb-wasm';

const ARROW_IPC_STREAM_EOS = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 0]);

export class DuckDBService {
  private static instance: DuckDBService;
  private db: duckdb.AsyncDuckDB | null = null;
  private logger: duckdb.ConsoleLogger = new duckdb.ConsoleLogger();

  private constructor() { }

  public static getInstance(): DuckDBService {
    if (!DuckDBService.instance) {
      DuckDBService.instance = new DuckDBService();
    }
    return DuckDBService.instance;
  }

  /**
   * Check if DuckDB is initialized and ready
   */
  public isInitialized(): boolean {
    return this.db !== null;
  }

  public async initialize(bundle: duckdb.DuckDBBundle, workerInstance: Worker): Promise<void> {
    if (this.db) {
      console.log('[DuckDBService] DB already initialized, skipping.');
      return;
    }

    console.log('[DuckDBService] Initializing DuckDB...');
    this._createDbInstance(workerInstance);

    this._assertSharedArrayBufferAvailable();

    console.log('[DuckDBService] Attempting to instantiate DuckDB with bundle...');
    await this._instantiateDb(bundle);

    console.log('[DuckDBService] Attempting to connect for loading extensions...');
    await this._loadExtensions();

    console.log('DuckDB extensions loaded.');
  }

  private _createDbInstance(workerInstance: Worker): void {
    this.db = new duckdb.AsyncDuckDB(this.logger, workerInstance);
    console.log('[DuckDBService] AsyncDuckDB instance created with CoreWorker instance.');
  }

  private _assertSharedArrayBufferAvailable(): void {
    if (typeof SharedArrayBuffer === 'undefined') {
      const errorMessage = 'SharedArrayBuffer is not available. Cross-origin isolation (COOP/COEP headers) is likely not configured correctly for the environment.';
      console.error(`[DuckDBService] ${errorMessage}`);
      throw new Error(errorMessage);
    }
    console.log('[DuckDBService] SharedArrayBuffer is available. Proceeding with instantiation.');
  }

  private async _instantiateDb(bundle: duckdb.DuckDBBundle): Promise<void> {
    if (!this.db) throw new Error('DuckDB instance not created.');
    try {
      const instantiationPromise = this.db.instantiate(bundle.mainModule, (bundle as any).pthreadWorker);
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('DuckDB instantiation timed out after 120 seconds.')), 120000)
      );
      await Promise.race([instantiationPromise, timeoutPromise]);
      console.log('[DuckDBService] this.db.instantiate completed successfully.');
    } catch (e) {
      console.error('[DuckDBService] Error during DuckDB instantiation:', e);
      throw e;
    }
  }

  private async _loadExtensions(): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');

    const c = await this.db.connect();
    try {
      console.log('[DuckDBService] Executing INSTALL excel;');
      await c.query('INSTALL excel;');
      await c.query('LOAD excel;');
      console.log('[DuckDBService] Excel extension loaded successfully.');

      console.log('[DuckDBService] Executing LOAD arrow;');
      await c.query('INSTALL arrow from community;');
      await c.query('LOAD arrow;');
      console.log('[DuckDBService] LOAD arrow; executed successfully.');

      const res = await c.query(
        "SELECT name, value FROM duckdb_settings() WHERE name like  '%threads%' or name like '%memory%';"
      );
      const settings = this._extractData(res);
      console.log('[DuckDBService] sys settings: ', settings);
    } catch (e) {
      console.error('[DuckDBService] Error loading extensions:', e);
      throw new Error('duckdb init fail.');
    } finally {
      await c.close();
      console.log('[DuckDBService] Connection closed after loading extensions.');
    }
  }

  public async registerFileBuffer(fileName: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    console.log(`[DuckDBService] Registering file '${fileName}' with buffer size: ${buffer.byteLength}`);
    
    // Register buffer directly with DuckDB
    // Note: Buffer ownership may be transferred to DuckDB, but this is safe because:
    // 1. Buffer was already transferred from main thread via Worker postMessage (Transferable)
    // 2. No subsequent code in Worker needs to access this buffer after registration
    await this.db.registerFileBuffer(fileName, buffer);
    
    console.log(`[DuckDBService] File '${fileName}' registered successfully via buffer.`);
  }

  /**
   * Register a file using File object for streaming access (zero-copy when possible).
   * Falls back to registerFileBuffer if file handle registration fails.
   * @param fileName - Logical file name in DuckDB virtual filesystem
   * @param file - Browser File object from input[type=file] or drag-and-drop
   */
  public async registerFileHandle(fileName: string, file: File): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    
    try {
      console.log(`[DuckDBService] Attempting to register file '${fileName}' via File handle (size: ${file.size} bytes)`);
      
      // Use BROWSER_FILEREADER protocol for File objects
      // directIO=false for better compatibility with Chrome Extension environment
      await this.db.registerFileHandle(fileName, file, DuckDBDataProtocol.BROWSER_FILEREADER, true);
      
      console.log(`[DuckDBService] File '${fileName}' registered successfully via File handle.`);
    } catch (error) {
      console.warn(
        `[DuckDBService] Failed to register file '${fileName}' via File handle, falling back to buffer strategy.`,
        error
      );
      
      // Fallback: read file into buffer and use buffer-based registration
      console.log(`[DuckDBService] Reading file '${fileName}' into buffer for fallback registration...`);
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      
      await this.registerFileBuffer(fileName, buffer);
    }
  }

  /**
   * Create a DuckDB table from a file.
   * NOTE: File must be registered beforehand via registerFileBuffer or registerFileHandle.
   * @param tableName - Name of the table to create
   * @param fileName - Logical file name (must have valid extension: .csv, .xlsx, .parquet)
   * @param sheetName - Optional sheet name for Excel files
   */
  public async createTableFromFile(
    tableName: string,
    fileName: string,
    sheetName?: string
  ): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    if (!fileName) throw new Error('fileName is required.');
    if (!tableName) throw new Error('tableName is required.');

    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    if (!fileExtension) throw new Error(`Unable to infer file extension from fileName: ${fileName}`);

    const safeTableName = this._escapeIdentifier(tableName);
    const safeFileName = this._escapeStringLiteral(fileName);

    const c = await this.db.connect();
    const dtime = Date.now();

    try {
      if (fileExtension === 'xlsx') {
        await this._createTableFromXlsx(c, safeTableName, safeFileName, fileName, sheetName, dtime);
        return;
      }

      if (fileExtension === 'csv') {
        await this._createTableFromCsv(c, safeTableName, safeFileName, fileName, dtime);
        return;
      }

      if (fileExtension === 'parquet') {
        await this._createTableFromParquet(c, safeTableName, safeFileName, fileName, dtime);
        return;
      }

      throw new Error(`Unsupported file type: ${fileExtension}`);
    } finally {
      await c.close();
    }
  }

  private async _createTableFromXlsx(
    conn: any,
    safeTableName: string,
    safeFileName: string,
    fileName: string,
    sheetName: string | undefined,
    startTimeMs: number
  ): Promise<void> {
    const sheetArg = sheetName ? `, sheet=${this._escapeStringLiteral(sheetName)}` : '';
    const sql = `CREATE OR REPLACE TABLE ${safeTableName} AS SELECT * FROM read_xlsx(${safeFileName}${sheetArg});`;
    console.log(`[DuckDBService] Loading Excel via read_xlsx: ${fileName}${sheetName ? ` (sheet=${sheetName})` : ''}`);
    await conn.query(sql);
    console.log(`[DuckDBService] Table ${safeTableName} created via read_xlsx, cost ${Date.now() - startTimeMs} ms.`);
  }

  private async _createTableFromCsv(
    conn: any,
    safeTableName: string,
    safeFileName: string,
    fileName: string,
    startTimeMs: number
  ): Promise<void> {
    const sql = `CREATE OR REPLACE TABLE ${safeTableName} AS SELECT * FROM read_csv_auto(${safeFileName}, header=true,sample_size=100);`;
    console.log(`[DuckDBService] Loading CSV via read_csv_auto: ${fileName}`);
    await conn.query(sql);
    console.log(`[DuckDBService] Table ${safeTableName} created via read_csv_auto, cost ${Date.now() - startTimeMs} ms.`);
  }

  private async _createTableFromParquet(
    conn: any,
    safeTableName: string,
    safeFileName: string,
    fileName: string,
    startTimeMs: number
  ): Promise<void> {
    const sql = `CREATE OR REPLACE TABLE ${safeTableName} AS SELECT * FROM read_parquet(${safeFileName});`;
    console.log(`[DuckDBService] Loading Parquet via read_parquet: ${fileName}`);
    await conn.query(sql);
    console.log(`[DuckDBService] Table ${safeTableName} created via read_parquet, cost ${Date.now() - startTimeMs} ms.`);
  }

  private _escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private _escapeStringLiteral(val: string): string {
    return `'${val.replace(/'/g, "''")}'`;
  }

  public async loadData(tableName: string, buffer: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('DuckDB not initialized.');

    const c: any = await this.db.connect();
    try {
      // duckdb-wasm JS API: insert Arrow IPC stream chunks
      await c.insertArrowFromIPCStream(buffer, { name: tableName, create: true });
      await c.insertArrowFromIPCStream(ARROW_IPC_STREAM_EOS, { name: tableName });
    } finally {
      await c.close();
    }

    console.log(`Data loaded into table '${tableName}' from Arrow IPC stream.`);
  }

  public async executeQuery(sql: string): Promise<{ data: any[]; schema: any[] }> {
    if (!this.db) throw new Error('DuckDB not initialized.');
    const conn: any = await this.db.connect();
    try {
      const rawResult = await this._queryRaw(conn, sql);
      const data = this._extractData(rawResult);
      const schema = this._extractSchema(rawResult, data);
      this._normalizeTimeFields(data, schema);
      this._normalizeBigIntFields(data); // Convert BigInt to Number for JSON serialization
      console.log('[DuckDBService] Standardized query result:', { data, schema });
      return { data, schema };
    } finally {
      await conn.close();
    }
  }

  /**
   * A. Global Summary Statistics
   * Provides flexible statistical aggregation for specified columns
   * @param tableName - Table to analyze
   * @param columns - Array of column configurations with name and stats to compute
   * @param enableSampling - Whether to use sampling (default: auto-enabled for >10k rows)
   * @param samplingRate - Sampling rate in percentage (default: 75)
   * @returns Statistical results as key-value pairs
   * 
   * @example
   * summaryStatistics('test_order', [
   *   { name: '实付金额', stats: ['min', 'max', 'avg', 'p50', 'p99'] },
   *   { name: '下单时间', stats: ['min', 'max'] },
   *   { name: '订单状态', stats: ['cardinality'] }
   * ])
   */
  public async summaryStatistics(
    tableName: string,
    columns: Array<{ name: string; stats: string[] }>,
    enableSampling?: boolean,
    samplingRate: number = 75
  ): Promise<{ data: any[]; schema: any[] }> {
    // Auto-detect sampling if not specified
    if (enableSampling === undefined) {
      const countResult = await this.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
      const rowCount = countResult.data[0]?.total || 0;
      enableSampling = rowCount > 10000;
    }

    const sampling = enableSampling ? `USING SAMPLE ${samplingRate}%` : '';
    const selectClauses: string[] = ['COUNT(*) as total_rows'];

    // Build SELECT clauses for each column and stat
    for (const col of columns) {
      const columnName = col.name;
      for (const stat of col.stats) {
        switch (stat) {
          case 'min':
            selectClauses.push(`MIN("${columnName}") as ${this._sanitizeAlias(columnName)}_min`);
            break;
          case 'max':
            selectClauses.push(`MAX("${columnName}") as ${this._sanitizeAlias(columnName)}_max`);
            break;
          case 'avg':
          case 'mean':
            selectClauses.push(`AVG("${columnName}") as ${this._sanitizeAlias(columnName)}_avg`);
            break;
          case 'stddev':
          case 'std':
            selectClauses.push(`STDDEV("${columnName}") as ${this._sanitizeAlias(columnName)}_stddev`);
            break;
          case 'median':
          case 'p50':
            selectClauses.push(`APPROX_QUANTILE("${columnName}", 0.5) as ${this._sanitizeAlias(columnName)}_p50`);
            break;
          case 'p80':
            selectClauses.push(`APPROX_QUANTILE("${columnName}", 0.8) as ${this._sanitizeAlias(columnName)}_p80`);
            break;
          case 'p99':
            selectClauses.push(`APPROX_QUANTILE("${columnName}", 0.99) as ${this._sanitizeAlias(columnName)}_p99`);
            break;
          case 'cardinality':
          case 'distinct':
            selectClauses.push(`APPROX_COUNT_DISTINCT("${columnName}") as ${this._sanitizeAlias(columnName)}_cardinality`);
            break;
          default:
            console.warn(`[DuckDBService] Unknown stat type: ${stat}`);
        }
      }
    }

    const sql = `SELECT ${selectClauses.join(',\n       ')} FROM ${tableName} ${sampling}`;
    console.log('[DuckDBService] summaryStatistics SQL:', sql);
    return this.executeQuery(sql);
  }

  /**
   * B. Data Distribution using HISTOGRAM
   * Returns histogram data for numeric columns
   * @param tableName - Table to analyze
   * @param columns - Array of column names to generate histograms for
   * @param enableSampling - Whether to use sampling
   * @param samplingRate - Sampling rate in percentage (default: 75)
   * @returns Histogram results for each column
   * 
   * @example
   * insightsDataDistribution('test_order', ['实付金额', '商品数量'])
   */
  public async insightsDataDistribution(
    tableName: string,
    columns: string[],
    enableSampling?: boolean,
    samplingRate: number = 75
  ): Promise<Record<string, { data: any[]; schema: any[] }>> {
    // Auto-detect sampling if not specified
    if (enableSampling === undefined) {
      const countResult = await this.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
      const rowCount = countResult.data[0]?.total || 0;
      enableSampling = rowCount > 10000;
    }

    const sampling = enableSampling ? `USING SAMPLE ${samplingRate}%` : '';
    const results: Record<string, { data: any[]; schema: any[] }> = {};

    // Execute histogram query for each column
    for (const columnName of columns) {
      const sql = `SELECT HISTOGRAM("${columnName}") FROM ${tableName} ${sampling}`;
      console.log(`[DuckDBService] insightsDataDistribution SQL for ${columnName}:`, sql);
      try {
        results[columnName] = await this.executeQuery(sql);
      } catch (error) {
        console.error(`[DuckDBService] Failed to generate histogram for ${columnName}:`, error);
        // Continue with other columns
      }
    }

    return results;
  }

  /**
   * C. Categorical/Dimensional Insights
   * Returns top N values grouped by specified dimensions
   * @param tableName - Table to analyze
   * @param groupByColumns - Columns to group by (supports multi-dimensional)
   * @param enableSampling - Whether to use sampling
   * @param samplingRate - Sampling rate in percentage (default: 75)
   * @param topN - Limit results to top N (default: 50)
   * @returns Grouped count results
   * 
   * @example
   * insightsCategorical('test_order', ['订单状态', '会员等级'], true, 75, 10)
   */
  public async insightsCategorical(
    tableName: string,
    groupByColumns: string[],
    enableSampling?: boolean,
    samplingRate: number = 75,
    topN: number = 50
  ): Promise<{ data: any[]; schema: any[] }> {
    // Auto-detect sampling if not specified
    if (enableSampling === undefined) {
      const countResult = await this.executeQuery(`SELECT COUNT(*) as total FROM ${tableName}`);
      const rowCount = countResult.data[0]?.total || 0;
      enableSampling = rowCount > 10000;
    }

    const quotedColumns = groupByColumns.map(col => `"${col}"`).join(', ');
    
    let sql: string;
    if (enableSampling) {
      // Sampling requires subquery
      sql = `
        SELECT ${quotedColumns}, COUNT(*) as cnt 
        FROM (SELECT * FROM ${tableName} USING SAMPLE ${samplingRate}%) as sampled_table
        GROUP BY ${quotedColumns}
        ORDER BY cnt DESC
        LIMIT ${topN}
      `.trim();
    } else {
      sql = `
        SELECT ${quotedColumns}, COUNT(*) as cnt 
        FROM ${tableName}
        GROUP BY ${quotedColumns}
        ORDER BY cnt DESC
        LIMIT ${topN}
      `.trim();
    }

    console.log('[DuckDBService] insightsCategorical SQL:', sql);
    return this.executeQuery(sql);
  }

  /**
   * Helper: Sanitize column name for use as SQL alias
   * Removes special characters and spaces
   */
  private _sanitizeAlias(columnName: string): string {
    return columnName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }

  private async _queryRaw(conn: any, sql: string): Promise<any> {
    try {
      return await conn.query(sql);
    } catch (err) {
      console.error('[DuckDBService] Query failed:', err, 'SQL:', sql);
      throw err;
    }
  }

  private _extractData(result: any): any[] {
    if (!result) return [];
    if (typeof result.numRows === 'number' && typeof result.get === 'function') {
      const rowsCount = result.numRows;
      const out = Array.from({ length: rowsCount }, (_, i) => {
        try {
          const row = result.get(i);
          return typeof row?.toJSON === 'function' ? row.toJSON() : row;
        } catch (err) {
          return result[i] ?? null;
        }
      });
      return out;
    }
    if (Array.isArray(result)) return result;
    if (typeof result.toArray === 'function') {
      return result.toArray().map((r: any) => (typeof r?.toJSON === 'function' ? r.toJSON() : r));
    }
    if (typeof result === 'object') return [result];
    return [];
  }

  private _extractSchema(result: any, data: any[]): any[] {
    if (result && result.schema && Array.isArray(result.schema.fields)) {
      return (result.schema.fields as any[]).map((field: any) => ({
        name: field?.name ?? String(field),
        type: field && field.type ? String(field.type) : 'unknown',
      }));
    }
    if (data.length > 0 && typeof data[0] === 'object' && !Array.isArray(data[0])) {
      return Object.keys(data[0]).map((k) => ({ name: k, type: typeof data[0][k] }));
    }
    return [];
  }

  private _normalizeTimeFields(data: any[], schema: any[]): void {
    if (!schema || schema.length === 0 || !data || data.length === 0) return;
    const timeFields = schema
      .filter((f) => typeof f.type === 'string' && /(timestamp|date|time)/i.test(f.type))
      .map((f) => ({ name: f.name, type: String(f.type) }));
    if (timeFields.length === 0) return;
    for (const row of data) {
      for (const fld of timeFields) {
        const key = fld.name;
        const rawVal = row?.[key];
        if (rawVal == null) continue;
        if (rawVal instanceof Date) {
          row[key] = rawVal.toISOString();
          continue;
        }
        if (typeof rawVal === 'string') {
          const parsed = Date.parse(rawVal);
          if (!isNaN(parsed)) {
            row[key] = new Date(parsed).toISOString();
          }
          continue;
        }
        if (typeof rawVal === 'number') {
          const best = this._chooseBestDateFromNumber(rawVal, fld.type);
          if (best) row[key] = best.toISOString();
        }
      }
    }
  }

  /**
   * Convert BigInt values to Number for JSON serialization.
   * DuckDB returns BIGINT columns as BigInt, which cannot be JSON.stringify'd.
   * This method recursively traverses data and converts all BigInt values to Number.
   */
  private _normalizeBigIntFields(data: any[]): void {
    if (!data || data.length === 0) return;
    
    const convertBigInt = (obj: any): any => {
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'bigint') {
        // Convert BigInt to Number (safe for values within Number.MAX_SAFE_INTEGER)
        return Number(obj);
      }
      
      if (Array.isArray(obj)) {
        return obj.map(convertBigInt);
      }
      
      if (typeof obj === 'object') {
        const converted: any = {};
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            converted[key] = convertBigInt(obj[key]);
          }
        }
        return converted;
      }
      
      return obj;
    };

    for (let i = 0; i < data.length; i++) {
      data[i] = convertBigInt(data[i]);
    }
  }

  private _chooseBestDateFromNumber(raw: number, typeHint?: string): Date | null {
    const now = Date.now();
    const isReasonableYear = (d: Date) => {
      const y = d.getUTCFullYear();
      return y >= 1970 && y <= 3000;
    };
    const candidates: { label: string; ms: number }[] = [];
    candidates.push({ label: 'ms', ms: raw });
    candidates.push({ label: 'micro', ms: Math.floor(raw / 1000) });
    candidates.push({ label: 's', ms: raw * 1000 });
    if (raw > 2000 && raw < 60000) {
      const excelMs = Math.round((raw - 25569) * 86400000);
      candidates.push({ label: 'excel_days', ms: excelMs });
    }
    if (typeHint) {
      const hint = typeHint.toLowerCase();
      if (hint.includes('micro')) candidates.sort((a, b) => (a.label === 'micro' ? -1 : (b.label === 'micro' ? 1 : 0)));
      else if (hint.includes('second')) candidates.sort((a, b) => (a.label === 's' ? -1 : (b.label === 's' ? 1 : 0)));
    }
    const preferred = candidates
      .map((c) => ({ ...c, date: new Date(c.ms) }))
      .filter((c) => !isNaN(c.date.getTime()) && c.date.getUTCFullYear() >= 2000 && c.date.getUTCFullYear() <= 2035);
    const selectBest = (list: { label: string; ms: number; date: Date }[]) => {
      if (list.length === 0) return null as Date | null;
      let best: Date | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const c of list) {
        const score = Math.abs(c.date.getTime() - now);
        if (score < bestScore) {
          bestScore = score;
          best = c.date;
        }
      }
      return best;
    };
    const pick = selectBest(preferred);
    if (pick) return pick;
    let best: Date | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const c of candidates) {
      const d = new Date(c.ms);
      if (isNaN(d.getTime())) continue;
      if (!isReasonableYear(d)) continue;
      const score = Math.abs(d.getTime() - now);
      if (score < bestScore) {
        bestScore = score;
        best = d;
      }
    }
    if (!best) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
      return null;
    }
    return best;
  }

  public async getTableSchema(tableName: string): Promise<{ data: any[]; schema: any[] }> {
    return this.executeQuery(`DESCRIBE "${tableName}";`);
  }

  public async shutdown(): Promise<void> {
    try {
      if (this.db) {
        try {
          const asAny = this.db as any;
          if (typeof asAny.terminate === 'function') {
            await asAny.terminate();
          } else if (typeof asAny.close === 'function') {
            await asAny.close();
          }
        } catch (e) {
          console.warn('[DuckDBService] Error while calling underlying shutdown on AsyncDuckDB:', e);
        }
        this.db = null;
      }
    } catch (e) {
      console.error('[DuckDBService] Error during shutdown:', e);
    }
  }
}
