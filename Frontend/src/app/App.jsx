import "./App.css"
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom"
import { AuthProvider } from "../components/AuthProvider"
import { useAuth } from "../hooks/useAuth"
import LoginPage from "../pages/LoginPage"
import DashboardPage from "../pages/DashboardPage"
import EditorPage from "../pages/EditorPage"

import { useLocation, useSearchParams } from "react-router-dom"

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="h-screen w-full bg-gray-950 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </main>
    )
  }

  if (!user) {
    const redirectUrl = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirectUrl}`} replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect") || "/"

  if (loading) {
    return (
      <main className="h-screen w-full bg-gray-950 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </main>
    )
  }

  if (user) {
    return <Navigate to={redirect} replace />
  }

  return children
}

function RoomRoute() {
  const { roomId } = useParams()
  return (
    <ProtectedRoute>
      <EditorPage roomId={roomId} />
    </ProtectedRoute>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route path="/room/:roomId" element={<RoomRoute />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
