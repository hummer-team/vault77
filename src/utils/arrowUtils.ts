/**
 * Arrow IPC Utilities
 * Shared serialization/deserialization functions for WASM communication
 * Extracted from anomaly.worker.ts to avoid code duplication
 */

import * as arrow from 'apache-arrow';

// ============================================================================
// WASM Column Name Mapping
// ============================================================================

/**
 * Column name mapping between TypeScript and WASM
 * 
 * **Why this is needed:**
 * - TypeScript side uses semantic names (e.g., 'customer_id' for customer clustering)
 * - Wasm functions have hardcoded column name expectations (e.g., 'order_id')
 * - This mapping provides a single source of truth for these inconsistencies
 * 
 * **Usage:**
 * ```typescript
 * // When serializing for Wasm
 * const wasmColumnName = WASM_COLUMN_MAPPING.clustering.idColumn; // 'order_id'
 * const arrowData = serializeToArrowIPC(ids, wasmColumnName, features);
 * 
 * // When deserializing from Wasm
 * const result = deserializeFromArrowIPC(wasmResult, wasmColumnName, ['cluster_id']);
 * ```
 */
export const WASM_COLUMN_MAPPING = {
  /**
   * Clustering (segment_customer_orders)
   * - TypeScript: customer_id (semantic name)
   * - Wasm expects: order_id (hardcoded in Rust)
   */
  clustering: {
    idColumn: 'order_id',  // Wasm expects 'order_id' even for customer clustering
    resultColumns: ['cluster_id'] as string[],
  },
  
  /**
   * Anomaly Detection (detect_outliers)
   * - TypeScript: order_id
   * - Wasm expects: order_id (consistent)
   */
  anomaly: {
    idColumn: 'order_id',
    resultColumns: ['abnormal_score', 'is_abnormal'] as string[],
  },
};

// ============================================================================
// Generic Arrow IPC Serialization
// ============================================================================

/**
 * Serialize data to Arrow IPC Stream format (CSP-safe using Builder API)
 * 
 * @param idColumn - Array of IDs (String type, UTF8 encoding)
 * @param idColumnName - Name for ID column (e.g., 'order_id', 'customer_id')
 * @param features - Feature matrix (2D number array)
 * @returns Uint8Array in Arrow IPC Stream format
 * 
 * @example
 * ```typescript
 * const ids = ['C001', 'C002', 'C003'];
 * const features = [[10, 5, 1000], [30, 2, 500], [5, 10, 2000]];
 * const arrowData = await serializeToArrowIPC(ids, 'customer_id', features);
 * ```
 */
