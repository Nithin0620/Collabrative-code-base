export default function ShortcutsModal({ onClose }) {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0
  const modKey = isMac ? "⌘" : "Ctrl"

  const shortcutGroups = [
    {
      category: "Editor & Code",
      items: [
        { label: "Save File to Cloud", keys: [`${modKey}`, "S"] },
        { label: "Run Code in Sandbox", keys: [`${modKey}`, "Enter"] },
        { label: "Format Code", keys: ["Shift", "Alt", "F"] },
        { label: "Create Version Snapshot", keys: [`${modKey}`, "Shift", "S"] },
        { label: "Open Keyboard Shortcuts", keys: [`${modKey}`, "/"] },
        { label: "Toggle AI Assistant", keys: [`${modKey}`, "K"] },
      ],
    },
    {
      category: "Collaboration & Communication",
      items: [
        { label: "Toggle Real-Time Chat", keys: [`${modKey}`, "Shift", "C"] },
        { label: "Toggle Code Comments", keys: [`${modKey}`, "Shift", "M"] },
        { label: "Toggle Audio Mic", keys: [`${modKey}`, "Shift", "A"] },
        { label: "Toggle Camera Video", keys: [`${modKey}`, "Shift", "V"] },
        { label: "Raise / Lower Hand", keys: [`${modKey}`, "Shift", "H"] },
      ],
    },
  ]

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-scaleUp">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">⌨️</span>
            <div>
              <h3 className="text-sm font-bold text-white">Keyboard Shortcuts</h3>
              <p className="text-xs text-gray-400">Boost your productivity with quick hotkeys</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg transition-colors p-1 rounded-lg hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {shortcutGroups.map((group) => (
            <div key={group.category} className="space-y-2">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">{group.category}</h4>
              <div className="bg-gray-950/80 rounded-xl border border-gray-800/80 divide-y divide-gray-800/50">
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-2.5 text-xs">
                    <span className="text-gray-300 font-medium">{item.label}</span>
                    <div className="flex gap-1">
                      {item.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded-md font-mono text-[11px] text-amber-300 shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
