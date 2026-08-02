import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { Editor } from "@monaco-editor/react"
import { downloadSnapshotAsZip } from "../lib/download"

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function Avatar({ src, name, size = 24 }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full bg-gray-600 flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name?.charAt(0)?.toUpperCase() || "?"}
    </div>
  )
}

export default function SnapshotHistory({
  roomId,
  onClose,
  onRestore,
  onDiff,
  onCompareTwoSnapshots,
}) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [previewSnapshot, setPreviewSnapshot] = useState(null)
  const [confirmRestore, setConfirmRestore] = useState(null)
  const [filterUser, setFilterUser] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelected, setCompareSelected] = useState([])
  const [undoUser, setUndoUser] = useState("")
  const [undoTimeFrom, setUndoTimeFrom] = useState("")
  const [undoTimeTo, setUndoTimeTo] = useState("")
  const [showUndoPanel, setShowUndoPanel] = useState(false)
  const [viewMode, setViewMode] = useState("list")
  const [gitCommits, setGitCommits] = useState([])
  const [gitInfo, setGitInfo] = useState(null)
  const [gitStatus, setGitStatus] = useState(null)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch("/api/projects/" + roomId + "/history", {
          credentials: "include",
        })
        const data = await res.json()
        setHistory((data.history || []).slice().reverse())
        setGitCommits(data.gitCommits || [])
        setGitInfo(data.gitInfo || null)
        setGitStatus(data.gitStatus || null)
      } catch {
        console.error("Failed to load history")
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [roomId])

  const uniqueAuthors = useMemo(() => {
    const map = new Map()
    history.forEach((s) => {
      if (s.author && !map.has(s.author)) {
        map.set(s.author, s.authorAvatar || "")
      }
    })
    return Array.from(map.entries()).map(([name, avatar]) => ({ name, avatar }))
  }, [history])

  const filteredHistory = useMemo(() => {
    return history.filter((s) => {
      if (filterUser && s.author !== filterUser) return false
      if (filterDateFrom) {
        const from = new Date(filterDateFrom).getTime()
        if (new Date(s.timestamp).getTime() < from) return false
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo).getTime()
        if (new Date(s.timestamp).getTime() > to) return false
      }
      return true
    })
  }, [history, filterUser, filterDateFrom, filterDateTo])

  const handleRestore = useCallback((snapshot) => {
    setConfirmRestore(snapshot)
  }, [])

  const executeRestore = useCallback((snapshot) => {
    setConfirmRestore(null)
    try {
      const parsed = JSON.parse(snapshot.data)
      onRestore(parsed)
      onClose()
    } catch {
      console.error("Failed to parse snapshot")
    }
  }, [onRestore, onClose])

  const handleDelete = async (snapshotId) => {
    setDeleting(snapshotId)
    try {
      await fetch("/api/projects/" + roomId + "/snapshot/" + snapshotId, {
        method: "DELETE",
        credentials: "include",
      })
      setHistory((prev) => prev.filter((s) => s._id !== snapshotId))
    } catch {
      console.error("Failed to delete snapshot")
    } finally {
      setDeleting(null)
    }
  }

  const toggleCompare = (id) => {
    setCompareSelected((prev) => {
      if (prev.includes(id)) return prev.filter((i) => i !== id)
      if (prev.length >= 2) return [prev[1], id]
      return [...prev, id]
    })
  }

  const executeCompare = () => {
    if (compareSelected.length === 2 && onCompareTwoSnapshots) {
      const snap1 = history.find((s) => s._id === compareSelected[0])
      const snap2 = history.find((s) => s._id === compareSelected[1])
      if (snap1 && snap2) {
        onCompareTwoSnapshots(snap1, snap2)
        onClose()
      }
    }
  }

  const handleExportZip = (snapshot) => {
    downloadSnapshotAsZip(snapshot)
  }

  const handleUndoUser = () => {
    if (!undoUser) return
    const range = filteredHistory.filter((s) => {
      if (s.author !== undoUser) return false
      if (undoTimeFrom) {
        const from = new Date(undoTimeFrom).getTime()
        if (new Date(s.timestamp).getTime() < from) return false
      }
      if (undoTimeTo) {
        const to = new Date(undoTimeTo).getTime()
        if (new Date(s.timestamp).getTime() > to) return false
      }
      return true
    })
    if (range.length === 0) return

    const allWithAuthor = history.filter((s) => s.author === undoUser)
    const earliestMatch = range[range.length - 1]
    const idx = allWithAuthor.indexOf(earliestMatch)
    const restoreTo = idx > 0 ? allWithAuthor[idx - 1] : null

    if (restoreTo) {
      handleRestore(restoreTo)
    } else {
      alert("No snapshot before this user's changes to restore to.")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 620, maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-bold text-white">Version History</h2>
            {!loading && history.length > 0 && (
              <span className="text-[11px] text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">{filteredHistory.length}</span>
            )}
            {gitInfo?.hasRepo && gitInfo.branch && (
              <span
                className="text-[10px] font-mono text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded"
                title="Git repository detected"
              >
                {gitInfo.branch}
              </span>
            )}
            {!loading && gitInfo?.hasRepo && (
              <span className="text-[10px] text-gray-500 bg-gray-700/70 px-1.5 py-0.5 rounded">
                {gitCommits.length} git commit{gitCommits.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {compareMode && compareSelected.length === 2 && (
              <button
                onClick={executeCompare}
                className="px-2.5 py-1 rounded bg-blue-500 text-white text-xs font-semibold hover:bg-blue-400 transition-colors cursor-pointer"
              >
                Compare ({compareSelected.length})
              </button>
            )}
            <button
              onClick={() => { setCompareMode(!compareMode); setCompareSelected([]) }}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                compareMode
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {compareMode ? "Cancel Compare" : "Compare"}
            </button>
            <button
              onClick={() => setShowUndoPanel(!showUndoPanel)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                showUndoPanel
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              Undo by User
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

        {showUndoPanel && (
          <div className="px-5 py-3 border-b border-gray-700 bg-gray-800/50 space-y-2">
            <p className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">Undo by User</p>
            <div className="flex items-center gap-2">
              <select
                value={undoUser}
                onChange={(e) => setUndoUser(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-gray-500 cursor-pointer"
              >
                <option value="">Select user...</option>
                {uniqueAuthors.map((a) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={undoTimeFrom}
                onChange={(e) => setUndoTimeFrom(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-gray-500"
                placeholder="From"
              />
              <span className="text-gray-500 text-xs">to</span>
              <input
                type="datetime-local"
                value={undoTimeTo}
                onChange={(e) => setUndoTimeTo(e.target.value)}
                className="bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1.5 focus:outline-none focus:border-gray-500"
                placeholder="To"
              />
              <button
                onClick={handleUndoUser}
                disabled={!undoUser}
                className="px-3 py-1.5 rounded bg-purple-500 text-white text-xs font-semibold hover:bg-purple-400 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Undo
              </button>
            </div>
          </div>
        )}

        <div className="px-5 py-3 border-b border-gray-700 flex items-center gap-2 bg-gray-800/30">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500 cursor-pointer"
          >
            <option value="">All users</option>
            {uniqueAuthors.map((a) => (
              <option key={a.name} value={a.name}>{a.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500"
            placeholder="From"
          />
          <span className="text-gray-500 text-xs">—</span>
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500"
            placeholder="To"
          />
          {(filterUser || filterDateFrom || filterDateTo) && (
            <button
              onClick={() => { setFilterUser(""); setFilterDateFrom(""); setFilterDateTo("") }}
              className="text-[11px] text-gray-400 hover:text-white cursor-pointer"
            >
              Clear
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setViewMode("list")}
              className={`p-1 rounded cursor-pointer ${viewMode === "list" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
              title="List view"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("timeline")}
              className={`p-1 rounded cursor-pointer ${viewMode === "timeline" ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"}`}
              title="Timeline view"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="9" strokeWidth={2} />
              </svg>
            </button>
          </div>
        </div>

        {gitStatus?.isRepo && gitStatus.uncommitted > 0 && (
          <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-[11px] text-amber-200/90">
              {gitStatus.uncommitted} uncommitted change{gitStatus.uncommitted !== 1 ? "s" : ""} on{" "}
              <span className="font-mono">{gitStatus.branch || "current branch"}</span>
              {gitStatus.staged > 0 && ` · ${gitStatus.staged} staged`}
              {gitStatus.workingTree > 0 && ` · ${gitStatus.workingTree} in working tree`}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-10 h-10 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <p className="text-gray-400 text-sm mb-1">
                {history.length === 0 ? "No snapshots yet" : "No snapshots match filters"}
              </p>
              {history.length === 0 && (
                <p className="text-gray-500 text-xs">Click "Snapshot" in the toolbar to create your first version</p>
              )}
            </div>
          ) : viewMode === "timeline" ? (
            <div className="relative pl-6">
              <div className="absolute left-[18px] top-2 bottom-2 w-0.5 bg-gray-700" />
              {filteredHistory.map((snapshot, index) => (
                <div key={snapshot._id} className="relative mb-4">
                  <div className="absolute -left-6 top-3 w-3 h-3 rounded-full bg-gray-700 border-2 border-amber-500 z-10" />
                  <div className="ml-2 rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-600 transition-colors p-3">
                    <div className="flex items-start gap-3">
                      <Avatar src={snapshot.authorAvatar} name={snapshot.author} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-200 font-medium truncate">
                            {snapshot.message || snapshot.label || "Unnamed snapshot"}
                          </span>
                          {compareMode && (
                            <input
                              type="checkbox"
                              checked={compareSelected.includes(snapshot._id)}
                              onChange={() => toggleCompare(snapshot._id)}
                              className="cursor-pointer"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-amber-400/70">{snapshot.author}</span>
                          <span className="text-[11px] text-gray-500">{formatDate(snapshot.timestamp)}</span>
                          {snapshot.filesCount > 0 && (
                            <span className="text-[11px] text-gray-500">{snapshot.filesCount} files</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            onClick={() => setPreviewSnapshot(snapshot)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                          >
                            Preview
                          </button>
                          <button
                            onClick={() => onDiff && onDiff(snapshot)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                          >
                            Diff
                          </button>
                          <button
                            onClick={() => handleRestore(snapshot)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium text-white bg-amber-500 hover:bg-amber-400 transition-colors cursor-pointer"
                          >
                            Restore
                          </button>
                          <button
                            onClick={() => handleExportZip(snapshot)}
                            className="px-2 py-0.5 rounded text-[10px] font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                            title="Export as ZIP"
                          >
                            ZIP
                          </button>
                          <button
                            onClick={() => setConfirmDelete(snapshot)}
                            className="p-0.5 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {gitCommits.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] text-green-400/80 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-4H8l4-4 4 4h-3v4h-2z"/>
                    </svg>
                    Git Commits
                  </p>
                  <div className="space-y-1.5">
                    {gitCommits.map((c, i) => (
                      <div key={i} className="rounded-lg bg-gray-900 border border-gray-700 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-green-400 shrink-0">{String(c.hash || "").slice(0, 7)}</span>
                          <span className="text-xs text-gray-200 truncate flex-1">{c.message}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                          {c.author} · {formatDate(c.date)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {filteredHistory.map((snapshot, index) => (
                <div
                  key={snapshot._id}
                  className="rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-600 transition-colors overflow-hidden"
                >
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar src={snapshot.authorAvatar} name={snapshot.author} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-200 font-medium truncate">
                          {snapshot.message || snapshot.label || "Unnamed snapshot"}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {snapshot.author && (
                            <span className="text-[11px] text-amber-400/70">{snapshot.author}</span>
                          )}
                          <span className="text-[11px] text-gray-500">{formatDate(snapshot.timestamp)}</span>
                          {snapshot.filesCount > 0 && (
                            <span className="text-[11px] text-gray-500">
                              {snapshot.filesCount} file{snapshot.filesCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {snapshot.gitCommit && (
                            <span
                              className="text-[10px] font-mono text-green-400/80 bg-green-500/10 px-1.5 py-0.5 rounded"
                              title={"Backed by git commit " + snapshot.gitCommit}
                            >
                              {snapshot.gitCommit.slice(0, 7)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      {compareMode && (
                        <input
                          type="checkbox"
                          checked={compareSelected.includes(snapshot._id)}
                          onChange={() => toggleCompare(snapshot._id)}
                          className="cursor-pointer"
                        />
                      )}
                      {snapshot.fileNames && snapshot.fileNames.length > 0 && (
                        <button
                          onClick={() => setExpandedId(expandedId === snapshot._id ? null : snapshot._id)}
                          className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                          title="Show files"
                        >
                          <svg className={`w-3.5 h-3.5 transition-transform ${expandedId === snapshot._id ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={() => setPreviewSnapshot(snapshot)}
                        className="px-2 py-1 rounded text-[11px] font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => onDiff && onDiff(snapshot)}
                        className="px-2 py-1 rounded text-[11px] font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
                      >
                        Diff
                      </button>
                      <button
                        onClick={() => handleRestore(snapshot)}
                        disabled={deleting === snapshot._id}
                        className="px-2.5 py-1 rounded text-[11px] font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => handleExportZip(snapshot)}
                        className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                        title="Export as ZIP"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setConfirmDelete(snapshot)}
                        disabled={deleting === snapshot._id}
                        className="p-1 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 disabled:opacity-50 transition-colors cursor-pointer"
                        title="Delete snapshot"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {expandedId === snapshot._id && snapshot.fileNames && snapshot.fileNames.length > 0 && (
                    <div className="px-3 pb-3 pt-0">
                      <div className="p-2 rounded bg-gray-800 border border-gray-700">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5 px-1">Files in this snapshot</p>
                        <div className="flex flex-wrap gap-1">
                          {snapshot.fileNames.map((name, i) => (
                            <span
                              key={i}
                              className="text-[11px] text-gray-300 bg-gray-700 px-2 py-0.5 rounded"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(null)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 w-80" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-200 mb-1">Delete this snapshot?</p>
            <p className="text-xs text-gray-400 mb-4 truncate">{confirmDelete.message || confirmDelete.label || "Unnamed snapshot"}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 rounded-lg text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={() => { handleDelete(confirmDelete._id); setConfirmDelete(null) }} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-400 transition-colors cursor-pointer">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmRestore && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setConfirmRestore(null)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 w-96" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="text-sm font-semibold text-gray-200">Restore this version?</p>
            </div>
            <p className="text-xs text-gray-400 mb-1 truncate">{confirmRestore.message || confirmRestore.label}</p>
            <p className="text-xs text-gray-500 mb-1">{confirmRestore.author} · {formatDate(confirmRestore.timestamp)}</p>
            <p className="text-xs text-amber-400/80 mb-4">Your current work will be saved as a snapshot first (non-destructive).</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRestore(null)} className="px-3 py-1.5 rounded-lg text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer">
                Cancel
              </button>
              <button onClick={() => executeRestore(confirmRestore)} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 transition-colors cursor-pointer">
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {previewSnapshot && (
        <PreviewModal snapshot={previewSnapshot} onClose={() => setPreviewSnapshot(null)} />
      )}
    </div>
  )
}

function PreviewModal({ snapshot, onClose }) {
  const [activeFile, setActiveFile] = useState(null)

  const parsed = useMemo(() => {
    try { return JSON.parse(snapshot.data) } catch { return null }
  }, [snapshot])

  const files = useMemo(() => {
    if (!parsed) return []
    const ft = parsed.fileTree || {}
    return (parsed.files || []).map((f) => ({
      ...f,
      name: ft[f.id]?.name || f.id,
      language: (ft[f.id]?.name || f.id).split(".").pop() || "plaintext",
    }))
  }, [parsed])

  useEffect(() => {
    if (!activeFile && files.length > 0) setActiveFile(files[0])
  }, [files, activeFile])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-[90vw] h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <h2 className="text-sm font-bold text-white">Preview: {snapshot.message || snapshot.label}</h2>
            <span className="text-[11px] text-gray-500">{snapshot.author} · {formatDate(snapshot.timestamp)}</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          <div className="w-48 border-r border-gray-700 overflow-y-auto shrink-0">
            <div className="p-2">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFile(f)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors cursor-pointer ${
                    activeFile?.id === f.id ? "bg-gray-700 text-white" : "text-gray-400 hover:bg-gray-700/50 hover:text-gray-200"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            {activeFile ? (
              <Editor
                height="100%"
                language={activeFile.language}
                value={activeFile.content || ""}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  wordWrap: "on",
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">No files</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
