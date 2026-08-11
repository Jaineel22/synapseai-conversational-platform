import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createTestApp, closeTestApp } from './helpers/testApp.js';

describe('smoke', () => {
    let ctx;

    beforeAll(async () => {
        ctx = await createTestApp();
    });

    afterAll(async () => {
        await closeTestApp(ctx);
    });

    it('GET /health returns ok without touching the database', async () => {
        const res = await request(ctx.app).get('/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok' });
    });

    it('GET /api/thread without auth returns 401', async () => {
        const res = await request(ctx.app).get('/api/thread');
        expect(res.status).toBe(401);
    });
});
