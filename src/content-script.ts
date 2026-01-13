const IFRAME_ID = 'vaultmind-sidebar-iframe';
const SIDEBAR_WIDTH = '380px'; // Define sidebar width as a constant
let iframe: HTMLIFrameElement | null = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;

// Add transition to body for smooth margin changes
document.body.style.transition = 'margin-right 0.3s ease-in-out';

function toggleSidebar() {
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    Object.assign(iframe.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: SIDEBAR_WIDTH, // Use constant width
      height: '100%',
      border: 'none',
      boxShadow: '-2px 0 15px rgba(0,0,0,0.15)',
      zIndex: '99999999',
      transform: 'translateX(100%)', // Initially hidden
      transition: 'transform 0.3s ease-in-out',
      background: '#fff'
    });
    iframe.src = chrome.runtime.getURL('index.html');
    document.body.appendChild(iframe);
  }
  
  setTimeout(() => {
    if (iframe) {
      const isSidebarOpen = iframe.style.transform === 'translateX(0%)';

      if (isSidebarOpen) {
        // Close sidebar
        iframe.style.transform = 'translateX(100%)';
        document.body.style.marginRight = '0'; // Reset body margin
      } else {
        // Open sidebar
        document.body.style.marginRight = SIDEBAR_WIDTH; // Adjust body margin
        iframe.style.transform = 'translateX(0%)';
      }
    }
  }, 50);
}

function removeSidebar() {
  if (iframe) {
    console.log('Removing sidebar and releasing resources.');

    // Reset body margin immediately for smooth transition
    document.body.style.marginRight = '0'; 
    iframe.style.transform = 'translateX(100%)'; // Animate out

    iframe.addEventListener('transitionend', () => {
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
        iframe = null; // Release reference for garbage collection
      }
    }, { once: true });
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => { // Renamed sender to _sender
  if (message.type === 'TOGGLE_SIDEBAR') {
    console.log('Content script received TOGGLE_SIDEBAR message.');
    toggleSidebar();
  } else if (message.type === 'CLOSE_SIDEBAR') {
    console.log('Content script received CLOSE_SIDEBAR message. Initiating removal.');
    removeSidebar();
  } else if (message.type === 'PING_CONTENT_SCRIPT') {
    console.log('Content script received PING_CONTENT_SCRIPT message. Responding.');
    sendResponse({ status: 'pong' });
    return true; // Indicate that sendResponse will be called asynchronously
  }
});

console.log('Vaultmind content script loaded.');
