// The definitive, final, and correct server.js for Hbuk

import 'dotenv/config';
import express from 'express';

// Environment validation warnings
if (!process.env.JWT_SECRET && !process.env.HBUK_JWT_SECRET) {
  console.warn('[WARN] JWT secret not configured (JWT_SECRET or HBUK_JWT_SECRET). Auth will fail.');
}
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { validate, registerSchema, loginSchema, entrySchema } from './validation.js';
import { authenticateToken } from './auth.js';
import { Resend } from 'resend';
import helmet from 'helmet';
import crypto from 'crypto';

// --- IMMUTABILITY FUNCTIONS ---
function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function commitDigest({ userId, content, createdAt, location }) {
  // canonical string for stable hashing
  const payload = JSON.stringify({
    userId: String(userId),
    content,
    createdAt: new Date(createdAt).toISOString(),
    location: location || null
  });
  return sha256Hex(payload);
}

function sha256HexStr(s){ return crypto.createHash('sha256').update(s,'utf8').digest('hex'); }

// --- SIGNING KEY METADATA ---
const SIG_ALG = 'HS256';
const SIG_KID = process.env.HBUK_SIGNING_KID || 'v1';

// Metrics collection (Prometheus-style)
let METRICS = { commits_total: 0, tombstones_total: 0, verify_total: 0, anchors_today_hits: 0 };
const METRICS_TOKEN = process.env.HBUK_METRICS_TOKEN || '';

function merkleRoot(hashes){
  if (!hashes || hashes.length === 0) return null;
  let layer = hashes.slice();
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const a = layer[i];
      const b = layer[i+1] ?? layer[i]; // duplicate last if odd
      next.push(sha256HexStr(a + b));
    }
    layer = next;
  }
  return layer[0];
}

const app = express();

// --- MIDDLEWARE ORDER ---
app.set('trust proxy', 1);

// Maintenance switch - flip HBUK_MAINTENANCE=1 in Render to return 503
app.use((req, res, next) => {
  if (process.env.HBUK_MAINTENANCE === '1') {
    return res.status(503).json({ error: 'Service in maintenance, please retry shortly.' });
  }
  next();
});

