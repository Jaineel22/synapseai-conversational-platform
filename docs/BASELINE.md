# SynapseAI — Phase 0 Baseline

Established: 2026-08-10
Scope: verification only. No application source files were modified, no dependencies were upgraded, no code was refactored. This document is the only intentional addition made during Phase 0.

---

## 1. Repository Snapshot

- **Branch:** `main`, tracking `origin/main` (`https://github.com/Jaineel22/synapseai-conversational-platform.git`)
- **Working tree at start of Phase 0:** clean, no uncommitted changes, no untracked files
- **Latest commit:** `b9c6297` — "fix: handle OPTIONS preflight in vercel.json"
- **Commit history (4 total):**
  1. `e775319` — Initial clean commit: SynapseAI conversational platform
  2. `229dcf6` — feat: production-ready config for Vercel + Render deployment
  3. `bc49c54` — feat: convert backend to Vercel serverless
  4. `b9c6297` — fix: handle OPTIONS preflight in vercel.json
- **Repository structure:** confirmed identical to the prior full architecture audit — two independent packages, `Backend/` and `Frontend/`, no monorepo tooling, no `docs/`, `tests/`, `docker/`, or `.github/` directories existed prior to this phase.

```
SynapseAI/
├── README.md
├── .gitignore
├── Backend/
│   ├── server.js, vercel.json, package.json, package-lock.json, .env
│   ├── middleware/auth.js
│   ├── models/User.js, models/Thread.js
│   ├── routes/auth.js, routes/chat.js
│   └── utils/gemini.js
└── Frontend/
    ├── index.html, vite.config.js, eslint.config.js, package.json, package-lock.json
    ├── .env.development
    └── src/ (App.jsx, MyContext.jsx, ThemeContext.jsx, Sidebar.jsx, ChatWindow.jsx, Chat.jsx, AuthModal.jsx, main.jsx, *.css, assets/)
```

### Git safety verification
- `.env` (Backend) is **not** tracked by git — correctly ignored.
- `.env.development` (Frontend) **is** tracked — this is intentional/harmless: it contains only `VITE_API_URL=` (empty), no secret.
- `node_modules/` is not tracked in either package.
- No build output (`dist/`) is tracked.
- No secret values appear anywhere in tracked git history based on the files currently in the repo.

---

## 2. Current Technology Stack

### Actually used (verified by import, not just by `package.json` presence)
- **Frontend:** React 19.2, Vite 7.3, Axios, react-markdown, rehype-highlight, highlight.js, js-cookie, uuid — all confirmed imported in `src/`.
- **Backend:** Express 5.2, Mongoose 9.2, jsonwebtoken 9, bcryptjs 3, cookie-parser, cors, dotenv, `@google/genai` 1.43 — all confirmed imported and exercised live during this phase's smoke test.

### Declared but unused/suspicious (re-confirmed this phase)
- `openai` (6.25.0) — installed, zero imports anywhere in source.
- `@google/generative-ai` (0.24.1) — installed, zero imports anywhere in source.
- `react-spinners` (0.17.0) — installed, zero imports anywhere in source (the loading indicator is a hand-built component).
- `nodemon` (3.1.14) — installed as a normal (not dev) dependency, but **no npm script invokes it** (see §3).

No new findings diverge from the prior full audit; this phase re-verified them against the live dependency tree (`npm ls --depth=0` in both packages matches `package.json` exactly, no missing/extraneous packages in either).

---

## 3. Backend Baseline

- **Entry point:** `server.js` — dual-mode: `app.listen()` locally (`NODE_ENV !== 'production'`), or exports the Express app for Vercel's serverless Node adapter.
- **npm scripts:** `Backend/package.json` has **no `scripts` block at all**. There is no `npm run dev` or `npm start`. Verified by direct inspection — this is not new since the last audit, but is re-confirmed here as a Phase 0 blocker: the backend was started for this phase via `node server.js` directly, not via an npm script, because none exists.
- **Routes:** 9 endpoints across `routes/auth.js` (`/api/auth/register`, `/login`, `/logout`, `/me`, `/theme`) and `routes/chat.js` (`/api/thread`, `/api/thread/:id`, `DELETE /api/thread/:id`, `POST /api/chat`) — all confirmed live and functioning during the smoke test in §7.
- **Controllers/services:** none — route handlers call Mongoose models and the Gemini wrapper directly.
- **Middleware:** `express.json()`, `cookie-parser`, `cors` (single `CLIENT_ORIGIN`), a custom per-request MongoDB-connect-with-caching middleware, and `authMiddleware` (JWT verification from cookie or `Authorization` header).
- **Authentication:** JWT signed with `JWT_SECRET`, stored in an httpOnly cookie; 7-day expiry; verified live — login issues a working session cookie, `/api/auth/me` correctly resolves it, and `/api/auth/logout` correctly invalidates it (post-logout `/me` returned 401).
- **Database:** MongoDB via Mongoose, reachable and functioning — confirmed live (see §7). Connection uses `tls: true, tlsAllowInvalidCertificates: true` (documented as a finding in §8, not fixed).
- **AI integration:** `utils/gemini.js` calls Google Gemini (`@google/genai`, model `gemini-3-flash-preview`) with a single non-streaming `generateContent` call, no conversation history, no system prompt. Verified live and working (see §7), after one transient failure on first attempt (see §9).
- **Deployment configuration:** `vercel.json` present and internally consistent with `server.js`'s serverless export pattern.

