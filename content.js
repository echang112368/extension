(function() {
  const isShopifyCheckout = () => {
    const { hostname, pathname } = window.location;
    const hostMatch =
      hostname === 'checkout.shopify.com' || hostname.endsWith('.myshopify.com');
    const pathMatch = /\/checkouts?/i.test(pathname);
    const checkoutObj = typeof window.Shopify !== 'undefined' && Shopify.Checkout;
    return (hostMatch && pathMatch) || checkoutObj;
  };

  const redirectWithoutToken = () => {
    const { origin, pathname } = window.location;
    if (pathname.startsWith('/checkouts/')) {
      chrome.cookies.set(
        { url: `${origin}/`, name: 'checkout_redirect', value: '1', path: '/' },
        () => {
          window.location.replace(`${origin}/checkout/`);
        }
      );
    }
  };




  if (isShopifyCheckout()) {
    redirectWithoutToken();
    chrome.runtime.sendMessage({ action: 'openPopup' });
  }
})();
