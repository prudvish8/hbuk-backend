// The definitive, one-time script to import the Genesis Hbuk story.

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');
const fs = require('fs').promises; // Using the promise-based version of fs
const path = require('path');

// --- CONFIGURATION ---
const url = process.env.MONGODB_URL;
const dbName = process.env.DB_NAME;
const genesisUserId = '689a3ccaf829780591ef8191'; // The ID you provided
const genesisMarkdownFile = path.join(__dirname, 'GENESIS_HBUK.md');

// --- MAIN SCRIPT ---

async function importGenesisStory() {
    const client = new MongoClient(url);

    try {
        // 1. Connect to the database
        await client.connect();
        const db = client.db(dbName);
        const entriesCollection = db.collection('entries');
        console.log('Successfully connected to MongoDB.');

        // 2. Read the Genesis Hbuk Markdown file
        const genesisText = await fs.readFile(genesisMarkdownFile, 'utf8');
        console.log('Successfully read GENESIS_HBUK.md file.');

        // 3. Define the Genesis Entry object
        const genesisEntry = {
            text: genesisText,
            timestamp: new Date(), // Set the timestamp to this moment
            locationName: "The Genesis Block",
            userId: new ObjectId(genesisUserId) // Use the provided ObjectId
        };

        // 4. Insert the entry into the database
        const result = await entriesCollection.insertOne(genesisEntry);
        console.log('---');
        console.log('✅ SUCCESS! The Genesis Hbuk has been permanently saved to the database.');
        console.log(`Inserted document ID: ${result.insertedId}`);
        console.log('---');

    } catch (err) {
        console.error('❌ ERROR: The import script failed.');
        console.error(err);
    } finally {
        // 5. Ensure the database connection is closed
        await client.close();
        console.log('Database connection closed.');
    }
}

// Run the main function
importGenesisStory();
