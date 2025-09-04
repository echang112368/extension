function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch (e) {
    return {};
  }
}

function isExpired(exp) {
  return !exp || Date.now() / 1000 >= exp;
}

async function saveAuth(data) {
  const accessExp = decodeJwt(data.access)?.exp || 0;
  const refreshExp = decodeJwt(data.refresh)?.exp || 0;
  const authData = { ...data, accessExp, refreshExp };
  await new Promise((resolve) => chrome.storage.local.set({ auth: authData }, resolve));
}

async function getAuth() {
  return new Promise((resolve) => chrome.storage.local.get('auth', resolve));
}

async function refreshAccessToken() {
  const { auth } = await getAuth();
  if (!auth?.refresh || isExpired(auth.refreshExp)) {
    throw new Error('Refresh token expired');
  }
  const resp = await fetch('http://localhost:8000/api/token/refresh/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh: auth.refresh }),
  });
  if (!resp.ok) {
    throw new Error('Refresh failed');
  }
  const data = await resp.json();
  const accessExp = decodeJwt(data.access)?.exp || 0;
  const newAuth = { ...auth, access: data.access, accessExp };
  await new Promise((resolve) => chrome.storage.local.set({ auth: newAuth }, resolve));
  return data.access;
}

async function getValidAccessToken() {
  const { auth } = await getAuth();
  if (!auth?.access) {
    throw new Error('No token');
  }
  if (isExpired(auth.accessExp)) {
    return await refreshAccessToken();
  }
  return auth.access;
}

async function requireLogin() {
  await new Promise((resolve) => chrome.storage.local.remove(['auth', 'cusID'], resolve));
  chrome.windows.create({
    url: chrome.runtime.getURL('login.html'),
    type: 'popup',
    width: 480,
    height: 700,
  });
}

