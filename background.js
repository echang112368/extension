/**
 * README
 * Load unpacked extension: open chrome://extensions, enable Developer mode,
 * click "Load unpacked" and select this folder.
 * The extension will display a Hello World overlay on every page you visit.
 */

function handleNavigation(details) {
  chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    files: ['content.js'],
  });
}

chrome.webNavigation.onCommitted.addListener(handleNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openPopup') {
    chrome.action.openPopup();
  }
});
