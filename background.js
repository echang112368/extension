/**
 * README
 * Load unpacked extension: open chrome://extensions, enable Developer mode,
 * click "Load unpacked" and select this folder.
 * The extension will display a Hello World overlay on every page you visit.
 */

function handleNavigation(details) {
  if (details.url && details.url.includes('/checkouts/')) {
    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ['content.js'],
    });
  }
}

const filter = { url: [{ urlContains: '/checkouts/' }] };
chrome.webNavigation.onCommitted.addListener(handleNavigation, filter);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation, filter);

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openPopup') {
    chrome.action.openPopup();
  }
});
