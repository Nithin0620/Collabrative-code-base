import { useState, useEffect, useCallback } from "react"

const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "c", label: "C" },
  { id: "ruby", label: "Ruby" },
  { id: "go", label: "Go" },
]

export default function TestCaseManager({
  currentLanguage,
  onRunTestCases,
  onClose,
}) {
  const [testCases, setTestCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    title: "",
    language: currentLanguage || "javascript",
    stdin: "",
    expectedOutput: "",
    tags: "",
  })
  const [filterLang, setFilterLang] = useState("all")
  const [selectedIds, setSelectedIds] = useState(new Set())

  const fetchTestCases = useCallback(async () => {
    setLoading(true)
    try {
      const params = filterLang !== "all" ? `?language=${filterLang}` : ""
      const res = await fetch("/api/testcases" + params, { credentials: "include" })
      const data = await res.json()
      setTestCases(data.testCases || [])
    } catch {
      setTestCases([])
    } finally {
      setLoading(false)
    }
  }, [filterLang])

  useEffect(() => {
    fetchTestCases()
  }, [fetchTestCases])

  useEffect(() => {
    if (currentLanguage) {
      setForm((f) => ({ ...f, language: currentLanguage }))
    }
  }, [currentLanguage])

  const handleSave = async () => {
    if (!form.title.trim()) return
    try {
      const body = {
        title: form.title.trim(),
        language: form.language,
        stdin: form.stdin,
        expectedOutput: form.expectedOutput,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      }
      if (editId) {
        await fetch("/api/testcases/" + editId, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        })
      } else {
        await fetch("/api/testcases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        })
      }
      resetForm()
      fetchTestCases()
    } catch {}
  }

  const handleDelete = async (id) => {
    try {
      await fetch("/api/testcases/" + id, {
        method: "DELETE",
        credentials: "include",
      })
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      fetchTestCases()
    } catch {}
  }

  const handleEdit = (tc) => {
    setForm({
      title: tc.title,
      language: tc.language,
      stdin: tc.stdin || "",
      expectedOutput: tc.expectedOutput || "",
      tags: tc.tags?.join(", ") || "",
    })
    setEditId(tc._id)
    setShowForm(true)
  }

  const resetForm = () => {
    setForm({ title: "", language: currentLanguage || "javascript", stdin: "", expectedOutput: "", tags: "" })
    setEditId(null)
    setShowForm(false)
  }

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === testCases.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(testCases.map((tc) => tc._id)))
    }
  }

  const handleRunSelected = () => {
    const selected = testCases.filter((tc) => selectedIds.has(tc._id))
    if (selected.length > 0 && onRunTestCases) {
      onRunTestCases(selected)
    }
  }

  const handleRunAll = () => {
    if (testCases.length > 0 && onRunTestCases) {
      onRunTestCases(testCases)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 620, maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 bg-gray-800/50">
          <h2 className="text-sm font-bold text-white">Custom Test Cases</h2>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && onRunTestCases && (
              <button
                onClick={handleRunSelected}
                className="px-2.5 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors cursor-pointer"
              >
                Run Selected ({selectedIds.size})
              </button>
            )}
            {testCases.length > 0 && onRunTestCases && (
              <button
                onClick={handleRunAll}
                className="px-2.5 py-1 rounded bg-green-600/20 text-green-400 text-xs font-semibold hover:bg-green-600/40 transition-colors cursor-pointer border border-green-500/30"
              >
                Run All
              </button>
            )}
            <button
              onClick={() => {
                setShowForm(!showForm)
                if (showForm) resetForm()
              }}
              className="px-2.5 py-1 rounded bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
            >
              {showForm ? "Cancel" : "+ New"}
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

        {/* Form */}
        {showForm && (
          <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/30 space-y-2">
            <div className="flex gap-2">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Test case title"
                className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-gray-500"
              />
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none cursor-pointer"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Input (stdin)</label>
                <textarea
                  value={form.stdin}
                  onChange={(e) => setForm({ ...form, stdin: e.target.value })}
                  placeholder="Program input..."
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono rounded px-3 py-1.5 resize-none focus:outline-none focus:border-gray-500"
                  spellCheck={false}
                />
              </div>
              <div className="flex-1">
                <label className="text-[9px] text-gray-500 uppercase tracking-wider mb-0.5 block">Expected Output</label>
                <textarea
                  value={form.expectedOutput}
                  onChange={(e) => setForm({ ...form, expectedOutput: e.target.value })}
                  placeholder="Expected stdout..."
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 text-xs font-mono rounded px-3 py-1.5 resize-none focus:outline-none focus:border-gray-500"
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="flex gap-2 items-center">
              <input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="Tags (comma-separated)"
                className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-3 py-1.5 focus:outline-none focus:border-gray-500"
              />
              <button
                onClick={handleSave}
                disabled={!form.title.trim()}
                className="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {editId ? "Update" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="px-4 py-2 border-b border-gray-700 flex items-center gap-2">
          <select
            value={filterLang}
            onChange={(e) => setFilterLang(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none cursor-pointer"
          >
            <option value="all">All Languages</option>
            {LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
          {testCases.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="text-[10px] text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              {selectedIds.size === testCases.length ? "Deselect All" : "Select All"}
            </button>
          )}
        </div>

        {/* Test case list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-gray-500 text-xs">Loading...</div>
          ) : testCases.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-xs">
              No test cases yet. Create one with + New.
            </div>
          ) : (
            <ul className="divide-y divide-gray-700/50">
              {testCases.map((tc) => {
                const isSelected = selectedIds.has(tc._id)
                return (
                  <li
                    key={tc._id}
                    className={`px-4 py-2.5 hover:bg-gray-800/40 transition-colors group ${isSelected ? "bg-blue-500/10" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(tc._id)}
                        className="mt-1 shrink-0 accent-blue-500 cursor-pointer"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white truncate">{tc.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300 shrink-0">{tc.language}</span>
                          {tc.tags?.length > 0 && tc.tags.map((t, i) => (
                            <span key={i} className="text-[9px] px-1 py-0.5 rounded bg-gray-800 text-gray-400">{t}</span>
                          ))}
                        </div>
                        <div className="flex gap-4 mt-1 text-[10px] text-gray-500 font-mono">
                          <span className="truncate max-w-[200px]">
                            <span className="text-gray-600">in: </span>{tc.stdin || "(empty)"}
                          </span>
                          <span className="truncate max-w-[200px]">
                            <span className="text-gray-600">out: </span>{tc.expectedOutput || "(empty)"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleEdit(tc)}
                          className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-400 text-[9px] hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(tc._id)}
                          className="px-1.5 py-0.5 rounded bg-gray-700 text-red-400 text-[9px] hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
                        >
                          Del
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
