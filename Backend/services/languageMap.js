// Central extension -> Monaco language mapping used across the backend.
// Keep this as the single source of truth for language detection.
export const EXT_LANGUAGE_MAP = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python", rb: "ruby", java: "java",
  cpp: "cpp", c: "c", h: "c", hpp: "cpp", cc: "cpp", cxx: "cpp",
  go: "go", rs: "rust", php: "php",
  html: "html", css: "css", scss: "scss",
  json: "json", md: "markdown", txt: "plaintext", yaml: "yaml", yml: "yaml",
  xml: "xml", sql: "sql", sh: "shell", bash: "shell", dockerfile: "dockerfile",
  toml: "ini",
}

export function languageFromName(filename) {
  const ext = String(filename || "").split(".").pop()?.toLowerCase() || ""
  return EXT_LANGUAGE_MAP[ext] || "plaintext"
}
