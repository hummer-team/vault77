import { useCallback } from 'react';
import { useDuckDB } from './useDuckDB';

interface SchemaColumn {
  name: string;
}

type SchemaCache = Record<string, SchemaColumn[]>;

/**
 * Hook for managing table schema caching in chrome.storage.session
 * Used for User Skill Configuration and other features requiring column metadata
 * 
 * @param iframeRef Reference to the sandbox iframe (used internally for DuckDB communication)
 */
export const useTableSchema = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
  // Internal: Get schema fetcher from useDuckDB
  const { getTableSchema, isDBReady } = useDuckDB(iframeRef);

  /**
   * Cache table schema to chrome.storage.session
   * @param tableName The name of the table to cache schema for
   */
  const cacheTableSchema = useCallback(
    async (tableName: string): Promise<void> => {
      if (!isDBReady) {
        console.warn('[useTableSchema] DuckDB not ready, cannot cache schema');
        return;
      }

      try {
        const schemaResult = await getTableSchema(tableName);
        if (!schemaResult || !Array.isArray(schemaResult.data)) {
          console.warn(`[useTableSchema] Invalid schema result for table: ${tableName}`);
          return;
        }

        // Extract column names from schema result
        const columns: SchemaColumn[] = schemaResult.data
          .map((row: any) => ({
            name: row.column_name || row.name || '',
          }))
          .filter((col) => col.name.length > 0);

        // Read existing cache
        const result = await chrome.storage.session.get('schemaCache');
        const existingCache = (result.schemaCache as SchemaCache | undefined) || {};

        // Update cache with new table schema
        const updatedCache: SchemaCache = {
          ...existingCache,
          [tableName]: columns,
        };

        // Write back to session storage
        await chrome.storage.session.set({ schemaCache: updatedCache });
        console.log(
          `[useTableSchema] Cached schema for table: ${tableName}, columns:`,
          columns.map((c) => c.name).join(', ')
        );
      } catch (error) {
        console.error(`[useTableSchema] Failed to cache schema for table: ${tableName}`, error);
      }
    },
    [getTableSchema, isDBReady]
  );

  /**
   * Remove table schema from cache
   * @param tableName The name of the table to remove from cache
   */
  const removeTableSchemaFromCache = useCallback(async (tableName: string): Promise<void> => {
    try {
      const result = await chrome.storage.session.get('schemaCache');
      const existingCache = (result.schemaCache as SchemaCache | undefined) || {};
      const { [tableName]: removed, ...updatedCache } = existingCache;
      await chrome.storage.session.set({ schemaCache: updatedCache });
      console.log(`[useTableSchema] Removed schema cache for table: ${tableName}`);
    } catch (error) {
      console.warn(`[useTableSchema] Failed to remove schema cache for table: ${tableName}`, error);
    }
  }, []);

  return {
    cacheTableSchema,
    removeTableSchemaFromCache,
  };
};
