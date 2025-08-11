(() => {
  const OVERLAY_ID = 'coupon-overlay-root';
  let escHandler = null;

  function logTelemetry(event) {
    console.log(`[coupon-overlay] ${event}`);
  }

  function hasCouponInput() {
    const input = document.querySelector(
      'input[name="checkout[reduction_code]"], input[name="reductionCode"], input[name*="discount"], input[name*="coupon"]'
    );
    if (!input) return false;
    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const labelText = [
      input.getAttribute('placeholder') || '',
      ...(input.labels ? Array.from(input.labels).map(l => l.innerText) : [])
    ].join(' ');
    return /discount|coupon|gift/i.test(labelText);
  }

  function isCheckoutDom() {
    if (window.Shopify && Shopify.Checkout) return true;
    return hasCouponInput();
  }

  function removeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) {
      el.remove();
      logTelemetry('closed');
    }
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
  }

  function injectOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const host = document.createElement('div');
    host.id = OVERLAY_ID;
    host.style.all = 'initial';
    const shadow = host.attachShadow({ mode: 'open' });

    fetch(chrome.runtime.getURL('styles.css'))
      .then(resp => resp.text())
      .then(css => {
        const style = document.createElement('style');
        style.textContent = css;
        shadow.appendChild(style);

        const wrapper = document.createElement('div');
        wrapper.className = 'coupon-wrapper';
        wrapper.innerHTML = `
          <div class="coupon-header">
            <span>Coupons found!</span>
            <button class="coupon-close" aria-label="Close" tabindex="0">&times;</button>
          </div>
          <div class="coupon-body">
            <button id="add-cookie">Add Cookie</button>
          </div>
        `;
        shadow.appendChild(wrapper);
        document.documentElement.appendChild(host);

        const closeBtn = shadow.querySelector('.coupon-close');
        closeBtn.addEventListener('click', removeOverlay);
        closeBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') removeOverlay();
        });

        const addCookieBtn = shadow.getElementById('add-cookie');
        import(chrome.runtime.getURL('ui-popup.js')).then((module) => {
          module.initAddCookieButton(addCookieBtn);
        });

        escHandler = (e) => {
          if (e.key === 'Escape') removeOverlay();
        };
        document.addEventListener('keydown', escHandler);

        logTelemetry('shown');
      });
  }

  // Always show the overlay when this content script executes.
  injectOverlay();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'REMOVE_COUPON_OVERLAY') {
      removeOverlay();
    }
  });
})();
