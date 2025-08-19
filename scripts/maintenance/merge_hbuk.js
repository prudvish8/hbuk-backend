// scripts/maintenance/merge_hbuk.js
// One-time merge: SOURCE_DB → TARGET_DB, dedupe users by email, remap entry.userId.
// Usage (dry run):  DRY_RUN=1 node scripts/maintenance/merge_hbuk.js
// Usage (real run): node scripts/maintenance/merge_hbuk.js

const { MongoClient, ObjectId } = require('mongodb');

const URI        = process.env.MONGODB_URI;                 // required
const SOURCE_DB  = process.env.SOURCE_DB  || 'hbuk_db';     // old
const TARGET_DB  = process.env.TARGET_DB  || 'hbuk';        // new/canonical
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '1000', 10);
const DRY_RUN    = !!process.env.DRY_RUN;

if (!URI) {
  console.error('❌ Set MONGODB_URI in env.');
  process.exit(1);
}

(async () => {
  const client = new MongoClient(URI);
  const startedAt = new Date();
  try {
    await client.connect();
    const src = client.db(SOURCE_DB);
    const dst = client.db(TARGET_DB);

    console.log(`\n🔗 Connected. SOURCE_DB=${SOURCE_DB} → TARGET_DB=${TARGET_DB}  DRY_RUN=${DRY_RUN ? 'yes' : 'no'}`);

    // Ensure key indexes on target
    if (!DRY_RUN) {
      await dst.collection('users').createIndex({ email: 1 }, { unique: true });
      await dst.collection('entries').createIndex({ userId: 1, createdAt: -1 });
      // Optional if digest must be unique:
      // await dst.collection('entries').createIndex({ digest: 1 }, { unique: true });
    }

    // 1) Upsert users by email and build oldId -> newId map
    const oldToNew = new Map(); // oldUserId(string) -> newUserId(ObjectId)
    let uIns = 0, uKept = 0, uSeen = 0;

    console.log('\n👤 Merging users (by email)…');
    const uCur = src.collection('users').find({}, { projection: { email: 1, hashedPassword: 1, createdAt: 1 } }).batchSize(BATCH_SIZE);
    for await (const u of uCur) {
      uSeen++;
      const email = (u.email || '').trim().toLowerCase();
      if (!email) continue;

      let result;
      if (!DRY_RUN) {
        result = await dst.collection('users').updateOne(
          { email },
          { $setOnInsert: { hashedPassword: u.hashedPassword, createdAt: u.createdAt || new Date() } },
          { upsert: true }
        );
      }
      if (!DRY_RUN && result && result.upsertedCount === 1) uIns++; else uKept++;

      // fetch target _id to record map
      let target = DRY_RUN
        ? await src.collection('users').findOne({ _id: u._id }, { projection: { _id: 1 } }) // placeholder
        : await dst.collection('users').findOne({ email }, { projection: { _id: 1 } });

      if (target && target._id) {
        oldToNew.set(String(u._id), target._id);
      }
      if (uSeen % 1000 === 0) console.log(`  …${uSeen} users processed`);
    }
    console.log(`✅ Users: processed=${uSeen} inserted=${uIns} kept=${uKept} mapped=${oldToNew.size}`);

    // 2) Copy entries, remapping userId via map; upsert on _id (keepExisting)
    console.log('\n📝 Merging entries (remapping userId)…');
    const eCur = src.collection('entries').find({}).batchSize(BATCH_SIZE);
    let eSeen = 0, eIns = 0, eKept = 0;
    let bulk = [];

    const flush = async () => {
      if (DRY_RUN || bulk.length === 0) { bulk = []; return; }
      const res = await dst.collection('entries').bulkWrite(bulk, { ordered: false });
      eIns += (res.upsertedCount || 0);
      bulk = [];
    };

    for await (const e of eCur) {
      eSeen++;
      const oldUserId = e.userId ? String(e.userId) : null;
      const mapped = oldUserId && oldToNew.get(oldUserId);
      const newUserId = mapped || e.userId;

      const newDoc = { ...e, userId: newUserId instanceof ObjectId ? newUserId : e.userId };
      // Upsert on original _id; do not overwrite existing docs.
      bulk.push({
        updateOne: {
          filter: { _id: e._id },
          update: { $setOnInsert: newDoc },
          upsert: true
        }
      });

      if (bulk.length >= BATCH_SIZE) await flush();
      if (eSeen % 5000 === 0) console.log(`  …${eSeen} entries queued`);
    }
    await flush();

    if (!DRY_RUN) {
      const tgtCount = await dst.collection('entries').countDocuments();
      const srcCount = await src.collection('entries').countDocuments();
      eKept = Math.max(0, srcCount - eIns);
      console.log(`✅ Entries: processed=${eSeen} inserted≈${eIns} kept≈${eKept} (dst now has ${tgtCount})`);
    } else {
      console.log(`(dry-run) Entries processed=${eSeen} (no writes)`);
    }

    // 3) Done
    const endedAt = new Date();
    console.log(`\n🎉 Merge complete in ${Math.round((endedAt - startedAt)/1000)}s. DRY_RUN=${DRY_RUN ? 'yes' : 'no'}`);
    console.log('➡️  Next: point backend to TARGET_DB only, archive SOURCE_DB when ready.');
    await client.close();
  } catch (err) {
    console.error('❌ Merge failed:', err);
    try { await client.close(); } catch {}
    process.exit(1);
  }
})();
