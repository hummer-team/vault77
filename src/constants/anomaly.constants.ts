/**
 * Anomaly Detection Constants
 * Configuration values for anomaly detection visualization and processing
 */

/**
 * Maximum anomalies to display in charts for performance reasons
 * When anomaly count exceeds this limit, only top N anomalies are shown
 */
export const MAX_ANOMALIES_FOR_VISUALIZATION = 500;

/**
 * Warning threshold for large anomaly datasets
 * UI will show performance warning when count exceeds this value
 */
export const ANOMALY_COUNT_WARNING_THRESHOLD = 1000;

/**
 * Maximum anomalies to view in analysis panel
 * View functionality will be limited to this number to prevent timeout
 */
export const MAX_ANOMALIES_FOR_VIEW = 10000;

/**
 * Maximum anomalies to download in CSV
 * For larger datasets, recommend batch export or backend export
 */
export const MAX_ANOMALIES_FOR_DOWNLOAD = 50000;
