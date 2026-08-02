export default function OnboardingModal({ onClose }) {
  const features = [
    {
      icon: "💾",
      title: "Save & Snapshot",
      desc: "Ctrl/Cmd+S saves to the cloud. Ctrl/Cmd+Shift+S creates a version snapshot you can restore, diff or compare anytime.",
    },
    {
      icon: "🌿",
      title: "Git Integration",
      desc: "Use the Source Control panel to init, commit, push and pull a real git repo. Snapshots are also backed by git commits.",
    },
    {
      icon: "👥",
      title: "Real-Time Collaboration",
      desc: "Everyone sees live cursors, edits, chat and voice. The owner can manage roles and share the room with a link.",
    },
    {
      icon: "⚡",
      title: "Run & Share",
      desc: "Execute code in the sandbox (Ctrl/Cmd+Enter), write test cases, and share your room via the Share button.",
    },
  ]

  return (
    <div className="fixed inset-0 z-[998] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-scaleUp">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl mx-auto mb-3">
            🚀
          </div>
          <h3 className="text-lg font-bold text-white">Welcome to your collaborative workspace</h3>
          <p className="text-xs text-gray-400 mt-1">Here's what you can do together</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl bg-gray-950/80 border border-gray-800 p-3">
              <p className="text-sm font-semibold text-gray-200 mb-0.5">{f.icon} {f.title}</p>
              <p className="text-[11px] text-gray-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-amber-500 text-gray-950 font-bold text-sm hover:bg-amber-400 transition-all duration-200 shadow-md hover:scale-[1.01] active:scale-95 cursor-pointer"
        >
          Get started
        </button>
      </div>
    </div>
  )
}