---

## 4. Frontend Baseline

- **Entry point:** `main.jsx` → `App.jsx`.
- **Components:** `Sidebar.jsx`, `ChatWindow.jsx` (with inline `SettingsModal`/`UpgradeModal`), `Chat.jsx`, `AuthModal.jsx` — structure unchanged from the prior audit.
- **State/context:** two React Contexts (`MyContext`, `ThemeContext`), no external state library, no routing library.
- **Styling:** per-component CSS files driven by a shared CSS custom-property token system in `index.css`; dark/light themes both fully defined.
- **API integration:** Axios, base URL from `VITE_API_URL` (empty in dev — Vite proxy handles `/api` → `localhost:8080`, confirmed in `vite.config.js`).
- **Current UX:** unchanged from the prior audit — Font Awesome icon classes are used with no icon library loaded (still unverified live in-browser this phase, since no browser-automation tool is available in this environment; verification here was at the network/compile level only, see §6 and §11).

---

## 5. Environment Configuration

Variable **names** only — no values reproduced.

| File | Variable | Required | Used by | Configured (non-empty)? |
|---|---|---|---|---|
| `Backend/.env` | `PORT` | No (defaults to 8080) | `server.js` | Yes |
| `Backend/.env` | `NODE_ENV` | Controls prod branching | `server.js`, `routes/auth.js` (cookie flags) | Yes (`development`) |
| `Backend/.env` | `MONGODB_URI` | Yes | `server.js` | Yes |
| `Backend/.env` | `JWT_SECRET` | Yes | `routes/auth.js`, `middleware/auth.js` | Yes |
| `Backend/.env` | `GEMINI_API_KEY` | Yes | `utils/gemini.js` | Yes |
| `Backend/.env` | `CLIENT_ORIGIN` | Yes (CORS) | `server.js` | Yes |
| `Frontend/.env.development` | `VITE_API_URL` | No in dev | `src/App.jsx` (axios base URL) | No (intentionally empty — proxy handles it) |

All required backend variables were present and functional — confirmed by successfully starting the server and exercising real DB and AI calls.

**⚠ Operational note (not a code issue):** during environment verification, a `Grep` search pattern intended to catch hardcoded secrets in source code was run too broadly and matched inside `Backend/.env` itself, causing the raw `MONGODB_URI` and `GEMINI_API_KEY` values to appear in one tool-output block earlier in this session's transcript. The file itself was never modified, committed, or transmitted anywhere by that action, and it remains correctly gitignored — but because the values are now visible in this conversation's history, you should treat them as at least potentially exposed and rotate both the Gemini API key and the MongoDB credentials as a precaution once convenient. This is documented here for transparency, not left implicit.

---

## 6. Build Verification

| Area | Command | Result | Notes |
|---|---|---|---|
| Backend startup | `node server.js` (no npm script exists) | **PASS** | Bound port 8080, connected to MongoDB, all 9 routes responded correctly (see §7) |
| Frontend dev startup | `npm run dev` | **PASS** | Vite ready in 1.55s on port 5173; root HTML and all 6 `.jsx` source files served/transformed without error (200 on each) |
| Frontend production build | `npm run build` | **PASS (with warning)** | 481 modules transformed, built in 7.9s; Rollup warned that the main JS chunk (546 kB / 172 kB gzipped) exceeds the 500 kB guideline — no code-splitting configured. Not a failure, informational only. |
| Backend build | n/a | **NOT APPLICABLE** | No build step exists or is needed — plain Node/ESM, no bundler/TypeScript |
| Lint | `npm run lint` (Frontend only — Backend has no lint config) | **FAIL (pre-existing)** | 1 error (`ChatWindow.jsx:25` — unused `reply` var) + 2 warnings (`App.jsx:46`, `Sidebar.jsx:22` — missing `useEffect` deps). All three existed before Phase 0; none were introduced or fixed this phase. |
| Tests | n/a | **NOT APPLICABLE** | No test framework installed in either package; no test files found anywhere outside `node_modules` |

---

## 7. Functional Smoke Test

