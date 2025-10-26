/**
 * README
 * Load unpacked extension: open chrome://extensions, enable Developer mode,
 * click "Load unpacked" and select this folder.
 * The extension will display a Hello World overlay on every page you visit.
 */

importScripts('auth.js');

const injectedTabs = new Map();

const MERCHANT_META_URL = 'http://localhost:8000/api/merchant_meta/';
const MERCHANT_LIST_URL = 'http://localhost:8000/api/merchant_list/';
const MERCHANT_SYNC_ALARM = 'merchant-sync';
const MERCHANT_SYNC_PERIOD_MINUTES = 60 * 24 * 7; // once per week
const MERCHANT_META_CHECK_INTERVAL_MS = MERCHANT_SYNC_PERIOD_MINUTES * 60 * 1000;
const MERCHANT_LIST_STORAGE_KEY = 'allowedMerchants';
const MERCHANT_VERSION_STORAGE_KEY = 'merchant_version';
const MERCHANT_CHECKED_AT_STORAGE_KEY = 'merchant_version_checked_at';
const MERCHANT_UPDATED_AT_STORAGE_KEY = 'merchant_list_updated_at';

let cachedAllowedMerchants = null;

const storageGet = (keys) =>
  new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });

const storageSet = (items) =>
  new Promise((resolve) => {
    chrome.storage.local.set(items, resolve);
  });

function updateAllowedMerchantCache(hosts) {
  if (Array.isArray(hosts)) {
    cachedAllowedMerchants = hosts;
  } else if (typeof hosts === 'undefined') {
    cachedAllowedMerchants = null;
  } else {
    cachedAllowedMerchants = [];
  }
}

async function loadAllowedMerchantsFromStorage() {
  const data = await storageGet([MERCHANT_LIST_STORAGE_KEY]);
  updateAllowedMerchantCache(data[MERCHANT_LIST_STORAGE_KEY]);
}

function hostMatches(allowedHost, hostname) {
  if (!allowedHost || !hostname) return false;
  if (hostname === allowedHost) return true;
  return hostname.endsWith(`.${allowedHost}`);
}

async function isAllowedMerchantUrl(url) {
  let urlObj;
  try {
    urlObj = new URL(url);
  } catch (e) {
    return false;
  }

  const hostname = urlObj.hostname;

  if (!cachedAllowedMerchants) {
    await loadAllowedMerchantsFromStorage();
  }

  if (!Array.isArray(cachedAllowedMerchants)) {
    return true;
  }

  if (cachedAllowedMerchants.length === 0) {
    return false;
  }

  return cachedAllowedMerchants.some((allowedHost) =>
    hostMatches(String(allowedHost).trim().toLowerCase(), hostname.toLowerCase())
  );
}

function isCheckoutOrCartUrl(url) {
  try {
    const { pathname } = new URL(url);
    if (!pathname) return false;
    return pathname.includes('/cart') || pathname.includes('/checkout');
  } catch (e) {
    return false;
  }
}

async function handleNavigation(details) {
  // Ignore subframe navigations to ensure we inject only on the main page
  if (details.frameId !== 0) return;

  if (!details.url || !isCheckoutOrCartUrl(details.url)) {
    injectedTabs.delete(details.tabId);
    return;
  }

  if (!(await isAllowedMerchantUrl(details.url))) {
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

const withNavigationHandling = (listener) => (details) => {
  listener(details).catch((error) => {
    console.error('Failed to handle navigation', error);
  });
};

const filter = {
  url: [
    { urlContains: '/checkouts/' },
    { urlContains: '/checkout' },
    { urlContains: '/cart' },
  ],
};

chrome.webNavigation.onCommitted.addListener(withNavigationHandling(handleNavigation), filter);
chrome.webNavigation.onHistoryStateUpdated.addListener(
  withNavigationHandling(handleNavigation),
  filter,
);
chrome.tabs.onRemoved.addListener((tabId) => injectedTabs.delete(tabId));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    handleNavigation({ tabId, frameId: 0, url: tab.url }).catch((error) => {
      console.error('Failed to handle navigation', error);
    });
  }
});

