// The definitive, final, and production-ready server.js for Hbuk

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const { validate } = require('./validation');
const { registerSchema, loginSchema, entrySchema } = require('./validation');
const { authenticateToken } = require('./auth');

const app = express();

// --- CRITICAL FIX: MIDDLEWARE ORDER ---

// 1. Trust Proxy: This MUST come first.
app.set('trust proxy', 1);

// 2. CORS: The "visa office" must be the next stop for ALL requests.
// We will explicitly allow your live frontend URL.
app.use(cors({ origin: 'https://hbuk.xyz' }));

// 3. General Rate Limiter: Protects against general DDOS attacks.
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// 4. JSON Parser: To read the body of requests.
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
        console.log(`Connected to MongoDB database: ${dbName}`);
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
}

// --- ROUTES ---

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Hbuk backend is healthy' });
});

app.post('/api/register', validate(registerSchema), async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Check if user already exists
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ email: email });
        
        if (existingUser) {
            return res.status(400).json({ message: "User already exists." });
        }
        
        // Generate salt and hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create new user object
        const newUser = {
            email: email,
            hashedPassword: hashedPassword
        };
        
        // Insert new user into database
        await usersCollection.insertOne(newUser);
        
        res.status(201).json({ message: "User registered successfully!" });
        
    } catch (err) {
        console.error("Error registering user:", err);
        res.status(500).json({ message: "Could not register user." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user in the database
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email: email });
        
        // If no user found, return invalid credentials
        if (!user) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        
        // Check if password matches
        const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
        
        // If password doesn't match, return invalid credentials
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid credentials." });
        }
        
        // Create JWT token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );
        
        res.status(200).json({ token: token });
        
    } catch (err) {
        console.error("Error during login:", err);
        res.status(500).json({ message: "Could not process login." });
    }
});

app.post('/api/commit', authenticateToken, validate(entrySchema), async (req, res) => {
    try {
        const newEntry = req.body;
        const collection = db.collection('entries');
        
        // Add userId to the entry
        newEntry.userId = req.user.userId;
        
        // Insert the new entry
        const result = await collection.insertOne(newEntry);
        
        console.log('Successfully saved new entry to MongoDB');
        res.status(201).json({
            message: 'Entry saved successfully!',
            entry: newEntry,
            id: result.insertedId
        });
    } catch (err) {
        console.error("Error writing to database:", err);
        res.status(500).json({ message: "Could not save to database." });
    }
});

app.get('/api/entries', authenticateToken, async (req, res) => {
    try {
        const collection = db.collection('entries');
        const entries = await collection.find({ userId: new ObjectId(req.user.userId) }).toArray();
        res.json(entries);
    } catch (err) {
        console.error("Error reading from database:", err);
        res.status(500).json({ message: "Could not read from database." });
    }
});


// --- SERVER STARTUP ---
const PORT = process.env.PORT || 3000;

connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Hbuk server is running on http://localhost:${PORT}`);
    });
});