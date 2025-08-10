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

  function makeDraggable(wrapper, header) {
    let startX, startY, origX, origY, dragging = false;

    header.addEventListener('mousedown', (e) => {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = wrapper.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      wrapper.style.right = 'auto';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      wrapper.style.left = `${origX + dx}px`;
      wrapper.style.top = `${origY + dy}px`;
    }

    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
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
          <div class="coupon-body">Hello World</div>
        `;
        shadow.appendChild(wrapper);
        document.documentElement.appendChild(host);

        const closeBtn = shadow.querySelector('.coupon-close');
        closeBtn.addEventListener('click', removeOverlay);
        closeBtn.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') removeOverlay();
        });

        escHandler = (e) => {
          if (e.key === 'Escape') removeOverlay();
        };
        document.addEventListener('keydown', escHandler);

        makeDraggable(wrapper, shadow.querySelector('.coupon-header'));

        logTelemetry('shown');
      });
  }

  function checkAndInject() {
    if (isCheckoutDom()) {
      injectOverlay();
      return true;
    }
    return false;
  }

  if (!checkAndInject()) {
    const observer = new MutationObserver(() => {
      if (checkAndInject()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    let tries = 0;
    const interval = setInterval(() => {
      if (checkAndInject() || ++tries > 10) {
        clearInterval(interval);
        observer.disconnect();
      }
    }, 1000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'REMOVE_COUPON_OVERLAY') {
      removeOverlay();
    }
  });
})();
