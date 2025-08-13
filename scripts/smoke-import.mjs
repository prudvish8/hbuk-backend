// scripts/smoke-import.mjs
// Only verifies modules resolve — doesn't start the server or hit the DB.
const mustImport = async (p) => {
  try { await import(p); console.log(`✅ import ok: ${p}`); }
  catch (e) { console.error(`❌ import failed: ${p}\n${e.stack || e}`); process.exit(1); }
};
await mustImport('../auth.js');
await mustImport('../validation.js');
console.log('✅ static import sanity complete');
