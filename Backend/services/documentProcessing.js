import Document from "../models/Document.js";
import Chunk from "../models/Chunk.js";
import { extractText } from "./textExtraction.js";
import { chunkDocument } from "./chunking.js";
import { embedDocumentChunks } from "./embeddingService.js";

/**
 * Runs the full ingestion pipeline for a just-uploaded document:
 * extract -> chunk -> embed -> persist chunks -> mark ready/failed.
 *
 * Deliberately synchronous-in-process rather than queue-backed — there is
 * no background-job infrastructure in this project, and introducing one
 * (Redis/a job queue) purely to make this async would be infrastructure the
 * document-processing volume at this scale doesn't justify. It runs as a
 * fire-and-forget task kicked off by the upload route (which has already
 * responded to the client with status "processing"); the Document's
 * `status` field is how the client learns the outcome.
 *
 * `buffer` is only ever held in memory for the lifetime of this call — no
 * raw file content is written to disk or persisted to the database, only
 * the extracted/chunked text and its embeddings.
 */
export async function processDocument({ documentId, buffer, fileType }) {
    try {
        const { pages, pageCount } = await extractText(buffer, fileType);
        const chunks = chunkDocument(pages);

        if (chunks.length === 0) {
            throw new Error("No usable text content could be extracted from this document.");
        }

        const embeddings = await embedDocumentChunks(chunks.map((c) => c.text));
        if (embeddings.length !== chunks.length) {
            throw new Error("Embedding generation returned an unexpected number of results.");
        }

        const doc = await Document.findById(documentId).select("userId").lean();
        if (!doc) return; // document was deleted while processing was in flight

        const chunkDocs = chunks.map((chunk, i) => ({
            documentId,
            userId: doc.userId,
            text: chunk.text,
            embedding: embeddings[i],
            page: chunk.page,
            chunkIndex: chunk.chunkIndex,
        }));

        await Chunk.insertMany(chunkDocs);

        await Document.findByIdAndUpdate(documentId, {
            status: "ready",
            chunkCount: chunkDocs.length,
            pageCount,
            error: null,
        });

        console.log(`[documents] processing completed document=${documentId} chunks=${chunkDocs.length}`);
    } catch (err) {
        console.error(`[documents] processing failed document=${documentId}`, err.message);
        // insertMany can partially succeed before a later step fails (e.g.
        // a transient DB error between the insert and the status update
        // below) — without this cleanup, those chunks would remain
        // retrievable by RAG even though the document itself shows
        // "failed", which is exactly the "misleading ready state" this
        // guards against. MongoDB has no multi-document rollback here
        // without transactions, so this is an explicit compensating step.
        await Chunk.deleteMany({ documentId }).catch(() => {});
        await Document.findByIdAndUpdate(documentId, {
            status: "failed",
            error: err.message || "Document processing failed.",
            chunkCount: 0,
        }).catch(() => {});
    }
}
