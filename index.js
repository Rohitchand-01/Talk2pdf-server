import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { Queue } from 'bullmq';
import { QdrantVectorStore } from '@langchain/qdrant';
import { GoogleGenAI } from '@google/genai';
import { config } from 'dotenv';
import { QdrantClient } from '@qdrant/client'; // Import the Qdrant client directly

config();
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const qdrantClient = new QdrantClient({ url: 'http://localhost:6333' }); // Create a Qdrant client

const queue = new Queue('file-upload-queue', {
    connection: { host: 'localhost', port: 6379 },
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});

const upload = multer({ storage: storage });

const app = express();
app.use(cors());

app.get('/', (req, res) => {
    res.send('Hello World!');
});

app.post('/upload/pdf', upload.single('pdf'), async (req, res) => {
    // ... (upload route remains the same) ...
});

app.get('/chat', async (req, res) => {
    const userQuery = req.query.q;
    if (!userQuery) {
        return res.status(400).json({ error: 'Please provide a query parameter "q".' });
    }

    try {
        console.log('Received chat query:', userQuery);
        console.log('Attempting to check Qdrant connection...');
        await qdrantClient.getCollections(); // This will throw an error if the connection fails
        console.log('Qdrant connection successful.');

        console.log('Attempting to connect to QdrantVectorStore...');
        const vectorStore = await QdrantVectorStore.fromExisting(
            genAI.embeddings,
            {
                url: 'http://localhost:6333',
                collectionName: 'pdf-embeddings',
            }
        );
        console.log('Successfully connected to QdrantVectorStore.');

        console.log('Creating retriever...');
        const retriever = vectorStore.asRetriever({
            k: 3 // Adjust the number of results as needed
        });
        console.log('Retriever created.');

        console.log('Invoking retriever with query:', userQuery);
        const results = await retriever.getRelevantDocuments(userQuery);
        console.log('Retrieved results:', results);

        return res.json({
            message: 'Chat query processed successfully',
            results: results,
        });
    } catch (error) {
        console.error('Error during chat query in index.js:', error);
        return res.status(500).json({ error: 'Failed to process chat query.' });
    }
});

app.listen(8000, () =>
    console.log('Server is running on http://localhost:8000')
);