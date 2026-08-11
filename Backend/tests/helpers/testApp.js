import { vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Mocked before anything imports utils/gemini.js (which transitively
// happens via routes/chat.js -> server.js). No real network call is ever
// made in tests, no API quota is spent, and behavior is fully
// deterministic. Individual tests can override the implementation via
// vi.mocked(GoogleGenAI) for specific scenarios (e.g. simulating failure).
vi.mock('@google/genai', () => {
    const generateContentStream = vi.fn(async function* defaultStream() {
        yield { text: 'Mocked ' };
        yield { text: 'response.' };
    });
    // Must be a real function (not an arrow function) — the application
    // code calls `new GoogleGenAI(...)`, and arrow functions can't be used
    // as constructors.
    function GoogleGenAI() {
        return { models: { generateContentStream } };
    }
    return { GoogleGenAI: vi.fn(GoogleGenAI) };
});

/**
 * Spins up an isolated Express app instance backed by an in-memory
 * MongoDB, for a single test file. Each test file gets its own database
 * and its own fresh import of the app — no state is shared across files.
 */
export async function createTestApp(envOverrides = {}) {
    const mongod = await MongoMemoryServer.create();

    process.env.MONGODB_URI = mongod.getUri();
    process.env.JWT_SECRET = 'test-jwt-secret-not-for-production';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.CLIENT_ORIGIN = 'http://localhost:5173';
    // Skips app.listen() and the eager startup DB connect in server.js —
    // Supertest manages the server lifecycle itself against the exported
    // app, and the per-request connect middleware handles the rest.
    process.env.VERCEL = '1';
    process.env.AUTH_RATE_LIMIT = envOverrides.AUTH_RATE_LIMIT || '1000';
    process.env.CHAT_RATE_LIMIT = envOverrides.CHAT_RATE_LIMIT || '1000';
    process.env.GEMINI_TIMEOUT_MS = envOverrides.GEMINI_TIMEOUT_MS || '5000';

    const { default: app } = await import('../../server.js');
    const { default: mongoose } = await import('mongoose');
    const { GoogleGenAI } = await import('@google/genai');

    return { app, mongod, mongoose, GoogleGenAI };
}

export async function closeTestApp({ mongod, mongoose }) {
    await mongoose.connection.close();
    await mongod.stop();
}
