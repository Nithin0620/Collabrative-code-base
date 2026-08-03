import { useState, useEffect, useMemo } from "react"
import { useAuth } from "../hooks/useAuth"

export default function LoginPage() {
  const { loginAsGuest, loginWithGoogle, loginWithGitHub, loginWithEmail, registerWithEmail } = useAuth()
  const [mode, setMode] = useState("login") // 'login' | 'register'
  const [username, setUsername] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const searchParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const isInvite = searchParams.get("redirect")?.includes("inviteToken")

  useEffect(() => {
    const urlError = searchParams.get("error")
    if (urlError) {
      setError(decodeURIComponent(urlError))
    }
  }, [searchParams])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setIsSubmitting(true)
    try {
      if (mode === "register") {
        await registerWithEmail(username, email, password)
      } else {
        await loginWithEmail(email, password)
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Authentication failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen w-full bg-gray-950 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-md shadow-2xl border border-gray-700">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-white mb-1">Collab Editor</h1>
          <p className="text-gray-400 text-sm">
            {isInvite ? "Sign in to accept your room invitation" : "Sign in to start coding together"}
          </p>
        </div>

        {isInvite && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs text-center font-medium">
            ✉️ You received a room invitation. Please authenticate to accept.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-500/50 text-red-300 text-sm text-center">
            {error === "auth_failed" ? "Authentication failed. Please try again." : error}
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex bg-gray-800 p-1 rounded-lg mb-6 border border-gray-700">
          <button
            type="button"
            onClick={() => { setMode("login"); setError("") }}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              mode === "login" ? "bg-amber-500 text-gray-950 shadow" : "text-gray-400 hover:text-white"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("register"); setError("") }}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${
              mode === "register" ? "bg-amber-500 text-gray-950 shadow" : "text-gray-400 hover:text-white"
            }`}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 mb-5">
          {mode === "register" && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="johndoe"
                className="w-full px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 block mb-1">
              {mode === "register" ? "Email Address" : "Email or Username"}
            </label>
            <input
              type={mode === "register" ? "email" : "text"}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={mode === "register" ? "user@example.com" : "user@example.com or Username"}
              className="w-full px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-2.5 rounded-lg bg-amber-500 text-gray-950 font-semibold text-sm hover:bg-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting
              ? "Authenticating..."
              : mode === "register"
                ? "Register Account"
                : "Sign In"}
          </button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-700"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-gray-900 px-3 text-gray-500">or continue with</span>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <button
            type="button"
            onClick={loginWithGoogle}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          <button
            type="button"
            onClick={loginWithGitHub}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
            GitHub
          </button>
        </div>

        {!isInvite && (
          <button
            type="button"
            onClick={loginAsGuest}
            className="w-full py-2 bg-gray-800/60 border border-gray-700 text-gray-400 rounded-lg text-xs hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
          >
            Enter as Guest
          </button>
        )}
      </div>
    </main>
  )
}
