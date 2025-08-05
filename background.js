chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'openPopup') {
    chrome.action.openPopup();
  }
});