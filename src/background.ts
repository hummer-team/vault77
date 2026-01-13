console.log("VaultMind Service Worker: Script loading and running.");

// --- CRITICAL CHANGE: Implement Programmatic Injection ---
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) {
        console.error("[action.onClicked] Tab ID is missing.");
        return;
    }

    // Add check for chrome:// URLs
    if (tab.url && tab.url.startsWith('chrome://')) {
        console.warn('[action.onClicked] Cannot inject into chrome:// tab object:', tab);
        return;
    }

    console.log(`[action.onClicked] Triggered for tab ID: ${tab.id}`);

    try {
        let contentScriptInjected = false;

        // Step 1: Try to ping the content script to see if it's already injected
        try {
            // Use a timeout for the ping message to avoid indefinite waiting
            const response = await Promise.race([
                chrome.tabs.sendMessage(tab.id, { type: 'PING_CONTENT_SCRIPT' }),
                new Promise((resolve) => setTimeout(() => resolve(null), 100)) // 100ms timeout
            ]);
            
            if (response && response.status === 'pong') {
                console.log(`[action.onClicked] Content script already injected in tab ${tab.id}.`);
                contentScriptInjected = true;
            }
        } catch (error: any) {
            // This error typically means the content script is not yet injected
            // or the tab is not accessible (e.g., chrome:// URLs, or before page load)
            if (error.message && error.message.includes("Receiving end does not exist")) {
                console.log(`[action.onClicked] Content script not found in tab ${tab.id}, proceeding with injection.`);
            } else {
                console.warn(`[action.onClicked] Error during PING_CONTENT_SCRIPT:`, error);
            }
        }

        // Step 2: If not injected, inject the content script
        if (!contentScriptInjected) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['assets/content-script.js'], // <-- Use the compiled JS path
            });
            console.log(`[action.onClicked] Content script injected into tab ${tab.id}.`);
        }

        // Step 3: Send the message to toggle the sidebar
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
        console.log(`[action.onClicked] TOGGLE_SIDEBAR message sent successfully to tab ${tab.id}.`);

    } catch (error) {
        console.error("[action.onClicked] Error during injection or message sending:", error);
    }
});
// --- END CRITICAL CHANGE ---

// Add listener to relay messages from iframe to content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CLOSE_SIDEBAR') {
        // Ensure sender.tab and sender.tab.id exist before proceeding
        if (sender.tab && sender.tab.id !== undefined) { // Added explicit check for undefined
            console.log(`Background script received CLOSE_SIDEBAR from iframe (tab ID: ${sender.tab.id}). Forwarding to content script.`);
            // Forward the message to the content script of the tab that sent it
            chrome.tabs.sendMessage(sender.tab.id, message)
                .then(() => {
                    console.log(`CLOSE_SIDEBAR message forwarded to tab successfully.`);
                    sendResponse({ status: 'success' });
                })
                .catch((error) => {
                    console.error(`Error forwarding CLOSE_SIDEBAR message to tab`, error);
                    sendResponse({ status: 'error', message: error.message });
                });
            return true; // Indicate that sendResponse will be called asynchronously
        } else {
            console.warn('Background script received CLOSE_SIDEBAR message, but sender.tab or sender.tab.id is missing/undefined.');
            sendResponse({ status: 'error', message: 'Sender tab ID missing/undefined.' });
        }
    }
    // For other messages, let other listeners handle them or return false
    return false;
});