// Request logger middleware
function requestLogger(req, res, next) {
  const id = crypto.randomBytes(4).toString('hex');
  const start = Date.now();
  req._reqId = id;
  console.log(`[REQ ${id}] ${req.method} ${req.originalUrl} ip=${req.ip}`);

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[RES ${id}] ${req.method} ${req.originalUrl} -> ${res.statusCode} in ${ms}ms`);
  });
  next();
}

// Debug headers middleware
function debugHeaders(req, res, next) {
  res.setHeader('X-HBUK-ReqId', req._reqId || 'n/a');
  res.setHeader('X-HBUK-Path', req.originalUrl || 'n/a');
  next();
}
// Robust CORS configuration
const allowedOrigins = [
  'https://hbuk.xyz',
  'https://www.hbuk.xyz',
  'http://localhost:5173',
  'http://localhost:3000',
];

// Netlify Deploy Preview patterns
const ORIGIN_PATTERNS = [
  /^https?:\/\/hbuk\.xyz$/,                          // prod
  /^https?:\/\/www\.hbuk\.xyz$/,                      // prod www
  /^https?:\/\/localhost(?::\d+)?$/,                 // local dev
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,              // local dev
  /^https?:\/\/192\.168\.\d+\.\d+(?::\d+)?$/,        // LAN dev
  /^https?:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/, // Netlify Deploy Previews
  /^https?:\/\/[a-z0-9-]+\.netlify\.app$/,           // Netlify branch deploys
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // allow non-browser clients
  return ORIGIN_PATTERNS.some((re) => re.test(origin));
}

app.use((req, res, next) => {
  // quick path for health to avoid CORS noise
  if (req.path === '/health' || req.path === '/health/db') return next();
  next();
});

app.use((req, res, next) => { res.setHeader('Vary', 'Origin'); next(); });

app.use(cors({
  origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-HBUK-SMOKE'],
  optionsSuccessStatus: 204,
  maxAge: 86400,
}));

// Security and body parsing middleware (early in stack)
app.set('trust proxy', 1); // Render behind proxy
app.use(helmet({ contentSecurityPolicy: false })); // Keep CSP disabled for now
app.use(helmet.hsts({ maxAge: 15552000 })); // 180 days HTTPS-only hint
app.use(express.json({ limit: '64kb' })); // pick a sensible limit for notes
app.use(express.urlencoded({ extended: true }));

// Request logging and debugging
app.use(requestLogger);
app.use(debugHeaders);

// Version header for production debugging
app.use((req, res, next) => {
  res.setHeader('X-HBUK-Version', process.env.COMMIT_SHA || 'dev');
  next();
});

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

// Authentication rate limiting (stricter for login/register)
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);

// Content write rate limiting (defense-in-depth)
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,             // 30 writes/min per IP
  standardHeaders: true,
  legacyHeaders: false
});

// Public endpoint rate limiting (DoS shield)
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,                // 120/minute per IP
  standardHeaders: true,
  legacyHeaders: false,
});

// --- RESEND SDK INITIALIZATION ---
const resend = new Resend(process.env.RESEND_API_KEY);

// --- DATABASE CONNECTION ---
const { MONGODB_URI, PORT = 3000, NODE_ENV } = process.env;

if (!MONGODB_URI) {
  console.error('❌ Missing MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000, // 10s
  socketTimeoutMS: 20000           // 20s
});
let db;

// --- ROUTES ---

// Health endpoints
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, ts: new Date().toISOString() });
});

app.get('/metrics', (req, res) => {
  const ok =
    METRICS_TOKEN &&
    (req.get('X-Metrics-Token') === METRICS_TOKEN ||
     req.query.token === METRICS_TOKEN);

  if (!ok) return res.status(403).type('text/plain').send('forbidden');

  res.type('text/plain').send(
    `hbuk_commits_total ${METRICS.commits_total}\n` +
    `hbuk_tombstones_total ${METRICS.tombstones_total}\n` +
    `hbuk_verify_total ${METRICS.verify_total}\n` +
    `hbuk_anchor_today_hits ${METRICS.anchors_today_hits}\n`
  );
});

app.get('/health/db', async (_req, res) => {
  try {
    const m = client?.topology?.s?.description; // native driver detail varies by version; we will just attempt a ping
    await db.command({ ping: 1 });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'ping fail' });
  }
});

app.post('/api/register', validate(registerSchema), async (req, res) => {
    try {
    const { email, password } = req.body || {};
    


    // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
    
    // Atomic insert - let MongoDB handle uniqueness
    const result = await db.collection('users').insertOne({ 
      email, 
      hashedPassword,
      createdAt: new Date()
    });

    // Only send welcome email after successful insert (skip for smoke tests and test domains)
    const skipEmail = req.headers['x-hbuk-smoke'] === '1' || email.endsWith('@hbuk.dev');
    if (!skipEmail) {
      try {
        await resend.emails.send({
        from: 'Hbuk <welcome@hbuk.xyz>',
        to: email,
        subject: 'Welcome to Hbuk: Your Digital History Begins',
        html: `
          <div style="font-family: sans-serif; line-height: 1.6;">
            <h1 style="color: #1a1a1a;">Welcome to Hbuk.</h1>
            <p>Your personal history book is now open. This is a private, permanent space for your thoughts, ideas, and journey.</p>
            <p>Hbuk is built on a simple, powerful philosophy:</p>
            <ul style="padding-left: 20px;">
              <li><strong>Honesty:</strong> What you write is what you wrote. There is no editing the past.</li>
              <li><strong>Immortality:</strong> Your thoughts persist beyond the moment.</li>
              <li><strong>Privacy:</strong> Your mind is your own. Your entries are yours alone.</li>
            </ul>
            <p>As it is written in our founding document:</p>
            <blockquote style="border-left: 4px solid #ccc; padding-left: 15px; margin-left: 0; font-style: italic;">
              "We're planting the tree of honest digital memory. Let it grow."
            </blockquote>
            <p>Your journey begins now.</p>
            <p>— The Hbuk Team</p>
          </div>
        `
        });
        console.log(`✅ Welcome email sent to ${email}`);
      } catch (emailError) {
        console.error('⚠️ Welcome email failed:', emailError);
        // Don't block registration if email fails
      }
    } else {
      console.log(`ℹ️  Welcome email skipped for ${email} (smoke test or test domain)`);
    }

    return res.status(201).json({ 
      message: 'User registered successfully!',
      user: { email }
    });

  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ error: 'User already exists. Please log in.' });
    }
    console.error('Registration error:', e);
    return res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/login', validate(loginSchema), async (req, res) => {
    try {
    const { email, password } = req.body || {};
    


    const users = db.collection('users');
    const user = await users.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const ok = await bcrypt.compare(password, user.hashedPassword);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { sub: String(user._id), email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    return res.status(200).json({
      token,
      user: { id: String(user._id), email: user.email }
    });

  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/commit', authenticateToken, writeLimiter, validate(entrySchema), async (req, res) => {
  try {
    const sub = req.user?.sub;
    if (!sub) return res.status(401).json({ error: 'Unauthorized' });

    // Extract all validated fields including location
    const { content, latitude, longitude, locationName } = req.body;
    
    // Debug logging to track what we're receiving
    console.log('[commit] keys=', Object.keys(req.body || {}));
    console.log('[commit] location fields:', { latitude, longitude, locationName });
    
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Content required' });
    }

    const createdAt = new Date();
    const doc = {
      userId: new ObjectId(sub),
      content,
      createdAt,
      // Include location fields if they exist
      ...(latitude !== undefined && longitude !== undefined ? {
        latitude,
        longitude,
        ...(locationName ? { locationName } : {})
      } : {})
    };

    // Debug logging to track what we're saving
    console.log('[commit] saving doc:', { 
      userId: doc.userId, 
      content: doc.content?.substring(0, 50) + '...',
      hasLocation: !!(doc.latitude && doc.longitude),
      locationFields: doc.latitude ? { latitude: doc.latitude, longitude: doc.longitude, locationName: doc.locationName } : null
    });

    // immutable digest (client-visible)
    const digest = commitDigest({ userId: sub, content, createdAt, location: doc.latitude ? { latitude: doc.latitude, longitude: doc.longitude } : null });

    // optional server-side witness signature (can rotate HBUK_SIGNING_SECRET later)
    const sig = crypto.createHmac('sha256', process.env.HBUK_SIGNING_SECRET || 'hbuk-dev')
      .update(digest)
      .digest('hex');

    doc.digest = digest;
    doc.signature = sig;
    doc.sigAlg = SIG_ALG;
    doc.sigKid = SIG_KID;

    const result = await db.collection('entries').insertOne(doc);
    METRICS.commits_total++;

    // Return the complete saved document including location fields
    const savedEntry = { _id: String(result.insertedId), ...doc };
    
    // Debug logging to track what we're returning
    console.log('[commit] returning saved entry:', { 
      id: savedEntry._id,
      hasLocation: !!(savedEntry.latitude && savedEntry.longitude),
      locationFields: savedEntry.latitude ? { latitude: savedEntry.latitude, longitude: savedEntry.longitude, locationName: savedEntry.locationName } : null
    });
    
    res.status(201).json(savedEntry);
  } catch (e) {
    console.error('commit error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- VERIFY: public, read-only tamper check by id + digest ---
app.get('/api/verify/:id/:digest', publicLimiter, async (req, res) => {
  try {
    const { id, digest } = req.params;
    if (!id || !digest) return res.status(400).json({ error: 'id and digest required' });

    // Validate ID and digest format
    const isHex = (s, n) => typeof s === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(s);
    if (!isHex(id, 24) || !isHex(digest, 64)) {
      return res.status(400).json({ ok: false, error: 'invalid id or digest format' });
    }

    const entry = await db.collection('entries').findOne({ _id: new ObjectId(id) }, { projection: { digest: 1, signature: 1 }});
    if (!entry) return res.status(404).json({ error: 'Not found' });

    const ok = entry.digest === digest;
    METRICS.verify_total++;
    // do NOT expose signature by default; it's server witness
    return res.status(200).json({ ok });
  } catch (e) {
    console.error('verify error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- DELETE: append-only "tombstone", do not modify original entry ---
app.delete('/api/entries/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const sub = req.user?.sub;
    if (!id || !sub) return res.status(400).json({ error: 'Bad request' });

    const original = await db.collection('entries').findOne({ _id: new ObjectId(id), userId: new ObjectId(sub) });
    if (!original) return res.status(404).json({ error: 'Not found' });

    const tombstone = {
      type: 'tombstone',
      userId: new ObjectId(sub),
      originalId: original._id,
      originalDigest: original.digest,
      createdAt: new Date(),        // when deletion was requested
    };

    const tRes = await db.collection('entries').insertOne(tombstone);
    METRICS.tombstones_total++;
    // (Optional) you can mark the UI to hide original when a tombstone exists; do NOT mutate the original doc.

    return res.status(201).json({ tombstoneId: String(tRes.insertedId) });
  } catch (e) {
    console.error('tombstone error:', e);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- EXPORT: user's complete data export ---
app.get('/api/export', authenticateToken, async (req, res) => {
  try {
    const userId = new ObjectId(req.user.sub);
    const entries = await db.collection('entries')
      .find({ userId })
      .project({ 
        content: 1, 
        createdAt: 1, 
        digest: 1, 
        signature: 1, 
        sigAlg: 1, 
        sigKid: 1, 
        type: 1, 
        originalId: 1, 
        originalDigest: 1,
        // Include location fields for complete export
        latitude: 1, 
        longitude: 1, 
        locationName: 1
      })
      .sort({ createdAt: 1 })
      .toArray();
    res.setHeader('Content-Type','application/json');
    res.setHeader('Content-Disposition','attachment; filename="hbuk-export.json"');
    res.status(200).send(JSON.stringify({ user: req.user.sub, exportedAt: new Date().toISOString(), entries }, null, 2));
  } catch (e) {
    console.error('export error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// All-user anchor of today's commits (UTC)
app.get('/api/anchors/today', publicLimiter, async (_req, res) => {
  try {
    const start = new Date();
    start.setUTCHours(0,0,0,0);
    const end = new Date(start); end.setUTCDate(end.getUTCDate()+1);

    const cursor = db.collection('entries').find(
      { digest: { $exists: true }, createdAt: { $gte: start, $lt: end }, type: { $exists: false } }, // exclude tombstones
      { projection: { digest: 1 } }
    );

    const hashes = [];
    for await (const doc of cursor) hashes.push(doc.digest);
    // IMPORTANT: sort leaves so the Merkle root is deterministic across runs
    hashes.sort(); // lexicographic sort for stable root
    const root = merkleRoot(hashes);
    METRICS.anchors_today_hits++;
    res.set('Cache-Control', 'public, max-age=60'); // 60s cache
    res.status(200).json({ date: start.toISOString().slice(0,10), count: hashes.length, root });
  } catch (e) {
    console.error('anchor error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function merkleProof(hashes, target) {
  // returns array of { side:'L'|'R', hash } from leaf to root
  const idx = hashes.indexOf(target);
  if (idx === -1) return null;

  let layer = hashes.map(h => h);
  let i = idx;
  const proof = [];

  while (layer.length > 1) {
    const next = [];
    for (let p = 0; p < layer.length; p += 2) {
      const a = layer[p];
      const b = layer[p+1] ?? layer[p];
      const node = sha256HexStr(a + b);
      next.push(node);

      if (p === i || p+1 === i) {
        const isLeft = (p === i);
        const sibling = isLeft ? (layer[p+1] ?? layer[p]) : layer[p];
        proof.push({ side: isLeft ? 'R' : 'L', hash: sibling });
        i = Math.floor(p / 2);
      }
    }
    layer = next;
  }
  return proof;
}

app.get('/api/anchors/proof/:id', authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;
    const sub = req.user?.sub;
    if (!id || !sub) return res.status(400).json({ error: 'Bad request' });

    // Validate ID format
    const isHex = (s, n) => typeof s === 'string' && new RegExp(`^[a-f0-9]{${n}}$`).test(s);
    if (!isHex(id, 24)) {
      return res.status(400).json({ error: 'invalid id format' });
    }

    const entry = await db.collection('entries').findOne(
      { _id: new ObjectId(id), userId: new ObjectId(sub), digest: { $exists: true } },
      { projection: { digest: 1, createdAt: 1 } }
    );
    if (!entry) return res.status(404).json({ error: 'Not found' });

    // limit to that UTC day (same window as /api/anchors/today)
    const start = new Date(entry.createdAt); start.setUTCHours(0,0,0,0);
    const end = new Date(start); end.setUTCDate(end.getUTCDate()+1);

    const cursor = db.collection('entries').find(
      { digest: { $exists: true }, createdAt: { $gte: start, $lt: end }, type: { $exists: false } },
      { projection: { digest: 1 } }
    );

    const hashes = [];
    for await (const doc of cursor) hashes.push(doc.digest);
    // IMPORTANT: sort leaves so the Merkle root is deterministic across runs
    hashes.sort(); // lexicographic sort for stable root

    const root = merkleRoot(hashes);
    const proof = merkleProof(hashes, entry.digest);
    if (!proof) return res.status(404).json({ error: 'Digest not anchored' });

    res.status(200).json({
      date: start.toISOString().slice(0,10),
      digest: entry.digest,
      root,
      count: hashes.length,
      proof // array of { side, hash }
    });
  } catch (e) {
    console.error('proof error:', e);
    res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/entries', authenticateToken, async (req, res) => {
    try {
    const userId = new ObjectId(req.user.sub);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const cursorId = req.query.cursor ? new ObjectId(req.query.cursor) : null;

    const match = { userId };
    if (cursorId) match._id = { $lt: cursorId };

    const pipeline = [
      { $match: match },
      { $lookup: {
          from: 'entries',
          let: { id: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [
              { $eq: ['$type', 'tombstone'] },
              { $eq: ['$originalId', '$$id'] }
            ] } } }
          ],
          as: 'tombs'
      }},
      { $addFields: { isDeleted: { $gt: [ { $size: '$tombs' }, 0 ] } } },
      { $project: { tombs: 0 } },
      { $sort: { _id: -1 } },
      { $limit: limit + 1 }
    ];

    const docs = await db.collection('entries').aggregate(pipeline).toArray();
    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

    res.json({ entries: items, nextCursor });
  } catch (e) {
    console.error('entries error:', e);
    res.status(500).json({ error: 'Internal server error' });
    }
});

// --- SERVER STARTUP ---
async function boot() {
  try {
    await client.connect();
    const DB_NAME = process.env.MONGODB_DB_NAME || 'hbuk';
    db = client.db(DB_NAME);
    console.log(`✅ Connected to MongoDB database: ${DB_NAME}`);

    // Ensure unique index on email
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'uniq_email' });
      console.log('✅ users.email unique index ensured');
    } catch (indexErr) {
      if (indexErr.code !== 85) { // 85 = index already exists
        console.warn('⚠️ Index creation warning:', indexErr.message);
      }
    }

    // Ensure index on entries for efficient sorting
    try {
      await db.collection('entries').createIndex({ userId: 1, createdAt: -1 }, { name: 'entries_user_created_idx' });
      console.log('✅ entries.userId+createdAt index ensured');
    } catch (indexErr) {
      if (indexErr.code !== 85) { // 85 = index already exists
        console.warn('⚠️ Entries index creation warning:', indexErr.message);
      }
    }

    const server = app.listen(PORT, () => {
      console.log(`✅ API listening on :${PORT} (${NODE_ENV || 'dev'})`);
    });

    // Prevent hanging forever on slow upstreams
    server.setTimeout(25000); // 25s
  } catch (err) {
    console.error('❌ Mongo connect failed:', err?.message || err);
    process.exit(1);
  }
}

boot();

// Friendly root route
app.get('/', (_req, res) => {
  res.status(200).json({ ok: true, name: 'hbuk-backend', ts: new Date().toISOString() });
});

// Version endpoint for debugging deployments
app.get('/version', (_req, res) => {
  res.status(200).json({ 
    ok: true, 
    name: 'hbuk-backend',
    dbName: process.env.MONGODB_DB_NAME || 'hbuk',
    nodeEnv: process.env.NODE_ENV || 'development',
    ts: new Date().toISOString()
  });
});

// Global error handler - must be last
app.use((err, req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Entry too large (64KB max).' });
  }
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: err?.message || 'Internal error' });
});