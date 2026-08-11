import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocked the same way tests/helpers/testApp.js mocks it for the main app —
// no real network call, no API quota spent. Each test can further override
// the mock's behavior for specific scenarios (batching, errors).
const embedContent = vi.fn();
vi.mock('@google/genai', () => {
    function GoogleGenAI() {
        return { models: { embedContent } };
    }
    return { GoogleGenAI: vi.fn(GoogleGenAI) };
});

process.env.GEMINI_API_KEY = 'test-gemini-key';

const { embedDocumentChunks, embedQuery } = await import('../services/embeddingService.js');

describe('embeddingService', () => {
    beforeEach(() => {
        embedContent.mockReset();
    });

    it('embedDocumentChunks returns [] for an empty input without calling the API', async () => {
        const result = await embedDocumentChunks([]);
        expect(result).toEqual([]);
        expect(embedContent).not.toHaveBeenCalled();
    });

    it('embedDocumentChunks returns embeddings in the same order as the input texts', async () => {
        embedContent.mockResolvedValueOnce({
            embeddings: [{ values: [0.1, 0.2] }, { values: [0.3, 0.4] }, { values: [0.5, 0.6] }],
        });

        const result = await embedDocumentChunks(['a', 'b', 'c']);
        expect(result).toEqual([[0.1, 0.2], [0.3, 0.4], [0.5, 0.6]]);
        expect(embedContent).toHaveBeenCalledTimes(1);
        expect(embedContent.mock.calls[0][0]).toMatchObject({
            contents: ['a', 'b', 'c'],
            config: { taskType: 'RETRIEVAL_DOCUMENT' },
        });
    });

    it('embedDocumentChunks batches large inputs into multiple API calls', async () => {
        embedContent.mockImplementation(async ({ contents }) => ({
            embeddings: contents.map(() => ({ values: [1] })),
        }));

        const texts = Array.from({ length: 120 }, (_, i) => `chunk ${i}`);
        const result = await embedDocumentChunks(texts);

        expect(result).toHaveLength(120);
        // EMBEDDING_BATCH_SIZE default is 50 -> 120 texts = 3 calls
        expect(embedContent).toHaveBeenCalledTimes(3);
    });

    it('embedDocumentChunks surfaces a rate-limit error with a clear message', async () => {
        embedContent.mockRejectedValueOnce({ status: 429, message: 'quota exceeded' });
        await expect(embedDocumentChunks(['a'])).rejects.toThrow(/rate-limited/i);
    });

    it('embedQuery returns null for empty input without calling the API', async () => {
        expect(await embedQuery('')).toBeNull();
        expect(await embedQuery('   ')).toBeNull();
        expect(embedContent).not.toHaveBeenCalled();
    });

    it('embedQuery uses the RETRIEVAL_QUERY task type', async () => {
        embedContent.mockResolvedValueOnce({ embeddings: [{ values: [0.9, 0.8] }] });
        const result = await embedQuery('what is the refund policy?');

        expect(result).toEqual([0.9, 0.8]);
        expect(embedContent.mock.calls[0][0]).toMatchObject({
            contents: 'what is the refund policy?',
            config: { taskType: 'RETRIEVAL_QUERY' },
        });
    });

    it('embedQuery surfaces an invalid-key error with a clear message', async () => {
        embedContent.mockRejectedValueOnce({ status: 401, message: 'bad key' });
        await expect(embedQuery('hello')).rejects.toThrow(/api key/i);
    });
});
