import { GoogleGenAI } from "@google/genai";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS, EMBEDDING_BATCH_SIZE } from "../config/rag.js";

// Separate GoogleGenAI client instance from utils/gemini.js by design — this
// module is the one place embedding calls happen, kept independent from the
// text-generation wrapper so either could be swapped/mocked without
// affecting the other. Constructed lazily so importing this module never
// requires GEMINI_API_KEY to already be set (matters for unit tests that
// mock @google/genai entirely).
let client = null;
const getClient = () => {
    if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return client;
};

const describeEmbeddingError = (err) => {
    const status = err?.status;
    if (status === 401 || status === 403) return new Error("Invalid or missing Gemini API key");
    if (status === 429) return new Error("Gemini embedding quota is temporarily rate-limited. Please try again in a moment.");
    if (typeof status === "number" && status >= 500) return new Error("Gemini embedding service is temporarily unavailable. Please try again.");
    const message = err?.message || String(err);
    return new Error(`Embedding generation failed: ${message}`);
};

function chunkArray(items, size) {
    const batches = [];
    for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
    }
    return batches;
}

/**
 * Embeds a batch of document chunk texts. Requests are batched
 * (EMBEDDING_BATCH_SIZE per call) to conserve API quota — a document with
 * hundreds of chunks still only costs a handful of requests. Returns
 * embeddings in the same order as `texts`.
 */
export async function embedDocumentChunks(texts) {
    if (!Array.isArray(texts) || texts.length === 0) return [];
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not found in environment variables");
    }

    const ai = getClient();
    const results = [];

    for (const batch of chunkArray(texts, EMBEDDING_BATCH_SIZE)) {
        try {
            const response = await ai.models.embedContent({
                model: EMBEDDING_MODEL,
                contents: batch,
                config: {
                    taskType: "RETRIEVAL_DOCUMENT",
                    outputDimensionality: EMBEDDING_DIMENSIONS,
                },
            });
            for (const embedding of response.embeddings || []) {
                results.push(embedding.values || []);
            }
        } catch (err) {
            throw describeEmbeddingError(err);
        }
    }

    return results;
}

/**
 * Embeds a single user query. Uses the RETRIEVAL_QUERY task type — paired
 * with RETRIEVAL_DOCUMENT on the chunk side, this is what the embedding
 * model expects for asymmetric semantic search (a question and its answer
 * are not phrased the same way, and the model accounts for that when told
 * which side of the pair it's embedding).
 */
export async function embedQuery(text) {
    if (!text || !text.trim()) return null;
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not found in environment variables");
    }

    const ai = getClient();
    try {
        const response = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text,
            config: {
                taskType: "RETRIEVAL_QUERY",
                outputDimensionality: EMBEDDING_DIMENSIONS,
            },
        });
        return response.embeddings?.[0]?.values || null;
    } catch (err) {
        throw describeEmbeddingError(err);
    }
}
