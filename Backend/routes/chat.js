import express from "express";
import { z } from "zod";
import Thread from "../models/Thread.js";
import { streamGeminiResponse, buildGeminiContents, MAX_CONTEXT_MESSAGES } from "../utils/gemini.js";
import authMiddleware from "../middleware/auth.js";
import validateBody from "../middleware/validate.js";
import { chatLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// All routes below require authentication
router.use(authMiddleware);

const chatSchema = z.object({
  threadId: z.string().trim().min(1, "threadId is required").max(200, "threadId is too long"),
  message: z.string().trim().min(1, "Message cannot be empty").max(8000, "Message is too long (max 8000 characters)"),
});

// ─────────────────────────────────────────
// GET /api/thread
// Returns all threads for the logged-in user
// ─────────────────────────────────────────
router.get("/thread", async (req, res) => {
  try {
    const threads = await Thread.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .select("threadId title updatedAt"); // only send what frontend needs
    res.json(threads);
  } catch (err) {
    console.error("Fetch threads error:", err);
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

// ─────────────────────────────────────────
// GET /api/thread/:threadId
// Returns messages for a specific thread
// ─────────────────────────────────────────
router.get("/thread/:threadId", async (req, res) => {
  const { threadId } = req.params;
  try {
    const thread = await Thread.findOne({ threadId, userId: req.userId });
    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }
    res.json(thread.messages);
  } catch (err) {
    console.error("Fetch chat error:", err);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

// ─────────────────────────────────────────
// DELETE /api/thread/:threadId  ← THE KEY FIX
// Deletes a thread owned by the logged-in user
// ─────────────────────────────────────────
router.delete("/thread/:threadId", async (req, res) => {
  const { threadId } = req.params;
  try {
    const deletedThread = await Thread.findOneAndDelete({
      threadId,
      userId: req.userId, // ensures users can only delete their own threads
    });

    if (!deletedThread) {
      return res.status(404).json({ error: "Thread not found or unauthorized" });
    }

    res.status(200).json({ success: "Thread deleted successfully" });
  } catch (err) {
    console.error("Delete thread error:", err);
    res.status(500).json({ error: "Failed to delete thread" });
  }
});

// ─────────────────────────────────────────
// POST /api/chat
// Sends a message and streams the AI reply back over SSE.
//
// Response is one of two shapes:
//   - Validation/auth failures that happen BEFORE generation starts are a
//     normal JSON error response (same as every other route), so the
//     frontend doesn't need special handling for those.
//   - Once generation starts, the response becomes an SSE stream of
//     `chunk` events (incremental text), followed by exactly one of
//     `done` or `error`.
// ─────────────────────────────────────────
router.post("/chat", chatLimiter, validateBody(chatSchema), async (req, res) => {
  const { threadId, message } = req.body;

  // Persist the user's message first, before touching Gemini at all, so it
  // survives even if generation fails outright (same guarantee as before).
  let thread;
  try {
    thread = await Thread.findOne({ threadId, userId: req.userId });

    if (!thread) {
      // New thread — title is set to the first message (truncated). A
      // fresh thread is always created scoped to req.userId, so a
      // client-supplied threadId can never be used to attach messages to
      // another user's thread — ownership is established here, not trusted
      // from the client.
      thread = new Thread({
        threadId,
        userId: req.userId,
        title: message.length > 40 ? message.substring(0, 40) + "..." : message,
        messages: [{ role: "user", content: message }],
      });
    } else {
      thread.messages.push({ role: "user", content: message });
    }

    await thread.save();
  } catch (err) {
    console.error("Chat: failed to save user message", err);
    return res.status(500).json({ error: "Failed to save message" });
  }

  // ─── Begin SSE stream ─────────────────────────────────────
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Defensive: prevents any nginx-style reverse proxy in front of this
    // service from buffering the response instead of forwarding it live.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const abortController = new AbortController();
  let clientClosed = false;
  const onClientGone = () => {
    clientClosed = true;
    abortController.abort();
  };
  // res's close event is the one that reliably fires for an
  // already-streaming response in this Express/Node setup; req's close
  // event is bound too as defensive redundancy in case that differs
  // across environments (e.g. behind Render's proxy layer).
  req.on("close", onClientGone);
  res.on("close", onClientGone);

  const startedAt = Date.now();
  let fullText = "";

  try {
    // The just-saved user message is already the last entry in
    // thread.messages, so slicing the window here naturally includes it
    // without any risk of sending it twice.
    const contextWindow = thread.messages.slice(-MAX_CONTEXT_MESSAGES);
    const contents = buildGeminiContents(contextWindow);

    console.log(`[chat] generation started thread=${threadId} user=${req.userId}`);

    for await (const delta of streamGeminiResponse(contents, { abortSignal: abortController.signal })) {
      // The Gemini SDK's abortSignal is documented as "client-only" — it
      // does not reliably stop the async generator from yielding further
      // chunks that may already be in flight. Checking clientClosed here
      // on every iteration is what actually guarantees we stop forwarding
      // chunks and, more importantly, never persist a reply for a request
      // the client already gave up on.
      if (clientClosed) break;
      fullText += delta;
      sendEvent("chunk", { text: delta });
    }

    if (clientClosed) {
      console.log(`[chat] generation stopped: client disconnected thread=${threadId}`);
      return;
    }

    if (!fullText) {
      throw new Error("Empty response received from Gemini");
    }

    // Persist the complete assistant reply once generation finishes
    // successfully — never write individual streamed chunks to MongoDB.
    thread.messages.push({ role: "assistant", content: fullText });
    thread.updatedAt = new Date();
    await thread.save();

    console.log(`[chat] generation completed thread=${threadId} durationMs=${Date.now() - startedAt}`);

    sendEvent("done", {});
    res.end();
  } catch (err) {
    if (clientClosed) {
      // The connection is already gone — nothing to send, and an
      // obviously-incomplete reply is intentionally not persisted.
      console.log(`[chat] generation stopped: client disconnected thread=${threadId}`);
      return;
    }
    console.error(`[chat] generation failed thread=${threadId}`, err);
    sendEvent("error", { error: err.message || "Something went wrong" });
    res.end();
  }
});

export default router;
