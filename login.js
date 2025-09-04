document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const errorDiv = document.getElementById('error');

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
      await saveAuth(data);
      await new Promise((resolve) =>
        chrome.storage.local.set({ cusID }, resolve)
      );
      chrome.runtime.sendMessage({ type: 'LOGIN_SUCCESS' });
      window.close();
    } catch (err) {
      errorDiv.textContent = err.message || 'Login failed';
    }
  });
});
