const API = process.env.API || 'https://hbuk-backend-hvow.onrender.com';

async function ok(path){ const r=await fetch(API+path); if(!r.ok){ throw new Error(path+' '+r.status); } }
(async()=>{
  await ok('/health');
  await ok('/health/db');
  console.log('OK');
})().catch(e=>{ console.error(e); process.exit(1); });
