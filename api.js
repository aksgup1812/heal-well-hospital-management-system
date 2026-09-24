/* Small reusable frontend client for the Heal Well Express API. */
(() => {
  const configuredUrl = window.HMS_API_URL || 'http://localhost:5000/api';
  const tokenKey = 'hmsApiToken';

  /* Make an authenticated API request and return its JSON response. */
  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = localStorage.getItem(tokenKey);
    if (token) headers.Authorization = `Bearer ${token}`;
    let response;
    try { response = await fetch(`${configuredUrl}${path}`, { ...options, headers }); }
    catch (error) { error.isNetworkError = true; throw error; }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.message || 'API request failed.'); error.status = response.status; error.isBackendUnavailable = response.status >= 500; throw error; }
    return payload;
  }

  /* Store or clear the JWT returned by the backend. */
  function setToken(token) { if (token) localStorage.setItem(tokenKey, token); else localStorage.removeItem(tokenKey); }

  /* Test whether the backend can be reached without requiring a login. */
  async function isAvailable() { try { await request('/health', { headers: {} }); return true; } catch (error) { return !error.isNetworkError && error.status !== undefined; } }

  window.HMS_API = { baseUrl: configuredUrl, request, setToken, isAvailable, get: (path) => request(path), post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }), put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }), delete: (path) => request(path, { method: 'DELETE' }) };
})();