export async function serializeToArrowIPC(
  idColumn: string[],
  idColumnName: string,
  features: number[][]
): Promise<Uint8Array> {
  try {
    // Validate input
    if (idColumn.length === 0) {
      throw new Error('Empty ID column array');
    }
    if (features.length !== idColumn.length) {
      throw new Error(`Feature count mismatch: ${features.length} vs ${idColumn.length} IDs`);
    }

    const featureCount = features[0]?.length || 0;
    if (featureCount === 0) {
      throw new Error('No features provided');
    }

    const rowCount = idColumn.length;

    // Build vectors using Builder API (no eval needed)
    // 1. ID column using Utf8Builder
    const idBuilder = new arrow.Utf8Builder({ type: new arrow.Utf8() });
    for (const id of idColumn) {
      idBuilder.append(id);
    }
    const idVector = idBuilder.finish().toVector();

    // 2. Feature columns using Float64Builder
    const featureVectors = [];
    for (let i = 0; i < featureCount; i++) {
      const featureBuilder = new arrow.Float64Builder({ type: new arrow.Float64() });
      for (let j = 0; j < rowCount; j++) {
        featureBuilder.append(features[j][i]);
      }
      featureVectors.push(featureBuilder.finish().toVector());
    }

    // 3. Build schema
    const fields = [
      new arrow.Field(idColumnName, new arrow.Utf8(), false),
      ...Array.from({ length: featureCount }, (_, i) =>
        new arrow.Field(`feature_${i}`, new arrow.Float64(), false)
      ),
    ];
    const schema = new arrow.Schema(fields);

    // 4. Create RecordBatch from vectors
    const children = [idVector.data[0], ...featureVectors.map(v => v.data[0])];
    const structData = new arrow.Data(
      new arrow.Struct(fields),
      0,
      rowCount,
      0,
      undefined,
      children
    );
    const recordBatch = new arrow.RecordBatch(schema, structData);

    // 5. Serialize to IPC Stream format
    const writer = arrow.RecordBatchStreamWriter.writeAll([recordBatch]);
    const arrowData = await writer.toUint8Array();

    console.log(`[ArrowUtils] Serialized ${rowCount} rows x ${featureCount} features (${arrowData.byteLength} bytes)`);
    return new Uint8Array(arrowData);
  } catch (error) {
    console.error('[ArrowUtils] Arrow IPC serialization failed:', error);
    throw new Error(`Arrow serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Generic Arrow IPC Deserialization
// ============================================================================

/**
 * Deserialize Arrow IPC result from WASM
 * 
 * @param arrowResult - Uint8Array from WASM in Arrow IPC format
 * @param idColumnName - Name of ID column to extract (e.g., 'order_id', 'customer_id')
 * @param expectedColumns - Array of expected column names (for validation)
 * @returns Object with extracted column arrays
 * 
 * @example
 * ```typescript
 * const result = deserializeFromArrowIPC(
 *   wasmResult,
 *   'customer_id',
 *   ['cluster_id']
 * );
 * // result = { customerIds: [...], cluster_id: [...] }
 * ```
 */
export function deserializeFromArrowIPC<T extends Record<string, any>>(
  arrowResult: Uint8Array,
  idColumnName: string,
  expectedColumns: string[]
): T & { ids: string[] } {
  try {
    // Parse Arrow Table from IPC
    const table = arrow.tableFromIPC(arrowResult);

    // Extract ID column
    const idColumn = table.getChild(idColumnName);
    if (!idColumn) {
      throw new Error(`Missing ID column '${idColumnName}' in WASM result`);
    }

    // Extract expected columns
    const result: any = {
      ids: Array.from(idColumn.toArray()) as string[],
    };

    for (const colName of expectedColumns) {
      const column = table.getChild(colName);
      if (!column) {
        throw new Error(`Missing column '${colName}' in WASM result`);
      }
      result[colName] = Array.from(column.toArray());
    }

    console.log(`[ArrowUtils] Deserialized ${result.ids.length} rows with ${expectedColumns.length} columns`);
    return result as T & { ids: string[] };
  } catch (error) {
    console.error('[ArrowUtils] Arrow IPC deserialization failed:', error);
    throw new Error(`Arrow deserialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ============================================================================
// Specialized Deserialization Functions (for specific WASM outputs)
// ============================================================================

/**
 * Deserialize anomaly detection result (order_id, abnormal_score, is_abnormal)
 * @deprecated Use deserializeFromArrowIPC with specific column names instead
 */
export function deserializeAnomalyResult(arrowResult: Uint8Array): {
  orderIds: string[];
  abnormalScores: number[];
  isAbnormal: boolean[];
} {
  return deserializeFromArrowIPC<{
    abnormal_score: number[];
    is_abnormal: boolean[];
  }>(arrowResult, 'order_id', ['abnormal_score', 'is_abnormal']) as any;
}

/**
 * Deserialize clustering result (customer_id, cluster_id)
 * 
 * Note: Uses WASM_COLUMN_MAPPING.clustering to handle the naming inconsistency
 * between TypeScript (customer_id) and Wasm (order_id).
 */
export function deserializeClusteringResult(arrowResult: Uint8Array): {
  customerIds: string[];
  clusterIds: number[];
} {
  const result = deserializeFromArrowIPC<{
    cluster_id: number[];
  }>(
    arrowResult,
    WASM_COLUMN_MAPPING.clustering.idColumn,  // 'order_id' (Wasm format)
    WASM_COLUMN_MAPPING.clustering.resultColumns
  );
  
  return {
    customerIds: result.ids,  // Convert back to semantic name
    clusterIds: result.cluster_id,
  };
}
