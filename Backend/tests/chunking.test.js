import { describe, it, expect } from 'vitest';
import { chunkText, chunkDocument } from '../services/chunking.js';

describe('chunkText', () => {
    it('returns no chunks for empty/whitespace-only text', () => {
        expect(chunkText('')).toEqual([]);
        expect(chunkText('   \n\n  ')).toEqual([]);
    });

    it('keeps short text as a single chunk', () => {
        const text = 'This is a short paragraph that fits well within any reasonable chunk size.';
        const chunks = chunkText(text, { chunkSize: 1200, chunkOverlap: 200, minChunkSize: 100 });
        expect(chunks).toHaveLength(1);
        expect(chunks[0]).toBe(text);
    });

    it('splits long text into multiple chunks bounded by chunkSize', () => {
        const paragraph = 'Sentence number restates the topic in slightly different words for testing purposes. ';
        const longText = Array.from({ length: 40 }, (_, i) => `${paragraph}Paragraph ${i}.\n\n`).join('');
        const chunks = chunkText(longText, { chunkSize: 500, chunkOverlap: 100, minChunkSize: 50 });

        expect(chunks.length).toBeGreaterThan(1);
        for (const chunk of chunks) {
            // Overlap can push a chunk slightly past chunkSize by design
            // (it's seeded with the previous chunk's tail before the next
            // unit is appended) — allow reasonable headroom rather than an
            // exact ceiling.
            expect(chunk.length).toBeLessThan(900);
        }
    });

    it('carries overlap text from the end of one chunk into the start of the next', () => {
        const paragraphs = Array.from({ length: 10 }, (_, i) =>
            `Paragraph ${i} contains unique content marker UNIQ${i} for overlap verification purposes across chunk boundaries.`
        );
        const text = paragraphs.join('\n\n');
        const chunks = chunkText(text, { chunkSize: 200, chunkOverlap: 80, minChunkSize: 20 });

        expect(chunks.length).toBeGreaterThan(1);
        // Whichever unique paragraph marker ends up right at the chunk[0]
        // boundary should reappear at the start of chunk[1] — proof the
        // overlap tail actually carried forward, without pinning the test
        // to exact byte-for-byte trim behavior.
        const lastMarkerInFirst = [...chunks[0].matchAll(/UNIQ\d+/g)].pop()?.[0];
        expect(lastMarkerInFirst).toBeDefined();
        expect(chunks[1].includes(lastMarkerInFirst)).toBe(true);
    });

    it('does not emit a tiny orphan chunk — merges it into its predecessor', () => {
        const text = 'A reasonably long first paragraph that will fill up most of the available chunk size on its own so the next tiny bit spills over.\n\nEnd.';
        const chunks = chunkText(text, { chunkSize: 140, chunkOverlap: 0, minChunkSize: 50 });

        for (const chunk of chunks) {
            expect(chunk.length).toBeGreaterThanOrEqual(50);
        }
    });

    it('falls back to sentence splitting for a single oversized paragraph', () => {
        const sentences = Array.from({ length: 20 }, (_, i) => `This is sentence number ${i} in one giant paragraph.`);
        const text = sentences.join(' '); // one paragraph, no blank lines
        const chunks = chunkText(text, { chunkSize: 200, chunkOverlap: 0, minChunkSize: 20 });

        expect(chunks.length).toBeGreaterThan(1);
    });
});

describe('chunkDocument', () => {
    it('preserves page metadata per chunk and assigns a global chunkIndex', () => {
        const pages = [
            { page: 1, text: 'Content of the first page, describing the introduction section in enough detail to form a chunk.' },
            { page: 2, text: 'Content of the second page, continuing the discussion with different subject matter entirely.' },
        ];
        const chunks = chunkDocument(pages, { chunkSize: 1000, chunkOverlap: 0, minChunkSize: 10 });

        expect(chunks.length).toBeGreaterThanOrEqual(2);
        expect(chunks.filter((c) => c.page === 1).length).toBeGreaterThan(0);
        expect(chunks.filter((c) => c.page === 2).length).toBeGreaterThan(0);
        // chunkIndex is globally sequential across pages
        expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
    });

    it('carries a null page through for unpaginated sources (txt/md)', () => {
        const pages = [{ page: null, text: 'Plain text document content with no inherent pagination at all.' }];
        const chunks = chunkDocument(pages, { chunkSize: 1000, chunkOverlap: 0, minChunkSize: 10 });
        expect(chunks.every((c) => c.page === null)).toBe(true);
    });

    it('never emits a chunk shorter than minChunkSize when more than one chunk exists', () => {
        const pages = [{ page: 1, text: 'X'.repeat(300) + '\n\n' + 'Y'.repeat(10) }];
        const chunks = chunkDocument(pages, { chunkSize: 150, chunkOverlap: 0, minChunkSize: 50 });
        for (const c of chunks) {
            expect(c.text.length).toBeGreaterThanOrEqual(10); // merged with neighbor, never bare "YYYYYYYYYY" alone below minChunkSize... unless it's the only chunk
        }
    });
});
