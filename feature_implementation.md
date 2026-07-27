# Feature Implementation Roadmap

---

## Phase 5 - Coding Features

### Code Execution
- **Technology:** Docker sandbox for isolated code execution
- **Supported Languages:** Python, Java, C++, JavaScript, and more
- **Features:**
  - Run button in toolbar
  - Input Box (stdin)
  - Output Box (stdout + stderr)
  - Execution Time display
  - Memory usage display
  - Stop Execution (kill process)
  - Custom Test Cases (run against multiple inputs)
- **Architecture:**
  - Backend: Docker API (dockerode) to spawn containers per execution
  - Containers run with resource limits (CPU, memory, timeout)
  - Ephemeral containers — destroyed after execution
  - Queue system for concurrent executions (Bull/BullMQ + Redis)
  - Language-specific base images (python:3.11-slim, node:20-slim, openjdk:21, gcc:13)
- **Implementation Steps:**
  1. Create `Execution` model (roomId, language, code, stdin, stdout, stderr, exitCode, time, memory, status)
  2. Create `/api/execute` route with Docker sandbox logic
  3. Create `ExecutionPanel` component (input, output, stats, stop button)
  4. Add "Run" button to EditorToolbar
  5. Add language selector (auto-detect from file extension)
  6. WebSocket for streaming stdout/stderr in real-time

### Save Snippets
- Save code snippets to account (not just rooms)
- Snippet list with search/filter
- Copy to clipboard, share link
- Tags/categories

### Download Code
- Download current file
- Download entire project as ZIP (using jszip)
- Preserve folder structure

---

## Phase 6 - AI Features

### Explain Code
- One-click explanation of selected code or entire file
- Uses GPT-4/Claude API
- Returns plain English explanation
- Highlight referenced variables/functions

### Find Bugs
- Analyze code for potential bugs
- Shows bug location + explanation + suggested fix
- Severity levels (error, warning, info)

### Optimize Code
- Suggest performance optimizations
- Show before/after diff
- Explain why the optimization helps

### Generate Tests
- Auto-generate unit tests for selected function
- Support Jest, pytest, JUnit, GoogleTest
- Show generated tests in a new file tab

### Generate Documentation
- Auto-generate JSDoc/docstrings
- Generate README sections
- API documentation from code

### Convert Language
- Convert code between languages (Python → C++, etc.)
- Side-by-side diff view
- Preserve logic/structure

### Ask AI
- Quick prompt bar (Cmd+K)
- Context-aware (knows current file, selection, errors)
- Suggestions based on cursor position

### AI Chat
- Full chat interface with AI assistant
- Context-aware (remembers conversation + codebase)
- Code blocks with syntax highlighting
- Copy/insert code from AI response

### AI Diff
- Show AI suggestions as git-style diffs
- + added (green)
- - removed (red)
- Accept/reject individual changes

---

## Phase 7 - History

### Version Control
- Google Docs-style version history
- Auto-save creates versions (every N minutes or on significant changes)
- Version list with timestamps and user avatars
- Click version to preview (read-only editor)

### Restore Version
- One-click restore to any previous version
- Confirmation dialog before restore
- Creates a new version when restoring (non-destructive)

### Timeline
- Visual timeline of edits
- Shows who edited what and when
- E.g., "8:12 — Rahul edited line 20", "8:14 — Nithin removed function"
- Filter by user or time range

### Undo by User
- Undo changes made by a specific user
- Select user → select time range → undo

### Snapshot
- Manual snapshots with labels
- Named snapshots (e.g., "Before refactor", "Release v1.0")
- Compare any two snapshots (diff view)
- Export snapshot as ZIP

---

## Phase 8 - Real-Time Awareness

### Active Users
- Green dot for active users
- Show in sidebar with avatar + name
- Last active timestamp

### Idle Users
- Yellow dot for idle users (no activity for 30s)
- Gray dot for offline/disconnected users

### Mouse Positions
- See other users' mouse positions in real-time
- Colored cursor with name label
- Optional: show in minimap

### Scroll Sync
- When following a user, sync scroll position
- Smooth scrolling to match followed user's viewport
- Can be toggled on/off independently of follow

### Mini Map
- VSCode-style minimap on the right side
- Shows colored dots/lines for each user's cursor position
- Click to jump to that user's location
- Shows overview of code structure

### Follow Cursor
- Click "Follow" on a user in sidebar
- Editor auto-scrolls to their cursor in real-time
- "Following {username}" indicator with stop button
- Auto-switches files if the followed user switches files
- Smooth transitions between positions

---

## Phase 9 - Voice & Video Communication

### Voice Chat
- **Technology:** WebRTC (peer-to-peer audio)
- **Architecture:**
  - Signaling via existing Socket.IO connection
  - STUN/TURN servers for NAT traversal (use public STUN + optional TURN)
  - Each participant sends/receives audio streams
