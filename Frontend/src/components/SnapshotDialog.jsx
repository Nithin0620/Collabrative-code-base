import { useState, useRef, useEffect, useMemo } from "react"
import { DiffEditor } from "@monaco-editor/react"
import { getFileInfo } from "../lib/fileTree"

function FileIcon({ filename, size = 14 }) {
  const info = getFileInfo(filename)
  return (
    <span
      className="inline-flex items-center justify-center text-[8px] font-bold rounded shrink-0"
      style={{ width: size, height: size, backgroundColor: info.color + "22", color: info.color }}
    >
      {info.label.slice(0, 2)}
    </span>
  )
}

export default function SnapshotDialog({ roomId, currentFiles, onSave, onClose }) {
  const [message, setMessage] = useState("")
  const [lastSnapshot, setLastSnapshot] = useState(null)
  const [loadingDiff, setLoadingDiff] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const fetchLastSnapshot = async () => {
      try {
        const res = await fetch("/api/projects/" + roomId + "/history", {
          credentials: "include",
        })
        const data = await res.json()
        const history = data.history || []
        if (history.length > 0) {
          const latest = history[history.length - 1]
          const parsed = JSON.parse(latest.data)
          setLastSnapshot(parsed)
        }
      } catch {
        console.error("Failed to load last snapshot")
      } finally {
        setLoadingDiff(false)
      }
    }
    fetchLastSnapshot()
  }, [roomId])

  const fileMeta = useMemo(() => {
    if (!currentFiles) return []

    const currentMap = {}
    currentFiles.forEach((f) => { currentMap[f.id] = f })

    const snapshotMap = {}
    if (lastSnapshot?.files) {
      lastSnapshot.files.forEach((f) => {
        const name = lastSnapshot.fileTree?.[f.id]?.name || f.id
        snapshotMap[f.id] = { ...f, name }
      })
    }

    const allIds = new Set([
      ...Object.keys(currentMap),
      ...Object.keys(snapshotMap),
    ])

    const files = []
    allIds.forEach((id) => {
      const cur = currentMap[id]
      const snap = snapshotMap[id]
      const name = cur?.name || snap?.name || id
      const language = getFileInfo(name).language
      const curContent = cur?.content || ""
      const snapContent = snap?.content || ""
      const changed = curContent !== snapContent
      const added = !snap && !!cur
      const removed = !!snap && !cur
      files.push({
        id,
        name,
        language,
        curContent,
        snapContent,
        added,
        removed,
        changed: changed && !added && !removed,
        unchanged: !changed && !added && !removed,
      })
    })

    files.sort((a, b) => {
      if (a.added && !b.added) return -1
      if (!a.added && b.added) return 1
      if (a.removed && !b.removed) return -1
      if (!a.removed && b.removed) return 1
      if (a.changed && !b.changed) return -1
      if (!a.changed && b.changed) return 1
      return a.name.localeCompare(b.name)
    })

    return files
  }, [currentFiles, lastSnapshot])

  const changedCount = fileMeta.filter((f) => f.added).length
  const modifiedCount = fileMeta.filter((f) => f.changed).length
  const removedCount = fileMeta.filter((f) => f.removed).length
  const unchangedCount = fileMeta.filter((f) => f.unchanged).length
  useEffect(() => {
    if (selectedId === null && fileMeta.length > 0) {
      const firstChanged = fileMeta.find((f) => !f.unchanged)
      setSelectedId(firstChanged?.id || fileMeta[0].id)
    }
  }, [fileMeta, selectedId])

  const selected = fileMeta.find((f) => f.id === selectedId)

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      return
    }
    onSave(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-[90vw] h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <h2 className="text-sm font-bold text-white">Create Snapshot</h2>
            <div className="flex items-center gap-2 text-[11px]">
              {changedCount > 0 && <span className="text-green-400">+{changedCount} added</span>}
              {modifiedCount > 0 && <span className="text-amber-400">~{modifiedCount} modified</span>}
              {removedCount > 0 && <span className="text-red-400">-{removedCount} removed</span>}
              {unchangedCount > 0 && <span className="text-gray-500">{unchangedCount} unchanged</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-700 shrink-0">
          <label className="text-xs font-medium text-gray-400 shrink-0">
            Message <span className="text-red-400">*</span>
          </label>
          <input
            ref={inputRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Add user authentication, Fix login bug..."
            className="flex-1 px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-600 text-sm text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer shrink-0"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            disabled={!message.trim()}
          >
            Save Snapshot
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-52 border-r border-gray-700 overflow-y-auto shrink-0">
            <div className="p-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-1">
                Files ({fileMeta.length})
              </p>
              {loadingDiff ? (
                <p className="text-xs text-gray-500 px-2 py-4 text-center">Loading...</p>
              ) : fileMeta.length === 0 ? (
                <p className="text-xs text-gray-500 px-2 py-4 text-center">No files</p>
              ) : (
                fileMeta.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors cursor-pointer ${
                      selectedId === f.id
                        ? "bg-gray-700 text-white"
                        : f.unchanged
                          ? "text-gray-500 hover:bg-gray-700/50 hover:text-gray-300"
                          : "text-gray-300 hover:bg-gray-700/50"
                    }`}
                  >
                    <FileIcon filename={f.name} />
                    <span className="flex-1 min-w-0 truncate text-xs">{f.name}</span>
                    {f.added && <span className="text-[9px] text-green-400 font-semibold">A</span>}
                    {f.removed && <span className="text-[9px] text-red-400 font-semibold">D</span>}
                    {f.changed && <span className="text-[9px] text-amber-400 font-semibold">M</span>}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {loadingDiff ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                Loading diff...
              </div>
            ) : selected ? (
              <DiffEditor
                key={selected.id}
                height="100%"
                language={selected.language}
                original={selected.snapContent}
                modified={selected.curContent}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 13,
                  wordWrap: "on",
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                Select a file to view differences
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
