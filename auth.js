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
    console.warn('authFetch missing auth tokens', {
      hasAccess: Boolean(access),
      hasRefresh: Boolean(refresh),
      url,
    });
    throw new Error('Not authenticated');
  }

  if (isTokenExpired(access)) {
    const tokenDetails = parseJwt(access);
    console.info('authFetch access token expired, attempting refresh', {
      url,
      exp: tokenDetails?.exp,
    });
    let resp;
    try {
      resp = await fetch('http://localhost:8000/api/token/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
    } catch (error) {
      console.error('authFetch token refresh request failed', {
        error: error?.message || error,
      });
      throw error;
    }
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
      let responseBody = null;
      try {
        responseBody = await resp.json();
      } catch (error) {
        responseBody = `Failed to read refresh response body: ${error?.message || error}`;
      }
      console.warn('authFetch token refresh failed', {
        status: resp.status,
        statusText: resp.statusText,
        body: responseBody,
      });
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
  const response = await fetch(url, options);
  if (!response.ok) {
    console.warn('authFetch non-ok response', {
      url,
      status: response.status,
      statusText: response.statusText,
    });
  }
  return response;
}

self.authFetch = authFetch;
self.isTokenExpired = isTokenExpired;
