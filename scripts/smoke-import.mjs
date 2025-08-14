// scripts/smoke-import.mjs
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const mustExist = [
  'server.js',
  'validation.js',
  'auth.js',            // check presence, but don't import
  '.github/workflows/smoke.yml',
];

let ok = true;
for (const p of mustExist) {
  try {
    await access(p, constants.R_OK);
    console.log(`OK  ${p}`);
  } catch {
    console.error(`MISS ${p}`);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
