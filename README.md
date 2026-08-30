# 🚀 Opencode: Real-Time Collaborative Cloud IDE

A modern, high-performance, real-time collaborative code editor and cloud IDE. Built with CRDT-based synchronization, Dockerized code execution sandboxes, collaborative terminal streaming, WebRTC voice/video, Git version control integration, and AI-powered coding assistance.

[Demo](#) · [Documentation](#documentation) · [API Docs](#api) · [Issues](#) · [Discord/Community](#)

---

## 📌 Overview

Opencode is a full-featured Cloud IDE designed to bring teams together in real-time. Whether you are pair programming, conducting technical interviews, teaching a class, or building complex microservices together, Opencode provides a frictionless, zero-setup environment directly in your browser.

The problem with traditional IDEs is that they are local-first, making real-time collaboration a bolt-on feature that often suffers from latency, desyncs, or complex network configurations. Opencode solves this by making collaboration a first-class citizen using CRDTs (Conflict-free Replicated Data Types) for deterministic, conflict-free state resolution.

It's built for:
- **Remote Engineering Teams:** Pair program effectively with integrated audio/video.
- **Educators & Students:** Teach coding interactively with shared terminals and sandboxes.
- **Technical Interviewers:** Conduct seamless coding interviews without external tools.
- **Hackathon Participants:** Rapidly prototype with built-in AI assistance and instant environments.

---

## ✨ Features

Opencode is packed with features designed to replicate and exceed a local desktop IDE experience:

- **⚡ Real-Time Collaboration**
  - Powered by Yjs (CRDT) and WebSockets for conflict-free multi-user live editing.
  - Granular cursor tracking, presence awareness, and real-time selection highlights.
- **🐳 Sandboxed Code Execution**
  - Isolated Docker container execution with strict memory, CPU, and PID limits.
  - Supports multiple languages: JavaScript (Node.js), Python, Java, C++, C, Go, Ruby.
  - BullMQ/Redis backed queue system for executing heavy workloads asynchronously.
- **💻 Interactive Shared Terminal**
  - Containerized shell sessions (`opencode-terminal`) with `xterm.js`.
  - Shared PTY streams for collaborative debugging and server running.
  - Dynamic stream resizing and port forwarding preview.
- **🤖 Context-Aware AI Assistant**
  - Integrated LLM assistance (via Groq / Llama 3) for deep code explanations.
  - Automated bug detection and real-time code optimization suggestions.
  - Conversational code refactoring that understands the context of your entire workspace.
- **🌿 Integrated Source Control & Git UI**
  - Visual Git GUI panel for tracking `git status`, reviewing diffs, and managing branches.
  - Perform commits, pull requests, and remote repository cloning/push/pull effortlessly.
- **🎥 WebRTC Video & Audio Rooms**
  - Integrated LiveKit SFU (Selective Forwarding Unit) for crystal clear communication.
  - Low-latency audio and video directly inside the workspace—no need for Zoom or Meet.
- **📸 Snapshot Versioning & Diffs**
  - Visual side-by-side diff previews for tracking changes over time.
  - One-click rollback checkpoints to restore previous code states.
- **💬 Inline Code Comments**
  - Line-level threaded discussions with real-time status and gutter markers.
- **🔒 Role-Based Access Control**
  - Granular room permissions: Owner, Editor, Viewer.
  - Password protection for private rooms and invite-only modes.
- **Background Jobs**
  - Redis and BullMQ powered workers for long-running operations.

---

## 🏗️ Architecture

Opencode relies on a highly scalable, service-oriented architecture, separated into distinct functional layers.

```text
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

### Major Components Explanation

- **Frontend:** A React 19 Single Page Application built with Vite. The core editing experience is powered by the Monaco Editor, augmented with `y-monaco` for CRDT synchronization. The UI is styled with Tailwind CSS, and WebRTC streams are handled by the LiveKit React SDK.
- **Backend:** A Node.js / Express 5 API server. It uses Socket.IO alongside `y-socket.io` to serve as the signaling and sync hub for the Yjs CRDT documents.
- **Database:** MongoDB (using Mongoose) serves as the persistent store for user accounts, project metadata, access control lists (ACLs), and historical snapshots.
- **AI/ML Services:** The backend integrates with Groq's LLM APIs (and locally fallback to `@xenova/transformers`) to provide tokenizer support and context-aware chat capabilities.
- **Queues:** Redis is paired with BullMQ to manage the job queue for code execution requests, preventing server overload and ensuring fair resource allocation.
- **Execution Engine & Sandboxes:** The backend uses `dockerode` to spawn and manage ephemeral Docker containers for code execution and interactive terminal sessions. Each session runs in an isolated environment.
- **External Services:** LiveKit handles the massive bandwidth requirements of multi-user video and audio streams, operating as an external SFU to offload this from the main Node.js server.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite, Tailwind CSS 4, Monaco Editor, xterm.js |
| **Collaboration** | Yjs (CRDT), y-monaco, y-socket.io, Socket.IO |
| **Backend** | Node.js 20, Express 5, Socket.IO, BullMQ, dockerode |
| **Database** | MongoDB Atlas / Mongoose |
| **Cache & Queue** | Redis, BullMQ |
| **Infrastructure**| Docker, Docker Compose, AWS (EC2, ECS, ALB, EFS) |
| **Realtime A/V** | LiveKit (WebRTC SFU) |
| **AI Integration**| Groq API, xenova/transformers (tokenizer) |
| **Auth** | Passport.js (Google, GitHub, JWT) |

---

## 📂 Project Structure

```text
opencode/
├── Frontend/                 # React 19 + Vite Frontend application
│   ├── src/
│   │   ├── components/       # Reusable UI components (Modals, Buttons)
│   │   ├── contexts/         # React Context providers (Auth, Theme)
│   │   ├── hooks/            # Custom React hooks
│   │   ├── pages/            # Main application pages/routes
│   │   ├── services/         # API client and WebSocket managers
│   │   ├── utils/            # Utility functions
│   │   └── App.jsx           # Main application entry component
│   ├── public/               # Static assets
│   ├── package.json          # Frontend dependencies
│   └── vite.config.js        # Vite bundler configuration
├── Backend/                  # Express 5 + Node.js Backend server
│   ├── controllers/          # Route handlers (Auth, Projects, AI)
│   ├── models/               # Mongoose schemas (User, Project, Comment)
│   ├── routes/               # Express route definitions
│   ├── services/             # Core business logic (Docker, Git, CRDT)
│   ├── sockets/              # WebSocket event handlers
│   ├── workers/              # BullMQ queue processors for sandboxes
│   ├── .env.example          # Example environment variables
│   ├── server.js             # Main backend entry point
│   └── package.json          # Backend dependencies
├── docs/                     # Detailed architectural & technical documentation
├── docker-compose.yml        # Local development orchestration
├── dockerfile                # Production multi-stage Docker build
├── AI_ASSISTANT_DESIGN.md    # System design for the AI component
└── README.md                 # Project documentation (You are here)
```

**Key Directories:**
- `Frontend/src/services`: Handles all complex real-time socket connections and API requests.
- `Backend/services`: Contains the `dockerode` implementations that securely spin up sandboxes.
- `docs/`: In-depth documentation separated by domain (architecture, api, deployment).

---

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Node.js** >= 20.0.0
- **npm** or **yarn**
- **Docker** & Docker Compose (Required for code execution sandboxes)
- **Redis** (Local instance or remote like Upstash)
- **MongoDB** (Local instance or MongoDB Atlas cluster)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/opencode.git
   cd opencode
   ```

2. **Install Backend Dependencies:**
   ```bash
   cd Backend
   npm install
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd ../Frontend
   npm install
   ```

---

## ⚙️ Environment Variables

The backend requires certain environment variables to function correctly.

1. Navigate to the `Backend/` directory.
2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

**Required Variables:**
```env
# Database
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/opencode

# Redis (for Queue & Sessions)
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your_super_secret_jwt_key
CLIENT_URL=http://localhost:5173

# Optional: OAuth Providers
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Optional: AI Integration
GROQ_API_KEY=your_groq_api_key

# Optional: LiveKit (A/V)
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret
LIVEKIT_URL=wss://your-livekit-instance.livekit.cloud
```

*Note: You can run the app without OAuth or AI by skipping those variables, but core features like database and redis are strictly required.*

---

## 🏃 Running Locally

The easiest way to get everything running is using the provided Docker Compose file which spins up Redis and standard dependencies.

### 1. Start Support Services (Redis, etc.)
```bash
docker compose up -d
```

### 2. Start the Backend (Development Mode)
In a new terminal window:
```bash
cd Backend
npm run start:dev &
```
*(Runs on `http://localhost:3000`)*

### 3. Start the Frontend (Development Mode)
In another new terminal window:
```bash
cd Frontend
npm run start:dev &
```
*(Runs on `http://localhost:5173`)*

Once both are running, visit `http://localhost:5173` in your browser.

---

## ⚙️ Configuration

Opencode provides several configuration points to tweak its performance and capabilities:

- **Docker Limits:** Located in `Backend/services/dockerService.js`. You can adjust memory (`Memory: 256 * 1024 * 1024` for 256MB), CPU quotas, and PIDs limits to secure the host machine.
- **Rate Limiting:** Managed in Express middleware to prevent abuse of the Code Execution API and the AI Assistant API.
- **Supported Languages:** Found in both frontend Monaco language maps and backend Docker image pull scripts. To add a new language, you must add a corresponding Docker execution container config.

---

## 🧪 Testing

Ensuring the reliability of real-time sync and sandboxing is critical.

```bash
# Run backend unit tests
cd Backend
npm test

# Run frontend tests
cd Frontend
npm test

# Run End-to-End (E2E) tests
npm run test:e2e
```

**Testing Strategy:**
- **Unit Tests:** Jest is used to verify pure functions, CRDT conflict resolution edge cases, and Docker container config generators.
- **Integration Tests:** Supertest is used against Express endpoints to ensure API routing, middleware, and database operations function correctly.
- **E2E Tests:** Playwright/Cypress is recommended for simulating multiple browser instances joining the same room and verifying that Yjs cursors and text changes synchronize properly.

---

## 🔌 API

Opencode exposes a RESTful API for standard operations and a WebSocket interface for real-time operations.

### REST Endpoints (Brief Overview)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Authenticate and return JWT |
| `GET` | `/api/projects` | List projects for the logged-in user |
| `POST` | `/api/projects` | Create a new project workspace |
| `GET` | `/api/projects/:id` | Fetch project details and metadata |
| `POST` | `/api/execute` | Submit code for sandboxed execution |
| `POST` | `/api/ai/chat` | Send workspace context to AI Assistant |

### WebSocket Events (Socket.IO)
- `join-room`: Subscribe to room-specific broadcasts.
- `yjs-update`: CRDT document state vectors for synchronization.
- `terminal-input` / `terminal-output`: PTY streams for the shared shell.

*For full API documentation, please see `docs/api.md`.*

---

## 🚢 Deployment

Deploying Opencode requires careful orchestration since it relies on Docker for user code execution. We recommend a multi-tier AWS architecture.

### Basic Deployment Flow

```text
GitHub Push
   ↓
GitHub Actions (CI/CD)
   ↓
Docker Build (Multi-stage build packaging Vite into Express)
   ↓
AWS ECR (Container Registry)
   ↓
AWS ECS on EC2 (Provides underlying access to Docker socket)
   ↓
Production ALB (Routes traffic to ECS tasks)
```

### Key Considerations for Production:
1. **EC2 over Fargate:** Because Opencode backend needs to spawn sibling Docker containers for user code (`dockerode`), the Node.js server needs access to the host's `/var/run/docker.sock`. This restricts deployment to EC2 instances rather than serverless containers (Fargate).
2. **WebSocket Scaling:** Use Redis adapter for Socket.IO if scaling beyond one backend instance. Sticky sessions are highly recommended on your Load Balancer.
3. **EFS for Persistence:** User project files and Git repositories should be mounted on Amazon EFS (Elastic File System) so they persist across container restarts.

*For detailed AWS setup instructions, refer to `aws-deployment-plan.md` and `docs/deployment.md`.*

---

## 🔐 Security

Security is a top priority for any application executing untrusted user code.

- **Authentication:** Standard JWT-based authentication stored in `httpOnly` cookies to prevent XSS attacks. OAuth 2.0 supported via GitHub/Google.
- **Authorization:** Room-level access controls mapped in MongoDB. Socket connections verify JWTs on upgrade to ensure unauthorized users cannot sniff WebSocket traffic.
- **Code Execution Sandboxing:**
  - All user code runs in isolated, ephemeral Docker containers.
  - Network access is completely disabled (`--network none`) for code runner sandboxes.
  - File system is mounted as Read-Only where applicable.
  - Strict resource limits (Memory, CPU, Fork bomb prevention via `--pids-limit`).
- **Secrets Management:** Environment variables are strictly separated. Never expose `.env` files.
- **Data Protection:** Passwords are encrypted via `bcryptjs`.
- **Vulnerability Reporting:** If you discover a security vulnerability within Opencode, please send an e-mail to security@opencode.com. All security vulnerabilities will be promptly addressed.

---

## 📊 Monitoring & Observability

To maintain a healthy IDE experience, observe the following metrics:

- **Logging:** All backend errors and critical events are logged to standard output. Use an aggregator like AWS CloudWatch or Datadog.
- **Metrics:** Track active WebSocket connections, Redis queue lengths (BullMQ), and Docker container counts. An exploding container count indicates zombie processes.
- **Error Tracking:** Integration with Sentry is recommended for tracking both frontend UI crashes and backend Express exceptions.
- **Health Checks:** The endpoint `/api/health` returns `200 OK` and checks the database and Redis connections. Configure your ALB to poll this endpoint.

---

## 🤝 Contributing

We welcome contributions from the community!

1. **Fork the repository** and create your branch from `main`.
   ```bash
   git checkout -b feature/my-amazing-feature
   ```
2. **Coding Standards:** We enforce ESLint. Please run `npm run lint` before committing.
3. **Testing:** Ensure that all existing tests pass and add new tests for your feature.
4. **Pull Requests:** Open a Pull Request with a detailed description of the changes. Ensure the CI pipeline passes.

For major architectural changes, please open an Issue first to discuss it with the core team.

---

## 📜 License

This project is licensed under the [MIT License](LICENSE).

---

## 👥 Team / Maintainers

- **Core Team** - [Maintainer Name / GitHub Profile]
- *We are currently looking for additional maintainers. Feel free to reach out!*

---

## 🙏 Acknowledgements

- [Yjs](https://github.com/yjs/yjs) - For the incredible CRDT implementation.
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - Microsoft's robust code editor.
- [LiveKit](https://livekit.io/) - For making open-source WebRTC accessible.
- [xterm.js](https://xtermjs.org/) - For the terminal emulator magic.
- [Groq](https://groq.com/) - For blazing fast LLM inference.

---

## 📚 Documentation

For deeper dives into the codebase, explore the `docs/` directory:

- [Architecture Overview](docs/architecture.md)
- [API Documentation](docs/api.md)
- [Development & Setup Guide](docs/setup.md)
- [Testing Strategy](docs/testing.md)
- [Deployment Guide](docs/deployment.md)
- [Troubleshooting](docs/troubleshooting.md)

### Layered Documentation Structure

Opencode utilizes a 3-layer documentation approach:

1. **README (Here):** "I just arrived. What is this and how do I run it?"
2. **`docs/` Directory:** "I need to understand or modify specific parts of this system."
3. **In-code JSDoc & Comments:** "How does this exact function work?"

```text
docs/
├── architecture.md      # Backend, Frontend, and CRDT Sync Architecture
├── setup.md             # Detailed local environment setup
├── testing.md           # How to run and write new tests
├── deployment.md        # Staging, production, and AWS specifics
├── api.md               # Full REST and WebSocket event reference
└── troubleshooting.md   # Common errors and their solutions
```
