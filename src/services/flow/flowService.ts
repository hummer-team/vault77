/**
 * Flow Service
 * Integration with DuckDB for analysis flow data operations
 */

import type { Field, FieldType, TableSchema, FlowNode, FlowEdge, JoinEdgeData, TableNodeData } from './types';
import { PLACEHOLDER_CONSTANTS } from './constants';

/**
 * Get list of available tables from DuckDB
 * Filters tables with 'main_table_' prefix
 * @param executeQuery DuckDB query executor function
 */
export async function getAvailableTables(
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<string[]> {
  try {
    // Query information_schema for tables (remove table_schema filter to match useDuckDB behavior)
    const result = await executeQuery(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE 'main_table_%'
      ORDER BY table_name
    `);

    return result.data.map((row: { table_name: string }) => row.table_name);
  } catch (error) {
    console.error('[FlowService] Failed to get tables from information_schema:', error);
    // Fallback: try to get all tables using SHOW TABLES
    try {
      const result = await executeQuery(`SHOW TABLES`);
      console.log('[FlowService] SHOW TABLES result:', result);
      // Handle different possible column names
      return result.data.map((row: any) => {
        return row.name || row.table_name || row.table || row[Object.keys(row)[0]];
      }).filter((name: string) => name && name.includes('main_table_'));
    } catch (fallbackError) {
      console.error('[FlowService] Fallback also failed:', fallbackError);
      return [];
    }
  }
}

/**
 * Get table schema (fields) from DuckDB
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 */
export async function getTableSchema(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<TableSchema> {
  try {
    const result = await executeQuery(`DESCRIBE "${tableName}"`);

    // Map DuckDB schema to Field type
    const fields: Field[] = result.data.map((row: any) => ({
      name: row.column_name || row.Column || row.col_name || row.column || 'unknown',
      type: mapDuckDBTypeToFieldType(row.column_type || row.Type || row.col_type || row.type || 'UNKNOWN'),
      nullable: row.null !== 'NO' && row.null !== false,
    }));

    return {
      tableName,
      fields,
    };
  } catch (error) {
    console.error(`[FlowService] Failed to get schema for ${tableName}:`, error);
    return {
      tableName,
      fields: [],
    };
  }
}

/**
 * Map DuckDB type to FieldType enum
 */
function mapDuckDBTypeToFieldType(duckdbType: string): FieldType {
  const type = duckdbType.toUpperCase();

  // Integer types
  if (type.includes('INTEGER') || type === 'INT') return 'INTEGER' as FieldType;
  if (type.includes('BIGINT')) return 'BIGINT' as FieldType;
  if (type.includes('SMALLINT')) return 'SMALLINT' as FieldType;
  if (type.includes('TINYINT')) return 'TINYINT' as FieldType;

  // Decimal types
  if (type.includes('DECIMAL') || type.includes('NUMERIC')) return 'DECIMAL' as FieldType;
  if (type.includes('REAL')) return 'REAL' as FieldType;
  if (type.includes('DOUBLE') || type.includes('FLOAT')) return 'DOUBLE' as FieldType;

  // String types
  if (type.includes('VARCHAR')) return 'VARCHAR' as FieldType;
  if (type.includes('TEXT')) return 'TEXT' as FieldType;
  if (type.includes('CHAR')) return 'CHAR' as FieldType;

  // Date/Time types
  if (type.includes('TIMESTAMP')) return 'TIMESTAMP' as FieldType;
  if (type.includes('DATE')) return 'DATE' as FieldType;
  if (type.includes('TIME')) return 'TIME' as FieldType;

  // Other types
  if (type.includes('BOOLEAN') || type === 'BOOL') return 'BOOLEAN' as FieldType;
  if (type.includes('BLOB') || type.includes('BYTEA')) return 'BLOB' as FieldType;
  if (type.includes('JSON')) return 'JSON' as FieldType;
  if (type.includes('UUID')) return 'UUID' as FieldType;
  if (type.includes('ARRAY') || type.includes('LIST')) return 'ARRAY' as FieldType;

  return 'UNKNOWN' as FieldType;
}

/**
 * Check if a table exists in DuckDB
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 */
export async function tableExists(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<boolean> {
  try {
    const result = await executeQuery(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'main' 
      AND table_name = '${tableName}'
    `);

    return result.data[0]?.count > 0;
  } catch (error) {
    console.error(`[FlowService] Failed to check if table exists: ${tableName}`, error);
    return false;
  }
}

/**
 * Get sample data from a table (for preview)
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 * @param limit Number of rows to return
 */
export async function getTableSample(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>,
  limit: number = 5
): Promise<{ data: any[]; schema: any[] }> {
  try {
    return await executeQuery(`
      SELECT * FROM "${tableName}" LIMIT ${limit}
    `);
  } catch (error) {
    console.error(`[FlowService] Failed to get sample from ${tableName}:`, error);
    return { data: [], schema: [] };
  }
}

/**
 * Get row count for a table
 * @param tableName Table name
 * @param executeQuery DuckDB query executor function
 */
export async function getTableRowCount(
  tableName: string,
  executeQuery: (sql: string) => Promise<{ data: any[]; schema: any[] }>
): Promise<number> {
  try {
    const result = await executeQuery(`
      SELECT COUNT(*) as count FROM "${tableName}"
    `);
    return result.data[0]?.count || 0;
  } catch (error) {
    console.error(`[FlowService] Failed to get row count for ${tableName}:`, error);
    return 0;
  }
}

// ============================================================================
// Placeholder Name Generation
// ============================================================================

/**
 * Generate a unique refId for condition definition node (e.g., GC1, CG2)
 * @param nodes Current flow nodes
 * @returns Unique refId (max 5 chars, alphanumeric)
 */
export function generateConditionGroupRefId(nodes: FlowNode[]): string {
  const prefix = PLACEHOLDER_CONSTANTS.DEFAULT_PREFIX;
  const existingIds = new Set(
    nodes
      .filter((n) => n.type === 'conditionGroupDefinition')
      .map((n) => (n.data as { refId?: string }).refId)
      .filter(Boolean)
  );

  let counter = 1;
  let refId = `${prefix}${counter}`;

  while (existingIds.has(refId)) {
    counter++;
    refId = `${prefix}${counter}`;
  }

  return refId;
}

/**
 * Generate placeholder name for a condition within a group
 * @param refId Group refId (e.g., GC1)
 * @param conditionIndex Condition index within group (0-based)
 * @returns Placeholder name (e.g., GC1_1, CG1_2)
 */
export function generatePlaceholderName(refId: string, conditionIndex: number): string {
  return `${refId}${PLACEHOLDER_CONSTANTS.SEPARATOR}${conditionIndex + 1}`;
}

/**
 * Generate display name for ConditionGroupDefinitionNode (条件组)
 * Maps GC_1 -> "条件组_1", GC_2 -> "条件组_2", etc.
 * @param refId Internal refId (e.g., GC_1)
 * @returns User-friendly display name (e.g., "条件组_1")
 */
export function generateConditionGroupDefinitionDisplayName(refId: string): string {
  // Extract number from refId (e.g., "GC_1" -> "1", "CG1" -> "1")
  const match = refId.match(/\d+/);
  if (!match) return refId; // Fallback if no number found
  const num = match[0];
  return `条件组_${num}`;
}

/**
 * Generate display name for ConditionGroupRelationNode (条件组关系)
 * Maps counter 1 -> "条件组关系_1", 2 -> "条件组关系_2", etc.
 * @param nodes Current flow nodes to count existing ConditionGroupRelationNodes
 * @returns User-friendly display name (e.g., "条件组关系_1")
 */
export function generateConditionGroupRelationDisplayName(nodes: FlowNode[]): string {
  // Count existing ConditionGroupRelationNodes (currently CONDITION_GROUP_RELATION type)
  const conditionGroupRelationCount = nodes.filter((n) => n.type === 'conditionGroupRelation').length;
  return `条件组关系_${conditionGroupRelationCount + 1}`;
}

/**
 * Validate refId format (Q18: max 5 chars, alphanumeric only)
 * @param refId RefId to validate
 * @returns Validation result
 */
export function validateRefId(refId: string): { valid: boolean; error?: string } {
  if (refId.length > PLACEHOLDER_CONSTANTS.MAX_REF_ID_LENGTH) {
    return {
      valid: false,
      error: `RefId must be at most ${PLACEHOLDER_CONSTANTS.MAX_REF_ID_LENGTH} characters`,
    };
  }

  if (!PLACEHOLDER_CONSTANTS.ALLOWED_REF_ID_PATTERN.test(refId)) {
    return {
      valid: false,
      error: 'RefId must contain only alphanumeric characters',
    };
  }

  return { valid: true };
}

/**
 * Check if refId is unique within the flow (Q18: unique within flow)
 * @param refId RefId to check
 * @param nodes Current flow nodes
 * @param excludeNodeId Optional node ID to exclude (for editing)
 * @returns Whether refId is unique
 */
export function isRefIdUnique(
  refId: string,
  nodes: FlowNode[],
  excludeNodeId?: string
): boolean {
  return !nodes.some(
    (n) =>
      n.type === 'conditionGroupDefinition' &&
      n.id !== excludeNodeId &&
      (n.data as { refId?: string }).refId === refId
  );
}

/**
 * Get the set of DuckDB table names that are upstream of a given node and
 * connected via **configured** join edges (JoinEdgeData.configured === true).
 *
 * Algorithm:
 * 1. BFS backwards from `nodeId` (following all edge types) to find upstream nodes.
 * 2. Collect all upstream table node names (seed set).
 * 3. Build a **bidirectional** adjacency graph from configured join edges.
 * 4. BFS over that graph starting from any seed table to expand to the full join cluster.
 *    This correctly handles join edges that point in either direction relative to the canvas flow.
 * 5. Fallback: if no configured joins exist, return just the upstream table nodes.
 *
 * @param nodeId  The node to start tracing from (typically a SelectNode / UdfConfigNode).
 * @param nodes   Full node list from the flow store.
 * @param edges   Full edge list from the flow store.
 * @returns       Ordered list of table names; empty array means "use all available tables".
 */
export function getUpstreamConfiguredJoinedTables(
  nodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[]
): string[] {
  // --- Step 1: BFS backwards (target→source) to collect upstream node IDs ---
  const upstream = new Set<string>([nodeId]);
  const queue: string[] = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      if (edge.target === current && !upstream.has(edge.source)) {
        upstream.add(edge.source);
        queue.push(edge.source);
      }
    }
  }

  // --- Step 2: Collect table names from upstream table nodes (seed set) ---
  const seedTables = new Set<string>();
  for (const nid of upstream) {
    const node = nodes.find((n) => n.id === nid);
    if (node?.type === 'table') {
      const tableName = (node.data as TableNodeData).tableName;
      if (tableName) seedTables.add(tableName);
    }
  }

  if (seedTables.size === 0) return [];

  // --- Step 3: Build bidirectional join graph from all configured join edges ---
  // (Join edges connect table nodes bidirectionally — direction in canvas is arbitrary)
  const joinGraph = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type !== 'join') continue;
    const d = edge.data as JoinEdgeData | undefined;
    if (!d?.configured) continue;
    const { sourceTableName: src, targetTableName: tgt } = d;
    if (!src || !tgt) continue;
    if (!joinGraph.has(src)) joinGraph.set(src, new Set());
    if (!joinGraph.has(tgt)) joinGraph.set(tgt, new Set());
    joinGraph.get(src)!.add(tgt);
    joinGraph.get(tgt)!.add(src); // bidirectional
  }

  // --- Step 4: BFS over join graph starting from seed tables to expand the cluster ---
  const seedsInGraph = [...seedTables].filter((t) => joinGraph.has(t));
  if (seedsInGraph.length === 0) {
    // No join edges — single-table mode, return the upstream tables
    return [...seedTables];
  }

  const cluster = new Set<string>(seedsInGraph);
  const clusterQueue = [...seedsInGraph];

  while (clusterQueue.length > 0) {
    const current = clusterQueue.shift()!;
    for (const neighbor of joinGraph.get(current) ?? []) {
      if (!cluster.has(neighbor)) {
        cluster.add(neighbor);
        clusterQueue.push(neighbor);
      }
    }
  }

  return [...cluster];
}

