import { getFileInfo } from "../lib/fileTree"

export default function StatusBar({
  filename,
  content,
  isSaving,
  lastSavedTime,
  usersCount,
  isSnapshotting,
  connectionStatus = "connected", // connected | reconnecting | offline
  onOpenShortcuts,
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

  const isConnected = connectionStatus === "connected"
  const isReconnecting = connectionStatus === "reconnecting"

  return (
    <div className="flex items-center justify-between h-6 px-3 bg-gray-950 border-t border-gray-800 text-[11px] text-gray-400 shrink-0 select-none">
      <div className="flex items-center gap-4">
        {/* Connection status indicator */}
        <div className="flex items-center gap-1.5 font-medium">
          <span className="relative flex h-2 w-2">
            {isConnected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isConnected
                  ? "bg-emerald-500"
                  : isReconnecting
                    ? "bg-amber-500 animate-pulse"
                    : "bg-red-500"
              }`}
            />
          </span>
          <span className={isConnected ? "text-emerald-400" : isReconnecting ? "text-amber-400" : "text-red-400"}>
            {isConnected ? "Connected" : isReconnecting ? "Reconnecting..." : "Offline"}
          </span>
        </div>

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
        <span>{usersCount || 1} {usersCount === 1 ? "user" : "users"}</span>
        {isSnapshotting && (
          <span className="text-amber-400 animate-pulse font-medium">Snapshotting...</span>
        )}
        {isSaving && !isSnapshotting && (
          <span className="text-gray-300">Saving...</span>
        )}
        {!isSaving && savedLabel && (
          <span>Saved {savedLabel}</span>
        )}
        <span>UTF-8</span>

        <button
          onClick={onOpenShortcuts}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          title="Keyboard Shortcuts (⌘/)"
        >
          <span>⌨️</span>
          <kbd className="font-mono text-[9px] bg-gray-800 border border-gray-700 px-1 rounded text-amber-300">⌘/</kbd>
        </button>
      </div>
    </div>
  )
}
