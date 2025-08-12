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
const { Resend } = require('resend');
const bodyParser = require('body-parser');

const app = express();

// --- MIDDLEWARE ORDER ---
app.set('trust proxy', 1);
// The definitive, final, and correct CORS configuration for Hbuk

if (process.env.NODE_ENV === 'production') {
    // In production, only allow our live frontend
    app.use(cors({ origin: 'https://hbuk.xyz' }));
} else {
    // In development, allow all origins for easy testing
    app.use(cors());
}
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// --- RESEND SDK INITIALIZATION ---
const resend = new Resend(process.env.RESEND_API_KEY);

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
        
        // Send welcome email
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
            console.log(`Welcome email sent to ${email}`);
        } catch (emailError) {
            console.error("Error sending welcome email:", emailError);
            // We don't block the registration if the email fails, just log the error.
        }
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