import { getGitStatus, getGitDiffStat } from "../utils/projectSync.js"
import { getUserProjectRole } from "../middleware/auth.js"
import { getRoomIndex, getRelatedFiles, getSymbolPortion } from "./symbolIndex.js"
import { semanticSearch } from "./retrievalService.js"
import { isSecretPath, redactSecrets } from "./sanitize.js"

const MAX_SERVER_FILE_CHARS = 40000
const MAX_SERVER_TAB_CHARS = 20000
const MAX_SERVER_SELECTION_CHARS = 20000
const MAX_SERVER_HISTORY_CHARS = 8000

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
      content: redactSecrets(String(currentFile.content || "").slice(0, MAX_SERVER_FILE_CHARS)),
    }
  }

  const selection = clientSnapshot.selection
  if (selection && typeof selection.text === "string" && selection.text.trim()) {
    context.selection = {
      text: redactSecrets(selection.text.slice(0, MAX_SERVER_SELECTION_CHARS)),
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
          content: redactSecrets(String(t.content || "").slice(0, MAX_SERVER_TAB_CHARS)),
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
        .map((m) => ({ role: m.role, content: redactSecrets(m.content.slice(0, MAX_SERVER_HISTORY_CHARS)) }))
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
        .filter((relPath) => !isSecretPath(relPath))
        .map((relPath) => {
          const relEntry = index.get(relPath)
          if (!relEntry) return null
          const imported = entry.imports.find((i) => i.resolved === relPath)
          let portions = []
          if (imported?.names?.length) {
            portions = imported.names
              .map((name) => ({ name, code: redactSecrets(getSymbolPortion(roomId, relPath, name)) }))
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
