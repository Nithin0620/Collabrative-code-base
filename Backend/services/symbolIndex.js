import Project from "../models/Project.js"
import { isSecretPath, redactSecrets } from "./sanitize.js"

// In-memory per-room index of symbols and imports. Rebuilt on save and lazily
// from Mongo on first request. Keyed by roomId -> relative path -> entry.
const roomIndexes = new Map()
const indexMeta = new Map()

// ---- language detection (mirror of the frontend EXTENSION_MAP) ----
function getLanguage(name) {
  const ext = (name.split(".").pop() || "").toLowerCase()
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext)) return "javascript"
  if (ext === "py") return "python"
  if (ext === "rb") return "ruby"
  if (ext === "go") return "go"
  if (ext === "java") return "java"
  if (["c", "h", "cpp", "hpp", "cc", "cxx"].includes(ext)) return "c"
  if (ext === "rs") return "rust"
  if (ext === "php") return "php"
  return "text"
}

const SYMBOL_PATTERNS = {
  javascript: [
    { type: "function", re: /\b(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g },
    { type: "function", re: /\b(?:export\s+)?(?:async\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g },
    { type: "function", re: /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g },
    { type: "class", re: /\b(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g },
    { type: "const", re: /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g },
  ],
  python: [
    { type: "function", re: /\bdef\s+([A-Za-z_]\w*)\s*\(/g },
    { type: "class", re: /\bclass\s+([A-Za-z_]\w*)\s*[:(\[]/g },
  ],
  ruby: [
    { type: "function", re: /\bdef\s+([A-Za-z_]\w*)/g },
    { type: "class", re: /\bclass\s+([A-Za-z_]\w*)/g },
  ],
  go: [
    { type: "function", re: /\bfunc\s+([A-Za-z_]\w*)\s*\(/g },
    { type: "type", re: /\btype\s+([A-Za-z_]\w*)\s+(?:struct|interface)\b/g },
  ],
  java: [
    { type: "class", re: /\bclass\s+([A-Za-z_]\w*)/g },
    { type: "function", re: /\b(?:public|private|protected)\s+[\w<>\[\],\s.]+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g },
  ],
  c: [
    { type: "function", re: /\b[\w:]+\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/g },
  ],
  rust: [
    { type: "function", re: /\bfn\s+([A-Za-z_]\w*)/g },
    { type: "struct", re: /\bstruct\s+([A-Za-z_]\w*)/g },
    { type: "enum", re: /\benum\s+([A-Za-z_]\w*)/g },
  ],
  php: [
    { type: "function", re: /\bfunction\s+([A-Za-z_]\w*)\s*\(/g },
    { type: "class", re: /\bclass\s+([A-Za-z_]\w*)/g },
  ],
  text: [],
}

const IMPORT_PATTERNS = {
  javascript: [
    { re: /\bimport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g, spec: 2, names: 1 },
    { re: /\bimport\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g, spec: 2, names: 1 },
    { re: /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*['"]([^'"]+)['"]/g, spec: 2, names: 1 },
    { re: /\bimport\s*['"]([^'"]+)['"]/g, spec: 1 },
    { re: /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, spec: 1 },
    { re: /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, spec: 1 },
  ],
  python: [
    { re: /\bfrom\s+([\w.]+)\s+import\s+([\w,\s*]+)/g, spec: 1, names: 2 },
    { re: /\bimport\s+([\w.]+)/g, spec: 1 },
  ],
  ruby: [
    { re: /\brequire(?:_relative)?\s*['"]([^'"]+)['"]/g, spec: 1 },
  ],
  go: [
    { re: /\bimport\s+[A-Za-z_]\w*\s+["]([^"]+)["]/g, spec: 1 },
    { re: /\bimport\s+["]([^"]+)["]/g, spec: 1 },
    { re: /\bimport\s*\(\s*([\s\S]*?)\s*\)/g, spec: 0, block: true },
  ],
  java: [{ re: /\bimport\s+([\w.]+);/g, spec: 1 }],
  c: [{ re: /\s*#\s*include\s*[<"]([^>"]+)[>"]/g, spec: 1 }],
  rust: [{ re: /\buse\s+([\w:]+)/g, spec: 1 }],
  php: [{ re: /\b(?:use|require|require_once|include|include_once)\s+([^;]+);/g, spec: 1 }],
  text: [],
}

function extractSymbols(language, content) {
  const symbols = []
  const seen = new Set()
  const patterns = SYMBOL_PATTERNS[language] || []
  const newlineOffsets = []
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) newlineOffsets.push(i)
  }
  const lineForOffset = (offset) => {
    let lo = 0
    let hi = newlineOffsets.length
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2)
      if (newlineOffsets[mid] < offset) lo = mid + 1
      else hi = mid
    }
    return lo + 1
  }
  for (const { type, re } of patterns) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(content)) !== null) {
      const name = match[1]
      if (!name || seen.has(name)) continue
      seen.add(name)
      const line = lineForOffset(match.index)
      symbols.push({ name, type, line })
    }
  }
  return symbols
}

function extractImports(language, content) {
  const imports = []
  const seenSpecs = new Set()
  const patterns = IMPORT_PATTERNS[language] || []
  for (const pattern of patterns) {
    pattern.re.lastIndex = 0
    let match
    while ((match = pattern.re.exec(content)) !== null) {
      if (pattern.block) {
        const block = match[1]
        const inner = block.match(/["']([^"']+)["']/g) || []
        for (const quoted of inner) {
          const spec = quoted.slice(1, -1)
          if (!seenSpecs.has(spec)) {
            seenSpecs.add(spec)
            imports.push({ spec, names: null, resolved: null })
          }
        }
        continue
      }
      const spec = match[pattern.spec]
      if (!spec) continue
      if (seenSpecs.has(spec)) continue
      seenSpecs.add(spec)
      let names = null
      if (pattern.names) {
        names = match[pattern.names]
          .split(",")
          .map((s) => s.trim().split(/\s+as\s+/)[0].replace(/\*/g, ""))
          .filter(Boolean)
      }
      imports.push({ spec, names, resolved: null })
    }
  }
  return imports
}

// Resolve a relative import specifier to a project-relative path.
function resolveModulePath(currentPath, spec, pathMap, folderSet) {
  if (!spec || !spec.startsWith(".")) return null
  const dirParts = currentPath.split("/").slice(0, -1)
  const parts = [...dirParts]
  for (const seg of spec.split("/")) {
    if (!seg || seg === ".") continue
    if (seg === "..") {
      if (parts.length) parts.pop()
      continue
    }
    parts.push(seg)
  }
  const base = parts.join("/")
  if (pathMap.has(base)) return base
  const EXT_GUESSES = ["", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".json", ".css", ".html", ".md", ".py", ".rb", ".go", ".java", ".c", ".h", ".cpp", ".rs", ".php"]
  for (const ext of EXT_GUESSES) {
    if (pathMap.has(base + ext)) return base + ext
  }
  if (folderSet.has(base)) {
    const INDEX_NAMES = ["index.js", "index.jsx", "index.ts", "index.tsx", "index.mjs", "index.py", "index.html", "index.json"]
    for (const idx of INDEX_NAMES) {
      if (pathMap.has(base + "/" + idx)) return base + "/" + idx
    }
  }
  return null
}

function buildRoomIndex(roomId, fileTree, files, updatedAt) {
  const tree = fileTree instanceof Map ? Object.fromEntries(fileTree) : Object.fromEntries(Object.entries(fileTree || {}))

  const childrenMap = {}
  Object.values(tree).forEach((item) => {
    const parent = item.parentId || "__root__"
    if (!childrenMap[parent]) childrenMap[parent] = []
    childrenMap[parent].push(item)
  })

  const pathMap = new Map()
  const folderSet = new Set()
  const walk = (parentKey, parts) => {
    for (const child of childrenMap[parentKey] || []) {
      const rel = [...parts, child.name].join("/")
      if (child.type === "folder") {
        folderSet.add(rel)
        walk(child.id, [...parts, child.name])
      } else {
        pathMap.set(rel, child)
      }
    }
  }
  walk("__root__", [])

  const contentById = new Map((files || []).map((f) => [String(f.id), String(f.content || "")]))

  const index = new Map()
  for (const [rel, item] of pathMap) {
    if (isSecretPath(rel)) continue
    const content = redactSecrets(contentById.get(String(item.id)) || "")
    const language = getLanguage(item.name)
    const imports = extractImports(language, content).map((imp) => ({
      ...imp,
      resolved: resolveModulePath(rel, imp.spec, pathMap, folderSet),
    }))
    index.set(rel, {
      path: rel,
      language,
      symbols: extractSymbols(language, content),
      imports: imports.filter((imp) => imp.resolved),
      content,
    })
  }

  roomIndexes.set(roomId, index)
  indexMeta.set(roomId, { updatedAt: updatedAt || Date.now() })
  return index
}

// Synchronously rebuild the index from fresh editor state (used by /save).
export function rebuildRoomIndex(roomId, fileTree, files) {
  return buildRoomIndex(roomId, fileTree, files, Date.now())
}

// Get the index for a room, rebuilding it if it is stale relative to the
// project's updatedAt. Pass the already-fetched project to avoid a second query.
export async function getRoomIndex(roomId, project) {
  const existing = roomIndexes.get(roomId)
  const meta = indexMeta.get(roomId)

  let updatedAt = null
  let fileTree = null
  let files = null

  if (project) {
    updatedAt = new Date(project.updatedAt || 0).getTime()
    fileTree = project.fileTree
    files = project.files || []
  }

  if (existing) {
    if (meta && (!updatedAt || meta.updatedAt >= updatedAt)) return existing
    if (!meta) return existing
  }

  if (!fileTree) {
    try {
      const p = await Project.findOne({ roomId })
      if (!p) return existing || null
      updatedAt = new Date(p.updatedAt || 0).getTime()
      fileTree = p.fileTree
      files = p.files || []
    } catch {
      return existing || null
    }
  }

  return buildRoomIndex(roomId, fileTree, files, updatedAt)
}

// Rank the files most relevant to the current file: direct imports first,
// then files importing it, then same-directory files.
export function getRelatedFiles(roomId, currentPath, { limit = 2 } = {}) {
  const index = roomIndexes.get(roomId)
  if (!index || !index.has(currentPath)) return []
  const current = index.get(currentPath)

  const imported = new Set(current.imports.map((i) => i.resolved))
  const reverse = []
  const sameDir = []
  const dir = currentPath.split("/").slice(0, -1).join("/")

  for (const [path, entry] of index) {
    if (path === currentPath) continue
    if (entry.imports.some((i) => i.resolved === currentPath)) reverse.push(path)
    if (path.split("/").slice(0, -1).join("/") === dir) sameDir.push(path)
  }

  const seen = new Set()
  const scored = []
  const add = (path, score) => {
    if (seen.has(path)) return
    seen.add(path)
    scored.push({ path, score })
  }

  for (const p of imported) add(p, 3)
  for (const p of reverse) add(p, 2)
  for (const p of sameDir) add(p, 1)

  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return scored.slice(0, limit).map((s) => s.path)
}

// Extract the lines around a symbol's definition in a file.
export function getSymbolPortion(roomId, path, symbolName, radius = 3) {
  const entry = roomIndexes.get(roomId)?.get(path)
  if (!entry) return null
  const symbol = entry.symbols.find((s) => s.name === symbolName)
  if (!symbol) return null
  const lines = entry.content.split("\n")
  const start = Math.max(0, symbol.line - 1 - radius)
  const end = Math.min(lines.length, symbol.line - 1 + radius + 1)
  return lines.slice(start, end).join("\n")
}