Performed via direct API calls (`curl`) against the locally-running backend, since no browser-automation tool is available in this environment — this is a documented limitation, not a skipped step. A throwaway account (`phase0-baseline-test@synapseai.local`) was created for this purpose; see §11 for residual-data disclosure.

| Feature | Result | Notes |
|---|---|---|
| Application/backend startup | PASS | See §6 |
| Registration | PASS | `POST /api/auth/register` → 201, user created, session cookie issued |
| Login | PASS | `POST /api/auth/login` → 200, session cookie issued and later successfully reused |
| Session check (`/me`) | PASS | Cookie-based session correctly resolved to the registered user |
| Chat → Gemini response | PASS (after one transient failure — see §9) | On a fresh backend process, `POST /api/chat` returned a real Gemini-generated reply (`"PONG"` to an exact-instruction prompt) in ~2s and correctly appended both user and assistant messages to the thread |
| Thread persistence | PASS | `GET /api/thread/:id` returned both the user message and the assistant reply, in order, after the chat call |
| Thread list | PASS | `GET /api/thread` correctly listed the created thread for the authenticated user |
| Theme update | PASS | `PUT /api/auth/theme` persisted `"light"` and returned it |
| Thread deletion | PASS | `DELETE /api/thread/:id` removed the thread; confirmed absent from a subsequent list call |
| Refresh/session persistence (server-side) | PASS | The backend's own session mechanism (cookie + JWT verify) is correct when exercised directly via API |
| Refresh/session persistence (client-side, browser) | **NOT VERIFIED — BLOCKED** | No browser-automation tool available this phase; the prior full audit found a client-side bug (`App.jsx` reads the httpOnly cookie via `js-cookie`, which cannot see it) that would prevent this from working in the actual browser UI even though the backend mechanism itself is sound. Not re-verified live in-browser this phase — flagged as unverified, not re-confirmed. |
| Logout | PASS | `POST /api/auth/logout` cleared the cookie; a subsequent `/me` call correctly returned 401 |
| Authorization isolation | PASS (re-confirmed) | All thread operations were correctly scoped to the authenticated user's own `userId` throughout the test |

---

## 8. Security Baseline

Observational only — nothing below was remediated this phase.

**Authentication/session**
- JWT in httpOnly cookie; `secure`/`sameSite` flags are environment-aware (verified correct for both dev and the described production intent) — implemented correctly.
- No server-side token revocation/blocklist — a JWT remains valid until natural expiry even after logout (mitigated by never being stored outside the httpOnly cookie in normal use).
- The JWT is also returned in the JSON response body on register/login, unused by the frontend — unnecessary exposure surface.

**Authorization**
- Verified live this phase: every thread operation is correctly scoped by `userId`; no cross-user data access path found.

**Input handling**
- No schema/type validation library on any route — only truthiness checks. `email`/`password` fields are not type-checked, which structurally permits a NoSQL-operator-shaped request body (e.g. an object instead of a string) to reach a Mongoose query unchecked. Exploitability was not proven end-to-end this phase (that would cross into remediation-adjacent testing, out of scope for Phase 0) — recorded as a real gap in the code as written.

**API protection**
- No rate limiting on any route, including `/login`, `/register`, and the Gemini-backed `/chat`.
- No Helmet or equivalent security headers.
- No CSRF token; `sameSite: 'none'` is used in production (necessary for the cross-origin frontend/backend split), which increases reliance on a CSRF control that isn't present.
- CORS is scoped to a single `CLIENT_ORIGIN` — correctly restrictive, not wide open.

**Database**
- `tlsAllowInvalidCertificates: true` is set on the Mongoose connection — this disables certificate validation on the MongoDB TLS link, a real (if narrow) exposure to MITM on that connection.
- No compound index beyond the implicit unique indexes on `email` and `threadId`.
- No unbounded queries observed beyond the full thread list per user (acceptable at current scale).

**Secrets**
- No secrets are hardcoded in source code (verified by pattern search across all `.js`/`.jsx` files this phase — only non-sensitive `localhost` dev references were found).
- `Backend/.env` is correctly gitignored and not tracked.
- See the operational note in §5 regarding a transcript-level exposure during this phase's own verification process — not a repository issue, but disclosed here for completeness.

---

## 9. Known Issues

### Critical
- None identified.

### High
- MongoDB connection disables TLS certificate validation (`tlsAllowInvalidCertificates: true`).
- Client-side session-restoration check reads an httpOnly cookie it can never see (`App.jsx`), likely defeating persistent login on browser refresh — carried forward from the prior audit, not re-verified live in-browser this phase (no browser tool available), but nothing in this phase's findings contradicts it.

