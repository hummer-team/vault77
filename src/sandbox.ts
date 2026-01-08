// import DuckDBWorker from './workers/duckdb.worker.ts?worker'; // <-- 移除此行

console.log('[Sandbox] Script started.');
console.log('[Sandbox.ts] window.origin:', window.origin); // <-- Added this log

// 声明 duckdbWorker 变量，但不在全局作用域创建实例
let duckdbWorker: Worker | null = null;

// Helper function to resolve URLs relative to the sandbox's origin
// This function is now only used for resources other than the main worker script
// const resolveURL = (path: string, extensionOrigin: string) => {
  // path from Vite is like '/assets/file.js'
  // extensionOrigin is like 'chrome-extension://<ID>/'
  // We combine them to get the absolute URL
  // FIX: The path from useDuckDB.ts is already absolute, so just return it.
  // The original resolveURL logic was for relative paths.
  // Now, resources passed to sandbox are already absolute chrome-extension:// URLs.
  // return path;
// };


// 监听来自父窗口的消息 (useDuckDB.ts)
window.addEventListener('message', async (event) => {
  console.log('[Sandbox] Received raw message from parent:', event.data); // <-- Added this log
  console.log('[Sandbox] Received message from parent:', event.data.type);

  if (!event.source) return;

  const { type, resources, extensionOrigin } = event.data; 

  // Special handling for DUCKDB_INIT to create the Worker and resolve resource URLs
  if (type === 'DUCKDB_INIT') {
    if (!resources) throw new Error('Missing resources for DUCKDB_INIT');
    if (!extensionOrigin) throw new Error('Missing extensionOrigin for DUCKDB_INIT'); // This check is now valid

    // 1. Get the URL of our custom duckdb.worker.ts script
    const ourWorkerScriptURL = resources['our-duckdb-worker-script.js'];
    if (!ourWorkerScriptURL) throw new Error('Missing our-duckdb-worker-script.js URL');

    // 移除 fetch, Blob, createObjectURL 等步骤
    // console.log('[Sandbox] Fetching worker script from:', ourWorkerScriptURL);
    // const response = await fetch(ourWorkerScriptURL);
    // const workerScriptContent = await response.text();
    // const workerBlob = new Blob([workerScriptContent], { type: 'application/javascript' });
    // const workerBlobURL = URL.createObjectURL(workerBlob);
    // console.log('[Sandbox] Created worker Blob URL:', workerBlobURL);

    // 4. Create the Worker directly using the provided URL
    duckdbWorker = new Worker(ourWorkerScriptURL, { type: 'module' }); // <-- Directly use ourWorkerScriptURL
    console.log('[Sandbox] DuckDB Worker created directly from URL with type module:', duckdbWorker); // Updated log

    // 5. Set up the onmessage handler for the newly created worker
    duckdbWorker.onmessage = (workerEvent) => {
      console.log('[Sandbox] Received message from DuckDB Worker:', workerEvent.data.type);
      if (window.parent && window.parent !== window) {
        const transfer = workerEvent.data.data instanceof ArrayBuffer ? [workerEvent.data.data] : [];
        window.parent.postMessage(workerEvent.data, '*', transfer);
      }
    };

    // 6. Resources are already absolute chrome-extension:// URLs from useDuckDB.ts
    // No need for further resolveURL calls here for the bundle resources.
    // Just ensure the 'resources' object passed to the worker is the one with absolute URLs.
    
    // 7. Forward the DUCKDB_INIT message with resolved resources to the DuckDB Worker
    // The worker will then use these absolute URLs for duckdb-wasm bundles
    duckdbWorker.postMessage({ ...event.data, resources: resources }); // resources are already absolute

    // 移除 URL.revokeObjectURL(workerBlobURL);
    // URL.revokeObjectURL(workerBlobURL);

  } else {
    // For other messages, if worker is not yet created, throw an error or queue
    if (!duckdbWorker) {
      console.error('[Sandbox] DuckDB Worker not initialized yet for message type:', type);
      // Optionally, send an error back to parent or queue the message
      return; 
    }
    // For other messages, just forward them directly
    duckdbWorker.postMessage(event.data, event.data.buffer instanceof ArrayBuffer ? [event.data.buffer] : []);
  }
});

// 通知父窗口 Sandbox 已经准备好
if (window.parent && window.parent !== window) {
  console.log('[Sandbox] Sending SANDBOX_READY to parent.');
  window.parent.postMessage({ type: 'SANDBOX_READY' }, '*');
}
