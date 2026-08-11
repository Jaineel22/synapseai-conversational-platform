import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const jsonRateLimitHandler = (req, res) => {
    res.status(429).json({ error: "Too many requests. Please try again later." });
};

// Register/login run before authentication exists, so there's no user
// identity to key on yet — IP is the only option. Threshold is sized to
// blunt credential-stuffing/brute-force while staying generous enough for
// normal mistyped-password retries.
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: jsonRateLimitHandler,
});

// Chat runs after authMiddleware, so req.userId is available. Keyed
// per-account rather than per-IP: the resource being protected is a paid,
// per-account Gemini quota, so account-based limiting matches the actual
// abuse case (and doesn't lump unrelated users on the same NAT/office IP
// together). Falls back to IP only in the unexpected case req.userId is
// missing.
export const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.CHAT_RATE_LIMIT) || 15,
    standardHeaders: true,
    legacyHeaders: false,
    // ipKeyGenerator normalizes IPv6 addresses to a /56 subnet before use —
    // required so a client can't defeat the fallback by rotating through
    // addresses within its own IPv6 subnet.
    keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
    handler: jsonRateLimitHandler,
});

// Document upload runs after authMiddleware too. Uploads are more expensive
// than a chat message (text extraction + a batch of embedding calls per
// file), so the window is generous but the per-window count is modest —
// enough for normal use, not enough to be useful for quota-draining abuse.
export const documentUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.DOCUMENT_UPLOAD_RATE_LIMIT) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
    handler: jsonRateLimitHandler,
});
