import { useState, useEffect, useCallback } from "react"

export default function SnippetManager({ onInsertCode, onClose }) {
  const [snippets, setSnippets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSave, setShowSave] = useState(false)
  const [saveTitle, setSaveTitle] = useState("")
  const [saveCode, setSaveCode] = useState("")
  const [saveLang, setSaveLang] = useState("javascript")
  const [saveTags, setSaveTags] = useState("")
  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState(null)

  const fetchSnippets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/snippets", { credentials: "include" })
      const data = await res.json()
      setSnippets(data.snippets || [])
    } catch {
      setSnippets([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSnippets()
  }, [fetchSnippets])

  const handleSave = async () => {
    if (!saveTitle.trim() || !saveCode.trim()) return
    try {
      const body = {
        title: saveTitle.trim(),
        code: saveCode,
        language: saveLang,
        tags: saveTags.split(",").map((t) => t.trim()).filter(Boolean),
      }
      if (editingId) {
        await fetch("/api/snippets/" + editingId, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        })
      } else {
        await fetch("/api/snippets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        })
      }
      setSaveTitle("")
      setSaveCode("")
      setSaveTags("")
      setEditingId(null)
      setShowSave(false)
      fetchSnippets()
    } catch {}
  }

  const handleDelete = async (id) => {
    try {
      await fetch("/api/snippets/" + id, {
        method: "DELETE",
        credentials: "include",
      })
      fetchSnippets()
    } catch {}
  }

  const handleEdit = (snippet) => {
    setSaveTitle(snippet.title)
    setSaveCode(snippet.code)
    setSaveLang(snippet.language)
    setSaveTags(snippet.tags?.join(", ") || "")
    setEditingId(snippet._id)
    setShowSave(true)
  }

  const filtered = snippets.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.language.toLowerCase().includes(search.toLowerCase()) ||
      s.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden" style={{ width: 560, maxHeight: "80vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 bg-gray-800/50">
          <h2 className="text-sm font-bold text-white">Snippets</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowSave(!showSave)
                setEditingId(null)
                setSaveTitle("")
                setSaveCode("")
                setSaveTags("")
              }}
              className="px-2.5 py-1 rounded bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
            >
              {showSave ? "Cancel" : "+ New"}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Save form */}
        {showSave && (
          <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/30 space-y-2">
            <input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Snippet title"
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-gray-500"
            />
            <textarea
              value={saveCode}
              onChange={(e) => setSaveCode(e.target.value)}
              placeholder="Paste or type code..."
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono rounded px-3 py-1.5 resize-none focus:outline-none focus:border-gray-500"
              spellCheck={false}
            />
            <div className="flex gap-2">
              <select
                value={saveLang}
                onChange={(e) => setSaveLang(e.target.value)}
                className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none cursor-pointer"
              >
                {["javascript", "python", "java", "cpp", "c", "ruby", "go", "html", "css", "typescript", "plaintext"].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <input
                value={saveTags}
                onChange={(e) => setSaveTags(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={handleSave}
                disabled={!saveTitle.trim() || !saveCode.trim()}
                className="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {editingId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-2 border-b border-gray-700">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snippets..."
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-gray-500 placeholder:text-gray-500"
          />
        </div>

        {/* Snippet list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500 text-xs">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-xs">
              {snippets.length === 0 ? "No snippets yet. Create one with + New." : "No matches found."}
            </div>
          ) : (
            <ul className="divide-y divide-gray-700/50">
              {filtered.map((s) => (
                <li key={s._id} className="px-4 py-2.5 hover:bg-gray-800/40 transition-colors group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white truncate">{s.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 shrink-0">{s.language}</span>
                      </div>
                      {s.tags?.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {s.tags.map((t, i) => (
                            <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-400">{t}</span>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-gray-500 mt-1 font-mono truncate max-w-full">{s.code.slice(0, 80)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {onInsertCode && (
                        <button
                          onClick={() => onInsertCode(s.code)}
                          className="px-1.5 py-0.5 rounded bg-green-600/20 text-green-400 text-[9px] font-semibold hover:bg-green-600/40 transition-colors cursor-pointer"
                        >
                          Insert
                        </button>
                      )}
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(s.code)
                        }}
                        className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 text-[9px] hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                        title="Copy to clipboard"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => handleEdit(s)}
                        className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 text-[9px] hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(s._id)}
                        className="px-1.5 py-0.5 rounded bg-gray-700 text-red-400 text-[9px] hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
                      >
                        Del
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
