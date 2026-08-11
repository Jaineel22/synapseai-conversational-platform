# SynapseAI

A full-stack, context-aware AI chat application built on Google Gemini — real-time streaming responses, persistent per-user conversation history, and JWT/httpOnly-cookie authentication.

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

## Architecture

```
Vercel (React + Vite)  --HTTPS, credentials-->  Render (Node + Express)  --+--> MongoDB Atlas (threads/users)
                                                                             +--> Google Gemini (@google/genai)
```

The frontend and backend are deployed independently on different origins; the backend is a normal long-running Express process (not serverless), reachable at a fixed URL, with a `GET /health` endpoint for the host's health checks.

## Features

- Email/password registration and login, JWT session in an httpOnly cookie
- Session restoration on page reload (via `GET /api/auth/me`, not by reading the cookie client-side — it can't be, by design)
- Persistent, per-user chat threads — create, switch, delete
- **Real conversation memory**: recent thread history (bounded, configurable) is sent to Gemini as context on every turn, with a centralized system instruction
- **Real Server-Sent-Events streaming**: responses render incrementally as Gemini generates them, not a client-side animation over an already-complete response
- Stop-generation control (client-side abort of an in-progress response)
- Dark / light theme, persisted per account
- Markdown + syntax-highlighted code block rendering
- Input validation (Zod) on every request body
- Rate limiting on authentication and chat endpoints
- Standard security headers (Helmet) and strict single-origin CORS

## Tech stack

**Frontend** — React 19, Vite, Axios, `fetch`/`ReadableStream` for SSE consumption, React Markdown, rehype-highlight, Font Awesome, uuid

**Backend** — Node.js, Express 5, Mongoose (MongoDB), JWT, bcryptjs, Zod, express-rate-limit, Helmet, `@google/genai`

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

## Database

MongoDB via Mongoose, two collections:

- **User** — `name`, `email` (unique), `password` (bcrypt hash), `theme`, `createdAt`
- **Thread** — `threadId` (unique), `userId` (ref User), `title`, `messages[]` (embedded subdocuments: `role`, `content`, `timestamp`), `createdAt`, `updatedAt`

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
| POST | `/chat` | ✅ | Send a message; streams the reply back over SSE |

### Other

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Liveness check (used by Render), independent of DB state |

## Project structure

```
SynapseAI/
├── Backend/
│   ├── server.js                # Entry point, middleware, health check, startup
│   ├── middleware/
│   │   ├── auth.js              # JWT verification
│   │   ├── validate.js          # Zod request-body validation
│   │   └── rateLimiter.js       # Auth + chat rate limits
│   ├── models/
│   │   ├── User.js
│   │   └── Thread.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── chat.js
│   ├── utils/
│   │   └── gemini.js            # Gemini streaming, context building, system instruction
│   └── tests/                   # Vitest + Supertest integration tests
│
└── Frontend/
    └── src/
        ├── App.jsx              # Auth bootstrap, theme, top-level view
        ├── MyContext.jsx / ThemeContext.jsx
        ├── Sidebar.jsx          # Thread list & navigation
        ├── ChatWindow.jsx       # Input, streaming consumption, Stop control
        ├── Chat.jsx             # Message rendering
        ├── AuthModal.jsx        # Login / register form
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

**Frontend** (`Frontend/.env.development` / hosting platform settings)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No in dev | Backend origin. Empty locally (Vite proxy handles it); set to the deployed backend URL in production. |

## Testing

```bash
# Backend — Supertest against a real Express app + in-memory MongoDB,
# Gemini calls mocked (no network, no API cost)
cd Backend
npm test

# Frontend — React Testing Library
cd Frontend
npm test
npm run lint
npm run build
```

Backend tests cover: registration/login validation and failure modes, session lifecycle, thread CRUD and cross-user isolation, streamed chat responses and persistence, conversation-memory context construction, and rate limiting. Frontend tests cover: SSE stream consumption and UI state transitions in `ChatWindow`, the login/register form, and the sidebar's two-step delete confirmation.

## Deployment

- **Frontend**: Vercel. `VITE_API_URL` (a build-time variable) must point at the Render backend's URL.
- **Backend**: Render, as a persistent Node web service — build command `npm install`, start command `npm start`, health check path `/health`. `NODE_ENV=production` must be set explicitly (Render doesn't guarantee this the way some platforms do, and the app's cookie security depends on it). A `vercel.json` is still present in `Backend/` as a dormant rollback path from before the Render migration; it isn't used in the current deployment.
- **Database**: MongoDB Atlas.
