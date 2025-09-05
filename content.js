(() => {
  const OVERLAY_ID = 'coupon-overlay-root';
  const SPECIFIC_UUID = '732bf11f-07c9-433e-b8f8-19fd6f160602';
  let escHandler = null;
  let modal,
    modalLoading,
    modalResult,
    resultTitle,
    resultDesc;
  let modalOpenCount = 0;
  let cookieCheckInterval = null;

  const MODAL_CSS = `
    #coupon-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.6);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
    }
    #coupon-modal.visible {
      display: flex;
    }
    #coupon-modal .modal-content {
      background: #fff;
      padding: 24px;
      border-radius: 8px;
      text-align: center;
      width: 80%;
      max-width: 320px;
      font-family: sans-serif;
      position: relative;
    }
    #coupon-modal .loader {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      animation: spin 0.5s linear infinite;
      margin: 0 auto 16px;
    }
    #coupon-modal ul {
      list-style: disc;
      padding-left: 20px;
      text-align: left;
      font-size: 14px;
      margin: 0;
    }
    #coupon-modal .close-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
    }
    #coupon-modal .hidden {
      display: none;
    }
    #coupon-modal button {
      margin-top: 16px;
      padding: 8px 12px;
      cursor: pointer;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;

  function showModal() {
    if (modal && modalOpenCount === 0) {
      modal.classList.add('visible');
      modal.focus();
      modalOpenCount++;
    }
  }

  function resetModal() {
    if (modalLoading && modalResult) {
      modalLoading.classList.remove('hidden');
      modalResult.classList.add('hidden');
    }
  }

  function hideModal() {
    if (modal && modalOpenCount > 0) {
      modal.classList.remove('visible');
      resetModal();
      modalOpenCount--;
    }
  }

  function isModalVisible() {
    return modal && modal.classList.contains('visible');
  }

  function logTelemetry(event) {
    console.log(`[coupon-overlay] ${event}`);
  }

  function getUuidCookie() {
    const match = document.cookie.match(/(?:^|; )uuid=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
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
      modalOpenCount = 0;
      logTelemetry('closed');
    }
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
    if (cookieCheckInterval) {
      clearInterval(cookieCheckInterval);
      cookieCheckInterval = null;
    }
  }

  function injectOverlay() {
    if (document.getElementById(OVERLAY_ID)) return;

    const host = document.createElement('div');
    host.id = OVERLAY_ID;
    host.style.all = 'initial';
    const shadow = host.attachShadow({ mode: 'open' });

    Promise.all([
      fetch(chrome.runtime.getURL('styles.css')).then(resp => resp.text()),
      fetch(chrome.runtime.getURL('ui-popup.html')).then(resp => resp.text()),
    ]).then(([css, html]) => {
      const style = document.createElement('style');
      style.textContent = css + MODAL_CSS;
      shadow.appendChild(style);

      const template = document.createElement('div');
      template.innerHTML = html;
      shadow.appendChild(template.firstElementChild);
      document.documentElement.appendChild(host);

      modal = document.createElement('div');
      modal.id = 'coupon-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('tabindex', '-1');
      modal.innerHTML = `
        <div class="modal-content">
          <button class="close-btn" aria-label="Close">&times;</button>
          <div class="loading">
            <div class="loader"></div>
            <ul>
              <li>Checking for deals</li>
              <li>Applying codes</li>
            </ul>
          </div>
          <div class="result hidden">
            <h2 class="result-title">All done!</h2>
            <p class="result-desc">You're back at checkout with the best we could find.</p>
            <button id="back-to-checkout">Back to Checkout</button>
          </div>
        </div>`;
      shadow.appendChild(modal);

      modalLoading = shadow.querySelector('#coupon-modal .loading');
      modalResult = shadow.querySelector('#coupon-modal .result');
      resultTitle = shadow.querySelector('#coupon-modal .result-title');
      resultDesc = shadow.querySelector('#coupon-modal .result-desc');
      const closeModalBtn = shadow.querySelector('#coupon-modal .close-btn');
      const backBtn = shadow.getElementById('back-to-checkout');
      closeModalBtn.addEventListener('click', hideModal);
      backBtn.addEventListener('click', hideModal);

      const closeBtn = shadow.querySelector('.coupon-close');
      closeBtn.addEventListener('click', removeOverlay);
      closeBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') removeOverlay();
      });

      const addCookieBtn = shadow.getElementById('add-cookie');
      if (addCookieBtn) {
        addCookieBtn.addEventListener('click', () => {
          showModal();
          chrome.runtime.sendMessage({ type: 'ADD_COOKIE' });
        });
      }

      const beforeLogin = shadow.getElementById('before-login');
      const afterLogin = shadow.getElementById('after-login');
      const loginBtn = shadow.getElementById('login');
      const supporting = shadow.getElementById('supporting-creator');

      const renderAuth = () => {
        const uuid = getUuidCookie();
        if (uuid) {
          if (beforeLogin) beforeLogin.style.display = 'none';
          if (afterLogin) afterLogin.style.display = 'none';
          if (supporting) supporting.style.display = 'block';
          return true;
        }
        chrome.storage.local.get('auth', ({ auth }) => {
          const isLoggedIn = !!(auth && (auth.user || auth.token || auth.uuid));
          if (beforeLogin) beforeLogin.style.display = isLoggedIn ? 'none' : 'block';
          if (afterLogin) afterLogin.style.display = isLoggedIn ? 'block' : 'none';
          if (supporting) supporting.style.display = 'none';
        });
        return false;
      };

      loginBtn?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_LOGIN' });
      });

      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'LOGIN_SUCCESS' || msg?.type === 'LOGOUT') {
          renderAuth();
          if (msg?.type === 'LOGIN_SUCCESS') updatePoints();
        }
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.auth) {
          renderAuth();
          updatePoints();
        }
      });

      renderAuth();
      cookieCheckInterval = setInterval(() => {
        if (renderAuth()) {
          clearInterval(cookieCheckInterval);
          cookieCheckInterval = null;
        }
      }, 1000);

      escHandler = (e) => {
        if (e.key === 'Escape') {
          if (isModalVisible()) {
            hideModal();
          } else {
            removeOverlay();
          }
        }
      };
      document.addEventListener('keydown', escHandler);

      logTelemetry('shown');
    });
  }

  function updatePoints() {
    chrome.storage.local.get('auth', async ({ auth }) => {
      const uuid = auth?.uuid;
      if (!uuid) return;
      try {
        const resp = await fetch(
          `http://localhost:8000/api/points/${uuid}/`
        );
        if (!resp.ok) return;
        const data = await resp.json();
        await new Promise((resolve) =>
          chrome.storage.local.set(
            { auth: { ...auth, points: data?.points ?? 0 } },
            resolve
          )
        );
      } catch (e) {
        console.error('Failed to fetch points', e);
      }
    });
  }

  // Always show the overlay when this content script executes unless a specific cookie is present.
  const existingUuid = getUuidCookie();
  updatePoints();
  if (existingUuid !== SPECIFIC_UUID) {
    injectOverlay();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'REMOVE_COUPON_OVERLAY') {
      removeOverlay();
    } else if (msg.type === 'RESULT') {
      showModal();
      if (modalLoading && modalResult) {
        modalLoading.classList.add('hidden');
        modalResult.classList.remove('hidden');
        if (msg.status === 'error') {
          resultTitle.textContent = 'Something went wrong';
          resultDesc.textContent = 'Please try again.';
        } else {
          resultTitle.textContent = 'All done!';
          resultDesc.textContent = "You're back at checkout with the best we could find.";
        }
      }
    } else if (msg.type === 'SHOW_LOADING') {
      resetModal();
      showModal();
    }
  });
})();
