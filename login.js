document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorDiv = document.getElementById('error');

  const updatePoints = async () => {
    const { auth } = await new Promise((resolve) =>
      chrome.storage.local.get('auth', resolve)
    );
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
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    const payload = {
      username: emailInput.value,
      password: passwordInput.value,
    };
    try {
      const response = await fetch('http://localhost:8000/api/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Login failed');
      }
      const data = await response.json();
      const cusID = data?.uuid;
      await new Promise((resolve) =>
        chrome.storage.local.set({ auth: data, cusID }, resolve)
      );
      await updatePoints();
      chrome.runtime.sendMessage({ type: 'LOGIN_SUCCESS' });
      window.close();
    } catch (err) {
      errorDiv.textContent = err.message || 'Login failed';
    }
  });
});
