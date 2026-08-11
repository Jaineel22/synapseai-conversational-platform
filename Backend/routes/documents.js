import express from "express";
import path from "node:path";
import multer from "multer";
import mongoose from "mongoose";
import Document from "../models/Document.js";
import Chunk from "../models/Chunk.js";
import authMiddleware from "../middleware/auth.js";
import { documentUploadLimiter } from "../middleware/rateLimiter.js";
import { processDocument } from "../services/documentProcessing.js";
import { MAX_FILE_SIZE_BYTES, SUPPORTED_EXTENSIONS } from "../config/rag.js";

const router = express.Router();

router.use(authMiddleware);

// Buffers stay in memory only for the lifetime of the request — nothing is
// ever written to disk. Render's filesystem is ephemeral anyway, so
// persisting raw uploads there would be pointless; only the extracted,
// chunked, embedded text is ever persisted (in MongoDB, alongside
// everything else this app already stores).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        if (!SUPPORTED_EXTENSIONS[ext]) {
            return cb(new Error(`Unsupported file type. Supported types: ${Object.keys(SUPPORTED_EXTENSIONS).join(", ")}`));
        }
        cb(null, true);
    },
});

// Wraps multer's callback-style middleware so its errors (oversized file,
// rejected extension) become the same JSON error shape as every other
// route, instead of falling through to the generic error handler.
function uploadSingleFile(req, res, next) {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: `File is too large. Maximum size is ${Math.floor(MAX_FILE_SIZE_BYTES / (1024 * 1024))}MB.` });
        }
        if (err) {
            return res.status(400).json({ error: err.message || "Invalid file upload." });
        }
        next();
    });
}

// Content sniffing — the declared extension/MIME type is never trusted
// alone. PDF and DOCX have real magic-byte signatures; txt/md don't, so
// they're instead rejected if they look like binary data (a NUL byte
// within the first few KB is a reliable "this isn't text" signal).
function looksLikeDeclaredType(buffer, fileType) {
    if (fileType === "pdf") {
        return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    }
    if (fileType === "docx") {
        return buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    }
    if (fileType === "txt" || fileType === "md") {
        return !buffer.subarray(0, Math.min(buffer.length, 8000)).includes(0);
    }
    return false;
}

// Strips path separators and control characters so the stored/display
// filename can never be mistaken for a path, and caps length defensively.
// No filesystem path is ever built from this value (files aren't written
// to disk), but it's still used in API responses, so it's sanitized as if
// it mattered for that reason too.
function sanitizeFilename(name) {
    const cleaned = String(name || "")
        .replace(/[/\\]/g, "")
        .replace(/[\x00-\x1f]/g, "")
        .trim();
    return cleaned.slice(0, 255) || "document";
}

function serializeDocument(doc) {
    return {
        id: doc._id,
        filename: doc.filename,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        status: doc.status,
        error: doc.error,
        chunkCount: doc.chunkCount,
        pageCount: doc.pageCount,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
    };
}

// ─────────────────────────────────────────
// POST /api/documents
// Uploads a document and kicks off async processing.
// ─────────────────────────────────────────
router.post("/", documentUploadLimiter, uploadSingleFile, async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file was uploaded. Use the "file" field.' });
    }

    const ext = path.extname(req.file.originalname || "").toLowerCase();
    const fileType = SUPPORTED_EXTENSIONS[ext];
    if (!fileType) {
        return res.status(400).json({ error: "Unsupported file type." });
    }
    if (req.file.buffer.length === 0) {
        return res.status(400).json({ error: "The uploaded file is empty." });
    }
    if (!looksLikeDeclaredType(req.file.buffer, fileType)) {
        return res.status(400).json({ error: "The file's content doesn't match its extension." });
    }

    let document;
    try {
        document = await Document.create({
            userId: req.userId,
            filename: sanitizeFilename(req.file.originalname),
            fileType,
            fileSize: req.file.buffer.length,
            status: "processing",
        });
    } catch (err) {
        console.error("Document create error:", err.message);
        return res.status(500).json({ error: "Failed to save document" });
    }

    console.log(`[documents] uploaded document=${document._id} user=${req.userId} type=${fileType} size=${document.fileSize}`);

    // Fire-and-forget: the client already has a "processing" document to
    // poll for; processDocument handles its own errors and always leaves
    // the document in a terminal ready/failed state.
    processDocument({ documentId: document._id, buffer: req.file.buffer, fileType });

    res.status(201).json(serializeDocument(document));
});

// ─────────────────────────────────────────
// GET /api/documents
// ─────────────────────────────────────────
router.get("/", async (req, res) => {
    try {
        const documents = await Document.find({ userId: req.userId }).sort({ createdAt: -1 });
        res.json(documents.map(serializeDocument));
    } catch (err) {
        console.error("List documents error:", err.message);
        res.status(500).json({ error: "Failed to fetch documents" });
    }
});

// ─────────────────────────────────────────
// GET /api/documents/:id
// ─────────────────────────────────────────
router.get("/:id", async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ error: "Document not found" });
    }
    try {
        const document = await Document.findOne({ _id: req.params.id, userId: req.userId });
        if (!document) {
            return res.status(404).json({ error: "Document not found" });
        }
        res.json(serializeDocument(document));
    } catch (err) {
        console.error("Fetch document error:", err.message);
        res.status(500).json({ error: "Failed to fetch document" });
    }
});

// ─────────────────────────────────────────
// DELETE /api/documents/:id
// ─────────────────────────────────────────
router.delete("/:id", async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({ error: "Document not found or unauthorized" });
    }
    try {
        const document = await Document.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!document) {
            return res.status(404).json({ error: "Document not found or unauthorized" });
        }
        await Chunk.deleteMany({ documentId: document._id, userId: req.userId });
        res.status(200).json({ success: "Document deleted successfully" });
    } catch (err) {
        console.error("Delete document error:", err.message);
        res.status(500).json({ error: "Failed to delete document" });
    }
});

export default router;