function extractAllowedHosts(listResponse) {
  if (!listResponse) return [];
  if (Array.isArray(listResponse)) return listResponse;
  if (Array.isArray(listResponse.allowed_hosts)) return listResponse.allowed_hosts;
  if (Array.isArray(listResponse.domains)) return listResponse.domains;
  if (Array.isArray(listResponse.merchants)) return listResponse.merchants;
  return [];
}

async function ensureMerchantListUpToDate() {
  try {
    const metaResp = await fetch(MERCHANT_META_URL);
    if (!metaResp.ok) {
      throw new Error(`Failed to fetch merchant meta: ${metaResp.status}`);
    }

    const meta = await metaResp.json();
    const version = meta?.version;
    if (!version) {
      throw new Error('Merchant meta response missing version');
    }

    const storageData = await storageGet([
      MERCHANT_VERSION_STORAGE_KEY,
      MERCHANT_LIST_STORAGE_KEY,
    ]);
    const storedVersion = storageData[MERCHANT_VERSION_STORAGE_KEY];
    const now = Date.now();

    if (storedVersion === version) {
      await storageSet({ [MERCHANT_CHECKED_AT_STORAGE_KEY]: now });
      return;
    }

    const listResp = await fetch(MERCHANT_LIST_URL);
    if (!listResp.ok) {
      throw new Error(`Failed to fetch merchant list: ${listResp.status}`);
    }

    const listData = await listResp.json();
    const allowedHosts = extractAllowedHosts(listData).map((host) =>
      String(host).trim().toLowerCase(),
    );

    await storageSet({
      [MERCHANT_LIST_STORAGE_KEY]: allowedHosts,
      [MERCHANT_VERSION_STORAGE_KEY]: version,
      [MERCHANT_CHECKED_AT_STORAGE_KEY]: now,
      [MERCHANT_UPDATED_AT_STORAGE_KEY]: now,
    });
    updateAllowedMerchantCache(allowedHosts);
  } catch (error) {
    console.error('Failed to update merchant list', error);
  }
}

async function ensureMerchantListUpToDateIfStale() {
  try {
    const data = await storageGet([MERCHANT_CHECKED_AT_STORAGE_KEY]);
    const lastChecked = data[MERCHANT_CHECKED_AT_STORAGE_KEY];
    const now = Date.now();

    if (typeof lastChecked === 'number' && now - lastChecked < MERCHANT_META_CHECK_INTERVAL_MS) {
      return;
    }
  } catch (error) {
    console.warn('Unable to determine last merchant list check timestamp', error);
  }

  return ensureMerchantListUpToDate();
}

function scheduleMerchantSync() {
  chrome.alarms.create(MERCHANT_SYNC_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: MERCHANT_SYNC_PERIOD_MINUTES,
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm?.name === MERCHANT_SYNC_ALARM) {
    ensureMerchantListUpToDate().catch((error) => {
      console.error('Merchant sync alarm failed', error);
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  scheduleMerchantSync();
  ensureMerchantListUpToDate().catch((error) => {
    console.error('Failed to perform initial merchant sync on install', error);
  });
});

chrome.runtime.onStartup.addListener(() => {
  scheduleMerchantSync();
  ensureMerchantListUpToDateIfStale()?.catch((error) => {
    console.error('Failed to perform merchant sync on startup', error);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes[MERCHANT_LIST_STORAGE_KEY]) {
    updateAllowedMerchantCache(changes[MERCHANT_LIST_STORAGE_KEY].newValue);
  }
});

loadAllowedMerchantsFromStorage().catch((error) => {
  console.error('Failed to load allowed merchants from storage', error);
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

async function setCusIdCookieForActiveTab() {
  const { cusID } = await new Promise((resolve) =>
    chrome.storage.local.get('cusID', resolve)
  );

  if (!cusID) return;

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.url) return;

  let urlObj;
  try {
    urlObj = new URL(tab.url);
  } catch (e) {
    return;
  }

  try {
    await setCookie({
      url: `${urlObj.origin}/`,
      name: 'cusID',
      value: cusID,
      path: '/',
    });
  } catch (e) {
    console.error('Failed to set cusID cookie', e);
  }
}

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
  } else if (msg?.type === 'SET_CUSID_COOKIE') {
    setCusIdCookieForActiveTab();
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
