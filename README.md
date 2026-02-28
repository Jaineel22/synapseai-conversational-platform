# 🧠 SynapseAI

A full-stack AI chat application powered by Google Gemini — with user authentication, persistent chat threads, and a neural-network-inspired UI.

![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose-47A248?style=flat-square&logo=mongodb&logoColor=white)
![Gemini](https://img.shields.io/badge/Google-Gemini_AI-4285F4?style=flat-square&logo=google&logoColor=white)

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- JWT authentication with HTTP-only cookie sessions
- Persistent chat threads stored per user in MongoDB
- Create, switch, and delete conversation threads
- Dark / Light theme toggle — preference saved to account
- Markdown + code block rendering with syntax highlighting
- Word-by-word typing animation for AI responses
- Responsive layout for desktop and mobile

---

## Tech Stack

**Frontend** — React 18, Vite, Axios, React Markdown, rehype-highlight, js-cookie, uuid

**Backend** — Node.js, Express, MongoDB, Mongoose, JWT, bcryptjs, dotenv, @google/genai, cors

---

## Project Structure

```
SynapseAI/
├── frontend/
│   └── src/
│       ├── App.jsx             # Root component + auth check
│       ├── index.css           # Global CSS variables & themes
│       ├── MyContext.jsx       # Global state (chat + auth)
│       ├── ThemeContext.jsx    # Theme context
│       ├── Sidebar.jsx         # Thread history & navigation
│       ├── ChatWindow.jsx      # Navbar, input, modals
│       ├── Chat.jsx            # Message rendering
│       └── AuthModal.jsx       # Login / Register modal
│
├── backend/
│   ├── middleware/
│   │   └── auth.js             # JWT verification
│   ├── models/
│   │   ├── User.js             # User schema
│   │   └── Thread.js           # Thread + messages schema
│   ├── routes/
│   │   ├── auth.js             # Auth endpoints
│   │   └── chat.js             # Thread & chat endpoints
│   ├── utils/
│   │   └── gemini.js           # Gemini API wrapper
│   └── server.js               # App entry point
│
├── .gitignore
└── README.md
```

---

## Prerequisites

- Node.js v18+
- npm v9+
- MongoDB — local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (free tier)
- Gemini API key — from [Google AI Studio](https://aistudio.google.com/) (free tier)

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/SynapseAI.git
cd SynapseAI
```

### 2. Set up the backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` folder and add your variables (see [Environment Variables](#environment-variables)).

### 3. Set up the frontend

```bash
cd ../frontend
npm install
```

Make sure `vite.config.js` has the API proxy configured:

```js
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
})
```

### 4. Run the app

Open two terminals:

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Visit [http://localhost:5173](http://localhost:5173)

---

## Environment Variables

Create `backend/.env` — **never commit this file.**

```env
PORT=8080
MONGODB_URI=mongodb://localhost:27017/synapseai
JWT_SECRET=your_jwt_secret_here
GEMINI_API_KEY=your_gemini_api_key_here
```

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Express server port. Defaults to `8080`. |
| `MONGODB_URI` | ✅ | MongoDB connection string. |
| `JWT_SECRET` | ✅ | Secret for signing JWT tokens. |
| `GEMINI_API_KEY` | ✅ | Your Google Gemini API key. |

---

## API Reference

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/register` | No | Create a new account |
| POST | `/login` | No | Login, receive JWT cookie |
| POST | `/logout` | No | Clear auth cookie |
| GET | `/me` | ✅ | Get current user |
| PUT | `/theme` | ✅ | Update theme preference |

### Threads & Chat — `/api`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/thread` | ✅ | Get all threads for user |
| GET | `/thread/:threadId` | ✅ | Get messages in a thread |
| DELETE | `/thread/:threadId` | ✅ | Delete a thread |
| POST | `/chat` | ✅ | Send message, get AI reply |

---

## Roadmap

- [ ] Streaming AI responses (token-by-token)
- [ ] Full conversation context passed to Gemini
- [ ] Auto-generated thread titles via AI
- [ ] Keyword search across threads
- [ ] Copy-to-clipboard on AI messages
- [ ] Per-user rate limiting

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Built with ❤️ from India &nbsp;·&nbsp; SynapseAI — where thoughts become connections
</div>
