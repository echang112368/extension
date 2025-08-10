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

            let urlObj;
            try {
                urlObj = new URL(tab.url);
            } catch (e) {
                // If URL parsing fails, stay on the current page
                chrome.tabs.update(tab.id, { url: tab.url });
                return;
            }

            const refValue = urlObj.searchParams.get('ref');
            const uuidPattern = /^badger:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
            if (refValue && uuidPattern.test(refValue)) {
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
                    const redirectUrl = `${urlObj.origin}/pre-checkout`;
                    chrome.tabs.update(tab.id, { url: redirectUrl });
                }
            );
        });
    });
});


