require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { authenticateToken } = require('./auth');
const { validateRegister, validateLogin, validateEntry } = require('./validation');

const app = express();
app.set('trust proxy', 1);
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rate limiting for login attempts
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: { message: "Too many login attempts, please try again later." }
});

// Rate limiting for general requests
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

const PORT = process.env.PORT || 3000;
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = process.env.DB_NAME || 'hbuk_db';

// Create a new MongoClient instance
const client = new MongoClient(MONGODB_URL);

// Async function to start the server
async function startServer() {
    try {
        // Connect to MongoDB
        await client.connect();
        console.log('Connected to MongoDB successfully');
        
        // Get the database instance
        const db = client.db(DB_NAME);
        
        // --- ROUTES ---
        
        // Endpoint to get all entries
        app.get('/api/entries', authenticateToken, async (req, res) => {
            try {
                const collection = db.collection('entries');
                const entries = await collection.find({ userId: req.user.userId }).toArray();
                res.json(entries);
            } catch (err) {
                console.error("Error reading from database:", err);
                res.status(500).json({ message: "Could not read from database." });
            }
        });
        
        // Endpoint to commit a new entry
        app.post('/api/commit', authenticateToken, validateEntry, async (req, res) => {
            try {
                const newEntry = req.body;
                const collection = db.collection('entries');
                
                // Add timestamp and userId to the entry
                newEntry.timestamp = new Date();
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
        
        // Endpoint to register a new user
        app.post('/api/register', generalLimiter, validateRegister, async (req, res) => {
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
        
        // Endpoint to login a user
        app.post('/api/login', loginLimiter, validateLogin, async (req, res) => {
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
        
        // Health check endpoint
        app.get('/', (req, res) => {
            res.json({ message: 'Hbuk backend is alive!' });
        });
        
        // Health endpoint for monitoring
        app.get('/health', (req, res) => {
            res.status(200).json({ status: 'ok', message: 'Hbuk backend is healthy' });
        });
        
        // Start the server
        app.listen(PORT, () => {
            console.log(`Hbuk server is running on http://localhost:${PORT}`);
            console.log(`Connected to MongoDB database: ${DB_NAME}`);
        });
        
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    await client.close();
    process.exit(0);
});

// Start the server
startServer();