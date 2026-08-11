import mongoose from "mongoose";

// userId is denormalized here (also reachable via documentId -> Document)
// so retrieval can be scoped to the requesting user with a single indexed
// query condition, without a join/populate on every search.
const ChunkSchema = new mongoose.Schema({
    documentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Document',
        required: true,
        index: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    text: {
        type: String,
        required: true,
    },
    embedding: {
        type: [Number],
        required: true,
    },
    page: {
        type: Number,
        default: null,
    },
    chunkIndex: {
        type: Number,
        required: true,
    },
}, { timestamps: { createdAt: true, updatedAt: false } });

ChunkSchema.index({ userId: 1, documentId: 1 });

export default mongoose.model("Chunk", ChunkSchema);
