// scripts/healthcheck.mjs
import { setTimeout as sleep } from 'node:timers/promises';

const API = process.env.API || 'https://hbuk-backend-hvow.onrender.com';
const PATHS = (process.env.HEALTH_PATHS || '/api/health,/healthz')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const TIMEOUT_MS = 5000;
const RETRIES = 3;

async function fetchJson(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // some health endpoints may not return JSON; tolerate that
    try { return await res.json(); } catch { return {}; }
  } catch (err) {
    throw err;
  }
}

(async () => {
  for (const path of PATHS) {
    let lastErr;
    for (let i = 0; i < RETRIES; i++) {
      const url = `${API}${path}`;
      try {
        const body = await fetchJson(url);
        console.log(`[health] ${url} -> OK`, body.ok ?? true);
        process.exit(0);
      } catch (err) {
        lastErr = err;
        console.log(`[health] ${url} attempt ${i + 1}/${RETRIES} failed: ${err.message}`);
        await sleep(1000 * (i + 1));
      }
    }
    console.error(`[health] ${API}${path} FAILED after ${RETRIES} attempts: ${lastErr?.message}`);
  }
  console.error('All health paths failed.');
  process.exit(1);
})();
