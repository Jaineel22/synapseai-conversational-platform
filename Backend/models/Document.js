import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    filename: {
        type: String,
        required: true,
        trim: true,
        maxlength: 255,
    },
    fileType: {
        type: String,
        enum: ['pdf', 'txt', 'md', 'docx'],
        required: true,
    },
    fileSize: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['processing', 'ready', 'failed'],
        default: 'processing',
    },
    error: {
        type: String,
        default: null,
    },
    chunkCount: {
        type: Number,
        default: 0,
    },
    pageCount: {
        type: Number,
        default: null,
    },
}, { timestamps: true });

DocumentSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Document", DocumentSchema);
