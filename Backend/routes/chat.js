import express from "express";
import Thread from "../models/Thread.js";
import getGeminiAPIResponse from "../utils/gemini.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// All routes below require authentication
router.use(authMiddleware);

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
// Sends a message and returns AI reply
// ─────────────────────────────────────────
router.post("/chat", async (req, res) => {
  const { threadId, message } = req.body;

  if (!threadId || !message) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    let thread = await Thread.findOne({ threadId, userId: req.userId });

    if (!thread) {
      // New thread — title is set to the first message (truncated)
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

    const assistantReply = await getGeminiAPIResponse(message);

    thread.messages.push({ role: "assistant", content: assistantReply });
    thread.updatedAt = new Date();
    await thread.save();

    res.json({ reply: assistantReply });
  } catch (err) {
    console.error("Chat endpoint error:", err);
    res.status(500).json({ error: "Something went wrong", details: err.message });
  }
});

export default router;
