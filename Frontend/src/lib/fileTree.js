const EXTENSION_MAP = {
  js:   { language: "javascript",  label: "JS",    color: "#f7df1e" },
  jsx:  { language: "javascript",  label: "React", color: "#61dafb" },
  ts:   { language: "typescript",  label: "TS",    color: "#3178c6" },
  tsx:  { language: "typescript",  label: "React", color: "#61dafb" },
  py:   { language: "python",      label: "PY",    color: "#3776ab" },
  rb:   { language: "ruby",        label: "Ruby",  color: "#cc342d" },
  java: { language: "java",        label: "Java",  color: "#ed8b00" },
  cpp:  { language: "cpp",         label: "C++",   color: "#00599c" },
  c:    { language: "c",           label: "C",     color: "#a8b9cc" },
  h:    { language: "c",           label: "H",     color: "#a8b9cc" },
  go:   { language: "go",          label: "Go",    color: "#00add8" },
  rs:   { language: "rust",        label: "Rust",  color: "#dea584" },
  html: { language: "html",        label: "HTML",  color: "#e34c26" },
  css:  { language: "css",         label: "CSS",   color: "#1572b6" },
  scss: { language: "scss",        label: "SCSS",  color: "#c6538c" },
  json: { language: "json",        label: "JSON",  color: "#f7df1e" },
  md:   { language: "markdown",    label: "MD",    color: "#ffffff" },
  txt:  { language: "plaintext",   label: "TXT",   color: "#888888" },
  yaml: { language: "yaml",        label: "YAML",  color: "#cb171e" },
  yml:  { language: "yaml",        label: "YML",   color: "#cb171e" },
  xml:  { language: "xml",         label: "XML",   color: "#f16529" },
  sql:  { language: "sql",         label: "SQL",   color: "#e38c00" },
  sh:   { language: "shell",       label: "Shell", color: "#4eaa25" },
  bash: { language: "shell",       label: "Bash",  color: "#4eaa25" },
  dockerfile: { language: "dockerfile", label: "Docker", color: "#2496ed" },
  toml: { language: "ini",         label: "TOML",  color: "#9c4221" },
}

export function getFileInfo(filename) {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const info = EXTENSION_MAP[ext]
  return {
    extension: ext,
    language: info?.language || "plaintext",
    label: info?.label || ext.toUpperCase() || "?",
    color: info?.color || "#888888",
  }
}

export function generateId() {
  return Math.random().toString(36).slice(2, 12)
}

export function buildFlatTree(fileTree) {
  const items = Object.values(fileTree)
  const folders = items.filter((i) => i.type === "folder")
  const files = items.filter((i) => i.type === "file")

  const roots = items.filter((i) => !i.parentId)
  const childrenMap = {}
  items.forEach((item) => {
    if (item.parentId) {
      if (!childrenMap[item.parentId]) childrenMap[item.parentId] = []
      childrenMap[item.parentId].push(item)
    }
  })

  function sortItems(arr) {
    return arr.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name)
      return a.type === "folder" ? -1 : 1
    })
  }

  sortItems(roots)
  Object.values(childrenMap).forEach(sortItems)

  return { roots, childrenMap, totalFiles: files.length, totalFolders: folders.length }
}

export function getDefaultFilename() {
  return "untitled.txt"
}

const EDITOR_EXCLUDED_DIRS = new Set(["node_modules", ".git", ".DS_Store"])

export function filterIgnoredTree(fileTree, files) {
  const entries = Object.values(fileTree || {})
  if (entries.length === 0) return { fileTree: {}, files: files || [] }

  const childrenMap = {}
  entries.forEach((e) => {
    const key = e.parentId || "__root__"
    if (!childrenMap[key]) childrenMap[key] = []
    childrenMap[key].push(e)
  })

  const dropped = new Set()
  const markDrop = (item) => {
    dropped.add(item.id)
    ;(childrenMap[item.id] || []).forEach(markDrop)
  }
  entries.forEach((e) => {
    if (EDITOR_EXCLUDED_DIRS.has(e.name)) markDrop(e)
  })

  const filtered = {}
  entries.forEach((e) => {
    if (!dropped.has(e.id)) filtered[e.id] = e
  })

  const kept = new Set(Object.keys(filtered))
  const filteredFiles = (files || []).filter((f) => kept.has(f.id))
  return { fileTree: filtered, files: filteredFiles }
}
