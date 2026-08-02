# AI Chat Assistant — Technical Design Document

**Goal:** Add a Cursor / Copilot Chat-style AI assistant to this collaborative code editor, powered by the **Groq API**, that understands project context without dumping the whole repository into the LLM.

**Scope of this document:** Analysis of the current codebase, how modern AI IDEs handle context, gap analysis, a tailored architecture, an MVP, a phased roadmap, an exact integration plan, and performance/cost guidance. No production code is written here; another engineer can implement this step by step.

---

## Table of Contents

1. [Current Project Analysis](#1-current-project-analysis)
2. [How Modern AI IDEs Actually Work](#2-how-modern-ai-ides-actually-work)
3. [Gap Analysis: Us vs. a Production AI IDE](#3-gap-analysis-us-vs-a-production-ai-ide)
4. [Recommended Architecture](#4-recommended-architecture)
5. [MVP Scope — What Exactly Goes to Groq](#5-mvp-scope--what-exactly-goes-to-groq)
6. [Roadmap](#6-roadmap)
7. [Integration Plan With This Codebase](#7-integration-plan-with-this-codebase)
8. [Performance & Cost Considerations](#8-performance--cost-considerations)
9. [Security & Guardrails](#9-security--guardrails)
10. [Risks & Open Decisions](#10-risks--open-decisions)

---

## 1. Current Project Analysis

### 1.1 Big picture

A real-time collaborative multi-file code editor. Users create/join "rooms" (each room = one project), edit code together in Monaco with CRDT-based live cursors, chat, comment, snapshot/restore versions, run code in Docker sandboxes, open a shared terminal, manage git, and do voice/video via LiveKit.

Stack:

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Monaco (`@monaco-editor/react`) |
| Collab sync | Yjs CRDT + `y-monaco` + `y-socket.io` over Socket.IO |
| Backend | Express 5 (ESM), Socket.IO 4 |
| Database | MongoDB Atlas via Mongoose |
| Queues/cache | Redis + BullMQ (code execution queue) |
| Sandboxes | Docker (dockerode) for code exec + terminal |
| Auth | Passport.js (Google, GitHub, guest) + JWT in httpOnly cookies |
| Realtime AV | LiveKit (WebRTC SFU), self-hosted via docker-compose |
| Git | `simple-git` on per-room on-disk repo |

### 1.2 Frontend architecture

```
Frontend/
  src/
    main.jsx, app/App.jsx + App.css      # Routing shell (3 routes)
    pages/
      LoginPage.jsx                       # Public
      DashboardPage.jsx                   # Room list / create / join
      EditorPage.jsx                      # THE hub (2,422 lines)
    components/                           # ~27 panel/modal components
      FileExplorer, EditorToolbar, TabBar, StatusBar,
      ChatPanel, CommentsPanel, ExecutionPanel, TerminalPanel,
      SourceControlPanel, SnapshotHistory, SnapshotDialog, DiffView,
      SnippetManager, TestCaseManager, MouseOverlay, MinimapOverlay,
      VideoGallery, VideoWindow, RoleManager, RoleBadge,
      PasswordPrompt, ShareModal, ShortcutsModal, SettingsModal,
      OnboardingModal, ToastNotification, AuthProvider
    hooks/
      useAuth, useProjectRole, useLiveKit, useWebRTC
    contexts/AuthContext.jsx
    lib/
      api.js        # axios client (only used for /auth today)
      rooms.js      # localStorage room history
      fileTree.js   # extension→language map, tree helpers, filter
      themes.js     # Monaco theme definitions
      download.js   # file/zip download helpers
```

**State management.** There is **no global store** (no Redux/Zustand/Context-for-data). Two patterns dominate:

1. **Local component state** inside `EditorPage.jsx` — `openTabs`, `selectedFileId`, `fileTree`, `selectionInfo`, `showChat`, `showGit`, etc. Everything is lifted into this one component and passed down as props.
2. **Yjs shared document** (`ydoc`) — the source of truth for project state. `yFileTree = ydoc.getMap("fileTree")` holds the folder structure; each file is a Y.Text at `file:${id}`. All collaborators see changes through CRDT sync.

An AI chat feature slots into this cleanly: it is per-user state (like `showChat`), and it **reads** live content straight from the `ydoc`, which means it always sees unsaved, in-progress code — the same view the user has.

### 1.3 Editor implementation

- Monaco via `@monaco-editor/react` (EditorPage.jsx:2004). One shared model is re-bound to the selected file using `MonacoBinding` (y-monaco) at EditorPage.jsx:948.
- File content is read with `getFileContent(fileId)` → `ydoc.getText("file:" + fileId).toString()` (EditorPage.jsx:488).
- **Current selection** is tracked in `selectionInfo` state (EditorPage.jsx:599–643): `{ startLine, endLine, selectedText, ... }`.
- **Cursor position** is available from `editorRef.current.getPosition()`.
- **Open tabs** in `openTabs` (EditorPage.jsx:274); the active file in `selectedFileId`.
- The language is derived from the filename via `getFileInfo(name).language` (lib/fileTree.js:30).

This is important: **everything needed to build an "editor context" snapshot is already in component state or the ydoc.** No refactor required to gather it.

### 1.4 Backend architecture

```
Backend/
  server.js                    # Express + Socket.IO + YSocketIO wiring, all handlers
  config/  db.js, passport.js
  middleware/auth.js           # authenticateToken, requireRoomAccess, requireProjectRole, roles
  models/  User, Project, Comment, Message, Execution, Snippet, TestCase
  routes/  auth, projects, comments, chat, execute, git, terminal, snippets, testCases
  utils/   projectSync (Mongo⇄disk + gitignore filter + git commit), terminalManager,
           sandboxRunner, execQueue (BullMQ worker), mailer
  sandbox/ Dockerfile(s) + run.sh
```

Routes mounted in `server.js:150–158`:

| Route | Purpose |
|---|---|
| `/auth` | OAuth + guest login |
| `/api/projects` | room CRUD, save, snapshots/history, members, roles, settings, invite, join |
| `/api/comments` | comments CRUD |
| `/api/chat` | human chat messages (REST) |
| `/api/execute` | enqueue code execution, stop, history |
| `/api/snippets`, `/api/testcases` | personal snippets, test cases |
| `/api/terminal` | kill terminal |
| `/api/projects` (git.js) | git status/log/branches/commit/push/pull/clone |

**Project storage model** (`models/Project.js`):
- `fileTree`: Map of `id → { id, name, type: "file"|"folder", parentId }`
- `files`: array of `{ id, content, language }`
- `settings`, `members` (Map of userId → role), `bannedUsers`, `history` (snapshots)

**Disk mirror.** Rooms also exist on disk at `/tmp/opencode-projects/<roomId>` (projectSync.js:8). `syncProjectToDisk()` writes Mongo state to disk; `applyDiskStateToEditor()` writes disk state back into the **live Yjs doc** (`ySocketIO.documents.get(roomId)`) so every connected client updates. This server-side handle on the live Yjs document is a huge asset for a future "AI edits the code live" feature.

### 1.5 Collaboration / real-time flow

- Yjs sync on a namespaced Socket.IO connection (`/yjs|<roomId>`), JWT-authed, with viewer write-protection (server.js:124–148).
- A second "room" socket (`io("/")`) handles: `join-room`, `chat-message` relay, member actions, terminal streams, WebRTC/LiveKit signaling.
- **Streaming precedent:** code execution streams stdout/stderr through Socket.IO rooms `exec:<executionId>` (execQueue.js:40–77; consumed in ExecutionPanel.jsx:71–120). There is no SSE anywhere yet, but the team is comfortable with token-chunk delivery over websockets — this makes adopting SSE for LLM streaming a small conceptual step.

### 1.6 Authentication & authorization

- JWT in httpOnly cookie `token` (7d). `authenticateToken` resolves `req.user` (middleware/auth.js:5).
- Room guards: `requireRoomAccess` (banned/password/invite checks), `requireProjectRole(...)` (owner/editor/viewer).
- Roles: `owner > editor > viewer`; `getUserProjectRole` (middleware/auth.js:29); `canEdit` respects the `readOnly` room setting.
- **Implication for AI:** question-answering can be available to *all* room roles; code-*writing* (Phase 4) must require `editor+` and honor `readOnly`, exactly like the existing `save` route (projects.js:144–150).

### 1.7 Where an AI assistant fits naturally

- **Frontend:** a right-hand panel exactly like the existing `ChatPanel`/`CommentsPanel`/`SourceControlPanel` overlay (`absolute top-4 bottom-4 right-4 z-20 w-80 ...`, EditorPage.jsx:2108–2127). A toggle button in `EditorToolbar` mirrors `onToggleGit`.
- **Backend:** a new `routes/ai.js` mounted at `/api/ai`, protected by `authenticateToken` + `requireRoomAccess`. A new `services/` layer for the Groq client, context assembly, and prompt building.
- **Context source:** the *client* has the freshest data (live ydoc buffers). It collects an "editor context snapshot" and posts it; the server enriches it with project metadata and the file tree. This is the natural split in this codebase because the source of truth for *unsaved* code lives in the browser.
- **Shared terminal/git/execution all already stream via Socket.IO**, so a collaborative "everyone sees the AI response" mode (optional future) would use the same `io` pattern as `chat-message` (server.js:193).

---

## 2. How Modern AI IDEs Actually Work

### 2.1 The core trick: context selection, not context dumping

Cursor, Copilot Chat, Claude Code, and Windsurf all do the same fundamental thing: **they never send the whole repository to the model.** They assemble a *small, prioritized* slice of the project (a few thousand to tens of thousands of tokens) that maximizes answer quality for the current question + current editor state. Everything else is retrieval on demand.

### 2.2 Techniques they use

| Technique | What it is | Essential for our MVP? |
|---|---|---|
| **Current file content** | The active file, usually full (or head+tail around cursor if huge) | ✅ Yes |
| **Selected code** | The user's text selection, highest priority | ✅ Yes |
| **Cursor position** | Line/col so the model understands "here" | ✅ Yes |
| **Open tabs / open files** | Other files the user has opened — they're actively relevant | ✅ Yes (names for MVP, contents in P2) |
| **File tree / project paths** | The shape of the project, cheap and disambiguating | ✅ Yes |
| **Conversation history** | Prior turns, trimmed to a budget | ✅ Yes |
| **Git diff** | Uncommitted changes = what the user is working on right now | 🟡 Nice (already have git status in-app) |
| **Error diagnostics** | Linter/compiler errors as context | 🟡 Nice (execution stderr exists) |
| **Streaming responses (SSE)** | Token-by-token delivery for perceived latency | ✅ Yes |
| **Related-file retrieval** | "Which other files matter?" via import scanning | 🟡 Phase 2 |
| **Symbol indexing** | Functions/classes → file/line, so the model can be told "here's `validateAuth`" | 🟡 Phase 2 |
| **RAG / embeddings + vector search** | Semantic search over chunks of the repo | 🟡 Phase 3 |
| **Import / dependency graph** | `import X from './y'`, package.json deps | 🟡 Phase 2–3 |
| **Agentic retrieval (tool calling)** | Model calls `read_file`, `grep_symbol`, `run_test` in a loop | ⬜ Phase 4 |
| **AST parsing** | Full syntax trees for exact symbol extraction | ⬜ Advanced (regex is enough for us) |

### 2.3 Context window & token budgeting

Every model has a hard context window (Groq's Llama-3.3-70B serves 128K tokens; small models less). The cost/latency of a request scales with input tokens, so the prompt builder must treat the window as a **budget**:

```
SYSTEM PROMPT        ~1–2K tokens
CONVERSATION HISTORY ~8–12K tokens   (last N turns, trimmed)
EDITOR CONTEXT       ~32–64K tokens  (selection > current file > open tabs > related)
RETRIEVAL SLICE      ~8–16K tokens   (Phase 2+)
RESPONSE RESERVE     ~2–4K tokens    (always keep room for the answer)
```

Priority order when tokens run out: **selection → current file → open tabs → related files → file tree → history → system boilerplate.**

### 2.4 Streaming

Chat UIs stream for perceived latency (TTFT ≪ total time). The OpenAI-compatible `stream: true` mode emits SSE lines `data: {json delta}\n\n` terminated by `data: [DONE]`. Groq is OpenAI-compatible, so this works with any SSE-aware client. Abort support (user hits stop) is mandatory.

### 2.5 Embeddings vs. symbol indexing vs. import graph

- **Symbol index** answers "where is `getUserProjectRole` defined?" — exact, needs a parser or careful regex.
- **Import graph** answers "what does `routes/ai.js` depend on?" — needs import-statement scanning (regex `import ... from '...'` / `require(...)` is 90% effective).
- **Embeddings/vector search** answer "find where authentication is handled" — fuzzy/semantic, needs an embedding model + vector store. **Note: Groq does not offer an embeddings endpoint today**, so Phase 3 must plug in a second provider (see §8.3).

### 2.6 Agentic retrieval

Advanced mode where the model isn't handed context — it *fetches* it with tool calls (`read_file`, `grep`, `run`). Powerful but expensive, non-deterministic, and hard to make reliable. This is Phase 4.

---

## 3. Gap Analysis: Us vs. a Production AI IDE

### 3.1 What already exists (reusable)

- **Live, accurate source of truth.** The Yjs doc in the browser is always current, including unsaved edits — better than most IDEs have for free.
- **Panel UI pattern.** Chat/FileExplorer/Git panels are a proven component pattern (`absolute right-4 ... w-80`) we copy.
- **Auth + room access middleware** to protect AI endpoints (`authenticateToken`, `requireRoomAccess`).
- **Role model** to gate read (viewer OK) vs. write (editor+) AI actions.
- **Git plumbing.** `git status`/`diff`-capable repo per room (routes/git.js) → uncommitted-change context is nearly free.
- **Streaming UX precedent.** Socket.IO chunk streaming for exec/terminal → engineers already know token-chunk patterns.
- **Live server-side Yjs handle** (`ySocketIO.documents.get(roomId)`) → Phase 4 "apply AI edit to all clients" is a solved mechanism.
- **A concept doc** (`ai_addition.md`) already sketches `AIChatPanel.jsx` + `routes/ai.js`; this design supersedes and details it.

### 3.2 What's missing

- No LLM client/service anywhere. No `GROQ_API_KEY`, no AI config.
- No SSE support (front or back).
- No context-assembly or prompt-building layer.
- No token estimation/budgeting.
- No symbol index, embeddings, or retrieval.
- No chat persistence for AI conversations (human chat is persisted; AI chat would start fresh per panel-open or need a model).
- No AI-specific rate limiting / cost controls.

### 3.3 What needs to be built (in order)

1. Groq client + `/api/ai/chat` streaming endpoint (Phase 1)
2. Editor-context snapshot collector on the client (Phase 1)
3. Prompt builder with token budget (Phase 1)
4. AI chat panel UI with streaming + code-block rendering (Phase 1)
5. Symbol + import index, related-file expansion (Phase 2)
6. Embedding pipeline + semantic search (Phase 3)
7. Tool-calling agent + live code application (Phase 4)

### 3.4 What can be reused vs. replaced

| Concern | Reuse | Build new |
|---|---|---|
| Auth on AI routes | `authenticateToken`, `requireRoomAccess` | — |
| Role gate for AI edits | `getUserProjectRole`, `canEdit` | — |
| File tree (names/paths) | `project.fileTree` + `filterEditorProject` | — |
| Uncommitted changes | `git status`/`diff` in routes/git.js | git-diff→prompt formatter |
| Streaming infrastructure | Socket.IO `io` | SSE route + client parser |
| Live doc writes (AI edits) | `ySocketIO.documents.get(roomId)` | diff→Yjs apply helper |
| Code execution context | `Execution` model + `/api/execute` | prompt formatter for errors |

---

## 4. Recommended Architecture

### 4.1 Component diagram

```
┌──────────────────────────────────  BROWSER  ──────────────────────────────────┐
│                                                                               │
│  EditorPage.jsx (existing hub)                                                │
│   ├─ Editor (Monaco) ──┐                                                      │
│   ├─ ydoc (Yjs)  ◄─────┴─ live file content (unsaved-safe)                    │
│   │                                                                           │
│   └─ [new] useAIChat hook ◄────────────────────────┐                           │
│          │                                         │                           │
│   [new] lib/aiContext.js   EditorToolbar (toggle)  │                           │
│   collects: current file, selection, cursor, tabs, │  AIChatPanel.jsx         │
│   file tree, history (last N turns)                │  ├ streams tokens         │
│          │                                         │  ├ renders markdown/code │
│          └──────────────┐                          │  └ copy/insert buttons   │
└─────────────────────────┼──────────────────────────┴──────────────────────────┘
                          │ POST /api/ai/chat  (SSE, credentials cookie)
                          ▼
┌──────────────────────────────────  SERVER  ───────────────────────────────────┐
│  middleware/auth.js  →  authenticateToken + requireRoomAccess                  │
│  routes/ai.js (new)                                                           │
│   ├─ validate payload, check rate limit (Redis)                               │
│   ├─ services/contextBuilder.js  enrich client snapshot w/ project meta,      │
│   │                                file tree (filtered), git status           │
│   ├─ services/promptBuilder.js   assemble messages + token budget + fallback  │
│   │                                truncation (selection>file>tabs>tree>hist) │
│   ├─ services/groqClient.js      OpenAI-compatible fetch → Groq, stream:true  │
│   └─ utils/sse.js                pipe `data:` deltas, `[DONE]`, abort hooks    │
│                                                                               │
│  Phase 2+  services/symbolIndex.js, retrievalService.js (Redis/in-memory)     │
│  Phase 4   services/agentEngine.js (+ applyDiff via ySocketIO.documents)      │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Why this shape

1. **Client collects context; server enriches.** The freshest code (unsaved buffer) is in the browser `ydoc`, so the client snapshots it. The server is authoritative for the *project shape* (Mongo `fileTree`, roles, git status). This hybrid is the only design that sees both the user's in-progress view and the project's real structure, and it avoids a second full-code fetch over the network.
2. **SSE over a plain POST.** Works through the existing Vite proxy (`/api` → :3000), uses the existing JWT cookie (no CORS/token-in-header pain), and is trivially abortable. Socket.IO would work too but adds no value for a *per-user* chat.
3. **Stateless MVP.** Conversation history lives in the hook/panel; each request carries the last N turns. No DB schema change in Phase 1, which keeps the first shippable slice tiny.
4. **Separation that matches the repo.** `routes/` for HTTP, `services/` for business logic, `utils/` for plumbing — same as `routes/git.js` + `utils/projectSync.js` today.

### 4.3 Data flow (one question)

```
User types "why does save fail for viewers?" + hits send
  │
  ▼ lib/aiContext.js builds snapshot:
    { roomId, question,
      currentFile: { path, language, content (truncated) },
      selection:   { text, startLine, endLine } | null,
      cursor:      { line, column },
      openTabs:    [ {path, language} ... ],
      fileTree:    ["src/App.jsx", "src/routes/ai.js", ...],   // filtered, no node_modules
      history:     [ {role, content} × last ~10 ] }
  │
  ▼ POST /api/ai/chat (JSON, cookie) → routes/ai.js
    - authenticateToken → requireRoomAccess
    - rate-limit check (Redis: user + room, e.g. 20 req/5min)
    - contextBuilder: add project settings/role, git status (uncommitted files), filtered file tree
    - promptBuilder:
        1. system prompt (persona + formatting rules + context rules)
        2. conversation history
        3. editor context block (selection, current file, tabs, tree)
        4. user question
        with token budgeting & truncation per priority
  │
  ▼ groqClient: POST https://api.groq.com/openai/v1/chat/completions
    { model: env GROQ_MODEL, messages, stream: true, temperature: 0.3 }
  │
  ▼ utils/sse.js pipes:  data: {delta}\n\n ... data: [DONE]
  │
  ▼ useAIChat hook (fetch + ReadableStream) appends tokens → AIChatPanel renders
  │  "Stop" → AbortController → server aborts Groq upstream (GET → cancelled)
```

### 4.4 Conversation state model

- **MVP (recommended):** per-user, client-side. `useAIChat` keeps `messages[]`; persisted to `localStorage` under `ai-chat:<roomId>` so refresh doesn't lose it. Shared per-room AI chat is a *different product decision* (like Cursor vs. a shared assistant); defer it.
- **Optional Phase 2:** `models/AIConversation.js` (roomId, userId, messages) if cross-session/device continuity is wanted.

---

## 5. MVP Scope — What Exactly Goes to Groq

### 5.1 The payload (nothing more)

Each request sends:

| # | Field | Why include |
|---|---|---|
| 1 | `question` | The user's actual request — the only *required* thing |
| 2 | `currentFile.path` + `.language` | Tells the model *where we are*. Disambiguates "this" |
| 3 | `currentFile.content` | The active file, full if ≤ ~16K tokens else head+tail around cursor. The single highest-value context unit |
| 4 | `selection.text` + `.startLine/.endLine` | "This function" → precise target. Highest priority when present |
| 5 | `cursor.line/.column` | "Here" — needed for insert-at-cursor and "after this line" answers |
| 6 | `openTabs[]` (paths + languages) | Files the user just looked at = related work. Names only in MVP (contents in Phase 2) |
| 7 | `fileTree[]` (filtered path list) | The project's shape; cheap (~1–2K tokens even for 100 files) and prevents nonsense answers |
| 8 | `history[]` (last ~10 turns) | Makes multi-turn "and now fix X" questions work |
| 9 | `roomId` + auth | Server-side authorization + rate limiting (not sent to the model) |

### 5.2 What is deliberately NOT sent (and why)

- **The whole repository.** Expensive, slow, and *worse* for quality than a focused slice (models get confused by irrelevant code). This is the single most important discipline.
- **`node_modules`, `.git`, `.env`, binaries.** Reuse the existing filters: `filterEditorProject()` / `getHiddenPaths()` / `ALWAYS_IGNORED` (projectSync.js:11). Never send secrets.
- **Other open tabs' full contents in MVP.** Names only; content arrives in Phase 2 when we can budget them.
- **Embeddings/semantic search in MVP.** The "find where auth is handled" queries work fine with the file tree + `grep`-style related-file scan in Phase 2; embeddings add cost and infra for marginal MVP value.

### 5.3 System prompt (shape)

```
You are an expert senior software engineer embedded in a collaborative
multi-user code editor (Cursor-style assistant).

Rules:
- You are given: the CURRENT FILE, the user's SELECTION (if any), cursor
  position, OPEN TABS, and the project FILE TREE.
- Answer concretely and reference real files/lines by path.
- If the question needs code, return a complete code block with a language
  tag (```js). Use the selection/current file to ground your answer.
- If the current file is not enough, say which other file you'd need and why
  (MVP: do not invent files; the tree limits you).
- Never output secrets, never invent files that aren't in the tree.
- Be concise. Use bullet points over essays.
```

### 5.4 Endpoints (Phase 1)

```
POST /api/ai/chat                 # streaming SSE chat
  req:  { roomId, question, currentFile?, selection?, cursor?,
          openTabs?, fileTree?, history? }
  res:  text/event-stream
        data: { delta: "..." }
        data: [DONE]
        (errors as data: { error: "..." } with a non-200-equivalent SSE event)

GET  /api/ai/config               # { enabled, model } — lets the panel show a badge
```

`/api/ai/chat` returns a **single assistant message** stream. History is maintained by the client and re-sent, so the endpoint is stateless (easy to cache, retry, scale).

### 5.5 Why this is the right MVP

- **Smallest feature that is actually useful.** A user can ask "explain this function", "why does this error occur", "refactor this selection", and get grounded, streaming answers about *their* code in *their* current state.
- **Reuses what exists.** Auth, room guards, the panel UI pattern, and the `ydoc` read path are all already there. No new infra, no DB migration, one env var.
- **Sets the seams for everything later.** The `contextBuilder`/`promptBuilder`/`retrievalService` split means Phase 2–4 bolt on without reshaping Phase 1.

---

## 6. Roadmap

Complexity estimates assume one engineer familiar with this codebase.

### Phase 1 — Streaming chat with editor context (MVP) · ~3–5 days

- `services/groqClient.js`, `routes/ai.js` (SSE), `utils/sse.js`; `GROQ_API_KEY`/`GROQ_MODEL` env.
- `lib/aiContext.js` snapshot collector; `hooks/useAIChat.js` (fetch stream + AbortController).
- `AIChatPanel.jsx` (message list, markdown+code rendering, copy button, Stop button) + toolbar toggle + shortcut (Ctrl/Cmd+K).
- `services/promptBuilder.js` with character/token budgeting and priority truncation.
- Token estimate: **~500 LOC** backend + **~700 LOC** frontend. Tests: curl the SSE route; manual panel test.

### Phase 2 — Related files + symbol awareness · ~3–4 days

- `services/symbolIndex.js`: extract function/class/const symbols per file (language-aware regex; no heavy parser), keyed `roomId → path → symbols`. Rebuilt on project save (hook the existing `/save` + Yjs updates).
- Import scan (`import/require` regex) → related-file list for the current file; include *relevant portions* (not whole files) of top-2 related files in the prompt.
- Git-status context: when uncommitted changes exist, append a compact `git diff --stat` + per-changed-file one-liner.
- Token estimate: **~400 LOC** backend. `POST /api/ai/context/<roomId>` introspection endpoint for debugging.

### Phase 3 — Embeddings & semantic search · ~4–6 days

- **Problem:** Groq has no embeddings endpoint. Use a pluggable `services/embeddingService.js`: start with `@xenova/transformers` (local, free, `all-MiniLM-L6-v2`) or an OpenAI/Jina/HF-API key; design the interface so the provider is a config swap.
- Chunk files (functions/classes, else fixed ~100-line windows with overlap), embed on save, store per-room (in-memory Map for scale-now, Redis/vector DB later — the interface hides the store).
- `POST /api/ai/search { roomId, query }` → top-k chunks with paths/lines; wire "ask about this repo" + `/search` results into the prompt as a retrieval slice.
- Token estimate: **~500 LOC** backend + small panel "Search" tab. Requires `@xenova/transformers` (≈ 20–40MB model, download-once) or an API key.

### Phase 4 — Agent mode + live code edits · ~1–2 weeks

- `services/agentEngine.js`: Groq **function calling** loop with tools `read_file`, `list_files`, `grep_symbol`, `get_git_diff`, `apply_edit`.
- `apply_edit` produces a validated diff; server applies it to the live Yjs doc via `ySocketIO.documents.get(roomId)` (same mechanism as `applyDiskStateToEditor`, projectSync.js:378) → **all collaborators see the AI edit live**, with the existing CRDT undo.
- Permission gate: `editor+` and `!readOnly` (mirror the `save` route, projects.js:144). Diff preview + accept/reject in the panel before applying.
- Token estimate: **~800–1200 LOC** backend + panel diff UI. This is where 70% of the "wow" comes from but also the hardest reliability work.

### Post-Phase-4 (optional)

- AI diff explanation on snapshots (`DiffView.jsx`), AI error auto-fix on `/api/execute` failures, Copilot-style inline completion via Monaco `InlineCompletionProvider`.

---

## 7. Integration Plan With This Codebase

### 7.1 New frontend files

| File | Responsibility |
|---|---|
| `Frontend/src/lib/aiContext.js` | Build the context snapshot from `EditorPage` state + `ydoc` (current file, selection, cursor, tabs, tree). Truncation helpers reused by prompt builder mirror |
| `Frontend/src/hooks/useAIChat.js` | Chat state, streaming via `fetch` + `ReadableStream`, abort, localStorage persistence |
| `Frontend/src/components/AIChatPanel.jsx` | Right-panel chat UI (reuse ChatPanel's layout pattern), markdown/code rendering, copy/insert buttons, Stop |
| `Frontend/src/components/AICodeBlock.jsx` | Render one ```fenced block with copy + "insert at cursor" |

### 7.2 Frontend files to modify

| File | Change |
|---|---|
| `EditorPage.jsx` | Add `showAI` state (mirror `showChat`); render `<AIChatPanel>` in the same `absolute top-4 bottom-4 right-4 z-20 w-80` wrapper (EditorPage.jsx:2108); pass a `getContextSnapshot()` built from existing state + `getFileContent`; add Ctrl/Cmd+K handler near existing shortcuts (EditorPage.jsx:1469) |
| `EditorToolbar.jsx` | Add an "AI" toggle button (mirror `onToggleGit`, EditorToolbar.jsx:181) — pass `showAI`/`onToggleAI` |
| `ShortcutsModal.jsx` | Document the new shortcut |
| `src/app/App.css` (or `index.css`) | Minimal styles for chat bubbles / code blocks if not fully Tailwind |

### 7.3 New backend files

| File | Responsibility |
|---|---|
| `Backend/routes/ai.js` | `POST /chat` (SSE) + `GET /config`. Auth + room access + rate limit + wiring |
| `Backend/services/groqClient.js` | OpenAI-compatible fetch wrapper (stream:true, AbortSignal, retries, timeout) |
| `Backend/services/contextBuilder.js` | Enrich client snapshot: filtered file tree from Mongo, role, git status, sanitization (strip `.env`-ish paths) |
| `Backend/services/promptBuilder.js` | Token budgeting + priority truncation + system prompt assembly |
| `Backend/utils/sse.js` | SSE writer: `data:` framing, `[DONE]`, error events, client-disconnect → upstream abort |
| `Backend/services/symbolIndex.js` *(P2)* | Symbol + import extraction per room |
| `Backend/services/embeddingService.js` *(P3)* | Pluggable embeddings + in-memory vector store |
| `Backend/services/agentEngine.js` *(P4)* | Tool-calling loop + diff→Yjs apply |

### 7.4 Backend files to modify

| File | Change |
|---|---|
| `Backend/server.js` | `app.use("/api/ai", aiRoutes)` near server.js:150; (P4) access to `ySocketIO` already exists via `app.set` |
| `Backend/middleware/auth.js` | *(P4 only)* a `requireEditorRole` wrapper if `apply_edit` needs `editor+` (or reuse `requireProjectRole("owner","editor")`) |
| `Backend/.env.example` | Add `GROQ_API_KEY`, `GROQ_MODEL=llama-3.3-70b-versatile`, `GROQ_MAX_TOKENS`, `AI_RATE_LIMIT` |
| `Backend/package.json` | *(P3 only)* `@xenova/transformers` if local embeddings |

### 7.5 Database changes

- **Phase 1: none.** AI conversation history is client-side. This is a deliberate MVP boundary.
- **Phase 2 (optional):** `models/AIConversation.js` for cross-device history, if wanted.
- **Phase 4:** no schema needed for apply-edit (writes go through the existing Yjs doc + save pipeline), but an `ai_edits` audit collection is recommended for rollback/forensics.

### 7.6 New environment variables

```
GROQ_API_KEY=            # required; enables /api/ai
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_BASE_URL=https://api.groq.com/openai/v1   # override for testing
AI_MAX_INPUT_TOKENS=64000                      # per-request budget
AI_RATE_LIMIT=20                               # requests per 5 min per user
```

---

## 8. Performance & Cost Considerations

### 8.1 Token optimization

- **Budget first, then assemble.** `promptBuilder` computes available tokens from `AI_MAX_INPUT_TOKENS`, then fills in priority order (selection → current file → tabs → tree → history → system), truncating each slice independently. Current file truncation strategy: if over budget, keep **head (30%) + around-cursor window (40%) + tail (30%)** so the model still sees signatures and ending.
- **Token estimation:** use `Math.ceil(chars / 4)` for MVP (≈ English+code average); upgrade to a real tokenizer (`gpt-tokenizer`, `tiktoken`) in Phase 2 for accuracy. Never trust model-reported usage for *pre-send* decisions.
- **Don't resend unchanged context.** Since history is client-side, cache the serialized editor snapshot per (file,line,sel-hash); if unchanged, reuse the string.

### 8.2 Caching

- **Prompt hash cache (MVP):** identical `(question-hash, context-hash)` → short TTL Redis hit returns the cached SSE transcript. Rarely hits in chat, cheap to add.
- **Embedding cache (P3):** key = `sha256(fileContent)` → vector. Skip re-embedding unchanged files.
- **Retrieval cache (P3):** `sha256(query)` → top-k paths for 60s.

### 8.3 Cost reduction

- **Model tiering:** `GROQ_MODEL` default (70B-class) for rich Q&A; a cheap fast model (`llama-3.1-8b-instant`) for "summarize this diff" or inline actions. Route by request type.
- **Per-user/per-room budgets:** daily token budget via Redis counters; 429 with a friendly message when exhausted. This is essential because a room can be shared and abuse is cheap to trigger.
- **Keep output small:** `max_tokens` (e.g. 2048) caps runaway responses.
- **Embeddings note:** Groq has no embeddings API, so Phase 3 cost depends on provider choice. Local `transformers.js` = $0 and private; hosted = pennies, but adds a key.

### 8.4 Latency

- **SSE streaming** collapses perceived latency to first-token. Groq is purpose-built for low TTFT.
- **Start the request before UI settles:** fire the request on Send, render a streaming bubble immediately; never block on a "thinking" spinner.
- **Abort propagation:** client AbortController → route aborts the Groq upstream fetch → frees the worker. Without this, users hammering Stop still pay for full generations.
- **Don't block the event loop:** Groq calls are I/O; keep CPU work (tokenization/truncation) in the prompt builder and consider a BullMQ job only if concurrent AI usage grows beyond a single process.

### 8.5 Concurrency

- Same-process concurrency is fine for Phase 1 (Node 20 + keep-alive upstream). If deployed across multiple API instances, the per-user Redis rate limiter and any in-memory Phase-2/3 indexes must move behind Redis — the services layer's interfaces are designed for exactly this swap.

---

## 9. Security & Guardrails

1. **Never send secrets to the model.** Enforce `ALWAYS_IGNORED` + `.gitignore` filtering (reuse `filterEditorProject`/`getHiddenPaths`) and *additionally* block `.env*`, credentials, and known secret patterns in `contextBuilder` regardless of what the client sends.
2. **Server-side authorization is mandatory.** `/api/ai/chat` requires `authenticateToken` + `requireRoomAccess`; the room context is taken from the **authenticated** roomId, never blindly trusted from the payload.
3. **Role-aware Phase 4.** `apply_edit` requires `editor+` and respects `readOnly` — mirror the `save` route exactly.
4. **Rate limits + daily budgets** (Redis) per user and per room; return a clear 429 SSE error.
5. **Prompt injection hygiene.** The client-provided `question` and even file contents are untrusted input to the LLM. The system prompt instructs the model to ignore instructions embedded in file content ("you are now..."), and MVP limits the model to files present in the tree (no invented paths).
6. **Audit log (Phase 4).** Record AI apply-edit operations; reuse snapshot/git backup so every AI change is reversible via the existing history.
7. **Never expose `GROQ_API_KEY`** to the client; `/api/ai/config` returns only `enabled`/`model`.

---

## 10. Risks & Open Decisions

| Decision | Recommendation | Why |
|---|---|---|
| Per-user vs. shared AI chat | **Per-user for MVP** | Shared raises conflicts + multi-tenant context concerns; per-user matches Cursor/Copilot mental model |
| SSE vs. Socket.IO for AI stream | **SSE over POST** | Fits Vite proxy + cookie auth, trivial abort; Socket.IO adds nothing here (we already have it for the *rest* of the app) |
| History persistence | **localStorage (client)** Phase 1; Mongo optional P2 | No schema change for MVP |
| Embeddings provider (P3) | Local `@xenova/transformers`, pluggable | Groq has no embeddings endpoint; local = free + private, swappable later |
| Parser vs. regex for symbols (P2) | **Regex first** | tree-sitter is heavy to add for marginal gain at our repo scale |
| Tokenizer | chars/4 → real tokenizer in P2 | Good enough for MVP, cheap to improve |
| Multi-instance scale | Keep interfaces DB-agnostic; move indexes to Redis if horizontal scaling | The codebase's own PLAN.md already targets horizontal scaling |

---

## Appendix A — SSE wire format (Phase 1)

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"delta":"Why"} \n
data: {"delta":" the save"} \n
...
data: [DONE] \n
```

Client parses lines starting with `data: ` (ignore `event:`/`id:` for MVP), reassembles `delta`, stops on `[DONE]`, and surfaces `data: {"error": ...}` as a failed message.

## Appendix B — Prompt structure (Phase 1)

```
system:  <§5.3 persona + rules>
user:    --- EDITOR CONTEXT ---
         CURRENT FILE: src/routes/ai.js (javascript)
         SELECTION (lines 12-18):
         ```js
         router.post("/chat", ...)
         ```
         CURSOR: line 21, col 4
         OPEN TABS: src/routes/ai.js, src/services/promptBuilder.js
         FILE TREE:
         - Backend/server.js
         - Backend/routes/ai.js
         ...
         --- CONVERSATION ---
         (previous turns, oldest → newest, trimmed to budget)
         --- QUESTION ---
         Why does this route fail for viewers?
```

The "EDITOR CONTEXT" block is generated by `promptBuilder` from the `contextBuilder`-enriched snapshot. The model only ever *sees* what the budget allows; everything else is retrieval/Phase-2+.

---

*End of document.*
