// Centralized RAG/document-pipeline configuration. Every tunable used across
// the document processing, chunking, embedding, and retrieval services lives
// here — env-overridable with sane defaults, so no magic numbers are
// scattered across route/service files.

// ─── Upload validation ─────────────────────────────────────
export const MAX_FILE_SIZE_BYTES = (Number(process.env.DOCUMENT_MAX_FILE_SIZE_MB) || 10) * 1024 * 1024;

// Extension -> internal document type. Content is still verified by magic
// bytes/heuristics in the upload route, never trusted from the extension or
// client-supplied MIME type alone.
export const SUPPORTED_EXTENSIONS = {
    '.pdf': 'pdf',
    '.txt': 'txt',
    '.md': 'md',
    '.docx': 'docx',
};

// ─── Chunking ───────────────────────────────────────────────
// Character-based (not token-based) — simple, predictable, and good enough
// for a paragraph/sentence-aware splitter. Overlap preserves context across
// a chunk boundary; min size avoids tiny orphan chunks that carry little
// retrievable signal.
export const CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE) || 1200;
export const CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP) || 200;
export const MIN_CHUNK_SIZE = Number(process.env.RAG_MIN_CHUNK_SIZE) || 100;

// ─── Embeddings ─────────────────────────────────────────────
// gemini-embedding-001 supports Matryoshka output truncation via
// outputDimensionality — 768 keeps stored vectors small (and cosine-similarity
// math cheap) while remaining well within the model's effective range.
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
export const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS) || 768;
// How many chunk texts are sent to the embeddings API in a single call —
// batches the whole document into a handful of requests instead of one
// request per chunk, to conserve API quota.
export const EMBEDDING_BATCH_SIZE = Number(process.env.EMBEDDING_BATCH_SIZE) || 50;

// ─── Retrieval ──────────────────────────────────────────────
export const RAG_TOP_K = Number(process.env.RAG_TOP_K) || 5;
// Cosine similarity floor (0-1). Chunks scoring below this are treated as
// not actually relevant rather than padding the context with noise.
export const RAG_MIN_SIMILARITY = Number(process.env.RAG_MIN_SIMILARITY) || 0.55;
// Per-chunk ceiling on how much text is inlined into the prompt, independent
// of CHUNK_SIZE — keeps a single oversized chunk from dominating the context
// budget even if chunking parameters change later.
export const RAG_MAX_CHUNK_CHARS_IN_PROMPT = Number(process.env.RAG_MAX_CHUNK_CHARS_IN_PROMPT) || 1500;
