# Terminal & GitHub Integration — 4-Phase Plan

## Phase 1 — Working Terminal with npm/git ✓
**Goal:** Terminal actually works, can run `npm i`, `npm run dev`, `git`, etc.

- [x] Custom terminal Docker image (`opencode-terminal:latest`) with node, npm, git
- [x] Sync project files from MongoDB to filesystem before terminal starts
- [x] Copy project files into terminal container as `/workspace` via `putArchive`
- [x] Fix Docker attach/stream (use `container.attach()` instead of `exec` for reliable I/O)
- [x] On-demand image build in `terminalManager.js` + `docker-compose` build service
- [x] Graceful fallback: local shell if Docker unavailable
- [x] Resize support via `container.resize()` (was `exec.resize()`)
- [x] Better resource limits (Init container, 512 PIDs)  

## Phase 2 — Git UI (Source Control Panel) ✓
**Goal:** GUI for git operations — no terminal needed for basic git workflow

- [x] `simple-git` backend integration
- [x] `Backend/routes/git.js` — REST endpoints (status, log, commit, branch, init, add, checkout)
- [x] `SourceControlPanel.jsx` — sidebar panel showing changed files, staged/unstaged, branches, history
- [x] Commit message input + Commit button (with Ctrl+Enter shortcut)
- [x] Branch selector (create, switch, list)
- [x] Initialize repo button (for non-git projects)
- [x] Git button in EditorToolbar
- [x] Error/success toast messages inline

## Phase 3 — GitHub Remote Integration
**Goal:** Push/pull/clone from GitHub

- [ ] GitHub OAuth token plumbing (from existing Passport.js GitHub strategy)
- [ ] `git clone <url>` — import GitHub repo as new project
- [ ] Push/Pull buttons with progress indicators
- [ ] Authentication handling (ssh keys / credential helper)
- [ ] `git clone` endpoint that creates a new room from a GitHub URL
- [ ] Commit history view (git log rendered in UI)

## Phase 4 — Git + Snapshot Coexistence & Polish
**Goal:** Both versioning systems work together seamlessly

- [ ] Editor state ↔ filesystem sync strategy (two-way)
- [ ] Git-aware snapshot creation (snapshot also creates a git commit)
- [ ] Auto-detect git changes and show in SnapshotHistory
- [ ] "Sync to Editor" / "Sync to Disk" buttons
- [ ] node_modules exclusion from Yjs/editor
- [ ] .gitignore awareness in file tree
- [ ] Polish: credential management, error handling, onboarding flow
