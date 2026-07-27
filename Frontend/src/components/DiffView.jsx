import { useState, useMemo } from "react"
import { DiffEditor } from "@monaco-editor/react"
import { getFileInfo } from "../lib/fileTree"

function FileIcon({ filename, size = 16 }) {
  const info = getFileInfo(filename)
  return (
    <span
      className="inline-flex items-center justify-center text-[9px] font-bold rounded shrink-0"
      style={{ width: size, height: size, backgroundColor: info.color + "22", color: info.color }}
    >
      {info.label.slice(0, 2)}
    </span>
  )
}

export default function DiffView({ label, leftLabel, rightLabel, currentFiles, snapshotFiles, onClose }) {
  const currentMap = useMemo(() => {
    const map = {}
    ;(currentFiles || []).forEach((f) => { map[f.id] = f })
    return map
  }, [currentFiles])

  const snapshotMap = useMemo(() => {
    const map = {}
    ;(snapshotFiles || []).forEach((f) => { map[f.id] = f })
    return map
  }, [snapshotFiles])

  const allIds = useMemo(() => {
    const ids = new Set([
      ...Object.keys(currentMap),
      ...Object.keys(snapshotMap),
    ])
    return Array.from(ids)
  }, [currentMap, snapshotMap])

  const fileMeta = useMemo(() => {
    return allIds.map((id) => {
      const cur = currentMap[id]
      const snap = snapshotMap[id]
      const name = cur?.name || snap?.name || id
      const language = getFileInfo(name).language
      const curContent = cur?.content || ""
      const snapContent = snap?.content || ""
      const changed = curContent !== snapContent
      const added = !snap && !!cur
      const removed = !!snap && !cur
      return { id, name, language, curContent, snapContent, changed, added, removed }
    })
  }, [allIds, currentMap, snapshotMap])

  const changedFiles = fileMeta.filter((f) => f.changed || f.added || f.removed)

  const [selectedId, setSelectedId] = useState(() => changedFiles[0]?.id || allIds[0] || null)
  const selected = fileMeta.find((f) => f.id === selectedId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-[90vw] h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white">Diff</h2>
            {leftLabel && rightLabel ? (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded">{leftLabel}</span>
                <span className="text-gray-500">vs</span>
                <span className="text-green-400 bg-green-400/10 px-2 py-0.5 rounded">{rightLabel}</span>
              </div>
            ) : label ? (
              <span className="text-[11px] text-gray-400 bg-gray-700 px-2 py-0.5 rounded">{label}</span>
            ) : null}
            <span className="text-[11px] text-gray-500">
              {changedFiles.length} file{changedFiles.length !== 1 ? "s" : ""} changed
            </span>
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

        <div className="flex flex-1 min-h-0">
          <div className="w-56 border-r border-gray-700 overflow-y-auto shrink-0">
            <div className="p-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider px-2 py-1">Files</p>
              {fileMeta.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setSelectedId(f.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors cursor-pointer ${
                    selectedId === f.id
                      ? "bg-gray-700 text-white"
                      : "text-gray-300 hover:bg-gray-700/50"
                  }`}
                >
                  <FileIcon filename={f.name} />
                  <span className="flex-1 min-w-0 truncate text-xs">{f.name}</span>
                  {f.added && <span className="text-[9px] text-green-400 font-semibold">A</span>}
                  {f.removed && <span className="text-[9px] text-red-400 font-semibold">D</span>}
                  {f.changed && !f.added && !f.removed && (
                    <span className="text-[9px] text-amber-400 font-semibold">M</span>
                  )}
                </button>
              ))}
              {fileMeta.length === 0 && (
                <p className="text-xs text-gray-500 px-2 py-4 text-center">No files</p>
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {selected ? (
              <DiffEditor
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
