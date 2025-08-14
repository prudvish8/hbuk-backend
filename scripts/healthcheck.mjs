// scripts/healthcheck.mjs
const API = process.env.API || 'https://hbuk-backend-hvow.onrender.com';

const fetchJson = async (url) => {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}\nBody: ${text}`);
  }
  try { return JSON.parse(text); } catch { return text; }
};

(async () => {
  try {
    console.log(`[health] ${API}/health`);
    const a = await fetchJson(`${API}/health`);
    console.log(a);

    console.log(`[health] ${API}/health/db`);
    const b = await fetchJson(`${API}/health/db`);
    console.log(b);

    console.log('health: OK');
    process.exit(0);
  } catch (e) {
    console.error('health: FAIL\n', e?.stack || String(e));
    process.exit(1);
  }
})();
