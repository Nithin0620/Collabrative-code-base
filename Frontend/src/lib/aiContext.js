import { getFileInfo } from "./fileTree"

// Rough token estimate shared with the prompt builder (chars / 4).
export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4)
}

const MAX_CURRENT_FILE_CHARS = 32000 * 4
const MAX_TAB_CHARS = 2000 * 4
const MAX_TREE_ENTRIES = 500

function buildPath(itemId, tree) {
  const item = tree[itemId]
  if (!item) return []
  const parentPath = item.parentId ? buildPath(item.parentId, tree) : []
  return [...parentPath, item.name]
}

export function getFilePath(fileId, tree) {
  return buildPath(fileId, tree).join("/")
}

function buildTreePaths(tree, limit = MAX_TREE_ENTRIES) {
  const paths = []
  const items = Object.values(tree || {})
  const childrenMap = {}
  items.forEach((item) => {
    const parent = item.parentId || "__root__"
    if (!childrenMap[parent]) childrenMap[parent] = []
    childrenMap[parent].push(item)
  })

  const walk = (parentKey, parts) => {
    if (paths.length >= limit) return
    for (const child of childrenMap[parentKey] || []) {
      if (paths.length >= limit) return
      const rel = [...parts, child.name].join("/")
      if (child.type === "file") paths.push(rel)
      else walk(child.id, [...parts, child.name])
    }
  }
  walk("__root__", [])
  return paths
}

// Keep head + tail and a window around the cursor so huge buffers stay within
// the payload budget while the model still sees signatures and endings. Each
// segment is capped by its own budget so a single very long line cannot blow
// past maxChars.
function truncateFileContent(content, cursorLine, maxChars) {
  if (content.length <= maxChars) return content

  const lines = content.split("\n")
  const headChars = Math.floor(maxChars * 0.3)
  const tailChars = Math.floor(maxChars * 0.3)

  let head = ""
  let i = 0
  while (i < lines.length && head.length < headChars) {
    const line = lines[i] + "\n"
    head += line.length <= headChars - head.length ? line : line.slice(0, headChars - head.length)
    i++
  }

  let tail = ""
  let j = lines.length - 1
  while (j > i && tail.length < tailChars) {
    const line = lines[j] + "\n"
    tail = line.length <= tailChars - tail.length ? line + tail : line.slice(0, tailChars - tail.length) + tail
    j--
  }

  const marker = "\n... [truncated] ...\n"
  const cursorIdx = Math.max(0, (cursorLine || 1) - 1)
  const from = Math.max(i, cursorIdx - 40)
  const to = Math.min(j + 1, cursorIdx + 41)
  const middleRaw = lines.slice(from, to).join("\n")
  const middleBudget = Math.max(
    0,
    maxChars - head.length - tail.length - (head ? marker.length : 0) - (j < lines.length - 1 ? marker.length : 0)
  )
  const middle = middleRaw.length <= middleBudget ? middleRaw : middleRaw.slice(0, middleBudget)

  return (
    (head ? head + marker : "") +
    middle +
    (j < lines.length - 1 ? marker + tail : "")
  )
}

// Build the client-side "editor context snapshot" posted to /api/ai/:roomId/chat.
export function buildContextSnapshot({ roomId, question, ydoc, fileTree, selectedFileId, openTabs, selection, cursor, history, useRetrieval }) {
  const currentFileName = selectedFileId ? fileTree[selectedFileId]?.name : null
  const currentFileContent = selectedFileId ? ydoc.getText("file:" + selectedFileId).toString() : ""

  const snapshot = {
    roomId,
    question,
    useRetrieval: useRetrieval === true,
    currentFile: currentFileName
      ? {
          path: getFilePath(selectedFileId, fileTree),
          language: getFileInfo(currentFileName).language,
          content: truncateFileContent(currentFileContent, cursor?.line, MAX_CURRENT_FILE_CHARS),
        }
      : null,
    selection: selection
      ? {
          text: selection.selectedText,
          startLine: selection.startLine,
          endLine: selection.endLine,
        }
      : null,
    cursor: cursor ? { line: cursor.line, column: cursor.column } : null,
    openTabs: (openTabs || [])
      .filter((id) => id && id !== selectedFileId)
      .map((id) => {
        const name = fileTree[id]?.name
        if (!name) return null
        const content = ydoc.getText("file:" + id).toString()
        return {
          path: getFilePath(id, fileTree),
          language: getFileInfo(name).language,
          content: truncateFileContent(content, null, MAX_TAB_CHARS),
        }
      })
      .filter(Boolean)
      .slice(0, 20),
    fileTree: buildTreePaths(fileTree, MAX_TREE_ENTRIES),
    history: (history || []).slice(-12),
  }

  return snapshot
}
