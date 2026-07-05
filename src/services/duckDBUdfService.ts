/**
 * DuckDB UDF Service
 * Manages registration and lifecycle of DuckDB MACRO (UDF) functions for data-cleaning operators.
 * UDF SQL definitions are sourced from design/udf.sql via Vite ?raw import.
 */

import udfSql from '../../design/udf.sql?raw';

// ============================================================================
// Kernel → UDF Function Mapping
// Maps BizKernel name to its corresponding DuckDB MACRO function name
// ============================================================================
export const KERNEL_UDF_MAP: Record<string, string> = {
  fn_ecom_data_clean_replace_spec_column_value: 'udf_replace_spec_column_value',
  fn_ecom_data_clean_up_lower: 'udf_up_lower_str',
  fn_ecom_data_clean_number_precision_control: 'udf_format_number',
  fn_ecom_data_clean_data_flag: 'udf_flag_spec_column',
  fn_ecom_data_format_date: 'udf_format_date_time',
  fn_basic_statis: 'fn_basic_statis',
  fn_ecom_order_distribution: 'fn_ecom_order_distribution',
  fn_ecom_repurchase_cycle: 'fn_ecom_repurchase_cycle',
  fn_ecom_arbitrage_analyze: 'fn_ecom_arbitrage_analyze',
  fn_ecom_inventory_forecast: 'fn_ecom_inventory_forecast',
  fn_ecom_market_basket: 'fn_ecom_market_basket',
  fn_ecom_abnormal_amount: 'fn_ecom_abnormal_amount',
  fn_ecom_rfm_profile: 'fn_ecom_rfm_profile',
  fn_ecom_order_channel_analysis: 'fn_ecom_order_channel_analysis',
  fn_ecom_order_funnel_analysis: 'fn_ecom_order_funnel_analysis',
  fn_ecom_fulfillment_efficiency: 'fn_ecom_fulfillment_efficiency',
  fn_ecom_order_net_amount_calc: 'fn_ecom_order_net_amount_calc'
} as const;

/** Set of all data-cleaning kernel names for fast lookup */
const DATA_CLEAN_KERNEL_NAMES = new Set(Object.keys(KERNEL_UDF_MAP));

// ============================================================================
// DuckDB UDF Service
// ============================================================================

class DuckDBUdfService {
  private _initialized = false;

  /**
   * Initialize all UDF MACROs into DuckDB.
   * Idempotent: skips if already initialized.
   * Must be called after DuckDB extensions are loaded.
   *
   * @param queryFn - Function to execute a SQL string against DuckDB
   */
  public async initializeUdfs(queryFn: (sql: string) => Promise<unknown>): Promise<void> {
    if (this._initialized) {
      console.log('[DuckDBUdfService] UDFs already initialized, skipping.');
      return;
    }

    console.log('[DuckDBUdfService] Initializing UDF MACROs from udf.sql...');

    // Split SQL into individual statements and execute each one.
    // DuckDB WASM does not support multi-statement execution in one query() call.
    const statements = this._splitSqlStatements(udfSql);
    console.log(`[DuckDBUdfService] Found ${statements.length} UDF statements to execute.`);

    for (const stmt of statements) {
      try {
        await queryFn(stmt);
      } catch (err) {
        // Log but do not abort — partial failure should not crash the app.
        // Individual UDF availability can be verified at call time.
        console.error('[DuckDBUdfService] Failed to register UDF statement:', stmt.slice(0, 80), err);
      }
    }

    this._initialized = true;
    console.log('[DuckDBUdfService] UDF initialization complete.');
  }

  /**
   * Whether UDFs have been registered in the current DuckDB session.
   */
  public isUdfInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Reset initialization state (e.g., when DuckDB is re-initialized).
   */
  public resetInitState(): void {
    this._initialized = false;
  }

  /**
   * Get the DuckDB MACRO function name for a given kernel.
   * Returns null if the kernel is not a data-cleaning UDF kernel.
   *
   * @param kernelName - BizKernel metadata name (e.g., 'fn_ecom_data_clean_replace_spec_column_value')
   */
  public getUdfFunctionName(kernelName: string): string | null {
    return KERNEL_UDF_MAP[kernelName] ?? null;
  }

  /**
   * Whether the given kernel is a data-cleaning UDF kernel.
   *
   * @param kernelName - BizKernel metadata name
   */
  public isDataCleanKernel(kernelName: string): boolean {
    return DATA_CLEAN_KERNEL_NAMES.has(kernelName);
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Split a SQL string containing multiple CREATE MACRO statements into an array
   * of individual executable statements.
   *
   * Strategy: split on top-level semicolons that end a statement.
   * We use a simple heuristic: split on ';' that are not inside string literals.
   */
  private _splitSqlStatements(sql: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];
      const prev = i > 0 ? sql[i - 1] : '';

      if (!inString) {
        if (ch === "'" || ch === '"') {
          inString = true;
          stringChar = ch;
          current += ch;
        } else if (ch === ';') {
          const trimmed = current.trim();
          if (trimmed.length > 0) {
            statements.push(trimmed);
          }
          current = '';
        } else {
          current += ch;
        }
      } else {
        current += ch;
        // Handle escaped quotes ('' or \')
        if (ch === stringChar && prev !== '\\') {
          // Check for doubled quote escape: ''
          if (i + 1 < sql.length && sql[i + 1] === stringChar) {
            // This is an escaped quote, keep going inside string
            current += sql[i + 1];
            i++;
          } else {
            inString = false;
          }
        }
      }
    }

    // Catch any trailing statement without a trailing semicolon
    const trimmed = current.trim();
    if (trimmed.length > 0) {
      statements.push(trimmed);
    }

    // Filter out pure comment blocks and empty strings
    return statements.filter((s) => {
      const stripped = s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      return stripped.length > 0 && !stripped.startsWith('--');
    });
  }
}

/** Singleton instance */
export const duckDBUdfService = new DuckDBUdfService();
export default duckDBUdfService;
