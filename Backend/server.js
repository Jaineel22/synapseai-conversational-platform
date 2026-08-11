import express from 'express';
import "dotenv/config";
import cors from "cors";
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';

import chatRoutes from './routes/chat.js';
import authRoutes from './routes/auth.js';

// ─── Required Environment Variables ───────────────────────
// Fail loudly at startup rather than running in a broken state where every
// request would silently 500, or CORS/auth would silently misbehave with
// an undefined origin/secret.
const REQUIRED_ENV_VARS = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY', 'CLIENT_ORIGIN'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missingEnvVars.join(', ')}`);
}

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: true
}));

// ─── Health Check ──────────────────────────────────────────
// Mounted before the DB-connect middleware so it reflects whether the
// process itself is up, independent of database connectivity. This is
// what a host's health checker (e.g. Render) should poll.
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// ─── MongoDB Connection ────────────────────────────────────
// Cached connection — important for serverless environments
// Vercel serverless functions are stateless; without caching,
// a new DB connection would be made on every single request
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;

    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            tls: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('MongoDB connection failed:', err.message);
        throw err;
    }
};

// Connect before handling any request
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        res.status(500).json({ error: 'Database connection failed' });
    }
});

// ─── Routes ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', chatRoutes);

// ─── 404 Handler ──────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────
// Client (4xx) error messages are safe to forward as-is — they describe
// what the caller did wrong. Server (5xx) errors may contain internal
// details (stack traces, driver messages), so only a generic message is
// sent to the client; the full error is still logged server-side.
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    const status = err.status || 500;
    const message = status < 500 ? (err.message || 'Bad request') : 'Internal server error';
    res.status(status).json({ error: message });
});

// ─── Long-running process: local dev, Render, or any normal Node host ─────
// `VERCEL` is set automatically by Vercel's build/runtime environment — it's
// the reliable signal for "running as a Vercel serverless function". Using
// NODE_ENV here instead would be wrong: Render also runs with
// NODE_ENV=production, and would then never call app.listen() either.
//
// The DB connection is made eagerly (not just lazily per-request) so a
// misconfigured/unreachable database fails the deploy immediately and
// visibly, instead of the process appearing healthy while every real
// request silently 500s.
if (!process.env.VERCEL) {
    connectDB()
        .then(() => {
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`Server running on http://localhost:${PORT}`);
            });
        })
        .catch(() => {
            console.error('Fatal: could not connect to MongoDB at startup. Exiting.');
            process.exit(1);
        });
}

// ─── Vercel Serverless Export ─────────────────────────────
export default app;
