import { THEMES } from "../lib/themes"
import { getFileInfo } from "../lib/fileTree"

export default function EditorToolbar({
  filename,
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  onSave,
  onSnapshot,
  onShowHistory,
  onToggleComments,
  showComments,
  onToggleChat,
  showChat,
  lastSaved,
  isSaving,
}) {
  const lang = filename ? getFileInfo(filename) : null

  return (
    <div className="flex items-center justify-between h-10 px-3 bg-gray-950 border-b border-gray-700 text-sm shrink-0">
      <div className="flex items-center gap-3">
        {filename && (
          <div className="flex items-center gap-1.5 text-gray-300">
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: lang.color + "22", color: lang.color }}
            >
              {lang.label}
            </span>
            <span className="font-mono text-xs">{filename}</span>
          </div>
        )}

        <div className="w-px h-4 bg-gray-700" />

        <label className="flex items-center gap-1.5 text-gray-400">
          <span className="text-xs">Theme</span>
          <select
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500 cursor-pointer"
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <div className="w-px h-4 bg-gray-700" />

        <div className="flex items-center gap-1.5 text-gray-400">
          <span className="text-xs">Size</span>
          <button
            onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer"
          >
            -
          </button>
          <span className="text-xs text-gray-300 w-6 text-center tabular-nums">{fontSize}</span>
          <button
            onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {lastSaved && (
          <span className="text-[10px] text-gray-500">
            {isSaving ? "Saving..." : `Saved ${lastSaved}`}
          </span>
        )}
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
        >
          Save
        </button>
        <button
          onClick={onSnapshot}
          className="px-2.5 py-1 rounded bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
        >
          Snapshot
        </button>
        <button
          onClick={onShowHistory}
          className="px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
        >
          History
        </button>
        <button
          onClick={onToggleComments}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
            showComments
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Comments
        </button>
        <button
          onClick={onToggleChat}
          className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
            showChat
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
          }`}
        >
          Chat
        </button>
      </div>
    </div>
  )
}
