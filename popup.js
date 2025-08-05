document.addEventListener('DOMContentLoaded', () => {
  console.log('This is a popup!');

  const button = document.getElementById('update-url');
  if (!button) {
    return;
  }

  button.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.id || !tab.url) {
        return;
      }

      const url = new URL(tab.url);
      url.search = 'ref=badger:123;buisID:55';
      chrome.tabs.update(tab.id, { url: url.toString() });
    });
  });
});

