# 🚀 Opencode: Real-Time Collaborative Cloud IDE

A modern, high-performance, real-time collaborative code editor and cloud IDE. Built with CRDT-based synchronization, Dockerized code execution sandboxes, collaborative terminal streaming, WebRTC voice/video, Git version control integration, and AI-powered coding assistance.

---

## 🌟 Key Features

- **⚡ Real-Time Collaboration:** Powered by Yjs (CRDT) and WebSockets for conflict-free multi-user live editing, cursor tracking, and presence awareness.
- **🐳 Sandboxed Code Execution:** Isolated Docker container execution with strict memory, CPU, and PID limits across multiple languages (JS, Python, Java, C++, C, Go, Ruby).
- **💻 Interactive Shared Terminal:** Containerized shell sessions (`opencode-terminal`) with xterm.js, stream resizing, and port forwarding preview.
- **🤖 Context-Aware AI Assistant:** Integrated LLM assistance (Groq / Llama 3) for code explanation, bug detection, automated optimizations, and conversational code refactoring.
- **🌿 Integrated Source Control & Git UI:** GUI panel for git status, commits, branch management, and remote repository cloning/push/pull.
- **🎥 WebRTC Video & Audio Rooms:** Integrated LiveKit SFU for crystal clear, low-latency audio/video communication directly inside the workspace.
- **📸 Snapshot Versioning & Diffs:** Visual side-by-side diff previews and one-click rollback checkpoints.
- **💬 Inline Code Comments:** Line-level threaded discussions with real-time status and gutter markers.
- **🔒 Role-Based Access Control:** Granular room permissions (Owner, Editor, Viewer), password protection, and invite-only modes.

---

## 🛠️ Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    React 19 + Vite Frontend                 │
│   (Monaco Editor, Yjs CRDTs, xterm.js, Tailwind CSS, LiveKit)│
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / WebSocket (Socket.IO)
┌──────────────────────────────▼──────────────────────────────┐
│                    Express 5 Backend Server                 │
│  ├── YSocketIO Sync Server (CRDT document coordination)      │
│  ├── REST APIs (Projects, Auth, Comments, Git, AI, Snippets) │
│  ├── Terminal Session Manager (Docker attach / PTY)         │
│  └── BullMQ / Redis Task Queue ───► Docker Sandbox Runner   │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
┌──────────────▼─────────────┐   ┌─────────────▼──────────────┐
│       MongoDB Atlas        │   │        LiveKit SFU         │
│ (Users, Projects, History) │   │ (WebRTC Audio/Video Media) │
└────────────────────────────┘   └────────────────────────────┘
```

### Core Technologies
- **Frontend:** React 19, Vite, Monaco Editor (`@monaco-editor/react`), Tailwind CSS, `xterm.js`, `yjs`, `y-monaco`, `livekit-client`.
- **Backend:** Node.js 20, Express 5, Socket.IO, `y-socket.io`, Mongoose, Passport.js, BullMQ, Redis, `dockerode`, `simple-git`.
- **Infrastructure:** Docker, Docker Compose, ECR, ECS on EC2, AWS ALB/NLB, EFS.

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Docker](https://www.docker.com/) & Docker Compose
- [Redis](https://redis.io/) (or local Docker container / Upstash)
- [MongoDB](https://www.mongodb.com/) (Local or MongoDB Atlas)

### 2. Environment Configuration
Create `.env` inside `Backend/`:
```bash
cp Backend/.env.example Backend/.env
```
Fill in your `MONGODB_URI`, `JWT_SECRET`, `CLIENT_URL`, and optional OAuth / Groq AI credentials.

### 3. Running Locally with Docker Compose
```bash
# Build sandbox runner and launch dependencies
docker compose up -d
```

### 4. Running Development Servers Manually
```bash
# Backend (Port 3000)
cd Backend
npm install
npm run dev

# Frontend (Port 5173)
cd Frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to start collaborating!

---

## 🧪 Production Deployment

The project includes a multi-stage Docker build that packages the Vite static frontend directly into the Express backend:

```bash
docker build -t collab-editor:latest .
docker run -p 3000:3000 --env-file Backend/.env collab-editor:latest
```

---

## 📄 License
This project is licensed under the MIT License.