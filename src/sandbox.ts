// import type * as Arrow from 'apache-arrow'; // <-- Added type import
// import DuckDBWorker from './workers/duckdb.worker.ts?worker'; // <-- 移除此行

import { logger } from './utils/logger';
logger.info('[Sandbox] Script started.');
logger.info('[Sandbox.ts] window.origin:', window.origin); // <-- Added this log

// 声明 duckdbWorker 变量，但不在全局作用域创建实例
let duckdbWorker: Worker | null = null;
// Once the worker instance is created and DUCKDB_INIT is posted, it can accept queued messages.
// The actual DB readiness is handled by the parent via DUCKDB_INIT_SUCCESS.
let isDuckdbWorkerReady = false;
const pendingMessages: Array<{ data: any; transferables: Transferable[] }> = [];

const flushPendingMessages = () => {
    if (!duckdbWorker || !isDuckdbWorkerReady) return;
    while (pendingMessages.length > 0) {
        const msg = pendingMessages.shift();
        if (!msg) break;
        try {
            logger.info('[Sandbox] Flushing pending message to duckdbWorker:', msg.data?.type);
            duckdbWorker.postMessage(msg.data, msg.transferables);
        } catch (e) {
            logger.warn('[Sandbox] Failed to flush pending message:', e);
        }
    }
};

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
    logger.info('[Sandbox] Received raw message from parent:', event.data);

    // --- NEW LOGGING ---
    if (event.data && event.data.buffer instanceof ArrayBuffer) {
        logger.info('[Sandbox] Received buffer with byteLength:', event.data.buffer.byteLength);
    }
    // --- END NEW LOGGING ---

    try {
        const safeLog = {
            type: event.data?.type,
            hasBuffer: event.data?.buffer instanceof ArrayBuffer,
            fileName: event.data?.fileName,
        };
        logger.info('[Sandbox] Received message summary:', safeLog);
    } catch (e) {
        logger.warn('[Sandbox] Failed to build safe log summary:', e);
    }

    logger.info('[Sandbox] Received message from parent type (from event.data.type):', event.data.type);
    logger.info('[Sandbox] Message origin:', event.origin); // <-- Added this log

    if (!event.source) return;
    // It's possible for event.data to be null or not an object
    if (!event.data) {
        logger.warn('[Sandbox] Received message with null or undefined data, ignoring.');
        return;
    }

    const { type, resources, extensionOrigin, id } = event.data;

    logger.info('[Sandbox] Destructured type:', type);
    logger.info('[Sandbox] Destructured resources:', resources);
    logger.info('[Sandbox] Destructured extensionOrigin:', extensionOrigin);
    logger.info('[Sandbox] Destructured id:', id);

    // Handle shutdown message: try to forward to worker and terminate/cleanup
    if (type === 'DUCKDB_SHUTDOWN') {
        logger.info('[Sandbox] Received DUCKDB_SHUTDOWN from parent.');
        if (!duckdbWorker) {
            logger.warn('[Sandbox] No duckdbWorker to shutdown. Posting DUCKDB_SHUTDOWN_SUCCESS to parent.');
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({ type: 'DUCKDB_SHUTDOWN_SUCCESS', id }, '*');
            }
            return;
        }

        // Try to send shutdown to worker and wait for ack; if no ack, force terminate after timeout
        try {
            const shutdownId = id || null;
            // send best-effort shutdown request to worker
            duckdbWorker.postMessage({ type: 'DUCKDB_SHUTDOWN', id: shutdownId });
        } catch (e) {
            logger.warn('[Sandbox] Failed to post DUCKDB_SHUTDOWN to worker:', e);
        }

        // set up a short-lived listener for worker ack; if ack arrives, it will be handled in duckdbWorker.onmessage
        const forceTimeout = setTimeout(() => {
            try {
                logger.info('[Sandbox] Forcing duckdbWorker.terminate() after timeout.');
                duckdbWorker?.terminate();
            } catch (e) {
                logger.warn('[Sandbox] Error terminating duckdbWorker:', e);
            } finally {
                duckdbWorker = null;
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({ type: 'DUCKDB_SHUTDOWN_SUCCESS', id }, '*');
                }
            }
        }, 500);

        // Also attach a temporary onmessage wrapper to catch shutdown ack
        const originalOnMessage = duckdbWorker.onmessage;
        duckdbWorker.onmessage = (workerEvent) => {
            try {
                const wtype = workerEvent.data?.type;
                logger.info('[Sandbox] Received message from DuckDB Worker while shutting down:', wtype);
                if (wtype === 'DUCKDB_SHUTDOWN_ACK' || wtype === 'DUCKDB_SHUTDOWN_SUCCESS') {
                    clearTimeout(forceTimeout);
                    try {
                        duckdbWorker?.terminate();
                    } catch (e) {
                        logger.warn('[Sandbox] Error terminating duckdbWorker after ack:', e);
                    }
                    duckdbWorker = null;
                    if (window.parent && window.parent !== window) {
                        window.parent.postMessage({ type: 'DUCKDB_SHUTDOWN_SUCCESS', id }, '*');
                    }
                    return;
                }
            } finally {
                // Ensure other worker messages still flow to parent
                try {
                    if (window.parent && window.parent !== window) {
                        const transfer = workerEvent.data && workerEvent.data.data instanceof ArrayBuffer ? [workerEvent.data.data] : [];
                        window.parent.postMessage(workerEvent.data, '*', transfer);
                    }
                } catch (e) {
                    logger.warn('[Sandbox] Error forwarding worker message during shutdown handling:', e);
                }
                // restore original handler for non-shutdown messages
                if (typeof originalOnMessage === 'function' && duckdbWorker) originalOnMessage.call(duckdbWorker, workerEvent);
            }
        };

        return;
    }

    // Special handling for DUCKDB_INIT to create the Worker and resolve resource URLs
    if (type === 'DUCKDB_INIT') {
        isDuckdbWorkerReady = false;
        if (!resources)
            throw new Error('Missing resources for DUCKDB_INIT');
        if (!extensionOrigin)
            throw new Error('Missing extensionOrigin for DUCKDB_INIT');

        // 1. Get the URL of our custom duckdb.worker.ts script
        const ourWorkerScriptURL = resources['our-duckdb-worker-script.js'];
        if (!ourWorkerScriptURL)
            throw new Error('Missing our-duckdb-worker-script.js URL');

        logger.info('[Sandbox] Current window.origin before Worker creation:', window.origin); // <-- Added this log

        try {
            // REMOVED the fetch -> Blob workaround.
            // Now creating the worker directly from its chrome-extension:// URL.
            logger.info('[Sandbox] Attempting to create worker directly from URL:', ourWorkerScriptURL);
            duckdbWorker = new Worker(ourWorkerScriptURL, { type: 'module' });
            logger.info('[Sandbox] DuckDB Worker created directly from URL:', duckdbWorker);

        } catch (e) {
            logger.error('[Sandbox] Error creating Worker directly:', e);
            logger.error('[Sandbox] Worker URL:', ourWorkerScriptURL);
            throw e;
        }

        // 5. Set up the onmessage handler for the newly created worker
        duckdbWorker.onmessage = (workerEvent) => {
            logger.info('[Sandbox] Received message from DuckDB Worker:', workerEvent.data.type);
            // The worker can always accept messages once created.
            // Flush any queued messages on first response as a safety net.
            if (!isDuckdbWorkerReady) {
                isDuckdbWorkerReady = true;
                flushPendingMessages();
            }
            if (window.parent && window.parent !== window) {
                const transfer = workerEvent.data.data instanceof ArrayBuffer ? [workerEvent.data.data] : [];
                window.parent.postMessage(workerEvent.data, '*', transfer);
            }
        };

        duckdbWorker.onerror = (error) => {
            logger.error('[Sandbox] Worker error details:', {
                message: error.message,
                filename: error.filename,
                lineno: error.lineno,
                colno: error.colno,
                error: error.error, // <-- Added this
            });
        };

        duckdbWorker.onmessageerror = (error) => {
            logger.error('[Sandbox] DuckDB Worker MESSAGE ERROR:', error);
        };

        // 6. Resources are already absolute chrome-extension:// URLs from useDuckDB.ts
        // No need for further resolveURL calls here for the bundle resources.
        // Just ensure the 'resources' object passed to the worker is the one with absolute URLs.

        // 7. Forward the DUCKDB_INIT message with resolved resources to the DuckDB Worker
        // The worker will then use these absolute URLs for duckdb-wasm bundles
        logger.info('[Sandbox] Forwarding DUCKDB_INIT message to worker with resources:', resources);
        duckdbWorker.postMessage({ ...event.data, resources: resources }); // resources are already absolute

        // Mark worker ready for accepting messages right after posting init.
        // This avoids dropping/queue-stalling messages that arrive during init.
        isDuckdbWorkerReady = true;
        flushPendingMessages();

    } else {
        // --- CRITICAL CHANGE: Forward all other messages directly to the worker ---
        if (!duckdbWorker) {
            // Queue message to avoid dropping it. Parent side is waiting for a response.
            const transferables = event.data.buffer instanceof ArrayBuffer ? [event.data.buffer] : [];
            logger.warn('[Sandbox] DuckDB Worker not initialized yet, queueing message type:', type);
            pendingMessages.push({ data: event.data, transferables });
            return;
        }

        // Determine if there's a buffer to transfer
        const transferables = event.data.buffer instanceof ArrayBuffer ? [event.data.buffer] : [];
        logger.info(`[Sandbox] Forwarding message of type '${type}' to duckdbWorker.`);
        if (!isDuckdbWorkerReady && type !== 'DUCKDB_INIT') {
            logger.warn('[Sandbox] duckdbWorker not ready yet, queueing message type:', type);
            pendingMessages.push({ data: event.data, transferables });
            return;
        }
        duckdbWorker.postMessage(event.data, transferables);
    }
});


// 通知父窗口 Sandbox 已经准备好
if (window.parent && window.parent !== window) {
    logger.info('[Sandbox] Sending SANDBOX_READY to parent.');
    window.parent.postMessage({ type: 'SANDBOX_READY' }, '*'); // <-- Corrected event type
}

// End of sandbox.ts
