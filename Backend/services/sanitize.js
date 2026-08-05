// Paths that should never reach the model regardless of what the client sends.
export const SECRET_PATH_RE =
  /(^|\/)(node_modules|\.git)(\/|$)|(^|\/)\.env([.\w]*)$|(^|\/)\.[\w-]*(secret|credential|credentials)[\w.-]*$|(^|\/)(\.aws|\.ssh|\.config)(\/|$)|(^|\/)(id_rsa|id_ed25519|\.npmrc|\.pgpass|\.netrc|\.git-credentials)$/i

// Redact obvious secret assignments inside otherwise-safe file content.
// Matches quoted ("...", '...') and unquoted values (KEY=value, key: value),
// plus JSON-style keys ("apiKey": "...", 'apiKey': '...').
export const SECRET_LINE_RE =
  /["']?\b(password|passwd|secret|client_?secret|api[_-]?key|apikey|access[_-]?key|refresh[_-]?token|auth[_-]?token|bearer|private[_-]?key|database[_-]?url)["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,#;]+)/gi

export function redactSecrets(content) {
  return String(content || "").replace(SECRET_LINE_RE, (match) =>
    match.replace(/\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,#;]+)/i, ': "<redacted>"')
  )
}

export function isSecretPath(p) {
  return SECRET_PATH_RE.test(String(p || ""))
}
