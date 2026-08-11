import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Only the embedding call is mocked (query embedding is deterministic and
// fully controlled per test) — retrieval itself runs against a real
// in-memory MongoDB, so the actual cosine-similarity ranking and the
// ownership-scoped query are exercised for real, not mocked away.
vi.mock('../services/embeddingService.js', () => ({
    embedQuery: vi.fn(),
}));

const { embedQuery } = await import('../services/embeddingService.js');
const { retrieveRelevantChunks } = await import('../services/retrieval.js');
const { default: Chunk } = await import('../models/Chunk.js');
const { default: Document } = await import('../models/Document.js');

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
    await mongoose.connection.close();
    await mongod.stop();
});

beforeEach(async () => {
    await Chunk.deleteMany({});
    await Document.deleteMany({});
    embedQuery.mockReset();
});

async function makeDocument(userId, filename = 'doc.txt') {
    return Document.create({ userId, filename, fileType: 'txt', fileSize: 100, status: 'ready' });
}

describe('retrieveRelevantChunks', () => {
    it('returns [] without embedding the query when the query is empty', async () => {
        const userId = new mongoose.Types.ObjectId();
        const result = await retrieveRelevantChunks({ userId, query: '   ' });
        expect(result).toEqual([]);
        expect(embedQuery).not.toHaveBeenCalled();
    });

    it('returns [] when the user has no chunks at all', async () => {
        const userId = new mongoose.Types.ObjectId();
        embedQuery.mockResolvedValue([1, 0, 0]);
        const result = await retrieveRelevantChunks({ userId, query: 'anything' });
        expect(result).toEqual([]);
    });

    it('ranks chunks by cosine similarity, highest first, and filters below the similarity floor', async () => {
        const userId = new mongoose.Types.ObjectId();
        const doc = await makeDocument(userId);

        await Chunk.insertMany([
            { documentId: doc._id, userId, text: 'exact match', embedding: [1, 0, 0], chunkIndex: 0 },
            { documentId: doc._id, userId, text: 'partial match', embedding: [0.7, 0.7, 0], chunkIndex: 1 },
            { documentId: doc._id, userId, text: 'orthogonal, irrelevant', embedding: [0, 1, 0], chunkIndex: 2 },
        ]);

        embedQuery.mockResolvedValue([1, 0, 0]);
        const result = await retrieveRelevantChunks({ userId, query: 'find the exact match' });

        // Orthogonal chunk (cosine similarity 0) is below RAG_MIN_SIMILARITY
        // and must not appear at all.
        expect(result.map((c) => c.text)).toEqual(['exact match', 'partial match']);
        expect(result[0].score).toBeGreaterThan(result[1].score);
        expect(result[0].filename).toBe('doc.txt');
    });

    it('never returns another user\'s chunks, even when they score higher', async () => {
        const userA = new mongoose.Types.ObjectId();
        const userB = new mongoose.Types.ObjectId();
        const docA = await makeDocument(userA, 'a.txt');
        const docB = await makeDocument(userB, 'b.txt');

        await Chunk.insertMany([
            { documentId: docA._id, userId: userA, text: 'user A chunk', embedding: [0.9, 0.1, 0], chunkIndex: 0 },
            { documentId: docB._id, userId: userB, text: 'user B chunk (perfect match)', embedding: [1, 0, 0], chunkIndex: 0 },
        ]);

        embedQuery.mockResolvedValue([1, 0, 0]);
        const result = await retrieveRelevantChunks({ userId: userA, query: 'anything' });

        expect(result.every((c) => c.text !== 'user B chunk (perfect match)')).toBe(true);
    });

    it('respects topK', async () => {
        const userId = new mongoose.Types.ObjectId();
        const doc = await makeDocument(userId);

        await Chunk.insertMany(
            Array.from({ length: 8 }, (_, i) => ({
                documentId: doc._id,
                userId,
                text: `chunk ${i}`,
                embedding: [1, 0, 0],
                chunkIndex: i,
            }))
        );

        embedQuery.mockResolvedValue([1, 0, 0]);
        const result = await retrieveRelevantChunks({ userId, query: 'q', topK: 3 });
        expect(result).toHaveLength(3);
    });

    it('narrows to specific documentIds when provided, excluding chunks from other owned documents', async () => {
        const userId = new mongoose.Types.ObjectId();
        const doc1 = await makeDocument(userId, 'doc1.txt');
        const doc2 = await makeDocument(userId, 'doc2.txt');

        await Chunk.insertMany([
            { documentId: doc1._id, userId, text: 'from doc1', embedding: [1, 0, 0], chunkIndex: 0 },
            { documentId: doc2._id, userId, text: 'from doc2', embedding: [1, 0, 0], chunkIndex: 0 },
        ]);

        embedQuery.mockResolvedValue([1, 0, 0]);
        const result = await retrieveRelevantChunks({ userId, query: 'q', documentIds: [String(doc1._id)] });

        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('from doc1');
    });

    it('a documentId belonging to another user is silently excluded, not an error', async () => {
        const userA = new mongoose.Types.ObjectId();
        const userB = new mongoose.Types.ObjectId();
        const docB = await makeDocument(userB, 'b.txt');
        await Chunk.insertMany([
            { documentId: docB._id, userId: userB, text: 'user B content', embedding: [1, 0, 0], chunkIndex: 0 },
        ]);

        embedQuery.mockResolvedValue([1, 0, 0]);
        const result = await retrieveRelevantChunks({ userId: userA, query: 'q', documentIds: [String(docB._id)] });
        expect(result).toEqual([]);
    });
});
