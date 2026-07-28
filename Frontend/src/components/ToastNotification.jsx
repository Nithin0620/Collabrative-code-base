import { useEffect } from "react"

export default function ToastNotification({ toasts = [], onDismiss }) {
  useEffect(() => {
    if (toasts.length === 0) return
    const timer = setTimeout(() => {
      onDismiss(toasts[0].id)
    }, toasts[0].duration || 3500)
    return () => clearTimeout(timer)
  }, [toasts, onDismiss])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-12 right-6 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const isError = toast.type === "error"
        const isSuccess = toast.type === "success"
        const isJoin = toast.type === "join"
        const isLeave = toast.type === "leave"

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-0 opacity-100 ${
              isError
                ? "bg-red-950/90 border-red-800 text-red-200"
                : isSuccess
                  ? "bg-emerald-950/90 border-emerald-800 text-emerald-200"
                  : isJoin
                    ? "bg-amber-950/90 border-amber-800 text-amber-200"
                    : isLeave
                      ? "bg-gray-900/90 border-gray-700 text-gray-300"
                      : "bg-blue-950/90 border-blue-800 text-blue-200"
            }`}
          >
            <span className="text-base flex-shrink-0">
              {isError ? "⚠️" : isSuccess ? "✅" : isJoin ? "👋" : isLeave ? "🚪" : "ℹ️"}
            </span>
            <div className="flex-1 min-w-0">
              {toast.title && <h5 className="text-xs font-bold truncate">{toast.title}</h5>}
              <p className="text-xs font-medium leading-tight break-words">{toast.message}</p>
            </div>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-xs opacity-60 hover:opacity-100 transition-opacity ml-2"
            >
              ✕
            </button>
          </div>
        )
      })}
    </div>
  )
}
