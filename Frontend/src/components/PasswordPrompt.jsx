import { useState } from "react"

export default function PasswordPrompt({ roomId, onVerified, onCancel }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/projects/" + roomId + "/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      })
      const data = await res.json()
      if (res.ok) {
        onVerified()
      } else {
        setError(data.message || "Invalid password")
      }
    } catch {
      setError("Failed to verify password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-80 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-sm font-bold text-white">Password Protected Room</h3>
          <p className="text-xs text-gray-400 mt-1">Enter the room password to join</p>
        </div>

        {error && (
          <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs text-center">{error}</div>
        )}

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="Password"
          autoFocus
          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 text-center"
        />

        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading || !password} className="flex-1 px-3 py-2 bg-amber-500 text-gray-950 rounded text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer disabled:opacity-50">
            {loading ? "Verifying..." : "Join"}
          </button>
        </div>
      </div>
    </div>
  )
}
