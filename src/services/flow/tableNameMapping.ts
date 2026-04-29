/**
 * Table Name Mapping Service
 * Maps internal table names (main_table_1, main_table_2) to user-friendly display names
 * based on uploaded file names and sheet names.
 *
 * Example:
 *   attachments = [
 *     { id: '1', file: { name: 'sales_data.xlsx' }, tableName: 'main_table_1', sheetName: 'Sheet1' },
 *     { id: '2', file: { name: 'sales_data.xlsx' }, tableName: 'main_table_2', sheetName: 'Sheet2' },
 *   ]
 *
 *   getTableDisplayNameMap(attachments) returns:
 *   {
 *     'main_table_1': 'sales_data_Sheet1',
 *     'main_table_2': 'sales_data_Sheet2',
 *   }
 */

import type { Attachment } from '../../types/workbench.types';

/**
 * Generate a mapping from table names to user-friendly display names
 * @param attachments Array of attachments with file metadata
 * @returns Map of tableName → displayName (e.g., { 'main_table_1': 'data_Sheet1' })
 *          Note: Names are NOT truncated here; truncation happens in UI layer
 */
export function getTableDisplayNameMap(attachments: Attachment[]): Record<string, string> {
  const map: Record<string, string> = {};

  for (const attachment of attachments) {
    const fileName = attachment.file?.name || 'unknown';
    const sheetName = attachment.sheetName || '';

    // Build display name: "fileName_sheetName"
    const displayName = sheetName
      ? `${fileName}_${sheetName}`
      : fileName;

    map[attachment.tableName] = displayName;
  }

  return map;
}

/**
 * Get the user-friendly display name for a single table
 * @param tableName Internal table name (e.g., 'main_table_1')
 * @param displayNameMap Map from getTableDisplayNameMap()
 * @returns Display name, or original tableName if not found
 */
export function getTableDisplayName(
  tableName: string,
  displayNameMap: Record<string, string>
): string {
  return displayNameMap[tableName] ?? tableName;
}

/**
 * Truncate a display name to a maximum length with ellipsis
 * @param name Display name to truncate
 * @param maxLength Maximum length (default: 20)
 * @returns Truncated name with "..." if exceeded, or original if under limit
 *
 * Example:
 *   truncateDisplayName('very_long_file_name_Sheet1') // => 'very_long_file_na...'
 *   truncateDisplayName('short.xlsx') // => 'short.xlsx'
 */
export function truncateDisplayName(name: string, maxLength: number = 20): string {
  if (name.length <= maxLength) {
    return name;
  }
  return name.substring(0, maxLength - 3) + '...';
}

/**
 * Get the full display name for a table (for use in tooltips)
 * Returns the untruncated display name
 * @param tableName Internal table name (e.g., 'main_table_1')
 * @param displayNameMap Map from getTableDisplayNameMap()
 * @returns Full untruncated display name
 */
export function getFullTableDisplayName(
  tableName: string,
  displayNameMap: Record<string, string>
): string {
  return displayNameMap[tableName] ?? tableName;
}
