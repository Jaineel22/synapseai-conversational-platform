import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './helpers/testApp.js';

// Embedding calls are mocked the same way Gemini generation is mocked for
// the rest of the suite — deterministic, no network, no quota spent. This
// lets the full upload -> process -> ready pipeline run end-to-end against
// the real (in-memory) MongoDB and the real chunking/extraction code, with
// only the external AI call replaced.
vi.mock('../services/embeddingService.js', () => ({
    embedDocumentChunks: vi.fn(async (texts) => texts.map((_, i) => [1, i * 0.01, 0])),
    embedQuery: vi.fn(async () => [1, 0, 0]),
}));

// Small limit so the oversized-file test doesn't need a real 10MB buffer.
process.env.DOCUMENT_MAX_FILE_SIZE_MB = '1';

async function registerAndLogin(app, email) {
    const user = { name: 'Doc Test User', email, password: 'longenough123' };
    await request(app).post('/api/auth/register').send(user);
    const res = await request(app).post('/api/auth/login').send({ email, password: user.password });
    return res.headers['set-cookie'][0];
}

async function waitForStatus(app, cookie, id, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const res = await request(app).get(`/api/documents/${id}`).set('Cookie', cookie);
        if (res.body.status !== 'processing') return res.body;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('Timed out waiting for document processing to finish');
}

describe('documents API', () => {
    let ctx;
    let cookie;

    beforeAll(async () => {
        ctx = await createTestApp();
        cookie = await registerAndLogin(ctx.app, 'docuser@example.com');
    });

    afterAll(async () => {
        await closeTestApp(ctx);
    });

    describe('authentication', () => {
        it('rejects unauthenticated upload', async () => {
            const res = await request(ctx.app).post('/api/documents').attach('file', Buffer.from('hi'), 'a.txt');
            expect(res.status).toBe(401);
        });

        it('rejects unauthenticated list/get/delete', async () => {
            expect((await request(ctx.app).get('/api/documents')).status).toBe(401);
            expect((await request(ctx.app).get('/api/documents/000000000000000000000000')).status).toBe(401);
            expect((await request(ctx.app).delete('/api/documents/000000000000000000000000')).status).toBe(401);
        });
    });

    describe('upload validation', () => {
        it('rejects an unsupported file extension', async () => {
            const res = await request(ctx.app)
                .post('/api/documents')
                .set('Cookie', cookie)
                .attach('file', Buffer.from('MZ\x90\x00'), 'malware.exe');
            expect(res.status).toBe(400);
        });

        it('rejects an oversized file', async () => {
            const bigBuffer = Buffer.alloc(2 * 1024 * 1024, 'a'); // 2MB > 1MB test limit
            const res = await request(ctx.app)
                .post('/api/documents')
                .set('Cookie', cookie)
                .attach('file', bigBuffer, 'big.txt');
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/too large/i);
        });

        it('rejects an empty file', async () => {
            const res = await request(ctx.app)
                .post('/api/documents')
                .set('Cookie', cookie)
                .attach('file', Buffer.from(''), 'empty.txt');
            expect(res.status).toBe(400);
        });

        it('rejects content that does not match its declared extension', async () => {
            // .txt file containing a NUL byte — fails the "looks like text" sniff
            const res = await request(ctx.app)
                .post('/api/documents')
                .set('Cookie', cookie)
                .attach('file', Buffer.from([0x00, 0x01, 0x02, 0x03]), 'binary.txt');
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/content/i);
        });
    });

    describe('happy path: upload, process, list, get, delete', () => {
        it('uploads a valid .txt document, processes it to ready, and it is retrievable', async () => {
            const content = 'This is a real test document.\n\nIt has multiple paragraphs of real content for chunking to work on, describing a fictional product policy in enough detail to produce more than one chunk when the chunk size is small.';
            const uploadRes = await request(ctx.app)
                .post('/api/documents')
                .set('Cookie', cookie)
                .attach('file', Buffer.from(content), 'policy.txt');

            expect(uploadRes.status).toBe(201);
            expect(uploadRes.body.status).toBe('processing');
            expect(uploadRes.body.filename).toBe('policy.txt');

            const final = await waitForStatus(ctx.app, cookie, uploadRes.body.id);
            expect(final.status).toBe('ready');
            expect(final.chunkCount).toBeGreaterThan(0);
            expect(final.error).toBeNull();
        });

        it('lists the uploaded document', async () => {
            const list = await request(ctx.app).get('/api/documents').set('Cookie', cookie);
            expect(list.status).toBe(200);
            expect(list.body.some((d) => d.filename === 'policy.txt')).toBe(true);
        });
    });

    describe('malformed document handling', () => {
        it('marks a document failed when it has no extractable text', async () => {
            const uploadRes = await request(ctx.app)
                .post('/api/documents')
                .set('Cookie', cookie)
                .attach('file', Buffer.from('   \n\n   '), 'blank.txt');

            expect(uploadRes.status).toBe(201);
            const final = await waitForStatus(ctx.app, cookie, uploadRes.body.id);
            expect(final.status).toBe('failed');
            expect(final.error).toMatch(/no extractable text/i);
        });
    });

    describe('ownership isolation', () => {
        let ownerCookie;
        let otherCookie;
        let ownedDocId;

        beforeAll(async () => {
            ownerCookie = await registerAndLogin(ctx.app, 'doc-owner@example.com');
            otherCookie = await registerAndLogin(ctx.app, 'doc-other@example.com');

            const uploadRes = await request(ctx.app)
                .post('/api/documents')
                .set('Cookie', ownerCookie)
                .attach('file', Buffer.from('Private content only the owner should see.'), 'private.txt');
            ownedDocId = uploadRes.body.id;
            await waitForStatus(ctx.app, ownerCookie, ownedDocId);
        });

        it('a different user cannot GET another user\'s document', async () => {
            const res = await request(ctx.app).get(`/api/documents/${ownedDocId}`).set('Cookie', otherCookie);
            expect(res.status).toBe(404);
        });

        it('a different user\'s document list never includes another user\'s documents', async () => {
            const res = await request(ctx.app).get('/api/documents').set('Cookie', otherCookie);
            expect(res.body.some((d) => d.id === ownedDocId)).toBe(false);
        });

        it('a different user cannot DELETE another user\'s document', async () => {
            const res = await request(ctx.app).delete(`/api/documents/${ownedDocId}`).set('Cookie', otherCookie);
            expect(res.status).toBe(404);

            const stillThere = await request(ctx.app).get(`/api/documents/${ownedDocId}`).set('Cookie', ownerCookie);
            expect(stillThere.status).toBe(200);
        });

        it('the owner can delete their own document, cascading to its chunks', async () => {
            const { default: Chunk } = await import('../models/Chunk.js');
            const beforeCount = await Chunk.countDocuments({ documentId: ownedDocId });
            expect(beforeCount).toBeGreaterThan(0);

            const res = await request(ctx.app).delete(`/api/documents/${ownedDocId}`).set('Cookie', ownerCookie);
            expect(res.status).toBe(200);

            const afterGet = await request(ctx.app).get(`/api/documents/${ownedDocId}`).set('Cookie', ownerCookie);
            expect(afterGet.status).toBe(404);

            const afterCount = await Chunk.countDocuments({ documentId: ownedDocId });
            expect(afterCount).toBe(0);
        });
    });

    describe('invalid document id', () => {
        it('returns 404 (not 500) for a malformed id', async () => {
            const res = await request(ctx.app).get('/api/documents/not-a-valid-id').set('Cookie', cookie);
            expect(res.status).toBe(404);
        });
    });
});
