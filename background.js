/**
 * README
 * Load unpacked extension: open chrome://extensions, enable Developer mode,
 * click "Load unpacked" and select this folder.
 * The extension will display a Hello World overlay on every page you visit.
 */

importScripts('auth.js');

const injectedTabs = new Map();

function handleNavigation(details) {
  // Ignore subframe navigations to ensure we inject only on the main page
  if (details.frameId !== 0) return;
  if (
    !details.url ||
    (!details.url.includes('/checkouts/') && !details.url.includes('/cart'))
  ) {
    injectedTabs.delete(details.tabId);
    return;
  }

  if (details.transitionType === 'reload' || details.transitionType === 'auto_reload') {
    injectedTabs.delete(details.tabId);
  }

  const lastUrl = injectedTabs.get(details.tabId);
  if (lastUrl === details.url) return;

  injectedTabs.set(details.tabId, details.url);
  chrome.scripting.executeScript({
    target: { tabId: details.tabId },
    files: ['auth.js', 'content.js'],
  });
}

const filter = { url: [{ urlContains: '/checkouts/' }, { urlContains: '/cart' }] };
chrome.webNavigation.onCommitted.addListener(handleNavigation, filter);
chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation, filter);
chrome.tabs.onRemoved.addListener(tabId => injectedTabs.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleNavigation({ tabId, frameId: 0, url: tab.url });
  }
});

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

const buildCookieUrl = (cookie) => {
  if (!cookie?.domain) return null;
  const domain = cookie.domain.replace(/^\./, '');
  if (!domain) return null;
  const protocol = cookie.secure ? 'https' : 'http';
  const path = cookie.path || '/';
  return `${protocol}://${domain}${path}`;
};

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

    const storeCookie = await new Promise((resolve) =>
      chrome.cookies.get({ url: `${urlObj.origin}/`, name: 'storeID' }, resolve)
    );
    const merchantUuid = storeCookie?.value;
    let couponName = '';
    console.log('Merchant UUID:', merchantUuid);
    if (merchantUuid) {
      console.log('going to try')
      try {
        const resp = await authFetch(
          `https://af8a61e2e155.ngrok-free.app/shopify/create-discount/${merchantUuid}/`,
          { method: 'POST' }
        );
        console.log('sent post')
        console.log('Response:', resp);
        if (resp.ok) {
          const data = await resp.json();
          couponName = data?.coupon_code || '';
          console.log('Coupon Name:', couponName);
        }
      } catch (e) {
        console.error('Failed to fetch coupon', e);
      }
    }

    const discountUrl = `${urlObj.origin}/discount/${encodeURIComponent(
      couponName
    )}`;
    await chrome.tabs.update(tab.id, { url: discountUrl });
    await waitForTab(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' });
    await new Promise((resolve) => setTimeout(resolve, 500));

    const targetUrl = `${urlObj.origin}/cart?discounts=${encodeURIComponent(
      couponName
    )}`;

    await chrome.tabs.update(tab.id, { url: targetUrl });
    await waitForTab(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' });

    const { cusID } = await new Promise((resolve) =>
      chrome.storage.local.get('cusID', resolve)
    );

    const cookieTasks = [];
    const uuidValue = couponName
      ? '733d0d67-6a30-4c48-a92e-b8e211b490f5'
      : 'n/a';
    const cookieBaseDetails = {
      url: `${urlObj.origin}/`,
      path: '/',
      expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    };

    cookieTasks.push(
      setCookie({
        ...cookieBaseDetails,
        name: 'uuid',
        value: uuidValue,
      })
    );

    cookieTasks.push(
      setCookie({
        ...cookieBaseDetails,
        name: 'cusID',
        value: 'f2a6b271-ee79-4241-9765-8bef49aabf24' || uuidValue,
      })
    );

    await Promise.all(cookieTasks);

    await chrome.tabs.reload(tab.id);
    await waitForTab(tab.id);
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' });

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
    chrome.tabs.sendMessage(tab.id, { type: 'SHOW_LOADING' });
    await new Promise((resolve) => setTimeout(resolve, 500));
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
  } else if (msg?.type === 'LOGIN_SUCCESS') {
    console.log('User logged in', msg.data);
  } else if (msg?.type === 'OPEN_LOGIN') {
    chrome.windows.create({
      url: chrome.runtime.getURL('login.html'),
      type: 'popup',
      width: 480,
      height: 700,
    });
  }
});
