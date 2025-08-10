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

      chrome.cookies.set(
        {
          url: `${urlObj.origin}/`,
          name: 'uuid',
          value: 'b88a40af-0e8b-42d3-bda7-fd6bdb0427a3',
          path: '/',
        },
        () => {
          const targetUrl = `${urlObj.origin}/cart`;

          const onUpdated = (updatedTabId, info, updatedTab) => {
            if (updatedTabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(onUpdated);
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

          chrome.tabs.onUpdated.addListener(onUpdated);
          chrome.tabs.update(tab.id, { url: targetUrl });
        }
      );
    });
  });
});
