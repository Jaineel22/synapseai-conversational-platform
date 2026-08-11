import jwt from 'jsonwebtoken';

const authMiddleware = async (req, res, next) => {
    try {
        // Get token from cookie or header
        const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;

        next();
    } catch (error) {
        // A token failing verification (expired, tampered, malformed) is a
        // routine occurrence — every session eventually expires — not an
        // application error, so this logs at warn with just the error's
        // category (e.g. "TokenExpiredError"), not the full object/stack.
        console.warn(`[auth] token verification failed: ${error.name || 'Error'} on ${req.method} ${req.originalUrl}`);
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
};

export default authMiddleware;