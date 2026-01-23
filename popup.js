document.addEventListener('DOMContentLoaded', () => {
  const beforeLogin = document.getElementById('before-login');
  const afterLogin = document.getElementById('after-login');
  const loginButton = document.getElementById('login');
  const addCookieButton = document.getElementById('add-cookie');
  const logoutButton = document.getElementById('logout');
  const nameSpan = document.getElementById('user-name');
  const pointsSpan = document.querySelector('[data-reward-points]');
  const meterFill = document.querySelector('[data-reward-meter]');
  const pointsCounter = pointsSpan?.closest('.points-counter');
  const pointsValueText = document.querySelector('[data-points-value]');
  const levelName = document.querySelector('[data-level-name]');
  const levelNext = document.querySelector('[data-level-next]');
  const levelRemaining = document.querySelector('[data-level-remaining]');
  const levelProgress = document.querySelector('[data-level-progress]');
  const POINTS_PER_DOLLAR = 60;
  const LEVELS = [
    { name: 'Starter', minPoints: 0 },
    { name: 'Scout', minPoints: 1000 },
    { name: 'Builder', minPoints: 2500 },
    { name: 'Trailblazer', minPoints: 5000 },
    { name: 'Vanguard', minPoints: 9000 },
    { name: 'Legend', minPoints: 15000 },
  ];
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
    if (pointsSpan) {
      pointsSpan.textContent = numericPoints.toLocaleString('en-US');
    }
    if (meterFill) {
      const currentIndex = LEVELS.reduce(
        (acc, level, index) => (numericPoints >= level.minPoints ? index : acc),
        0
      );
      const currentLevel = LEVELS[currentIndex];
      const nextLevel = LEVELS[currentIndex + 1];
      const progress = nextLevel
        ? (numericPoints - currentLevel.minPoints) /
          (nextLevel.minPoints - currentLevel.minPoints)
        : 1;
      meterFill.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;

      if (levelName) {
        levelName.textContent = `Level ${currentIndex + 1} · ${currentLevel.name}`;
      }
      if (levelNext) {
        levelNext.textContent = nextLevel
          ? `${nextLevel.name} at ${nextLevel.minPoints.toLocaleString('en-US')} pts`
          : 'Max level reached';
      }
      if (levelRemaining) {
        levelRemaining.textContent = nextLevel
          ? `${(nextLevel.minPoints - numericPoints).toLocaleString('en-US')} pts to go`
          : 'You are at the top!';
      }
      if (levelProgress) {
        levelProgress.textContent = `${Math.round(progress * 100)}%`;
      }
    }
    if (pointsValueText) {
      const dollars = numericPoints / POINTS_PER_DOLLAR;
      pointsValueText.textContent = `$${dollars.toFixed(2)} earned`;
    }
    if (animate && pointsCounter) {
      pointsCounter.classList.remove('bump');
      requestAnimationFrame(() => {
        pointsCounter.classList.add('bump');
      });
    }
  };

  const render = () => {
    chrome.storage.local.get(
      ['auth', 'reward_points_total', 'reward_points_last_earned'],
      ({ auth, reward_points_total, reward_points_last_earned }) => {
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

        if (nameSpan) nameSpan.textContent = name;
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
