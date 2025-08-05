
(function() {
  const isShopifyCheckout = () => {
    const { hostname, pathname } = window.location;
    const hostMatch =
      hostname === 'checkout.shopify.com' || hostname.endsWith('.myshopify.com');
    const pathMatch = /\/checkouts?/i.test(pathname);
    const checkoutObj = typeof window.Shopify !== 'undefined' && Shopify.Checkout;
    return (hostMatch && pathMatch) || checkoutObj;
  };


  if (isShopifyCheckout()) {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  }
})();
