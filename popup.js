document.addEventListener('DOMContentLoaded', () => {
  const addCookieButton = document.getElementById('add-cookie');
  if (!addCookieButton) return;

  addCookieButton.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id || !tab.url) return;

      let urlObj;
      try {
        urlObj = new URL(tab.url);
      } catch (e) {
        return;
      }

      const targetUrl = `${urlObj.origin}/cart`;

      const onCartLoaded = (updatedTabId, info) => {
        if (updatedTabId === tab.id && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(onCartLoaded);

          chrome.cookies.set(
            {
              url: `${urlObj.origin}/`,
              name: 'uuid',
              value: 'b88a40af-0e8b-42d3-bda7-fd6bdb0427a3',
              path: '/',
            },
            () => {
              const onReloaded = (reloadedTabId, reloadInfo) => {
                if (reloadedTabId === tab.id && reloadInfo.status === 'complete') {
                  chrome.tabs.onUpdated.removeListener(onReloaded);
                  chrome.scripting.executeScript({
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
                          el.click();
                          break;
                        }
                      }
                    },
                  });
                }
              };

              chrome.tabs.onUpdated.addListener(onReloaded);
              chrome.tabs.reload(tab.id);
            }
          );
        }
      };

      chrome.tabs.onUpdated.addListener(onCartLoaded);
      chrome.tabs.update(tab.id, { url: targetUrl });
    });
  });
});
