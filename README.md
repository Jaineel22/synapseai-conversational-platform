# SynapseAI

An authenticated AI conversational platform with Retrieval-Augmented Generation, built on Google Gemini — real-time streaming responses, persistent per-user conversation history, document ingestion with semantic search, grounded/cited answers, and JWT/httpOnly-cookie authentication.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-Express_5-339933?style=flat-square&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Gemini](https://img.shields.io/badge/Google-Gemini_AI-4285F4?style=flat-square&logo=google&logoColor=white)
![Vitest](https://img.shields.io/badge/Tested_with-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)

---

## Table of Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Authentication](#authentication)
- [AI architecture](#ai-architecture)
- [RAG: document knowledge base](#rag-document-knowledge-base)
- [Database](#database)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Deployment](#deployment)

---

## What it does

SynapseAI is a private, account-based chat interface over Google Gemini. Users register, log in, and get their own space of persistent conversation threads. Unlike a bare API wrapper around an LLM, the backend maintains real multi-turn context — the model actually receives the recent conversation history on every turn, not just the latest message — and responses stream to the browser incrementally as they're generated.

Users can also upload their own documents (PDF, TXT, Markdown, DOCX) and ask questions grounded in them: the backend extracts and chunks the text, generates real semantic embeddings, retrieves the most relevant chunks for a question via vector similarity search, and has Gemini answer using that retrieved context — with structured source citations (document + page) back to the client. Retrieval is strictly isolated per user; nobody can retrieve another user's document content.

## Architecture

```
Vercel (React + Vite)  --HTTPS, credentials-->  Render (Node + Express)  --+--> MongoDB Atlas (users/threads/documents/chunks)
                                                                             +--> Google Gemini (@google/genai — generation + embeddings)
```

The frontend and backend are deployed independently on different origins; the backend is a normal long-running Express process (not serverless), reachable at a fixed URL, with a `GET /health` endpoint for the host's health checks.

**RAG pipeline** (see [RAG: document knowledge base](#rag-document-knowledge-base) for details):

```
User uploads a document
  ↓
Express (multer, in-memory) → extension + magic-byte validation
  ↓
Text extraction (pdf-parse / mammoth / plain read) — per-page where available
  ↓
Chunking (paragraph/sentence-aware, configurable size + overlap)
  ↓
Embedding (Gemini gemini-embedding-001, batched)
  ↓
Chunks + embeddings stored in MongoDB, Document marked "ready"

User asks a question with "Ask my documents" on
  ↓
Query embedded (Gemini, RETRIEVAL_QUERY)
  ↓
Cosine similarity search over the user's own chunks (ownership enforced in the DB query)
  ↓
Top-K chunks above a similarity floor → labeled context block
  ↓
Gemini (with a grounding + prompt-injection-boundary system instruction)
  ↓
Streamed, cited answer
```

## Features

- Email/password registration and login, JWT session in an httpOnly cookie
- Session restoration on page reload (via `GET /api/auth/me`, not by reading the cookie client-side — it can't be, by design)
- Persistent, per-user chat threads — create, switch, delete
- **Real conversation memory**: recent thread history (bounded, configurable) is sent to Gemini as context on every turn, with a centralized system instruction
- **Real Server-Sent-Events streaming**: responses render incrementally as Gemini generates them, not a client-side animation over an already-complete response
- Stop-generation control (client-side abort of an in-progress response)
- **Retrieval-Augmented Generation**: upload PDF/TXT/Markdown/DOCX documents, ask questions grounded in them, get structured source citations (document + page) — see [below](#rag-document-knowledge-base)
- Dark / light theme, persisted per account
- Markdown + syntax-highlighted code block rendering
- Input validation (Zod) on every request body
- Rate limiting on authentication, chat, and document-upload endpoints
- Standard security headers (Helmet) and strict single-origin CORS

## Tech stack

**Frontend** — React 19, Vite, Axios, `fetch`/`ReadableStream` for SSE consumption, React Markdown, rehype-highlight, Font Awesome, uuid

**Backend** — Node.js, Express 5, Mongoose (MongoDB), JWT, bcryptjs, Zod, express-rate-limit, Helmet, `@google/genai` (chat generation **and** embeddings), multer, pdf-parse, mammoth

**Testing** — Vitest across both packages; Supertest + an in-memory MongoDB instance for backend integration tests (with the Gemini SDK mocked — no test ever makes a real API call); React Testing Library for frontend component tests

**Deployment** — Frontend on Vercel, backend on Render (a normal Node web service, not serverless), MongoDB Atlas

## Authentication

JWT, signed server-side and stored in an `httpOnly` cookie — never exposed to frontend JavaScript. `secure`/`sameSite` cookie flags are environment-aware, correct for the cross-origin Vercel↔Render split in production. Passwords are hashed with bcrypt. Every thread/chat operation is scoped server-side to the authenticated user's ID — a user cannot read, modify, or delete another user's data, and a client-supplied thread ID is never trusted for ownership.

## AI architecture

- **Provider**: Google Gemini, via the `@google/genai` SDK (`ai.models.generateContentStream`) — one provider, no unused SDKs.
- **Memory**: on each `POST /api/chat`, the last N messages (`MAX_CONTEXT_MESSAGES`, default 20, env-overridable) from the thread — including the message just sent — are converted to Gemini's `{role, parts}` format and sent as conversation context. The app's own `"assistant"` role is translated to Gemini's required `"model"` at this one boundary.
- **System instruction**: centralized in `Backend/utils/gemini.js`, not scattered across route files.
- **Streaming**: `generateContentStream` yields incremental text deltas, forwarded to the client as SSE `chunk` events as they arrive; the complete reply is persisted to MongoDB exactly once, only after generation finishes successfully — individual chunks are never written to the database.
- **Timeouts & cancellation**: a hard timeout (`GEMINI_TIMEOUT_MS`, default 60s) bounds every call. A client disconnect or explicit Stop click aborts the stream and skips persisting an incomplete reply.
- **Error handling**: Gemini's `ApiError` status code drives user-facing error messages (rate-limited, invalid key, model unavailable, etc.) rather than fragile string matching.

## RAG: document knowledge base

### Why in-app cosine similarity instead of a vector database

MongoDB (Atlas) is already this project's only database. MongoDB Atlas Vector Search was considered and is the natural upgrade path, but was **not** used for Phase 5 for two concrete reasons: it requires manually creating a vector search index via the Atlas dashboard (a step that can't be verified or automated from the codebase), and its `$vectorSearch` aggregation stage doesn't run against the `mongodb-memory-server` instance the test suite uses locally/in CI — meaning retrieval logic would be untestable without a live Atlas cluster.

Instead, chunk embeddings are stored as plain number arrays on each chunk document, and semantic search computes cosine similarity **in the Node process**, over chunks pre-filtered to the requesting user by the MongoDB query itself. This adds zero infrastructure, runs identically in dev/test/prod, and is fully unit-testable. The tradeoff is that it reads every one of a user's (optionally document-scoped) chunks per query — a deliberate, documented choice that's appropriate at a personal/small-team document-set scale. If retrieval volume ever outgrows that, `Backend/services/retrieval.js` is the single place to swap in `$vectorSearch` (or an external vector DB) without changing its input/output contract.

### Pipeline

1. **Upload** (`POST /api/documents`) — multer holds the file in memory only (nothing is ever written to disk — Render's filesystem is ephemeral anyway). Extension is checked against an allowlist (`.pdf`, `.txt`, `.md`, `.docx`), and the actual file content is sniffed (PDF/DOCX magic bytes; txt/md rejected if they look like binary data) — the client-declared MIME type is never trusted alone. Size is capped (`DOCUMENT_MAX_FILE_SIZE_MB`).
2. **Processing** (`Backend/services/documentProcessing.js`) — runs after the upload response is already sent (the client gets the new `Document` back immediately with `status: "processing"`); no queue/Redis involved, just an async function the route doesn't await. Each stage is its own module:
   - `services/textExtraction.js` — `pdf-parse` (per-page, via a custom page-render callback) / `mammoth` (docx) / plain UTF-8 read (txt/md).
   - `services/chunking.js` — paragraph-first, sentence-fallback chunking with configurable size/overlap (`RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`); a chunk shorter than `RAG_MIN_CHUNK_SIZE` is merged into its neighbor rather than emitted as a near-empty orphan. PDF chunking is done per-page, so each chunk carries an exact page number.
   - `services/embeddingService.js` — wraps `ai.models.embedContent` (Gemini `gemini-embedding-001`, `taskType: RETRIEVAL_DOCUMENT`), batched (`EMBEDDING_BATCH_SIZE`) so a whole document costs a handful of API calls, not one per chunk.
   - Chunks + embeddings are saved, and the `Document` is marked `ready` (with `chunkCount`/`pageCount`) or `failed` (with a user-safe `error` message — never a raw stack trace or parser exception).
3. **Retrieval** (`Backend/services/retrieval.js`) — the query is embedded with `taskType: RETRIEVAL_QUERY` (the asymmetric counterpart to `RETRIEVAL_DOCUMENT`), compared via cosine similarity against the user's own chunks (`Chunk.find({ userId, ... })` — ownership is a MongoDB query condition, not an app-layer filter applied after the fact), filtered by a similarity floor (`RAG_MIN_SIMILARITY`) and capped at `RAG_TOP_K`.
4. **Generation** (`Backend/services/ragPrompt.js`, wired into the existing `POST /api/chat`) — retrieved chunks are formatted into a labeled `[Source N]` context block (each capped at `RAG_MAX_CHUNK_CHARS_IN_PROMPT`) and appended to the current turn only; earlier conversation turns are untouched, so multi-turn memory keeps working. A RAG-specific system instruction explicitly tells Gemini retrieved text is **untrusted reference data, not instructions** — a real (not foolproof) prompt-injection defense against a document containing text like "ignore previous instructions."
5. **Citations** — structured source metadata (`filename`, `page`, similarity `score`) is sent to the client on the SSE `done` event and persisted on the assistant's message in MongoDB, so citations survive a page reload.

### Using it

The chat composer has an "Ask my documents" toggle (disabled until at least one document finishes processing). When it's on, `POST /api/chat` is sent `useKnowledge: true` (and optionally `documentIds` to scope to specific documents); when it's off, the request body is unchanged from before Phase 5 and no retrieval happens at all.

## Database

MongoDB via Mongoose, four collections:

- **User** — `name`, `email` (unique), `password` (bcrypt hash), `theme`, `createdAt`
- **Thread** — `threadId` (unique), `userId` (ref User), `title`, `messages[]` (embedded subdocuments: `role`, `content`, `sources[]` — optional, only on RAG-grounded replies — `timestamp`), `createdAt`, `updatedAt`
- **Document** — `userId` (ref User), `filename`, `fileType` (`pdf`/`txt`/`md`/`docx`), `fileSize`, `status` (`processing`/`ready`/`failed`), `error`, `chunkCount`, `pageCount`, `createdAt`, `updatedAt`. Raw file bytes are never persisted — only this metadata and the chunks derived from it.
- **Chunk** — `documentId` (ref Document), `userId` (ref User — denormalized so retrieval never needs a join to enforce ownership), `text`, `embedding[]` (numbers), `page`, `chunkIndex`, `createdAt`

## API reference

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | No | Create a new account |
| POST | `/login` | No | Log in, receive session cookie |
| POST | `/logout` | No | Clear the session cookie |
| GET | `/me` | ✅ | Get the current authenticated user |
| PUT | `/theme` | ✅ | Update theme preference |

### Threads & chat — `/api`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/thread` | ✅ | List the current user's threads |
| GET | `/thread/:threadId` | ✅ | Get a thread's messages |
| DELETE | `/thread/:threadId` | ✅ | Delete a thread |
| POST | `/chat` | ✅ | Send a message; streams the reply back over SSE. Body accepts optional `useKnowledge: boolean` and `documentIds: string[]` to enable RAG for that turn — omitted entirely, behavior is identical to pre-Phase-5 |

### Documents (RAG) — `/api/documents`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/` | ✅ | Upload a document (`multipart/form-data`, field name `file`); returns immediately with `status: "processing"` while extraction/chunking/embedding run in the background |
| GET | `/` | ✅ | List the current user's documents |
| GET | `/:id` | ✅ | Get one document's status/metadata |
| DELETE | `/:id` | ✅ | Delete a document and cascade-delete its chunks |

### Other

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Liveness check (used by Render), independent of DB state |

## Project structure

```
SynapseAI/
├── Backend/
│   ├── server.js                # Entry point, middleware, health check, startup
│   ├── config/
│   │   └── rag.js               # All RAG/document-pipeline tuning constants, env-overridable
│   ├── middleware/
│   │   ├── auth.js              # JWT verification
│   │   ├── validate.js          # Zod request-body validation
│   │   └── rateLimiter.js       # Auth + chat + document-upload rate limits
│   ├── models/
│   │   ├── User.js
│   │   ├── Thread.js
│   │   ├── Document.js          # Uploaded document metadata + processing status
│   │   └── Chunk.js             # Chunk text + embedding + page, owned by a Document/User
│   ├── routes/
│   │   ├── auth.js
│   │   ├── chat.js              # Normal chat + RAG-augmented chat (same endpoint)
│   │   └── documents.js         # Upload / list / get / delete
│   ├── services/
│   │   ├── textExtraction.js    # pdf-parse / mammoth / plain text, per-page where possible
│   │   ├── chunking.js          # Paragraph/sentence-aware chunking
│   │   ├── embeddingService.js  # Gemini embedContent wrapper (documents + queries)
│   │   ├── documentProcessing.js # Orchestrates extract -> chunk -> embed -> persist
│   │   ├── retrieval.js         # Ownership-scoped cosine-similarity search
│   │   └── ragPrompt.js         # Grounding system instruction + context-block prompt building
│   ├── utils/
│   │   └── gemini.js            # Gemini streaming, context building, system instruction
│   └── tests/                   # Vitest + Supertest integration tests
│
└── Frontend/
    └── src/
        ├── App.jsx              # Auth bootstrap, theme, top-level view
        ├── MyContext.jsx / ThemeContext.jsx
        ├── Sidebar.jsx          # Thread list & navigation
        ├── ChatWindow.jsx       # Input, streaming consumption, Stop control, knowledge toggle
        ├── Chat.jsx             # Message rendering + source citations
        ├── DocumentsPanel.jsx   # Upload / status / delete modal
        ├── api/documents.js     # Documents API client
        ├── AuthScreen.jsx / AuthPanel.jsx  # Login / register form
        └── tests/               # Vitest + React Testing Library component tests
```

## Local setup

**Prerequisites**: Node.js 18+, a MongoDB connection string (local or [Atlas](https://www.mongodb.com/cloud/atlas)), a [Gemini API key](https://aistudio.google.com/).

```bash
# Backend
cd Backend
npm install
cp .env.example .env   # fill in real values — never commit .env
npm run dev             # http://localhost:8080

# Frontend (separate terminal)
cd Frontend
npm install
npm run dev              # http://localhost:5173, proxies /api to localhost:8080
```

## Environment variables

Names only — see `Backend/.env.example` / `Frontend/.env.example` for details, never commit real values.

**Backend** (`Backend/.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Defaults to `8080`. Render sets this automatically in production. |
| `NODE_ENV` | Effectively yes | Controls cookie `secure`/`sameSite` flags — must be `production` in any real deployment. |
| `MONGODB_URI` | ✅ | MongoDB connection string. |
| `JWT_SECRET` | ✅ | Secret for signing JWTs. |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key. |
| `CLIENT_ORIGIN` | ✅ | Exact origin of the deployed frontend, used for CORS. |
| `MAX_CONTEXT_MESSAGES` | No | Conversation-memory window size (default 20). |
| `GEMINI_TIMEOUT_MS` | No | Per-request Gemini timeout (default 60000). |
| `AUTH_RATE_LIMIT` | No | Requests per 15 min per IP on register/login (default 20). |
| `CHAT_RATE_LIMIT` | No | Requests per minute per user on chat (default 15). |
| `DOCUMENT_UPLOAD_RATE_LIMIT` | No | Uploads per 15 min per user (default 20). |
| `EMBEDDING_MODEL` | No | Gemini embedding model (default `gemini-embedding-001`). |
| `EMBEDDING_DIMENSIONS` | No | Stored embedding vector size (default 768) — see the note in `.env.example` before changing this on data that already exists. |
| `EMBEDDING_BATCH_SIZE` | No | Chunk texts per embedding API call (default 50). |
| `RAG_CHUNK_SIZE` / `RAG_CHUNK_OVERLAP` / `RAG_MIN_CHUNK_SIZE` | No | Chunking tuning (defaults 1200 / 200 / 100 characters). |
| `RAG_TOP_K` | No | Chunks retrieved per RAG query (default 5). |
| `RAG_MIN_SIMILARITY` | No | Cosine-similarity floor, 0-1 (default 0.55). |
| `RAG_MAX_CHUNK_CHARS_IN_PROMPT` | No | Per-chunk cap when building the prompt (default 1500). |
| `DOCUMENT_MAX_FILE_SIZE_MB` | No | Max upload size in MB (default 10). |

**Frontend** (`Frontend/.env.development` / hosting platform settings)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No in dev | Backend origin. Empty locally (Vite proxy handles it); set to the deployed backend URL in production. |

## Testing

```bash
# Backend — Supertest against a real Express app + in-memory MongoDB,
# Gemini calls (both generation and embeddings) mocked — no network, no API cost
cd Backend
npm test

# Frontend — React Testing Library
cd Frontend
npm test
npm run lint
npm run build
```

Backend tests cover: registration/login validation and failure modes, session lifecycle, thread CRUD and cross-user isolation, streamed chat responses and persistence, conversation-memory context construction, rate limiting, text extraction (valid/empty/unsupported/corrupted documents), chunking (short/long text, overlap, page metadata preservation), the embedding service (batching, ordering, error mapping — mocked), retrieval (real in-memory MongoDB + fake deterministic vectors — ranking, similarity floor, top-K, ownership isolation, document-scoped search), the documents API (upload validation, full processing pipeline to `ready`, ownership isolation, cascading delete), and RAG chat (prompt construction, citation propagation, graceful retrieval failure, ownership). Frontend tests cover: SSE stream consumption and UI state transitions in `ChatWindow`, the "Ask my documents" toggle and its effect on the request body, the login/register form, the sidebar's two-step delete confirmation, the Documents panel (list/upload/error/delete states), and source-citation rendering in `Chat`.

No test in either package makes a real Gemini API call — every AI call (chat generation and embeddings) is mocked with deterministic fixtures, so the suite runs the same whether or not the Gemini API key currently has quota available.

## Deployment

- **Frontend**: Vercel. `VITE_API_URL` (a build-time variable) must point at the Render backend's URL.
- **Backend**: Render, as a persistent Node web service — build command `npm install`, start command `npm start`, health check path `/health`. `NODE_ENV=production` must be set explicitly (Render doesn't guarantee this the way some platforms do, and the app's cookie security depends on it). A `vercel.json` is still present in `Backend/` as a dormant rollback path from before the Render migration; it isn't used in the current deployment.
- **Database**: MongoDB Atlas. No manual index/dashboard configuration is required for RAG — retrieval runs in-app (see [RAG: document knowledge base](#rag-document-knowledge-base)) against the same collections/connection every other feature already uses.
- **Document uploads**: processed entirely in memory; nothing is written to Render's (ephemeral) filesystem, so this requires no persistent disk or object storage add-on.
