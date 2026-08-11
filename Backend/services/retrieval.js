import Chunk from "../models/Chunk.js";
import Document from "../models/Document.js";
import { embedQuery } from "./embeddingService.js";
import { RAG_TOP_K, RAG_MIN_SIMILARITY } from "../config/rag.js";

function cosineSimilarity(a, b) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic retrieval, scoped to a single user's documents.
 *
 * Ownership is enforced at the MongoDB query itself (`userId` in the
 * `find` filter) — never as an app-layer filter applied after the fact —
 * so there is no code path where another user's chunks are even loaded
 * into memory, let alone scored or returned.
 *
 * Similarity is computed in-process (cosine similarity over embedding
 * arrays already stored on each chunk) rather than via a dedicated vector
 * database — a deliberate choice at this project's scale that keeps the
 * whole pipeline on the existing MongoDB with no additional infrastructure
 * or manual index configuration to deploy. It reads every one of the
 * user's (optionally document-scoped) chunks per query, which is the
 * documented tradeoff of this approach; it comfortably handles a personal
 * or small-team document set and can be swapped for MongoDB Atlas Vector
 * Search's `$vectorSearch` later without changing this function's contract
 * (same input/output shape) if retrieval volume outgrows it.
 */
export async function retrieveRelevantChunks({ userId, query, documentIds, topK = RAG_TOP_K }) {
    if (!query || !query.trim()) return [];

    const queryEmbedding = await embedQuery(query);
    if (!queryEmbedding) return [];

    const filter = { userId };
    if (Array.isArray(documentIds) && documentIds.length > 0) {
        filter.documentId = { $in: documentIds };
    }

    const candidates = await Chunk.find(filter)
        .select("text embedding page documentId chunkIndex")
        .lean();

    if (candidates.length === 0) return [];

    const scored = candidates
        .map((chunk) => ({
            chunkId: chunk._id,
            documentId: chunk.documentId,
            text: chunk.text,
            page: chunk.page,
            chunkIndex: chunk.chunkIndex,
            score: cosineSimilarity(queryEmbedding, chunk.embedding),
        }))
        .filter((c) => c.score >= RAG_MIN_SIMILARITY)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

    if (scored.length === 0) return [];

    // Re-checked against userId here too — belt-and-suspenders against a
    // documentId that doesn't belong to this user ever surfacing a
    // filename, even though the Chunk query above already excludes those
    // chunks entirely.
    const docIds = [...new Set(scored.map((c) => String(c.documentId)))];
    const docs = await Document.find({ _id: { $in: docIds }, userId }).select("filename").lean();
    const filenameById = new Map(docs.map((d) => [String(d._id), d.filename]));

    return scored.map((c) => ({
        ...c,
        filename: filenameById.get(String(c.documentId)) || "Unknown document",
    }));
}
