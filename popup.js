document.addEventListener('DOMContentLoaded', () => {
  const beforeLogin = document.getElementById('before-login');
  const afterLogin = document.getElementById('after-login');
  const loginButton = document.getElementById('login');
  const addCookieButton = document.getElementById('add-cookie');
  const nameSpan = document.getElementById('user-name');
  const pointsSpan = document.getElementById('user-points');

  const render = () => {
    chrome.storage.local.get('auth', ({ auth }) => {
      if (auth && auth.user) {
        const name = auth.user.name || auth.user.username || 'User';
        const points = auth.user.points ?? auth.points ?? 0;
        nameSpan.textContent = name;
        pointsSpan.textContent = points;
        beforeLogin.style.display = 'none';
        afterLogin.style.display = 'block';
      } else {
        beforeLogin.style.display = 'block';
        afterLogin.style.display = 'none';
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
  });

  loginButton?.addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('login.html'),
      type: 'popup',
      width: 480,
      height: 700,
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'LOGIN_SUCCESS') {
      render();
    }
  });

  render();
});

