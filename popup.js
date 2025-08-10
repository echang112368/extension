document.addEventListener('DOMContentLoaded', () => {
  const button = document.getElementById('add-cookie');
  if (!button) return;

  button.addEventListener('click', () => {
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
            chrome.tabs.update(tab.id, { url: `${urlObj.origin}/pre-checkout` });
          }
        );
    });
  });
});
