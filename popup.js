document.addEventListener('DOMContentLoaded', () => {
  const beforeLogin = document.getElementById('before-login');
  const afterLogin = document.getElementById('after-login');
  const loginButton = document.getElementById('login');
  const addCookieButton = document.getElementById('add-cookie');
  const accountButton = document.getElementById('account');
  const logoutButton = document.getElementById('logout');
  const nameSpan = document.getElementById('user-name');
  const pointsSpans = document.querySelectorAll('[data-reward-points]');
  const meterFills = document.querySelectorAll('[data-reward-meter]');
  const savedAmount = document.querySelector('[data-saved-amount]');
  const pointsCounter = document.querySelector('.points-counter');
  const REWARD_POINTS_PER_LEVEL = 500;
  const FALLBACK_ACCOUNT_URL = 'https://badger.com/account';
  const updatePoints = async () => {
    const { auth } = await new Promise((resolve) =>
      chrome.storage.local.get('auth', resolve)
    );
    const uuid = auth?.uuid;
    const refresh = auth?.refresh;
    if (!uuid || !refresh) return null;
    try {
      const resp = await fetch(`http://localhost:8000/api/points/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid, refresh }),
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      const points = data?.points ?? 0;
      const updatedAuth = {
        ...auth,
        points,
        user: auth?.user ? { ...auth.user, points } : auth?.user,
      };

      await new Promise((resolve) =>
        chrome.storage.local.set(
          { auth: updatedAuth, reward_points_total: points },
          resolve
        )
      );
      return points;
    } catch (e) {
      console.error('Failed to fetch points', e);
    }
    return null;
  };

  const updateRewardDisplay = (totalPoints, animate = false) => {
    const numericPoints = Number(totalPoints) || 0;
    pointsSpans.forEach((span) => {
      span.textContent = numericPoints.toLocaleString('en-US');
    });
    meterFills.forEach((fill) => {
      const progress = (numericPoints % REWARD_POINTS_PER_LEVEL) / REWARD_POINTS_PER_LEVEL;
      fill.style.transform = `scaleX(${progress})`;
    });
    if (animate && pointsCounter) {
      pointsCounter.classList.remove('bump');
      requestAnimationFrame(() => {
        pointsCounter.classList.add('bump');
      });
    }
  };

  const formatCurrency = (value) => {
    const numericValue = Number(value) || 0;
    return numericValue.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
  };

  const render = () => {
    chrome.storage.local.get(
      ['auth', 'reward_points_total', 'reward_points_last_earned', 'total_saved'],
      ({ auth, reward_points_total, reward_points_last_earned, total_saved }) => {
      const isLoggedIn = !!(
        auth &&
        (auth.user || auth.token || auth.uuid || auth.access || auth.refresh)
      );

      if (isLoggedIn) {
        const name =
          auth?.user?.name ||
          auth?.user?.username ||
          auth?.name ||
          auth?.email ||
          'User';

        const points =
          Number(reward_points_total) ||
          Number(auth?.user?.points) ||
          Number(auth?.points) ||
          0;
        const savedValue =
          Number(total_saved) ||
          Number(auth?.user?.total_saved) ||
          Number(auth?.total_saved) ||
          Number(auth?.savings) ||
          0;
        const accountUrl =
          auth?.user?.account_url || auth?.account_url || FALLBACK_ACCOUNT_URL;

        if (nameSpan) nameSpan.textContent = name;
        if (savedAmount) savedAmount.textContent = formatCurrency(savedValue);
        if (accountButton) accountButton.dataset.accountUrl = accountUrl;
        const shouldAnimate =
          Number(reward_points_last_earned) &&
          Date.now() - Number(reward_points_last_earned) < 30000;
        updateRewardDisplay(points, shouldAnimate);
        if (shouldAnimate) {
          chrome.storage.local.remove('reward_points_last_earned');
        }
        if (beforeLogin) beforeLogin.style.display = 'none';
        if (afterLogin) afterLogin.style.display = 'flex';
      } else {
        if (beforeLogin) beforeLogin.style.display = 'flex';
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

  const requestCusIdCookieForActiveTab = () => {
    chrome.runtime.sendMessage({ type: 'SET_CUSID_COOKIE' });
  };

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

    if (couponName) {
      await setCookie({
        url: `${urlObj.origin}/`,
        name: 'uuid',
        value: '4397b0db-7c7c-440a-89ac-4097b0d31854',
        path: '/',
        expirationDate: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
      });
    }

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

  accountButton?.addEventListener('click', () => {
    const url = accountButton.dataset.accountUrl || FALLBACK_ACCOUNT_URL;
    chrome.tabs.create({ url });
  });

  const refreshPointsAndRender = async () => {
    const updatedPoints = await updatePoints();
    render();
    if (typeof updatedPoints === 'number') {
      updateRewardDisplay(updatedPoints);
    }
  };

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'LOGIN_SUCCESS') {
      refreshPointsAndRender();
      requestCusIdCookieForActiveTab();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      if (changes.auth) {
        render();
      }
      if (changes.reward_points_total) {
        updateRewardDisplay(changes.reward_points_total.newValue, true);
      }
      if (changes.cusID) {
        requestCusIdCookieForActiveTab();
      }
    }
  });

  refreshPointsAndRender();
  requestCusIdCookieForActiveTab();
});
