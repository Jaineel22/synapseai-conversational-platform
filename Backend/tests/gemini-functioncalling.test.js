import { describe, it, expect, vi, beforeEach } from 'vitest';

// Isolated mock of the Gemini SDK for this file only — separate from
// tests/helpers/testApp.js's shared mock, since this suite needs to
// control multiple sequential generateContentStream calls (the initial
// call plus the function-calling follow-up) rather than the app-level
// single-call default.
const generateContentStream = vi.fn();
vi.mock('@google/genai', () => {
    function GoogleGenAI() {
        return { models: { generateContentStream } };
    }
    return { GoogleGenAI: vi.fn(GoogleGenAI) };
});

process.env.GEMINI_API_KEY = 'test-gemini-key';

const { streamGeminiResponse } = await import('../utils/gemini.js');
const { TOOL_DECLARATIONS } = await import('../services/tools.js');

async function* asyncChunks(chunks) {
    for (const chunk of chunks) yield chunk;
}

async function collect(generator) {
    const out = [];
    for await (const delta of generator) out.push(delta);
    return out.join('');
}

describe('streamGeminiResponse — function calling', () => {
    beforeEach(() => {
        generateContentStream.mockReset();
    });

    it('streams plain text unchanged and never sends `tools` when none are passed', async () => {
        generateContentStream.mockResolvedValueOnce(asyncChunks([{ text: 'Hello ' }, { text: 'world.' }]));

        const contents = [{ role: 'user', parts: [{ text: 'hi' }] }];
        const text = await collect(streamGeminiResponse(contents));

        expect(text).toBe('Hello world.');
        expect(generateContentStream).toHaveBeenCalledTimes(1);
        expect(generateContentStream.mock.calls[0][0].config.tools).toBeUndefined();
    });

    it('executes the requested tool and streams the follow-up answer', async () => {
        generateContentStream
            .mockResolvedValueOnce(asyncChunks([{ text: undefined, functionCalls: [{ name: 'get_current_datetime', args: {} }] }]))
            .mockResolvedValueOnce(asyncChunks([{ text: 'Today is ' }, { text: 'some date.' }]));

        const contents = [{ role: 'user', parts: [{ text: 'what is the date today?' }] }];
        const text = await collect(streamGeminiResponse(contents, { tools: TOOL_DECLARATIONS }));

        expect(text).toBe('Today is some date.');
        expect(generateContentStream).toHaveBeenCalledTimes(2);

        // First call offered the tool.
        expect(generateContentStream.mock.calls[0][0].config.tools).toEqual([
            { functionDeclarations: TOOL_DECLARATIONS },
        ]);

        // Follow-up call carries the functionCall/functionResponse turns
        // and does NOT re-offer tools (bounds the call chain to one hop).
        const followUp = generateContentStream.mock.calls[1][0];
        expect(followUp.config.tools).toBeUndefined();
        expect(followUp.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);

        const functionResponse = followUp.contents[2].parts[0].functionResponse;
        expect(functionResponse.name).toBe('get_current_datetime');
        expect(functionResponse.response.iso8601).toBeDefined();
    });

    it('reports a tool execution failure back to the model instead of throwing', async () => {
        generateContentStream
            .mockResolvedValueOnce(asyncChunks([{ text: undefined, functionCalls: [{ name: 'nonexistent_tool', args: {} }] }]))
            .mockResolvedValueOnce(asyncChunks([{ text: "I couldn't do that." }]));

        const contents = [{ role: 'user', parts: [{ text: 'do the impossible' }] }];
        const text = await collect(streamGeminiResponse(contents, { tools: TOOL_DECLARATIONS }));

        expect(text).toBe("I couldn't do that.");
        const followUp = generateContentStream.mock.calls[1][0];
        expect(followUp.contents[2].parts[0].functionResponse.response.error).toMatch(/unknown tool/i);
    });

    it('returns no text and makes no follow-up call if the model calls a tool but the stream yields nothing else', async () => {
        generateContentStream.mockResolvedValueOnce(
            asyncChunks([{ text: undefined, functionCalls: [{ name: 'get_current_datetime', args: {} }] }])
        );
        generateContentStream.mockResolvedValueOnce(asyncChunks([]));

        const contents = [{ role: 'user', parts: [{ text: 'date?' }] }];
        const text = await collect(streamGeminiResponse(contents, { tools: TOOL_DECLARATIONS }));

        expect(text).toBe('');
        expect(generateContentStream).toHaveBeenCalledTimes(2);
    });
});
