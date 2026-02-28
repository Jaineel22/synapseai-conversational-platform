import express from 'express';
import "dotenv/config";
import cors from "cors";
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';

import chatRoutes from './routes/chat.js';
import authRoutes from './routes/auth.js';

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CLIENT_ORIGIN,
    credentials: true
}));

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
            tlsAllowInvalidCertificates: true,
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
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error'
    });
});

// ─── Local Dev: start server normally ─────────────────────
// In production (Vercel), the export below is used instead
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}

// ─── Vercel Serverless Export ─────────────────────────────
export default app;
