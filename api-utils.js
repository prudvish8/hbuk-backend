// api-utils.js — hardened ESM utilities for Hbuk

// Allow override from HTML before this script runs:
//   <script>window.API_BASE='https://my-api.example.com'</script>
const heuristicBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:')
  ? 'http://localhost:3000'
  : 'https://hbuk-backend-hvow.onrender.com';

export const API_BASE =
  (typeof window !== 'undefined' && window.API_BASE) ||
  heuristicBase;

console.log('[HBUK] API_BASE:', API_BASE);

// Token helpers (localStorage by design for simple MVP)
const TOKEN_KEY = 'hbuk_token';
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {}
}
export function clearToken() { setToken(null); }

// Core fetch wrapper with timeout and rich errors
export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 20000;
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers,
      // we don't rely on cookies; JWT is in Authorization
      // credentials: 'include' // not needed for header-based auth
      mode: 'cors',
    });

    // Read the body text once; we'll parse conditionally
    const raw = await res.text().catch(() => '');

    // Helper: best-effort JSON parse
    const toJson = () => {
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    };

    if (!res.ok) {
      const data = toJson();
      const msg = (data && (data.error || data.message)) || raw || res.statusText || 'Request failed';
      console.error('[HBUK] API non-OK', res.status, msg);
      // Do NOT auto-logout unless the app wires it explicitly
      const err = new Error(`HTTP ${res.status} – ${msg}`);
      err.status = res.status;
      err.body = data ?? raw;
      throw err;
    }

    // 204 No Content or empty body
    if (res.status === 204 || raw.trim() === '') return null;

    const data = toJson();
    return (data !== null) ? data : raw;
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'Request timed out' : (e?.message || 'Network error');
    console.error('[HBUK] API request failed:', msg);
    throw new Error(msg);
  } finally {
    clearTimeout(id);
  }
} 