/**
 * Get all tables participating in at least one configured join edge on the canvas.
 *
 * Unlike `getUpstreamConfiguredJoinedTables`, this function does NOT require a
 * specific starting node — it scans the entire edge list for configured join
 * edges and returns all connected table names. Use this for nodes (e.g.,
 * ConditionGroupDefinitionNode) that may not have direct upstream edges to table nodes.
 *
 * @param edges  Full edge list from the flow store.
 * @returns      List of table names in the joined cluster; empty if no configured joins.
 */
export function getCanvasJoinedTables(edges: FlowEdge[]): string[] {
  // Build bidirectional join graph from configured join edges
  const joinGraph = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.type !== 'join') continue;
    const d = edge.data as JoinEdgeData | undefined;
    if (!d?.configured) continue;
    const { sourceTableName: src, targetTableName: tgt } = d;
    if (!src || !tgt) continue;
    if (!joinGraph.has(src)) joinGraph.set(src, new Set());
    if (!joinGraph.has(tgt)) joinGraph.set(tgt, new Set());
    joinGraph.get(src)!.add(tgt);
    joinGraph.get(tgt)!.add(src);
  }

  if (joinGraph.size === 0) return [];

  // BFS to collect all tables in the join cluster
  const visited = new Set<string>();
  const result: string[] = [];
  for (const tableName of joinGraph.keys()) {
    if (!visited.has(tableName)) {
      const queue = [tableName];
      visited.add(tableName);
      while (queue.length > 0) {
        const curr = queue.shift()!;
        result.push(curr);
        for (const neighbor of joinGraph.get(curr) ?? []) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }
  }
  return result;
}
