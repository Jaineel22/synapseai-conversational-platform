import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './helpers/testApp.js';

// Rate limiting gets its own file deliberately: Vitest isolates modules
// per test FILE, not per describe block. A second createTestApp() call
// within a file that already imported server.js would reuse the cached
// module (and its already-closed DB connection) instead of picking up a
// fresh CHAT_RATE_LIMIT env value.
describe('chat rate limiting', () => {
    let ctx;
    let cookie;

    beforeAll(async () => {
        // Low, test-specific limit so this doesn't need dozens of requests
        // to exercise.
        ctx = await createTestApp({ CHAT_RATE_LIMIT: '3' });
        const user = { name: 'Rate Limit User', email: 'ratelimituser@example.com', password: 'longenough123' };
        await request(ctx.app).post('/api/auth/register').send(user);
        const res = await request(ctx.app)
            .post('/api/auth/login')
            .send({ email: user.email, password: user.password });
        cookie = res.headers['set-cookie'][0];
    });

    afterAll(async () => {
        await closeTestApp(ctx);
    });

    it('returns 429 once the per-user limit is exceeded', async () => {
        // Sends an invalid (empty-message) body — rejected by validation,
        // but the limiter runs before validation, so it still counts
        // toward the limit while costing nothing to send.
        const attempt = () =>
            request(ctx.app)
                .post('/api/chat')
                .set('Cookie', cookie)
                .send({ threadId: 'rl-thread', message: '' });

        const results = [];
        for (let i = 0; i < 5; i++) {
            results.push((await attempt()).status);
        }

        expect(results.slice(0, 3)).toEqual([400, 400, 400]);
        expect(results.slice(3)).toEqual([429, 429]);
    });
});
