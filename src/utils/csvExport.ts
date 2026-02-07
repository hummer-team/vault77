/**
 * CSV Export Utility
 * Provides functions to export data to CSV files
 */

/**
 * Escape CSV value (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: any): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Export data to CSV file
 * @param data Array of objects to export
 * @param filename Output filename (without .csv extension)
 * @param columns Optional column names, defaults to all keys from first row
 */
export function exportToCSV(
  data: any[],
  filename: string,
  columns?: string[]
): void {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  // Determine columns
  const cols = columns || Object.keys(data[0]);
  
  // Build CSV header
  const header = cols.map(escapeCSVValue).join(',');
  
  // Build CSV rows
  const rows = data.map(row => {
    return cols.map(col => escapeCSVValue(row[col])).join(',');
  });
  
  // Combine and create blob
  const csvContent = [header, ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Trigger download
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
