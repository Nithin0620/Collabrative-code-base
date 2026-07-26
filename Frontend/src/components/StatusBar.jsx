import { getFileInfo } from "../lib/fileTree"

export default function StatusBar({
  filename,
  content,
  isSaving,
  lastSavedTime,
  usersCount,
  isSnapshotting,
}) {
  const text = content || ""
  const chars = text.length
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const lines = text ? text.split("\n").length : 0
  const lang = filename ? getFileInfo(filename) : null

  const savedLabel = lastSavedTime
    ? (() => {
        const diff = Math.floor((Date.now() - lastSavedTime) / 1000)
        if (diff < 5) return "just now"
        if (diff < 60) return `${diff}s ago`
        return `${Math.floor(diff / 60)}m ago`
      })()
    : null

  return (
    <div className="flex items-center justify-between h-6 px-3 bg-gray-950 border-t border-gray-700 text-[11px] text-gray-400 shrink-0">
      <div className="flex items-center gap-4">
        {lang && (
          <span className="flex items-center gap-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: lang.color }}
            />
            {lang.label}
          </span>
        )}
        <span>{lines} lines</span>
        <span>{words} words</span>
        <span>{chars} chars</span>
      </div>

      <div className="flex items-center gap-4">
        <span>{usersCount} {usersCount === 1 ? "user" : "users"}</span>
        {isSnapshotting && (
          <span className="text-amber-400">Snapshotting...</span>
        )}
        {isSaving && !isSnapshotting && (
          <span className="text-gray-300">Saving...</span>
        )}
        {!isSaving && savedLabel && (
          <span>Saved {savedLabel}</span>
        )}
        <span>UTF-8</span>
      </div>
    </div>
  )
}
