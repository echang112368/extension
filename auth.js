function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (e) {
    return null;
  }
}

function isTokenExpired(token) {
  const data = parseJwt(token);
  if (!data || !data.exp) return true;
  return Date.now() >= data.exp * 1000;
}

async function authFetch(url, options = {}) {
  const { auth } = await new Promise((resolve) =>
    chrome.storage.local.get('auth', resolve)
  );
  let access = auth?.access;
  const refresh = auth?.refresh;
  if (!access || !refresh) {
    throw new Error('Not authenticated');
  }

  if (isTokenExpired(access)) {
    const resp = await fetch('http://localhost:8000/api/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    });
    if (resp.ok) {
      const data = await resp.json();
      access = data?.access;
      const newRefresh = data?.refresh || refresh;
      await new Promise((resolve) =>
        chrome.storage.local.set(
          { auth: { ...auth, access, refresh: newRefresh } },
          resolve
        )
      );
    } else {
      await new Promise((resolve) =>
        chrome.storage.local.remove(['auth', 'cusID'], resolve)
      );
      throw new Error('Authentication expired');
    }
  }

  options.headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${access}`,
  };
  return fetch(url, options);
}

self.authFetch = authFetch;
self.isTokenExpired = isTokenExpired;