- **Features:**
  - Mute/unmute microphone toggle
  - Speaker indicator (who's talking via audio level detection)
  - Leave voice channel button
  - Audio quality settings
- **UI:**
  - Voice channel section in sidebar (like Discord)
  - Green circle around avatar when speaking
  - Mic icon next to username in user list
- **Implementation Steps:**
  1. Add WebRTC signaling events to Socket.IO (`voice-offer`, `voice-answer`, `voice-ice-candidate`)
  2. Create `VoiceChannel` component managing peer connections
  3. Use `navigator.mediaDevices.getUserMedia({ audio: true })` for mic access
  4. Mesh topology: each peer connects to every other peer (works for rooms up to ~6 users)
  5. For larger rooms, consider SFU with mediasoup or Jitsi
  6. Add voice state to awareness (`voiceConnected: true/false`)

### Video Chat
- **Technology:** WebRTC (peer-to-peer video + audio)
- **Architecture:**
  - Same signaling as voice chat
  - Additional video stream tracks
- **Features:**
  - Camera on/off toggle
  - Screen sharing
  - Grid view / speaker view layout
  - Picture-in-picture floating windows
- **UI:**
  - Small floating video windows (draggable, resizable)
  - Grid layout option for multiple participants
  - Minimize/maximize controls
  - Video mute indicator
- **Implementation Steps:**
  1. Extend WebRTC signaling for video tracks
  2. Create `VideoWindow` component (small floating, draggable)
  3. Create `VideoGrid` component for layout
  4. Use `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`
  5. Screen share via `navigator.mediaDevices.getDisplayMedia()`
  6. Add video state to awareness

### Raise Hand
- **Purpose:** Classroom/workshop use case — participants signal they want to speak
- **Features:**
  - "Raise Hand" button in toolbar or sidebar
  - Hand icon appears next to username in user list
  - Raised hands shown in notification bar at top
  - Host/moderator can "lower" hands or call on someone
  - Queue order (who raised first)
- **Implementation:**
  - Add `handRaised: boolean` and `handRaisedAt: timestamp` to awareness
  - Add "Raise Hand" button to EditorToolbar or sidebar
  - Notification banner when hands are raised (for room owner)
  - Sound notification option

---

## Phase 10 - Role System

### Role Hierarchy
- **Owner:** Full control — manage roles, kick, ban, delete room, settings
- **Editor:** Can edit code, create files, leave comments
- **Viewer:** Read-only access — can view code, leave comments, chat

### Permissions
| Action | Owner | Editor | Viewer |
|--------|-------|--------|--------|
| Edit code | Yes | Yes | No |
| Create/delete files | Yes | Yes | No |
| Leave comments | Yes | Yes | Yes |
| Chat | Yes | Yes | Yes |
| Kick users | Yes | No | No |
| Ban users | Yes | No | No |
| Change roles | Yes | No | No |
| Delete room | Yes | No | No |
| Manage settings | Yes | No | No |

### Features
- Invite Only mode (only invited users can join)
- Read Only mode (all non-owners become viewers)
- Kick User (remove from room, can rejoin)
- Ban User (blocked from room entirely)
- Password Protected Rooms (require password to join)
- Role badge next to username in sidebar

### Implementation Steps:
  1. Add `role` field to User model per-room (Map<roomId, role>)
  2. Add `settings` to Project model (inviteOnly, readOnly, password, bannedUsers[])
  3. Create `/api/rooms/:roomId/roles` route (update role, kick, ban)
  4. Middleware: check role permissions on file/comment/edit operations
  5. `RoleManager` component for owner to manage roles
  6. Password prompt component on room join

---

## Phase 11 - Backend Architecture

### Target Architecture
```
GitHub
  ↓
GitHub Actions (CI/CD)
  ↓
Docker Build (multi-stage)
  ↓
Push Image to Amazon ECR
  ↓
Amazon ECS (or EC2)
  ↓
Application Load Balancer
  ↓
CloudFront (optional CDN)
  ↓
Domain + HTTPS
```

### Architecture Design (shows system thinking)
```
API Gateway
  ↓
Node Server (Express 5)
  ↓
Redis Pub/Sub (sessions, cache, rate limiting)
  ↓
Socket.IO (real-time events)
  ↓
MongoDB (persistent data)
  ↓
Docker (code execution sandbox)
```

Even with one backend instance, designing for horizontal scaling shows good system thinking.

### Requirements
- Docker Compose for local development
- Multi-stage Docker builds (build + production images)
- Health check endpoint (`/health`)
- Structured logging (winston/pino)
- Environment variable management (.env, validation)
- Automatic restart policy (Docker: `restart: unless-stopped`)
- CI/CD pipeline (GitHub Actions)
- Metrics dashboard (basic — uptime, active connections, request count)

### Docker Compose (local dev)
```yaml
services:
  api:
    build: ./Backend
    ports: ["3000:3000"]
    depends_on: [mongo, redis]
    environment:
      - MONGO_URI=mongodb://mongo:27017/collab-editor
      - REDIS_URL=redis://redis:6379
  mongo:
    image: mongo:7
    volumes: ["mongo-data:/data/db"]
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
```

### Multi-stage Dockerfile
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3000
HEALTHCHECK --interval=30s CMD curl -f http://localhost:3000/health
CMD ["node", "server.js"]
```

---

## Phase 12 - Nice UI Touches

### Animations & Polish
- Animated join/leave notifications (toast slide-in/out)
- User avatars (Google/GitHub photo or generated initials)
- Toast messages (success, error, info — auto-dismiss)
- Keyboard shortcuts panel (Cmd+/ to view all)
- Connection status indicator (Connected/Reconnecting/Offline)
- Loading skeletons (instead of blank screens)
- Responsive layout (collapsible sidebar on mobile)
- Dark mode (already default, add light mode toggle)
- Share dialog (copy link, QR code, social share)
- Recently opened rooms (on Dashboard)

### Micro-interactions
- Hover effects on buttons and cards
- Active state feedback on clicks
- Smooth panel open/close transitions
- File explorer expand/collapse animation
- Tab switch animation in editor

---

## Bonus Features (Great Resume Material)

### CRDT Collaboration
- Already using Yjs (CRDT) instead of naive OT syncing
- Offline editing with automatic merge on reconnect
- Conflict-free concurrent edits

### Collaborative Whiteboard
- Canvas-based drawing tool alongside the editor
- Shapes, lines, freehand, text
- Shared via Yjs (awareness + CRDT sync)
- Use case: architecture diagrams, pseudocode flowcharts

### Terminal Sharing
- WebSocket + containerized shell (xterm.js + Docker)
- Multiple users see same terminal
- Only owner/editor can type
- Session recording and playback

### Live Markdown Preview
- Split-pane Markdown renderer
- Real-time preview as you type
- GitHub-flavored Markdown support
- Export as HTML/PDF

### Plugin/Extensions Architecture
- Custom plugins via npm packages
- Plugin API for toolbar buttons, panels, themes
- Hot-load plugins without restart
- Community plugin registry

### Presence Heatmap
- Shows which lines/sections are being actively edited
- Color intensity based on recent edit frequency
- Helps identify collaboration hotspots

### Session Recording & Replay
- Record all awareness + edit events
- Replay editing session in real-time or fast-forward
- Useful for code review, demos, teaching
- Store recordings as compressed event logs

---

## Completed

### Phase 5 - Coding Features
- Docker sandbox execution via dockerode (with child_process fallback)
- Supported languages: JavaScript, Python, Java, C++, C, Ruby, Go
- Stop Execution — kill running processes/containers from UI
- Memory usage tracking per execution
- Custom Test Cases — save, edit, delete, filter by language
- Run single, selected, or all test cases against code
- Persistent Snippets — stored in MongoDB (was in-memory Map)
- Download Code — single file + project ZIP (already existed)
- Sandbox indicator (Docker Sandbox vs No Sandbox badge)
- docker-compose.yml for local dev (mongo + api + sandbox builder)
- Resource limits: 256MB memory, 50% CPU, 15s timeout, no network, 100 PIDs

### Phase 1 - Project Setup
- React 19 + Vite + Tailwind CSS 4 (frontend)
- Express 5 + Socket.IO + Yjs (backend)
- MongoDB Atlas + Mongoose
- Passport.js (Google + GitHub OAuth)
- JWT auth in httpOnly cookies

### Phase 2 - Auth & Multi-File
- Guest / Google / GitHub login
- Multi-file editor with Yjs CRDT
- File explorer (create, rename, delete, move, folders)
- Theme selection (5 themes)
- Font size control
- Auto-save (10s) + Ctrl+S manual save
- Room system (random IDs, share/invite links)
- Dashboard (room history, create, join, search, delete)

### Phase 3 - Presence & Collaboration
- Live cursors with colored labels
- User presence (active/idle status dots)
- Typing indicators
- WebSocket auth (JWT in handshake)

### Phase 4 - Comments & Versioning
- Comment system (CRUD, replies, reactions, resolve)
- Gutter decorations for commented lines
- Floating comment button on text selection
- Click gutter dots to scroll to comment
- Snapshot versioning (message, author, file count)
- SnapshotDialog with side-by-side diff preview
- Quick snapshot (Ctrl+Shift+S)
- Restore from snapshot (clears content before inserting)
- Smooth amber highlight on focused comment (3s fade-out)

### Phase 8 Partial - Follow User & Chat (In Progress)
- Follow user cursor (awareness-based auto-scroll)
- Side chat panel (REST + Socket.IO real-time)
- Follow/Unfollow buttons in user list
- Following indicator with stop button
