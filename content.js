(() => {
  const OVERLAY_ID = 'coupon-overlay-root';
  const SPECIFIC_UUID = '733d0d67-6a30-4c48-a92e-b8e211b490f5';
  const NO_DISCOUNT_UUID = 'n/a';
  const REWARD_LAYER_ID = 'badger-reward-layer';
  const REWARD_POINTS_PER_LEVEL = 1000;
  const REWARD_ICON = '⭐';
  const REWARD_ANIMATION_DURATION = 900;
  let escHandler = null;
  let modal,
    modalLoading,
    modalResult,
    resultTitle,
    resultDesc;
  let overlayShadow = null;
  let modalOpenCount = 0;
  let cookieCheckInterval = null;
  const creatorCache = {};
  let hasRequestedCusIdCookie = false;
  let rewardObserverInitialized = false;
  let rewardAnimationInFlight = 0;

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

  function isExtensionContextValid() {
    return Boolean(chrome?.runtime?.id);
  }

  function runIfExtensionContextValid(action) {
    if (!isExtensionContextValid()) return;
    try {
      action();
    } catch (error) {
      if (
        typeof error?.message === 'string' &&
        error.message.includes('Extension context invalidated')
      ) {
        return;
      }
      throw error;
    }
  }

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

  function getRewardElements() {
    if (!overlayShadow) return null;
    const cart = overlayShadow.querySelector('[data-reward-cart]');
    const meter = overlayShadow.querySelector('[data-reward-meter]');
    const points = overlayShadow.querySelector('[data-reward-points]');
    const counter = points?.closest('.points-counter');
    if (!cart || !meter || !points) return null;
    return { cart, meter, points, counter };
  }

  function ensureRewardLayer() {
    let layer = document.getElementById(REWARD_LAYER_ID);
    if (!layer) {
      layer = document.createElement('div');
      layer.id = REWARD_LAYER_ID;
      layer.className = 'reward-flight-layer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateCounter({ fromValue, toValue, duration, onUpdate, onComplete }) {
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = easeOutCubic(progress);
      const current = Math.round(fromValue + (toValue - fromValue) * eased);
      onUpdate(current);
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else if (onComplete) {
        onComplete();
      }
    }
    requestAnimationFrame(tick);
  }

  function updateRewardMeter(progress) {
    const elements = getRewardElements();
    if (!elements) return;
    const clamped = Math.min(Math.max(progress, 0), 1);
    elements.meter.style.transform = `scaleX(${clamped})`;
  }

  function setRewardDisplay(totalPoints) {
    const elements = getRewardElements();
    if (!elements) return;
    const progress = (totalPoints % REWARD_POINTS_PER_LEVEL) / REWARD_POINTS_PER_LEVEL;
    elements.points.textContent = totalPoints.toLocaleString('en-US');
    updateRewardMeter(progress);
  }

  function triggerCartPulse() {
    const elements = getRewardElements();
    if (!elements) return;
    elements.cart.classList.remove('pulse');
    void elements.cart.offsetWidth;
    elements.cart.classList.add('pulse');
  }

  function animateRewardUpdate({ earnedPoints, totalPoints }) {
    const elements = getRewardElements();
    if (!elements) return;
    const currentValue = Number(elements.points.textContent.replace(/,/g, '')) || 0;
    const duration = 700;
    const progress = (totalPoints % REWARD_POINTS_PER_LEVEL) / REWARD_POINTS_PER_LEVEL;

    elements.counter?.classList.remove('bump');
    void elements.counter?.offsetWidth;
    elements.counter?.classList.add('bump');

    updateRewardMeter(progress);
    animateCounter({
      fromValue: currentValue,
      toValue: totalPoints,
      duration,
      onUpdate: (value) => {
        elements.points.textContent = value.toLocaleString('en-US');
      },
    });
    triggerCartPulse();
  }

  function animateRewardFlight(startRect, endRect, count = 6) {
    const layer = ensureRewardLayer();
    const startX = startRect.left + startRect.width / 2;
    const startY = startRect.top + startRect.height / 2;
    const endX = endRect.left + endRect.width / 2;
    const endY = endRect.top + endRect.height / 2;
    const controlX = (startX + endX) / 2;
    const controlY = Math.min(startY, endY) - 120;

    rewardAnimationInFlight += count;

    for (let i = 0; i < count; i += 1) {
      const token = document.createElement('div');
      token.className = 'reward-point';
      token.textContent = REWARD_ICON;
      layer.appendChild(token);

      const duration = REWARD_ANIMATION_DURATION + i * 80;
      const jitterX = (Math.random() - 0.5) * 30;
      const jitterY = (Math.random() - 0.5) * 20;
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeOutCubic(t);
        const x =
          (1 - eased) * (1 - eased) * startX +
          2 * (1 - eased) * eased * (controlX + jitterX) +
          eased * eased * endX;
        const y =
          (1 - eased) * (1 - eased) * startY +
          2 * (1 - eased) * eased * (controlY + jitterY) +
          eased * eased * endY;
        token.style.transform = `translate(${x}px, ${y}px) scale(${1 - t * 0.2})`;

        if (t < 1) {
          requestAnimationFrame(animate);
        } else {
          token.classList.add('fade-out');
          setTimeout(() => {
            token.remove();
            rewardAnimationInFlight -= 1;
            if (rewardAnimationInFlight === 0) {
              triggerCartPulse();
            }
          }, 200);
        }
      };
      requestAnimationFrame(animate);
    }
  }

  function getBuyTarget(element) {
    if (!element) return null;
    const candidate = element.closest(
      'button, [role="button"], input[type="submit"], input[type="button"], a'
    );
    if (!candidate) return null;
    const text =
      candidate.getAttribute('aria-label') ||
      candidate.textContent ||
      candidate.value ||
      '';
    if (/buy|checkout|place order|complete|pay|purchase|confirm/i.test(text)) {
      return candidate;
    }
    return null;
  }

  function getConfirmationTarget() {
    const selectors = ['[data-order-status]', '.order-confirmation', '.thank-you'];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    const textMatches = Array.from(document.querySelectorAll('h1, h2, p')).find((el) =>
      /thank you|order confirmed|purchase complete|confirmation/i.test(
        el.textContent || ''
      )
    );
    return textMatches || null;
  }

  function triggerRewardFlow(originElement) {
    const originRect = originElement?.getBoundingClientRect();
    const rewardTarget = getRewardElements()?.cart;
    if (!originRect || !rewardTarget) return;
    const targetRect = rewardTarget.getBoundingClientRect();
    const earnedPoints = Math.floor(40 + Math.random() * 110);

    animateRewardFlight(originRect, targetRect, Math.max(4, Math.round(earnedPoints / 30)));
    runIfExtensionContextValid(() =>
      chrome.runtime.sendMessage({ type: 'REWARD_POINTS_EARNED', points: earnedPoints })
    );
  }

  function setupRewardObservers() {
    if (rewardObserverInitialized) return;
    rewardObserverInitialized = true;

    document.addEventListener('click', (event) => {
      const target = getBuyTarget(event.target);
      if (target) {
        triggerRewardFlow(target);
      }
    });

    const immediateConfirmation = getConfirmationTarget();
    if (immediateConfirmation) {
      triggerRewardFlow(immediateConfirmation);
      return;
    }

    const observer = new MutationObserver(() => {
      const confirmation = getConfirmationTarget();
      if (confirmation) {
        triggerRewardFlow(confirmation);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
    overlayShadow = shadow;

    Promise.all([
      fetch(chrome.runtime.getURL('styles.css')).then(resp => resp.text()),
      fetch(chrome.runtime.getURL('ui-popup.html')).then(resp => resp.text()),
    ]).then(([css, html]) => {
      const style = document.createElement('style');
      style.textContent = css + MODAL_CSS;
      shadow.appendChild(style);

      const template = document.createElement('div');
      template.innerHTML = html;
      const brandMarkImg = template.querySelector('.brand-mark img');
      if (brandMarkImg) {
        brandMarkImg.src = chrome.runtime.getURL('transparent-logo.png');
      }
      const supportingIllustration = template.querySelector('.supporting-illustration');
      if (supportingIllustration) {
        supportingIllustration.src = chrome.runtime.getURL('party-horn.png');
      }
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
          runIfExtensionContextValid(() =>
            chrome.runtime.sendMessage({ type: 'ADD_COOKIE' })
          );
        });
      }

      const beforeLogin = shadow.getElementById('before-login');
      const afterLogin = shadow.getElementById('after-login');
      const loginBtn = shadow.getElementById('login');
      const supporting = shadow.getElementById('supporting-creator');
      const creatorNameSpan = supporting?.querySelector('#creator-name');

      async function fetchCreatorName(uuid) {
        if (!uuid) return 'creator';
        if (creatorCache[uuid]) return creatorCache[uuid];
        try {
          const resp = await authFetch(
            `http://localhost:8000/api/creators/${uuid}/`
          );
          if (!resp.ok) return 'creator';
          const data = await resp.json();
          const name =
            data?.name || data?.username || data?.creator_name || 'creator';
          creatorCache[uuid] = name;
          return name;
        } catch (e) {
          console.error('Failed to fetch creator', e);
          return 'creator';
        }
      }

      const renderAuth = () => {
        if (!isExtensionContextValid()) return false;

        const uuid = getUuidCookie();
        runIfExtensionContextValid(() =>
          chrome.storage.local.get('auth', ({ auth }) => {
            const isLoggedIn = !!(
              auth &&
              (auth.user || auth.token || auth.uuid || auth.access || auth.refresh)
            );

            if (!isLoggedIn) {
              if (beforeLogin) beforeLogin.style.display = 'block';
              if (afterLogin) afterLogin.style.display = 'none';
              if (supporting) supporting.style.display = 'none';
              hasRequestedCusIdCookie = false;
            } else if (!uuid) {
              if (beforeLogin) beforeLogin.style.display = 'none';
              if (afterLogin) afterLogin.style.display = 'block';
              if (supporting) supporting.style.display = 'none';
              hasRequestedCusIdCookie = false;
            } else if (uuid !== SPECIFIC_UUID && uuid !== NO_DISCOUNT_UUID) {
              if (beforeLogin) beforeLogin.style.display = 'none';
              if (afterLogin) afterLogin.style.display = 'none';
              if (supporting) {
                supporting.style.display = 'block';
                fetchCreatorName(uuid).then((name) => {
                  if (creatorNameSpan) creatorNameSpan.textContent = name;
                });
                if (!hasRequestedCusIdCookie) {
                  runIfExtensionContextValid(() =>
                    chrome.runtime.sendMessage({ type: 'SET_CUSID_COOKIE' })
                  );
                  hasRequestedCusIdCookie = true;
                }
              }
            } else {
              if (beforeLogin) beforeLogin.style.display = 'none';
              if (afterLogin) afterLogin.style.display = 'none';
              if (supporting) supporting.style.display = 'none';
              hasRequestedCusIdCookie = false;
              removeOverlay();
            }
          })
        );

        return !!uuid;
      };

      loginBtn?.addEventListener('click', () => {
        runIfExtensionContextValid(() =>
          chrome.runtime.sendMessage({ type: 'OPEN_LOGIN' })
        );
      });

      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === 'LOGIN_SUCCESS' || msg?.type === 'LOGOUT') {
          renderAuth();
        }
      });

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.auth) {
          renderAuth();
          syncRewardState();
        }
        if (area === 'local' && changes.reward_points_total) {
          syncRewardState();
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

      setupRewardObservers();
      syncRewardState();
      logTelemetry('shown');
    });
  }

  function syncRewardState() {
    if (!isExtensionContextValid()) return;
    runIfExtensionContextValid(() =>
      chrome.storage.local.get(['auth', 'reward_points_total'], ({ auth, reward_points_total }) => {
        const total =
          Number(reward_points_total) ||
          Number(auth?.points) ||
          Number(auth?.user?.points) ||
          0;
        if (total >= 0) {
          setRewardDisplay(total);
        }
      })
    );
  }

  // Show the overlay when we have a UUID that does not match the
  // specific opt-out value or the no-discount value. Some stores set or
  // update the UUID cookie asynchronously after the page loads, so if we
  // see one of these values initially we keep checking until it changes.
  const existingUuid = getUuidCookie();
  if (existingUuid !== SPECIFIC_UUID && existingUuid !== NO_DISCOUNT_UUID) {
    injectOverlay();
  } else {
    const uuidMonitor = setInterval(() => {
      const currentUuid = getUuidCookie();
      if (
        currentUuid &&
        currentUuid !== SPECIFIC_UUID &&
        currentUuid !== NO_DISCOUNT_UUID
      ) {
        clearInterval(uuidMonitor);
        injectOverlay();
      }
    }, 1000);
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
    } else if (msg.type === 'REWARD_POINTS_APPLIED') {
      const totalPoints = Number(msg.totalPoints) || 0;
      const earnedPoints = Number(msg.earnedPoints) || 0;
      animateRewardUpdate({ earnedPoints, totalPoints });
    }
  });
})();
