document.addEventListener('DOMContentLoaded', () => {
  const addCookieButton = document.getElementById('add-cookie');
  const loginButton = document.getElementById('login');
  const tokenDiv = document.getElementById('token');

  if (addCookieButton) {
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

    addCookieButton.addEventListener('click', async () => {
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
  }

  if (loginButton) {
    loginButton.addEventListener('click', async () => {
      if (tokenDiv) tokenDiv.textContent = '';
      try {
        const response = await fetch('https://6f26ddd568cc.ngrok-free.app/api/login-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'demo', password: 'demo' })
        });

        if (!response.ok) {
          throw new Error('Network response was not ok');
        }

        const data = await response.json();
        const token = data.token || JSON.stringify(data);
        if (tokenDiv) tokenDiv.textContent = token;
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ token });
        }
      } catch (err) {
        console.error(err);
        if (tokenDiv) tokenDiv.textContent = 'Login failed';
      }
    });
  }
});
