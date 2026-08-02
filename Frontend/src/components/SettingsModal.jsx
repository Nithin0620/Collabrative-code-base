import { useState, useEffect, useCallback } from "react"

function GistHint() {
  return (
    <div className="mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 leading-relaxed">
      <p className="font-semibold text-amber-300 mb-1">How to create a GitHub token</p>
      <ol className="list-decimal list-inside space-y-0.5 text-amber-100/70">
        <li>Go to GitHub → Settings → Developer settings → Personal access tokens</li>
        <li>Click <span className="font-mono text-amber-300">Generate new token (classic)</span></li>
        <li>Give it the <span className="font-mono text-amber-300">repo</span> scope</li>
        <li>Paste it below. It is stored on your account only, never shared with the room.</li>
      </ol>
    </div>
  )
}

export default function SettingsModal({ onClose }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/projects/github/status", { credentials: "include" })
      const data = await res.json()
      setStatus(data)
    } catch {
      setError("Failed to load GitHub status")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const showNotice = (msg) => {
    setNotice(msg)
    setTimeout(() => setNotice(""), 3000)
  }

  const handleSave = async () => {
    if (!token.trim()) {
      setError("Paste your GitHub Personal Access Token first")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/projects/github/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: token.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || "Failed to save token")
      } else {
        setToken("")
        showNotice(data.message || "GitHub token saved")
        await fetchStatus()
      }
    } catch {
      setError("Failed to save token")
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setError("")
    try {
      const res = await fetch("/api/projects/github/token", {
        method: "DELETE",
        credentials: "include",
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || "Failed to remove token")
      } else {
        showNotice(data.message || "GitHub token removed")
        await fetchStatus()
      }
    } catch {
      setError("Failed to remove token")
    }
  }

  const linked = status?.linked

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚙️</span>
            <div>
              <h3 className="text-sm font-bold text-white">Settings</h3>
              <p className="text-xs text-gray-400">GitHub authentication for push, pull & clone</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg transition-colors p-1 rounded-lg hover:bg-gray-800 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && <div className="p-2.5 rounded-lg bg-red-900/30 border border-red-800 text-[11px] text-red-400">{error}</div>}
        {notice && <div className="p-2.5 rounded-lg bg-green-900/30 border border-green-800 text-[11px] text-green-400">{notice}</div>}

        {loading ? (
          <div className="py-8 text-center text-sm text-gray-400">Loading...</div>
        ) : (
          <>
            <div className="rounded-xl bg-gray-950/80 border border-gray-800 p-3.5">
              <div className="flex items-center gap-2.5">
                <svg className="w-8 h-8 shrink-0" viewBox="0 0 24 24" fill="#fff">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">GitHub</p>
                  {linked ? (
                    <p className="text-[11px] text-green-400">
                      Linked as <span className="font-mono">{status.username}</span>
                      {status.githubId ? " (via GitHub account)" : " (via personal access token)"}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-500">Not linked yet</p>
                  )}
                </div>
                {linked && (
                  <button
                    onClick={handleRemove}
                    className="ml-auto shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-medium text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Personal Access Token
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/60 font-mono"
              />
              <button
                onClick={handleSave}
                disabled={saving || !token.trim()}
                className="w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                {saving ? "Saving..." : linked ? "Update token" : "Link GitHub"}
              </button>
            </div>

            <GistHint />
          </>
        )}
      </div>
    </div>
  )
}
