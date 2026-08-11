import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

// Initialize Google GenAI with API key from environment variables
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3-flash-preview";

// How many recent messages (user + assistant combined) from a thread are
// sent to Gemini as conversation context. Bounded so a long-running thread
// doesn't grow the request payload/latency/token usage indefinitely — recent
// context matters far more than the full history for a chat assistant.
// Overridable via env for tuning without a code change.
export const MAX_CONTEXT_MESSAGES = Number(process.env.MAX_CONTEXT_MESSAGES) || 20;

// Centralized system instruction — the one place SynapseAI's model behavior
// is defined, so route/controller code never needs to know about prompting.
const SYSTEM_INSTRUCTION = [
    "You are SynapseAI, a helpful, knowledgeable conversational assistant.",
    "Answer clearly and concisely. Use Markdown formatting (including fenced",
    "code blocks with a language tag) when it improves readability.",
    "If you are not sure about something, say so instead of guessing.",
].join(" ");

// Hard ceiling on how long a single Gemini call is allowed to run. Without
// this, a stalled request (e.g. the undiagnosed cold-start hang observed
// during Phase 0's baseline testing) would leave the client waiting
// indefinitely with no error ever surfaced. Overridable via env for tuning.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 60_000;

// Mongoose stores roles as "user" | "assistant" (matches the app's own
// domain language). The Gemini API requires "user" | "model" for turns.
// This mapping is the only place that translation happens.
const toGeminiRole = (role) => (role === "assistant" ? "model" : "user");

/**
 * Converts a thread's stored messages (already truncated to the desired
 * window by the caller) into the Content[] shape @google/genai expects.
 */
export const buildGeminiContents = (messages) =>
    messages.map((m) => ({
        role: toGeminiRole(m.role),
        parts: [{ text: m.content }],
    }));

const describeGeminiError = (err) => {
    // @google/genai's ApiError always carries the real HTTP status code —
    // check that first. It's far more reliable than matching substrings in
    // the raw error message, which is often a nested JSON blob that can
    // accidentally contain misleading words (e.g. a quota error's message
    // includes the model name, which previously caused it to be misread as
    // "model not available" instead of a rate limit).
    const status = err?.status;
    if (status === 401 || status === 403) return new Error("Invalid or missing Gemini API key");
    if (status === 404) return new Error("Gemini model not available. Check model name and API version");
    if (status === 429) return new Error("Gemini is temporarily rate-limited. Please try again in a moment.");
    if (typeof status === "number" && status >= 500) return new Error("Gemini API is temporarily unavailable. Please try again.");

    // Errors without a status are ones we threw ourselves locally
    // (missing API key, invalid input) — safe to match by message.
    const message = err?.message || String(err);
    if (message.includes("API key")) return new Error("Invalid or missing Gemini API key");
    if (message.includes("fetch")) return new Error("Network error while calling Gemini API");
    return new Error(`Gemini API error: ${message}`);
};

/**
 * Streaming generation, given pre-built conversation context. Returns an
 * async generator yielding text deltas as they arrive from Gemini.
 *
 * `abortSignal` lets the caller stop consuming early (e.g. the client
 * disconnected or clicked "Stop"). Per the SDK's own docs this only stops
 * the client from continuing to read/forward the response — it does not
 * guarantee the upstream generation job itself is cancelled server-side.
 */
export async function* streamGeminiResponse(contents, { abortSignal } = {}) {
    if (!Array.isArray(contents) || contents.length === 0) {
        throw new Error("contents must be a non-empty array");
    }
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY not found in environment variables");
    }

    const timeoutSignal = AbortSignal.timeout(GEMINI_TIMEOUT_MS);
    const combinedSignal = abortSignal ? AbortSignal.any([abortSignal, timeoutSignal]) : timeoutSignal;

    let stream;
    try {
        stream = await ai.models.generateContentStream({
            model: MODEL,
            contents,
            config: { systemInstruction: SYSTEM_INSTRUCTION, abortSignal: combinedSignal },
        });
    } catch (err) {
        if (timeoutSignal.aborted) throw new Error("Gemini request timed out. Please try again.");
        throw describeGeminiError(err);
    }

    try {
        for await (const chunk of stream) {
            if (chunk.text) {
                yield chunk.text;
            }
        }
    } catch (err) {
        if (timeoutSignal.aborted) throw new Error("Gemini request timed out. Please try again.");
        // AbortError at this point came from the caller's own abortSignal
        // (client disconnected / clicked Stop) — let it propagate as-is so
        // the caller can distinguish "user stopped it" from "Gemini
        // actually failed".
        if (err?.name === "AbortError") throw err;
        throw describeGeminiError(err);
    }
}
