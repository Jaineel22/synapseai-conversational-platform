import mongoose from "mongoose";

// Citation metadata for a RAG-grounded assistant reply — only ever present
// on messages generated with useKnowledge:true. Stored alongside the
// message (not looked up separately) so a reloaded thread shows the same
// sources the user originally saw, without re-running retrieval.
const SourceSchema = new mongoose.Schema({
    index: { type: Number, required: true },
    documentId: { type: String, required: true },
    filename: { type: String, required: true },
    page: { type: Number, default: null },
    score: { type: Number, required: true },
}, { _id: false });

const MessageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ["user", "assistant"],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    sources: {
        type: [SourceSchema],
        default: undefined,
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const ThreadSchema = new mongoose.Schema({
    threadId: {
        type: String,
        required: true,
        unique: true
    },
    userId: {                    // ← NEW FIELD
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        default: "New Chat"
    },
    messages: [MessageSchema],
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now 
    }
});

export default mongoose.model("Thread", ThreadSchema);