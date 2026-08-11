import { CHUNK_SIZE, CHUNK_OVERLAP, MIN_CHUNK_SIZE } from "../config/rag.js";

// Collapse line-ending variance and stray control characters before
// chunking, so paragraph/sentence boundaries below are detected reliably
// regardless of how the source document encoded whitespace.
function normalizeText(text) {
    return text
        .replace(/\r\n/g, "\n")
        .split("").filter((ch) => ch.charCodeAt(0) !== 0).join("")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function splitParagraphs(text) {
    return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

// Fallback for a single paragraph that alone exceeds the chunk size —
// splits on sentence-ending punctuation so an oversized paragraph still
// breaks at semantically reasonable points instead of a hard character cut.
function splitSentences(paragraph) {
    const sentences = paragraph.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g);
    return sentences ? sentences.map((s) => s.trim()).filter(Boolean) : [paragraph];
}

/**
 * Splits a single block of text into semantically-coherent chunks.
 *
 * Strategy: paragraphs are packed greedily up to `chunkSize`; a paragraph
 * that alone exceeds `chunkSize` is broken into sentences first. Each new
 * chunk (after the first) is seeded with the tail of the previous chunk
 * (`chunkOverlap` characters) so context isn't lost at a chunk boundary. A
 * final chunk shorter than `minChunkSize` is merged into its predecessor
 * rather than emitted as a near-empty orphan.
 */
export function chunkText(text, { chunkSize = CHUNK_SIZE, chunkOverlap = CHUNK_OVERLAP, minChunkSize = MIN_CHUNK_SIZE } = {}) {
    const normalized = normalizeText(text || "");
    if (!normalized) return [];

    const paragraphs = splitParagraphs(normalized);
    const units = [];
    for (const paragraph of paragraphs) {
        if (paragraph.length <= chunkSize) {
            units.push(paragraph);
        } else {
            units.push(...splitSentences(paragraph));
        }
    }
    if (units.length === 0) return [];

    const chunks = [];
    let current = "";

    const closeCurrent = () => {
        const trimmed = current.trim();
        if (trimmed) chunks.push(trimmed);
        current = "";
    };

    for (const unit of units) {
        const candidate = current ? `${current}\n\n${unit}` : unit;
        if (candidate.length <= chunkSize || !current) {
            current = candidate;
        } else {
            closeCurrent();
            const overlapTail = chunkOverlap > 0 ? chunks[chunks.length - 1].slice(-chunkOverlap) : "";
            current = overlapTail ? `${overlapTail}\n\n${unit}` : unit;
        }
    }
    closeCurrent();

    if (chunks.length > 1 && chunks[chunks.length - 1].length < minChunkSize) {
        const orphan = chunks.pop();
        chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n${orphan}`;
    }

    return chunks;
}

/**
 * Chunks an already-paginated document (the shape `extractText` returns —
 * `[{ page, text }]`) into a flat, globally-ordered chunk list. Chunking is
 * done per-page so each chunk's `page` metadata is exact; the tradeoff is
 * that a chunk never spans a page boundary, which is an acceptable
 * simplicity/accuracy tradeoff at this project's scale.
 */
export function chunkDocument(pages, options = {}) {
    const chunks = [];
    let chunkIndex = 0;

    for (const { page, text } of pages) {
        for (const chunkTextValue of chunkText(text, options)) {
            chunks.push({ text: chunkTextValue, page, chunkIndex });
            chunkIndex += 1;
        }
    }

    return chunks;
}
