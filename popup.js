console.log('This is a popup!');
document.addEventListener('DOMContentLoaded', () => {
    console.log('This is a popup!');


    const button = document.getElementById('add-cookie');
    if (!button) {
        return;
    }

    button.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (!tab || !tab.id || !tab.url) {
                return;
            }

            try {
                const urlObj = new URL(tab.url);
                const refValue = urlObj.searchParams.get('ref');
                const uuidPattern = /^badger:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
                if (refValue && uuidPattern.test(refValue)) {
                    return;
                }
            } catch (e) {
                // ignore invalid URLs and continue to set cookie
            }

            chrome.cookies.set({
                url: tab.url,
                name: 'uuid',
                value: '1111'
            }, () => {
                const originalUrl = tab.url;
                let redirectUrl;
                try {
                    const urlObj = new URL(originalUrl);
                    redirectUrl = urlObj.origin;
                } catch (e) {
                    redirectUrl = originalUrl;
                }

                chrome.tabs.update(tab.id, { url: redirectUrl }, () => {
                    // return to checkout after briefly leaving
                    setTimeout(() => {
                        chrome.tabs.update(tab.id, { url: originalUrl });
                    }, 1000);
                });
            });
        });
    });
});


