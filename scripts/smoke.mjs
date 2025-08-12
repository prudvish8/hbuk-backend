import crypto from 'crypto';
const API = process.env.API || 'https://hbuk-backend-hvow.onrender.com';
const EMAIL = process.env.EMAIL || `u${Math.floor(Math.random()*1e9)}@hbuk.dev`;
const PASS  = process.env.PASS  || 'test123';

const log = (label, ok, extra='') => console.log(`${ok?'✅':'❌'} ${label}${extra?` — ${extra}`:''}`);
const j = async (p)=>{ const r=await p; const t=await r.text(); try{return {status:r.status,json:JSON.parse(t),raw:t}}catch{return {status:r.status,raw:t}}; };

(async () => {
  // health
  let r = await j(fetch(`${API}/health`));
  log('health', r.status===200 && r.json?.ok);

  r = await j(fetch(`${API}/health/db`));
  log('health/db', r.status===200 && r.json?.ok);

  // register
  r = await j(fetch(`${API}/api/register`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:EMAIL,password:PASS})}));
  log('register (new)', r.status===201, r.raw);

  r = await j(fetch(`${API}/api/register`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:EMAIL,password:PASS})}));
  log('register (dup)', r.status===409);

  // login
  r = await j(fetch(`${API}/api/login`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:EMAIL,password:PASS})}));
  const TOKEN = r.json?.token;
  log('login', r.status===200 && !!TOKEN);

  const auth = { Authorization: `Bearer ${TOKEN}` };

  // entries empty
  r = await j(fetch(`${API}/api/entries?limit=2`, {headers:auth}));
  log('entries (empty-ok)', r.status===200 && Array.isArray(r.json?.entries));

  // commit
  r = await j(fetch(`${API}/api/commit`, {method:'POST',headers:{...auth,'Content-Type':'application/json'},body:JSON.stringify({content:'immutable smoke'})}));
  const ID = r.json?.id, DIG = r.json?.digest;
  log('commit', r.status===201 && ID && DIG);

  // verify
  r = await j(fetch(`${API}/api/verify/${ID}/${DIG}`));
  log('verify', r.status===200 && r.json?.ok===true);

  // anchors
  r = await j(fetch(`${API}/api/anchors/today`));
  log('anchors/today', r.status===200 && typeof r.json?.root === 'string');

  // proof
  r = await j(fetch(`${API}/api/anchors/proof/${ID}`, {headers:auth}));
  log('anchors/proof', r.status===200 && Array.isArray(r.json?.proof));

  // tombstone
  r = await j(fetch(`${API}/api/entries/${ID}`, {method:'DELETE', headers:auth}));
  log('tombstone', r.status===201);

  // list again
  r = await j(fetch(`${API}/api/entries?limit=5`, {headers:auth}));
  const first = r.json?.entries?.[0];
  log('entries after tombstone', r.status===200 && first);

  // negative: tamper token
  const BAD = TOKEN.slice(0, -1) + (TOKEN.endsWith('a') ? 'b':'a');
  r = await j(fetch(`${API}/api/entries`, {headers:{Authorization:`Bearer ${BAD}`}}));
  log('JWT tamper → 403', r.status===403);

  // negative: verify wrong digest
  const wrong = crypto.createHash('sha256').update('nope').digest('hex');
  r = await j(fetch(`${API}/api/verify/${ID}/${wrong}`));
  log('verify (tampered) → false', r.status===200 && r.json?.ok===false);

  console.log(`\nEMAIL: ${EMAIL}\nAPI: ${API}`);
})();
