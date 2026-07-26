import { useState, useEffect } from "react"

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function SnapshotHistory({ roomId, onClose, onRestore, onDiff }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch("/api/projects/" + roomId + "/history", {
          credentials: "include",
        })
        const data = await res.json()
        setHistory((data.history || []).slice().reverse())
      } catch {
        console.error("Failed to load history")
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
  }, [roomId])

  const handleRestore = async (snapshot) => {
    setRestoring(snapshot._id)
    try {
      const parsed = JSON.parse(snapshot.data)
      onRestore(parsed)
      onClose()
    } catch {
      console.error("Failed to parse snapshot")
    } finally {
      setRestoring(null)
    }
  }

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl w-[480px] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-sm font-bold text-white">Version History</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Loading...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-400 text-sm mb-1">No snapshots yet</p>
              <p className="text-gray-500 text-xs">Click "Snapshot" in the toolbar to save a version</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((snapshot) => (
                <div
                  key={snapshot._id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-600 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200 truncate">
                      {snapshot.label || "Unnamed snapshot"}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {timeAgo(snapshot.timestamp)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => handleRestore(snapshot)}
                      disabled={restoring === snapshot._id}
                      className="px-2.5 py-1 rounded text-xs font-medium text-white bg-amber-500 hover:bg-amber-400 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {restoring === snapshot._id ? "Restoring..." : "Restore"}
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
              ))}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(null)}>
          <div
            className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-gray-200 mb-1">Delete this snapshot?</p>
            <p className="text-xs text-gray-400 mb-4 truncate">{confirmDelete.label || "Unnamed snapshot"}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleDelete(confirmDelete._id); setConfirmDelete(null) }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-400 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
