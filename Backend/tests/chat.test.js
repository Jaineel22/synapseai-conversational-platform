import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './helpers/testApp.js';

// Parses the raw SSE response body into its chunk texts + terminal event,
// the same shape the frontend's own parser consumes.
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
    const user = { name: 'Chat Test User', email, password: 'longenough123' };
    await request(app).post('/api/auth/register').send(user);
    const res = await request(app).post('/api/auth/login').send({ email, password: user.password });
    return res.headers['set-cookie'][0];
}

describe('chat', () => {
    let ctx;
    let cookie;

    beforeAll(async () => {
        ctx = await createTestApp();
        cookie = await registerAndLogin(ctx.app, 'chatuser@example.com');
    });

    afterAll(async () => {
        await closeTestApp(ctx);
    });

    it('POST /api/chat requires authentication', async () => {
        const res = await request(ctx.app)
            .post('/api/chat')
            .send({ threadId: 'no-auth-thread', message: 'hi' });
        expect(res.status).toBe(401);
    });

    it('rejects an empty message', async () => {
        const res = await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: 'validation-thread', message: '   ' });
        expect(res.status).toBe(400);
    });

    it('rejects a non-string threadId (NoSQL-operator-injection shape)', async () => {
        const res = await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId: { $ne: null }, message: 'hi' });
        expect(res.status).toBe(400);
    });

    it('streams a reply over SSE and persists exactly one complete assistant message', async () => {
        const threadId = 'stream-thread-1';
        const res = await request(ctx.app)
            .post('/api/chat')
            .set('Cookie', cookie)
            .send({ threadId, message: 'Hello there' });

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/event-stream/);

        const events = parseSSE(res.text);
        const chunkEvents = events.filter((e) => e.event === 'chunk');
        const doneEvents = events.filter((e) => e.event === 'done');
        expect(chunkEvents.length).toBeGreaterThan(0);
        expect(doneEvents.length).toBe(1);

        const fullText = chunkEvents.map((e) => e.data.text).join('');
        expect(fullText).toBe('Mocked response.');

        const thread = await request(ctx.app).get(`/api/thread/${threadId}`).set('Cookie', cookie);
        expect(thread.body).toHaveLength(2);
        expect(thread.body[0]).toMatchObject({ role: 'user', content: 'Hello there' });
        expect(thread.body[1]).toMatchObject({ role: 'assistant', content: 'Mocked response.' });
    });

    it('sends prior thread history to Gemini as conversation context (memory)', async () => {
        const threadId = 'memory-thread-1';

        await request(ctx.app).post('/api/chat').set('Cookie', cookie).send({ threadId, message: 'first message' });
        ctx.GoogleGenAI.mock.results[0].value.models.generateContentStream.mockClear();

        await request(ctx.app).post('/api/chat').set('Cookie', cookie).send({ threadId, message: 'second message' });

        const calls = ctx.GoogleGenAI.mock.results[0].value.models.generateContentStream.mock.calls;
        const [{ contents }] = calls[calls.length - 1];

        // Context sent to Gemini should include the earlier turns, not
        // just the newest message in isolation.
        const texts = contents.map((c) => c.parts[0].text);
        expect(texts).toContain('first message');
        expect(texts).toContain('Mocked response.');
        expect(texts).toContain('second message');

        // Roles are translated to Gemini's "user"/"model", never the raw
        // Mongoose "assistant" value.
        expect(contents.every((c) => c.role === 'user' || c.role === 'model')).toBe(true);
    });

    it('lists, retrieves, and deletes only threads owned by the requester', async () => {
        const list = await request(ctx.app).get('/api/thread').set('Cookie', cookie);
        expect(list.status).toBe(200);
        expect(list.body.some((t) => t.threadId === 'stream-thread-1')).toBe(true);

        const del = await request(ctx.app).delete('/api/thread/stream-thread-1').set('Cookie', cookie);
        expect(del.status).toBe(200);

        const afterDelete = await request(ctx.app).get('/api/thread/stream-thread-1').set('Cookie', cookie);
        expect(afterDelete.status).toBe(404);
    });

    describe('cross-user isolation', () => {
        let otherCookie;

        beforeAll(async () => {
            otherCookie = await registerAndLogin(ctx.app, 'otheruser@example.com');
            await request(ctx.app)
                .post('/api/chat')
                .set('Cookie', cookie)
                .send({ threadId: 'owned-by-user-1', message: 'private message' });
        });

        it('a different user cannot read another user\'s thread', async () => {
            const res = await request(ctx.app)
                .get('/api/thread/owned-by-user-1')
                .set('Cookie', otherCookie);
            expect(res.status).toBe(404);
        });

        it('a different user cannot delete another user\'s thread', async () => {
            const res = await request(ctx.app)
                .delete('/api/thread/owned-by-user-1')
                .set('Cookie', otherCookie);
            expect(res.status).toBe(404);

            // Confirm it's still there for the actual owner.
            const stillThere = await request(ctx.app)
                .get('/api/thread/owned-by-user-1')
                .set('Cookie', cookie);
            expect(stillThere.status).toBe(200);
        });

        it('a different user\'s thread list never includes another user\'s threads', async () => {
            const res = await request(ctx.app).get('/api/thread').set('Cookie', otherCookie);
            expect(res.body.some((t) => t.threadId === 'owned-by-user-1')).toBe(false);
        });
    });
});
