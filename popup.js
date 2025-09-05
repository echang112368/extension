document.addEventListener('DOMContentLoaded', () => {
  const beforeLogin = document.getElementById('before-login');
  const afterLogin = document.getElementById('after-login');
  const loginButton = document.getElementById('login');
  const addCookieButton = document.getElementById('add-cookie');
  const logoutButton = document.getElementById('logout');
  const nameSpan = document.getElementById('user-name');
  const pointsSpan = document.getElementById('user-points');

  const updatePoints = async () => {
    const { auth } = await new Promise((resolve) =>
      chrome.storage.local.get('auth', resolve)
    );
    const uuid = auth?.uuid;
    if (!uuid) return;
    try {
      const resp = await fetch(
        `http://localhost:8000/api/points/${uuid}/`
      );
      if (!resp.ok) return;
      const data = await resp.json();
      await new Promise((resolve) =>
        chrome.storage.local.set(
          { auth: { ...auth, points: data?.points ?? 0 } },
          resolve
        )
      );
    } catch (e) {
      console.error('Failed to fetch points', e);
    }
  };

  const render = () => {
    chrome.storage.local.get('auth', ({ auth }) => {
      const isLoggedIn = !!(auth && (auth.user || auth.token || auth.uuid));

      if (isLoggedIn) {
        const name =
          auth?.user?.name ||
          auth?.user?.username ||
          auth?.name ||
          auth?.email ||
          'User';

        const points = auth?.user?.points ?? auth?.points ?? 0;

        if (nameSpan) nameSpan.textContent = name;
        if (pointsSpan) pointsSpan.textContent = points;
        if (beforeLogin) beforeLogin.style.display = 'none';
        if (afterLogin) afterLogin.style.display = 'block';
      } else {
        if (beforeLogin) beforeLogin.style.display = 'block';
        if (afterLogin) afterLogin.style.display = 'none';
      }
    });
  };

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

  addCookieButton?.addEventListener('click', async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id || !tab.url) return;

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
    if (merchantUuid) {
      try {
        const resp = await authFetch(
          `http://localhost:8000/api/create-discount/${merchantUuid}/`,
          { method: 'POST' }
        );
        if (resp.ok) {
          const data = await resp.json();
          couponName = data?.coupon_code || '';
        }
      } catch (e) {
        console.error('Failed to fetch coupon', e);
      }
    }

    const targetUrl = `${urlObj.origin}/cart?discounts=${encodeURIComponent(
      couponName
    )}`;

    await chrome.tabs.update(tab.id, { url: targetUrl });
    await waitForTab(tab.id);

    const { cusID } = await new Promise((resolve) =>
      chrome.storage.local.get('cusID', resolve)
    );

    await setCookie({
      url: `${urlObj.origin}/`,
      name: 'uuid',
      value: '4397b0db-7c7c-440a-89ac-4097b0d31854',
      path: '/',
      expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    });

    if (cusID) {
      await setCookie({
        url: `${urlObj.origin}/`,
        name: 'cusID',
        value: cusID,
        path: '/',
      });
    }

    await chrome.tabs.reload(tab.id);
    await waitForTab(tab.id);

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (coupon) => {
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
              setTimeout(() => {
                window.location.href = `/checkout?discounts=${encodeURIComponent(
                  coupon
                )}`;
              }, 1500);
            }, 2000);
            break;
          }
        }
      },
      args: [couponName],
    });
  });

  loginButton?.addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('login.html'),
      type: 'popup',
      width: 480,
      height: 700,
    });
  });

  logoutButton?.addEventListener('click', () => {
    chrome.storage.local.remove(['auth', 'cusID'], () => {
      chrome.runtime.sendMessage({ type: 'LOGOUT' });
      render();
    });
  });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'LOGIN_SUCCESS') {
        render();
      }
    });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.auth) {
      render();
    }
  });

  updatePoints().then(render);
});

