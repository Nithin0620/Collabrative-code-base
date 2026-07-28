import { useState, useEffect, useCallback } from "react"
import api from "../lib/api"
import AuthContext from "../contexts/AuthContext"

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const urlToken = new URLSearchParams(window.location.search).get("token")

    if (urlToken) {
      setToken(urlToken)
      window.history.replaceState({}, "", "/")
      api.get("/me")
        .then((res) => setUser(res.data.user))
        .catch(() => { setUser(null); setToken(null) })
        .finally(() => setLoading(false))
      return
    }

    api.get("/me")
      .then((res) => {
        setUser(res.data.user)
        return api.get("/token")
      })
      .then((res) => setToken(res.data.token))
      .catch(() => { setUser(null); setToken(null) })
      .finally(() => setLoading(false))
  }, [])

  const registerWithEmail = useCallback(async (username, email, password) => {
    const res = await api.post("/register", { username, email, password })
    setUser(res.data.user)
    setToken(res.data.token)
    return res.data.user
  }, [])

  const loginWithEmail = useCallback(async (emailOrUsername, password) => {
    const res = await api.post("/login", { emailOrUsername, password })
    setUser(res.data.user)
    setToken(res.data.token)
    return res.data.user
  }, [])

  const loginAsGuest = useCallback(async () => {
    const res = await api.post("/guest")
    setUser(res.data.user)
    setToken(res.data.token)
    return res.data.user
  }, [])

  const loginWithGoogle = useCallback(() => {
    window.location.href = "/auth/google"
  }, [])

  const loginWithGitHub = useCallback(() => {
    window.location.href = "/auth/github"
  }, [])

  const logout = useCallback(async () => {
    await api.post("/logout")
    setUser(null)
    setToken(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        registerWithEmail,
        loginWithEmail,
        loginAsGuest,
        loginWithGoogle,
        loginWithGitHub,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
