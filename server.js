// The definitive, final, and correct server.js for Hbuk

import 'dotenv/config';
import express from 'express';
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

const app = express();

// --- MIDDLEWARE ORDER ---
app.set('trust proxy', 1);

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
  'http://localhost:5173',
  'http://localhost:3000',
];

app.use((req, res, next) => {
  // quick path for health to avoid CORS noise
  if (req.path === '/health' || req.path === '/health/db') return next();
  next();
});

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/Postman or same-origin
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// cors() already handles OPTIONS preflight automatically

// Security and body parsing middleware (early in stack)
app.set('trust proxy', 1); // Render behind proxy
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging and debugging
app.use(requestLogger);
app.use(debugHeaders);

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

app.get('/health/db', async (_req, res) => {
  try {
    const m = client?.topology?.s?.description; // native driver detail varies by version; we will just attempt a ping
    await db.command({ ping: 1 });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'ping fail' });
  }
});

app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    
    // Early input validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Atomic insert - let MongoDB handle uniqueness
    const result = await db.collection('users').insertOne({ 
      email, 
      hashedPassword,
      createdAt: new Date()
    });

    // Only send welcome email after successful insert
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

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    
    // Early input validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

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

app.post('/api/commit', authenticateToken, validate(entrySchema), async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in token' });
        }
        
        const newEntry = {
            ...req.body,
            userId: new ObjectId(userId), // Ensure userId is stored as ObjectId
            createdAt: new Date()
        };
        const result = await db.collection('entries').insertOne(newEntry);
        res.status(201).json({ message: 'Entry saved successfully!', entry: newEntry, id: result.insertedId });
    } catch (err) {
        console.error('Commit error:', err);
        res.status(500).json({ error: "Could not save to database." });
    }
});

app.get('/api/entries', authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in token' });
        }
        
        const entries = await db.collection('entries').find({ userId: new ObjectId(userId) }).sort({ createdAt: -1 }).toArray();
        res.json({ entries });
    } catch (err) {
        console.error('Entries error:', err);
        res.status(500).json({ error: "Could not read from database." });
    }
});

// --- SERVER STARTUP ---
async function boot() {
  try {
    await client.connect();
    db = client.db('hbuk'); // adjust if your DB name differs
    console.log('✅ Connected to MongoDB');

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

// Global error handler - must be last
app.use((err, req, res, _next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: err?.message || 'Internal error' });
});