### Medium
- No input validation/type-checking on auth routes — structurally permits NoSQL-operator-shaped request bodies.
- No rate limiting on any route.
- No CSRF protection despite `sameSite: 'none'` in production.
- The very first `POST /api/chat` call made against the freshly-started backend this phase never returned a response (client timed out after 30s; only the user message was persisted, no error was logged, no assistant reply was ever appended). A direct, isolated call to the same SDK/model/key outside Express succeeded in ~1.7s, and a **restart of the backend process** resolved it — every subsequent chat call in this session succeeded normally. Root cause not diagnosed (out of scope for Phase 0, which documents rather than debugs); recorded as a reproducible-once, not-yet-explained cold-start/first-request symptom worth a closer look before this is relied on in production, since a user's first message in a fresh deployment could otherwise appear to hang with no error surfaced to the client.

### Low
- Backend `package.json` has no `scripts` block — `npm run dev`/`npm start` as documented in the README do not exist.
- Two AI SDKs (`openai`, `@google/generative-ai`) and one UI library (`react-spinners`) are installed and unused.
- No security headers (Helmet or equivalent).
- JWT returned in response body in addition to the httpOnly cookie, unused by the frontend.
- Production frontend build emits an unaddressed >500kB chunk-size warning (no code-splitting).

### Informational
- Font Awesome icon classes are used throughout the UI with no Font Awesome asset loaded anywhere — carried forward from the prior audit; not re-verified live in-browser this phase (no browser tool available in this environment).
- ESLint reports 1 pre-existing error and 2 pre-existing warnings (see §6) — none introduced or fixed this phase.
- `GET /api/<anything-not-under-/auth>` returns 401 rather than 404 for typos, because `authMiddleware` is mounted for the entire `/api` router before route matching completes — expected behavior given the code's structure, not a bug, but worth knowing when debugging a "wrong" status code.

---

## 10. Technical Debt

- **Missing tests:** zero automated test coverage anywhere in the project.
- **Architectural:** no controller/service layer on the backend, no API-client module on the frontend (axios calls are inline in components).
- **Unused dependencies:** `openai`, `@google/generative-ai`, `react-spinners` (see §2).
- **Missing validation:** no schema validation library on any backend route.
- **Deployment concerns:** frontend deployment target is not determinable from the repository (no platform config file present); a stale code comment in `App.jsx` references "Render" while the actual backend deployment artifact targets Vercel.
- **UI concerns:** Font Awesome icons likely non-functional in the deployed app (not re-verified live this phase); hardcoded dark-mode-only syntax-highlight theme regardless of app theme; no client-side routing.
- **AI limitations:** no conversation history sent to the model, no streaming, no system prompt, no RAG/embeddings/tools/agents — all previously documented in the full architecture audit and unchanged this phase.

---

## 11. Deferred Work

The following are explicitly **not implemented** in Phase 0 and are deferred to later phases, per the Phase 0 charter:

conversation memory · real streaming/SSE · RAG · embeddings · vector search · document upload · web search · function calling · TypeScript migration · UI redesign · new component library · new authentication system · new database · Redis · Kafka · Docker infrastructure · CI/CD · observability stack · large refactors · dependency upgrades

No application source file was edited to work around any finding above. Where a finding blocked full verification (e.g. no npm script to start the backend), the verification was performed by an equivalent direct command instead of by fixing the underlying gap.

**Residual test data disclosure:** a throwaway account `phase0-baseline-test@synapseai.local` was created in the live MongoDB database during the functional smoke test (§7) to exercise the register → chat → persist → delete → logout flow end-to-end. All threads created under that account were deleted as part of this phase's cleanup. The account itself was **not** deleted, because no account-deletion endpoint exists in the API — removing it would require direct database access, which was intentionally not performed in Phase 0. You may want to delete it manually before Phase 1.

---

## 12. Phase 0 Acceptance Criteria

| Criterion | Status |
|---|---|
| Repository inspected | ✅ Passed |
| Technology stack verified (declared vs. actually used) | ✅ Passed |
| Environment requirements documented (names only) | ✅ Passed |
| Backend startup verified | ✅ Passed |
| Frontend startup verified | ✅ Passed |
| Production build verified | ✅ Passed |
| Lint status verified | ✅ Passed (pre-existing failures documented, not fixed) |
| Test status verified | ✅ Passed (confirmed: none exist) |
| Functional smoke test performed | ✅ Passed (API-level; browser-level UI checks blocked by tooling, disclosed above) |
| Security baseline performed | ✅ Passed |
| Git safety verified | ✅ Passed |
| Baseline document created | ✅ Passed (this file) |

**Phase 0 is complete.** This document is the verified source of truth for what currently works, what doesn't, and what is unverifiable in this environment. Phase 1 planning should proceed from here — this file, not memory or assumption, from either side.
