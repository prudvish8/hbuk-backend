// The definitive, final, and correct server.js for Hbuk

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { validate, registerSchema, loginSchema, entrySchema } = require('./validation');
const { authenticateToken } = require('./auth');

const app = express();

// --- MIDDLEWARE ORDER ---
app.set('trust proxy', 1);
app.use(cors({ origin: 'https://hbuk.xyz' }));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use(express.json());

// --- DATABASE CONNECTION ---
const url = process.env.MONGODB_URL;
const dbName = process.env.DB_NAME;
const client = new MongoClient(url);
let db;

async function connectToDb() {
    try {
        await client.connect();
        db = client.db(dbName);
        console.log('Connected to MongoDB successfully');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
}

// --- ROUTES ---

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.post('/api/register', validate(registerSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists." });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await usersCollection.insertOne({ email, hashedPassword });
        res.status(201).json({ message: "User registered successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Could not register user." });
    }
});

app.post('/api/login', validate(loginSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.collection('users').findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.hashedPassword))) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        res.status(200).json({ token });
    } catch (err) {
        res.status(500).json({ message: "Could not process login." });
    }
});

app.post('/api/commit', authenticateToken, validate(entrySchema), async (req, res) => {
    try {
        const newEntry = {
            ...req.body,
            userId: new ObjectId(req.user.userId) // Ensure userId is stored as ObjectId
        };
        const result = await db.collection('entries').insertOne(newEntry);
        res.status(201).json({ message: 'Entry saved successfully!', entry: newEntry, id: result.insertedId });
    } catch (err) {
        res.status(500).json({ message: "Could not save to database." });
    }
});

app.get('/api/entries', authenticateToken, async (req, res) => {
    try {
        const entries = await db.collection('entries').find({ userId: new ObjectId(req.user.userId) }).toArray();
        res.json(entries);
    } catch (err) {
        res.status(500).json({ message: "Could not read from database." });
    }
});

// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;
connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Hbuk server is running on port ${PORT}`);
    });
});