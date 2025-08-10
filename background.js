/**
 * README
 * Load unpacked extension: open chrome://extensions, enable Developer mode,
 * click "Load unpacked" and select this folder.
 * Test: Navigate to a Shopify checkout page (e.g., https://checkout.shopify.com/...)
 * and the extension should show the coupon overlay.
 */

function isCheckoutUrl(url) {
  return /checkout\.shopify\.com|\.myshopify\.com|\/checkout(s)?/i.test(url);
}

function handleNavigation(details) {
  if (isCheckoutUrl(details.url)) {
    chrome.scripting.executeScript({
      target: { tabId: details.tabId },
      files: ['content.js'],
    });
  } else {
    chrome.tabs.sendMessage(details.tabId, { type: 'REMOVE_COUPON_OVERLAY' }, () => {});
  }
}

chrome.webNavigation.onCommitted.addListener(handleNavigation);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openPopup') {
    chrome.action.openPopup();
  }
});
