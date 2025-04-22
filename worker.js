import { Worker } from 'bullmq';
import { config } from 'dotenv';
import { QdrantVectorStore } from '@langchain/qdrant';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CharacterTextSplitter } from '@langchain/textsplitters';
import { GoogleGenAI } from '@google/genai';

// Load env variables
config();

const worker = new Worker(
    'file-upload-queue',
    async job => {
        try {
            console.log('Worker received job:', job.data);

            const data = JSON.parse(job.data);
            const loader = new PDFLoader(data.path);
            const docs = await loader.load();
            console.log('PDF loaded with', docs.length, 'pages.');

            const textSplitter = new CharacterTextSplitter({
                chunkSize: 300,
                chunkOverlap: 0,
            });

            const splitDocs = await textSplitter.splitDocuments(docs);
            console.log('PDF split into', splitDocs.length, 'chunks.');

            const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

            const embeddings = {
                embedDocuments: async texts => {
                    try {
                        const responses = await genAI.models.embedContent({
                            model: 'gemini-embedding-exp-03-07',
                            contents: texts.map(text => ({ parts: [{ text }] })),
                        });
                        return responses.embeddings.map(embedding => embedding.values);
                    } catch (error) {
                        console.error('Error generating embeddings:', error);
                        throw error; // Re-throw the error to be caught by the worker's main try-catch
                    }
                },
                embedQuery: async text => {
                    try {
                        const response = await genAI.models.embedContent({
                            model: 'gemini-embedding-exp-03-07',
                            contents: [{ parts: [{ text }] }],
                        });
                        return response.embeddings[0].values;
                    } catch (error) {
                        console.error('Error generating query embedding:', error);
                        throw error; // Re-throw the error
                    }
                },
            };

            console.log('Generating embeddings for', splitDocs.length, 'documents');
            const texts = splitDocs.map(doc => doc.pageContent);
            const metadatas = splitDocs.map(doc => doc.metadata);

            const vectorStore = await QdrantVectorStore.fromTexts(
                texts,
                metadatas,
                embeddings, // Pass the modified embeddings object
                {
                    url: 'http://localhost:6333',
                    collectionName: 'pdf-embeddings',
                }
            );

            console.log('Embeddings saved to Qdrant successfully.');
        } catch (error) {
            console.error('Error in worker processing job:', error);
            // Optionally, you can handle job failure in BullMQ (e.g., retry) here.
            throw error; // Important: Throwing the error will mark the job as failed in BullMQ.
        }
    },
    {
        concurrency: 100,
        connection: { host: 'localhost', port: 6379 },
    }
);