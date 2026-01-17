// This file centralizes the definitions for DuckDB engine resources.

// 1. Import resource URLs as relative paths
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_worker_mvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker_eh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import duckdb_pthread_worker_from_url from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url';
import duckdb_pthread_worker_content from '@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?raw';

// 2. Define and export the DUCKDB_RESOURCES constant
export const getDuckDBResources = () => {
  // The worker script URL needs to be resolved at runtime by the extension.
  const our_duckdb_worker_script_url = chrome.runtime.getURL('assets/duckdb.worker.js');

  return {
    'duckdb-mvp.wasm': duckdb_wasm,
    'duckdb-browser-mvp.worker.js': duckdb_worker_mvp,
    'duckdb-eh.wasm': duckdb_wasm_eh,
    'duckdb-browser-eh.worker.js': duckdb_worker_eh,
    'duckdb-browser-coi.pthread.worker.js': duckdb_pthread_worker_from_url,
    'duckdb-browser-coi.pthread.worker.js_content': duckdb_pthread_worker_content,
    'our-duckdb-worker-script.js': our_duckdb_worker_script_url,
  };
};
