import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

vi.mock('../services/embeddingService.js', () => ({
    embedDocumentChunks: vi.fn(),
}));

const { embedDocumentChunks } = await import('../services/embeddingService.js');
const { processDocument } = await import('../services/documentProcessing.js');
const { default: Document } = await import('../models/Document.js');
const { default: Chunk } = await import('../models/Chunk.js');

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.connection.close();
    await mongod.stop();
});

afterEach(async () => {
    vi.restoreAllMocks();
    await Document.deleteMany({});
    await Chunk.deleteMany({});
});

const SAMPLE_TEXT = 'This is a real diagnostic paragraph with enough content to form a chunk on its own for pipeline testing purposes.';

async function makeDocument(overrides = {}) {
    return Document.create({
        userId: new mongoose.Types.ObjectId(),
        filename: 'test.txt',
        fileType: 'txt',
        fileSize: SAMPLE_TEXT.length,
        status: 'processing',
        ...overrides,
    });
}

describe('processDocument', () => {
    it('marks the document ready and persists chunks on success', async () => {
        const doc = await makeDocument();
        embedDocumentChunks.mockResolvedValue([[1, 0, 0]]);

        await processDocument({ documentId: doc._id, buffer: Buffer.from(SAMPLE_TEXT), fileType: 'txt' });

        const updated = await Document.findById(doc._id);
        expect(updated.status).toBe('ready');
        expect(updated.chunkCount).toBe(1);
        expect(await Chunk.countDocuments({ documentId: doc._id })).toBe(1);
    });

    it('marks the document failed and stores no chunks when embedding fails outright', async () => {
        const doc = await makeDocument();
        embedDocumentChunks.mockRejectedValue(new Error('Gemini embedding quota is temporarily rate-limited. Please try again in a moment.'));

        await processDocument({ documentId: doc._id, buffer: Buffer.from(SAMPLE_TEXT), fileType: 'txt' });

        const updated = await Document.findById(doc._id);
        expect(updated.status).toBe('failed');
        expect(updated.error).toMatch(/rate-limited/i);
        expect(updated.chunkCount).toBe(0);
        expect(await Chunk.countDocuments({ documentId: doc._id })).toBe(0);
    });

    it('marks the document failed for an empty/unextractable document, with no chunks', async () => {
        const doc = await makeDocument();

        await processDocument({ documentId: doc._id, buffer: Buffer.from('   \n\n  '), fileType: 'txt' });

        const updated = await Document.findById(doc._id);
        expect(updated.status).toBe('failed');
        expect(updated.error).toMatch(/no extractable text/i);
        expect(await Chunk.countDocuments({ documentId: doc._id })).toBe(0);
    });

    it('cleans up any chunks already inserted if a later step fails (no orphaned/retrievable chunks on a failed document)', async () => {
        const doc = await makeDocument();
        embedDocumentChunks.mockResolvedValue([[1, 0, 0]]);

        // Simulate a transient failure on the "mark ready" step, which runs
        // strictly after chunks are already inserted — the exact window
        // this fix protects.
        const updateSpy = vi.spyOn(Document, 'findByIdAndUpdate').mockImplementationOnce(() => {
            throw new Error('simulated transient DB failure');
        });

        await processDocument({ documentId: doc._id, buffer: Buffer.from(SAMPLE_TEXT), fileType: 'txt' });
        updateSpy.mockRestore();

        const updated = await Document.findById(doc._id);
        expect(updated.status).toBe('failed');
        expect(updated.chunkCount).toBe(0);
        // The real assertion: no chunk survives for a document that isn't ready.
        expect(await Chunk.countDocuments({ documentId: doc._id })).toBe(0);
    });

    it('does nothing destructive if the document was deleted while processing was in flight', async () => {
        const doc = await makeDocument();
        embedDocumentChunks.mockResolvedValue([[1, 0, 0]]);
        await Document.findByIdAndDelete(doc._id);

        await expect(
            processDocument({ documentId: doc._id, buffer: Buffer.from(SAMPLE_TEXT), fileType: 'txt' })
        ).resolves.not.toThrow();

        expect(await Chunk.countDocuments({ documentId: doc._id })).toBe(0);
        expect(await Document.findById(doc._id)).toBeNull();
    });
});
