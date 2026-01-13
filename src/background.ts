console.log("VaultMind Service Worker: Script loading and running.");

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) {
        console.error("[action.onClicked] Tab ID is missing.");
        return;
    }

    console.log(`[action.onClicked] Triggered for tab ID: ${tab.id}. Attempting to open side panel.`);

    try {

        await chrome.sidePanel.open({tabId: tab.id});
        //await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

        console.log(`[action.onClicked] Side panel opened successfully for tab ID: ${tab.id}.`);
    } catch (error) {
        console.error("[action.onClicked] Error opening side panel:", error);
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
