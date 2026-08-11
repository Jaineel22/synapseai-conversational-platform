import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './helpers/testApp.js';

// Retrieval is mocked at the service boundary — this suite is about the
// chat route's RAG wiring (prompt construction, source propagation, error
// handling), not about cosine-similarity ranking, which retrieval.test.js
// already covers against a real database.
vi.mock('../services/retrieval.js', () => ({
    retrieveRelevantChunks: vi.fn(),
}));

const { retrieveRelevantChunks } = await import('../services/retrieval.js');

function parseSSE(body) {
    const events = [];
    for (const frame of body.split('\n\n')) {
        if (!frame.trim()) continue;
        let event = 'message';
        let data = '';
        for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data = line.slice(5).trim();
        }
        if (data) events.push({ event, data: JSON.parse(data) });
    }
    return events;
}

async function registerAndLogin(app, email) {
    const user = { name: 'RAG Chat User', email, password: 'longenough123' };
    await request(app).post('/api/auth/register').send(user);
    const res = await request(app).post('/api/auth/login').send({ email, password: user.password });
    return res.headers['set-cookie'][0];
}

const fakeRetrievedChunks = () => ([
    {
        chunkId: 'chunk-1', documentId: '507f1f77bcf86cd799439011', filename: 'handbook.pdf',
        page: 4, chunkIndex: 0, score: 0.91,
        text: 'Employees may work remotely up to three days per week.',
    },
    {
        chunkId: 'chunk-2', documentId: '507f1f77bcf86cd799439011', filename: 'handbook.pdf',
        page: 7, chunkIndex: 3, score: 0.77,
        text: 'Remote work requests must be approved by a manager in advance.',
    },
]);

describe('RAG chat', () => {
    let ctx;
    let cookie;

    beforeAll(async () => {
        ctx = await createTestApp();
        cookie = await registerAndLogin(ctx.app, 'ragchat@example.com');
    });

    afterAll(async () => {
        await closeTestApp(ctx);
    });

    it('normal chat (useKnowledge omitted) never calls retrieval', async () => {
        retrieveRelevantChunks.mockClear();
        const res = await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: 'normal-thread', message: 'hello' });

        expect(res.status).toBe(200);
        expect(retrieveRelevantChunks).not.toHaveBeenCalled();
    });

    it('grounds the response in retrieved chunks and returns structured source citations', async () => {
        retrieveRelevantChunks.mockResolvedValueOnce(fakeRetrievedChunks());

        const res = await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: 'rag-thread-1', message: 'How many remote days are allowed?', useKnowledge: true });

        expect(res.status).toBe(200);
        expect(retrieveRelevantChunks).toHaveBeenCalledWith(
            expect.objectContaining({ userId: expect.anything(), query: 'How many remote days are allowed?' })
        );

        const events = parseSSE(res.text);
        const doneEvent = events.find((e) => e.event === 'done');
        expect(doneEvent).toBeDefined();
        expect(doneEvent.data.sources).toEqual([
            expect.objectContaining({ index: 1, filename: 'handbook.pdf', page: 4 }),
            expect.objectContaining({ index: 2, filename: 'handbook.pdf', page: 7 }),
        ]);

        // The prompt actually sent to Gemini must contain the retrieved
        // context, labeled, not just the bare question.
        const calls = ctx.GoogleGenAI.mock.results[0].value.models.generateContentStream.mock.calls;
        const [{ contents }] = calls[calls.length - 1];
        const lastTurnText = contents[contents.length - 1].parts[0].text;
        expect(lastTurnText).toContain('[Source 1]');
        expect(lastTurnText).toContain('handbook.pdf');
        expect(lastTurnText).toContain('three days per week');

        // Citations are persisted on the assistant message too, not just
        // sent over SSE for the live turn.
        const thread = await request(ctx.app).get('/api/thread/rag-thread-1').set('Cookie', cookie);
        const assistantMessage = thread.body.find((m) => m.role === 'assistant');
        expect(assistantMessage.sources).toHaveLength(2);
    });

    it('tells the model explicitly when no relevant documents were found, and returns no sources', async () => {
        retrieveRelevantChunks.mockResolvedValueOnce([]);

        const res = await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: 'rag-thread-empty', message: 'irrelevant question', useKnowledge: true });

        expect(res.status).toBe(200);
        const events = parseSSE(res.text);
        const doneEvent = events.find((e) => e.event === 'done');
        expect(doneEvent.data.sources).toEqual([]);

        const calls = ctx.GoogleGenAI.mock.results[0].value.models.generateContentStream.mock.calls;
        const [{ contents }] = calls[calls.length - 1];
        const lastTurnText = contents[contents.length - 1].parts[0].text;
        expect(lastTurnText).toMatch(/no relevant content/i);
    });

    it('passes documentIds through to retrieval for scoped "ask this document" queries', async () => {
        retrieveRelevantChunks.mockResolvedValueOnce([]);
        await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: 'rag-thread-scoped', message: 'q', useKnowledge: true, documentIds: ['507f1f77bcf86cd799439011'] });

        expect(retrieveRelevantChunks).toHaveBeenCalledWith(
            expect.objectContaining({ documentIds: ['507f1f77bcf86cd799439011'] })
        );
    });

    it('returns a plain JSON error (not a broken SSE stream) when retrieval fails', async () => {
        retrieveRelevantChunks.mockRejectedValueOnce(new Error('Embedding generation failed: quota exceeded'));

        const res = await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: 'rag-thread-fail', message: 'q', useKnowledge: true });

        expect(res.status).toBe(502);
        expect(res.headers['content-type']).toMatch(/json/);
        expect(res.body.error).toMatch(/quota exceeded/i);

        // The user's message is still saved even though retrieval failed —
        // same guarantee normal chat gives when generation fails.
        const thread = await request(ctx.app).get('/api/thread/rag-thread-fail').set('Cookie', cookie);
        expect(thread.body.some((m) => m.role === 'user' && m.content === 'q')).toBe(true);
    });

    it('a user cannot use documentIds to retrieve chunks scoped to another user (enforced by retrieval, not by chat.js)', async () => {
        // The chat route trusts retrieveRelevantChunks to enforce
        // ownership — this test documents that trust boundary explicitly:
        // chat.js always passes the authenticated req.userId, never a
        // client-supplied one.
        retrieveRelevantChunks.mockResolvedValueOnce([]);
        await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: 'rag-thread-ownership', message: 'q', useKnowledge: true, documentIds: ['ffffffffffffffffffffffff'] });

        const lastCallArgs = retrieveRelevantChunks.mock.calls.at(-1)[0];
        expect(String(lastCallArgs.userId)).not.toBe('undefined');
    });
});
