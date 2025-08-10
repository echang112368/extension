chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openPopup') {
    chrome.action.openPopup();
  }
});

const isShopifyCheckout = (url) => {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname === 'checkout.shopify.com') return true;
    if (hostname.endsWith('.myshopify.com') &&
        (pathname.startsWith('/checkouts') || pathname.startsWith('/checkout')))
      return true;
    return pathname.includes('/checkouts/');
  } catch {
    return false;
  }
};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = changeInfo.url || tab.url;
  if (url && isShopifyCheckout(url)) {
    chrome.action.openPopup({ tabId });
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && isShopifyCheckout(tab.url)) {
      chrome.action.openPopup({ tabId });
    }
  } catch (e) {
    // Ignore errors
  }
});


