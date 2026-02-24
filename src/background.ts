console.log("VaultMind Service Worker: Script loading and running.");

/**
 * Opens Vaultmind in a new tab (same window)
 */
async function openInNewTab(): Promise<void> {
    await chrome.tabs.create({
        url: chrome.runtime.getURL('index.html')
    });
    console.log('[openInNewTab] New tab opened successfully');
}

/**
 * Opens Vaultmind in a new separate window
 */
async function openInNewWindow(): Promise<void> {
    await chrome.windows.create({
        url: chrome.runtime.getURL('index.html'),
        type: 'popup',
        width: 1400,
        height: 900,
    });
    console.log('[openInNewWindow] New window opened successfully');
}

/**
 * Configuration object for Vaultmind open mode.
 * Modify the 'mode' property to change behavior:
 * - 'new_tab': Open in new tab within same window (default)
 * - 'new_window': Open in new separate window
 */
const VAULTMIND_CONFIG: { mode: 'new_tab' | 'new_window' } = {
    mode: 'new_tab' // <-- Change this to 'new_window' for new window mode
};

chrome.action.onClicked.addListener(async () => {
    console.log(`[action.onClicked] Opening Vaultmind with mode: ${VAULTMIND_CONFIG.mode}`);

    try {
        // Use switch to handle different open modes
        switch (VAULTMIND_CONFIG.mode) {
            case 'new_window':
                await openInNewWindow();
                break;
            case 'new_tab':
            default:
                await openInNewTab();
                break;
        }
    } catch (error) {
        console.error('[action.onClicked] Error opening Vaultmind:', error);
    }
});

// Add listener to handle messages from the side panel (e.g., close requests)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'CLOSE_SIDEBAR') {
        console.log(`Background script received CLOSE_SIDEBAR message from side panel.`);

        // Query for the active tab in the current window
        chrome.tabs.query({active: true, currentWindow: true})
            .then(async (tabs) => {
                if (tabs.length > 0 && tabs[0].id !== undefined) {
                    const activeTabId = tabs[0].id;
                    console.log(`Found active tab ID: ${activeTabId}. Visually closing and disabling side panel.`);

                    // Then disable the panel as per official docs
                    await chrome.sidePanel.setOptions({
                        tabId: activeTabId,
                        enabled: false,
                        path: 'empty.html'
                    });

                    console.log(`Side panel visually closed and disabled for tab ID: ${activeTabId}.`);
                    sendResponse({status: 'success'});
                } else {
                    throw new Error("No active tab found or tab ID is missing.");
                }
            })
            .catch((error) => {
                console.error(`Error processing CLOSE_SIDEBAR message:`, error);
                sendResponse({status: 'error', message: error.message});
            });

        return true; // Indicate that sendResponse will be called asynchronously
    }
    // For other messages, let other listeners handle them or return false
    return false;
});
