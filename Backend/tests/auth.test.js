import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './helpers/testApp.js';

describe('auth', () => {
    let ctx;

    beforeAll(async () => {
        ctx = await createTestApp();
    });

    afterAll(async () => {
        await closeTestApp(ctx);
    });

    const user = { name: 'Test User', email: 'testuser@example.com', password: 'longenough123' };

    describe('POST /api/auth/register', () => {
        it('rejects an invalid email', async () => {
            const res = await request(ctx.app)
                .post('/api/auth/register')
                .send({ ...user, email: 'not-an-email' });
            expect(res.status).toBe(400);
        });

        it('rejects a password under 8 characters', async () => {
            const res = await request(ctx.app)
                .post('/api/auth/register')
                .send({ ...user, password: 'short' });
            expect(res.status).toBe(400);
        });

        it('rejects a non-string email (NoSQL-operator-injection shape)', async () => {
            const res = await request(ctx.app)
                .post('/api/auth/register')
                .send({ ...user, email: { $ne: null } });
            expect(res.status).toBe(400);
        });

        it('creates a user, sets a cookie, and never returns a JWT or password in the body', async () => {
            const res = await request(ctx.app).post('/api/auth/register').send(user);
            expect(res.status).toBe(201);
            expect(res.body.user).toMatchObject({ name: user.name, email: user.email });
            expect(res.body.user.password).toBeUndefined();
            expect(res.body.token).toBeUndefined();
            expect(res.headers['set-cookie']?.[0]).toMatch(/^token=/);
        });

        it('rejects a duplicate email', async () => {
            const res = await request(ctx.app).post('/api/auth/register').send(user);
            expect(res.status).toBe(400);
        });
    });

    describe('POST /api/auth/login', () => {
        it('rejects a nonexistent user', async () => {
            const res = await request(ctx.app)
                .post('/api/auth/login')
                .send({ email: 'nobody@example.com', password: 'whatever123' });
            expect(res.status).toBe(401);
        });

        it('rejects the wrong password', async () => {
            const res = await request(ctx.app)
                .post('/api/auth/login')
                .send({ email: user.email, password: 'wrongpassword123' });
            expect(res.status).toBe(401);
        });

        it('logs in with correct credentials and sets a cookie', async () => {
            const res = await request(ctx.app)
                .post('/api/auth/login')
                .send({ email: user.email, password: user.password });
            expect(res.status).toBe(200);
            expect(res.headers['set-cookie']?.[0]).toMatch(/^token=/);
        });
    });

    describe('session lifecycle', () => {
        let cookie;

        beforeAll(async () => {
            const res = await request(ctx.app)
                .post('/api/auth/login')
                .send({ email: user.email, password: user.password });
            cookie = res.headers['set-cookie'][0];
        });

        it('GET /api/auth/me is 401 without a cookie', async () => {
            const res = await request(ctx.app).get('/api/auth/me');
            expect(res.status).toBe(401);
        });

        it('GET /api/auth/me resolves the session with a valid cookie', async () => {
            const res = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
            expect(res.status).toBe(200);
            expect(res.body.user.email).toBe(user.email);
        });

        it('PUT /api/auth/theme rejects an invalid theme value', async () => {
            const res = await request(ctx.app)
                .put('/api/auth/theme')
                .set('Cookie', cookie)
                .send({ theme: 'neon' });
            expect(res.status).toBe(400);
        });

        it('PUT /api/auth/theme persists a valid theme', async () => {
            const res = await request(ctx.app)
                .put('/api/auth/theme')
                .set('Cookie', cookie)
                .send({ theme: 'light' });
            expect(res.status).toBe(200);

            const me = await request(ctx.app).get('/api/auth/me').set('Cookie', cookie);
            expect(me.body.user.theme).toBe('light');
        });

        it('POST /api/auth/logout clears the session', async () => {
            const logoutRes = await request(ctx.app).post('/api/auth/logout').set('Cookie', cookie);
            expect(logoutRes.status).toBe(200);

            // The cookie the client would now hold is the cleared one from
            // the Set-Cookie response, not the original session cookie.
            const clearedCookie = logoutRes.headers['set-cookie'][0];
            const me = await request(ctx.app).get('/api/auth/me').set('Cookie', clearedCookie);
            expect(me.status).toBe(401);
        });
    });
});
