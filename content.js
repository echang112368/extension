(function() {
  const isShopifyCheckout = () => {
    const { hostname, pathname } = window.location;
    const hostMatch =
      hostname === 'checkout.shopify.com' || hostname.endsWith('.myshopify.com');
    const pathMatch = /\/checkouts?/i.test(pathname);
    const checkoutObj = typeof window.Shopify !== 'undefined' && Shopify.Checkout;
    return (hostMatch && pathMatch) || checkoutObj;
  };

  const handleCheckoutRedirect = () => {
    const { hostname, origin, pathname, search } = window.location;
    const params = new URLSearchParams(search);

    const onTokenCheckout =
      (hostname === 'checkout.shopify.com' ||
        hostname.endsWith('.myshopify.com')) &&
      pathname.startsWith('/checkouts/');

    if (onTokenCheckout) {
      let shopOrigin;
      try {
        shopOrigin = new URL(document.referrer).origin;
      } catch (e) {
        if (window.Shopify && window.Shopify.shop) {
          shopOrigin = `https://${window.Shopify.shop}`;
        }
      }
      if (shopOrigin) {
        window.location.replace(`${shopOrigin}/?checkout_redirect=1`);
      }
      return;
    }

    if (params.get('checkout_redirect') === '1') {
      chrome.cookies.set(
        { url: `${origin}/`, name: 'checkout_redirect', value: '1', path: '/' },
        () => {
          window.location.replace(`${origin}/checkout/`);
        }
      );
    }
  };

  handleCheckoutRedirect();

  if (isShopifyCheckout()) {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  }
})();
