import { getGitStatus, getGitDiffStat } from "../utils/projectSync.js"
import { getUserProjectRole } from "../middleware/auth.js"
import { getRoomIndex, getRelatedFiles, getSymbolPortion } from "./symbolIndex.js"
import { semanticSearch } from "./retrievalService.js"

// Paths that should never reach the model regardless of what the client sends.
const SECRET_PATH_RE =
  /(^|\/)(node_modules|\.git)(\/|$)|(^|\/)\.env([.\w]*)$|(^|\/)\.[\w-]*(secret|credential|credentials)[\w.-]*$|(^|\/)(\.aws|\.ssh|\.config)(\/|$)|(^|\/)(id_rsa|id_ed25519|\.npmrc|\.pgpass|\.netrc|\.git-credentials)$/i

// Redact obvious secret assignments inside otherwise-safe file content.
const SECRET_LINE_RE =
  /\b(password|passwd|secret|client_?secret|api[_-]?key|apikey|access[_-]?key|refresh[_-]?token|auth[_-]?token|bearer|private[_-]?key|database[_-]?url)\b\s*[:=]\s*["'][^"']{4,}["']/gi

function redactSecrets(content) {
  return String(content || "").replace(SECRET_LINE_RE, (match) =>
    match.replace(/[:=]\s*["'][^"']*["']/i, ': "<redacted>"')
  )
}

function isSecretPath(p) {
  return SECRET_PATH_RE.test(String(p || ""))
}

// Enrich the client-provided snapshot with project metadata, role info, git
// status, and sanitization. Never trusts the client blindly for access.
export async function buildContext({ roomId, project, userId, clientSnapshot = {} }) {
  const role = getUserProjectRole(project, userId)
  const readOnly = !!(project.settings?.readOnly && role !== "owner")

  const context = {
    roomId,
    projectName: project.name || project.roomId,
    role: role || "viewer",
    readOnly,
    question: String(clientSnapshot.question || "").slice(0, 20000),
  }

  const currentFile = clientSnapshot.currentFile
  if (currentFile && typeof currentFile.path === "string" && !isSecretPath(currentFile.path)) {
    context.currentFile = {
      path: currentFile.path.slice(0, 500),
      language: typeof currentFile.language === "string" ? currentFile.language : "plaintext",
      content: redactSecrets(String(currentFile.content || "")),
    }
  }

  const selection = clientSnapshot.selection
  if (selection && typeof selection.text === "string" && selection.text.trim()) {
    context.selection = {
      text: redactSecrets(selection.text.slice(0, 20000)),
      startLine: Number(selection.startLine) || 0,
      endLine: Number(selection.endLine) || 0,
    }
  }

  const cursor = clientSnapshot.cursor
  if (cursor) {
    context.cursor = {
      line: Number(cursor.line) || 0,
      column: Number(cursor.column) || 0,
    }
  }

  context.openTabs = Array.isArray(clientSnapshot.openTabs)
    ? clientSnapshot.openTabs
        .slice(0, 20)
        .filter((t) => t && typeof t.path === "string" && !isSecretPath(t.path))
        .map((t) => ({
          path: t.path.slice(0, 500),
          language: t.language || "plaintext",
          content: redactSecrets(String(t.content || "").slice(0, 20000)),
        }))
    : []

  context.fileTree = Array.isArray(clientSnapshot.fileTree)
    ? clientSnapshot.fileTree
        .map((p) => String(p || ""))
        .filter(Boolean)
        .filter((p) => !isSecretPath(p))
        .slice(0, 500)
    : []

  context.history = Array.isArray(clientSnapshot.history)
    ? clientSnapshot.history
        .slice(-20)
        .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .map((m) => ({ role: m.role, content: redactSecrets(m.content.slice(0, 8000)) }))
    : []

  const git = await getGitStatus(roomId).catch(() => null)
  if (git && git.isRepo && git.uncommitted > 0) {
    context.git = git
    const diff = await getGitDiffStat(roomId).catch(() => null)
    if (diff) context.gitDiff = diff
  }

  // Symbol + related-file awareness (Phase 2).
  const index = await getRoomIndex(roomId, project)
  if (index && context.currentFile) {
    const entry = index.get(context.currentFile.path)
    if (entry) {
      context.currentSymbols = entry.symbols.slice(0, 60)

      const related = getRelatedFiles(roomId, context.currentFile.path, { limit: 2 })
      context.relatedFiles = related
        .map((relPath) => {
          const relEntry = index.get(relPath)
          if (!relEntry) return null
          const imported = entry.imports.find((i) => i.resolved === relPath)
          let portions = []
          if (imported?.names?.length) {
            portions = imported.names
              .map((name) => ({ name, code: getSymbolPortion(roomId, relPath, name) }))
              .filter((p) => p.code)
          }
          return {
            path: relPath,
            language: relEntry.language,
            symbols: relEntry.symbols.slice(0, 20),
            portions,
          }
        })
        .filter(Boolean)
    }
  }

  // Semantic retrieval (Phase 3): auto-embed the question for repo-wide intent
  // or when the client explicitly asks, and attach the top chunks as context.
  const retrievalHint =
    /(where\s+is|which\s+file|find\s+|search|locate|repo(?:sitory)?-wide|across\s+(?:the\s+)?(?:codebase|repo|project)|how\s+is\s+[\w.]+\s+(?:used|implemented)|used\s+anywhere|implements?|references?)\b/i
  const wantRetrieval =
    clientSnapshot.useRetrieval === true || retrievalHint.test(String(context.question || ""))
  if (wantRetrieval) {
    context.retrieval = await semanticSearch(roomId, project, context.question, { topK: 5 }).catch(
      (err) => {
        console.warn("[retrieval] search failed:", err.message)
        return null
      }
    )
  }

  return context
}
