import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../hooks/useAuth"
import { getRooms, saveRoom, deleteRoom, updateRoomName, generateRoomId, timeAgo } from "../lib/rooms"

function UserAvatar({ user }) {
  if (user.avatar) {
    return (
      <img src={user.avatar} alt={user.username} className="w-9 h-9 rounded-full object-cover" />
    )
  }
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
      style={{ backgroundColor: user.color }}
    >
      {user.username.charAt(0).toUpperCase()}
    </div>
  )
}

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [joinCode, setJoinCode] = useState("")
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    setRooms(getRooms())
  }, [])

  const createRoom = useCallback(() => {
    const id = generateRoomId()
    saveRoom({ id, name: "" })
    navigate(`/room/${id}`)
  }, [navigate])

  const joinRoom = useCallback(() => {
    const code = joinCode.trim().toLowerCase()
    if (!code) return
    saveRoom({ id: code, name: "" })
    navigate(`/room/${code}`)
    setJoinCode("")
  }, [joinCode, navigate])

  const openRoom = useCallback((id) => {
    saveRoom({ id })
    navigate(`/room/${id}`)
  }, [navigate])

  const handleDelete = useCallback((e, id) => {
    e.stopPropagation()
    setRooms((prev) => prev.filter((r) => r.id !== id))
    deleteRoom(id)
  }, [])

  const startRename = useCallback((e, room) => {
    e.stopPropagation()
    setEditingId(room.id)
    setEditName(room.name || room.id)
  }, [])

  const saveRename = useCallback(() => {
    if (!editingId) return
    const name = editName.trim()
    updateRoomName(editingId, name)
    setRooms(getRooms())
    setEditingId(null)
    setEditName("")
  }, [editingId, editName])

  const filteredRooms = rooms.filter(
    (r) =>
      r.id.includes(search.toLowerCase()) ||
      (r.name && r.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <main className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white">Collab Editor</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <UserAvatar user={user} />
              <span className="text-sm text-gray-300 hidden sm:block">{user.username}</span>
            </div>
            <button
              onClick={logout}
              className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 text-sm hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <button
            onClick={createRoom}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-gray-950 font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Room
          </button>

          <div className="flex flex-1 max-w-md">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && joinRoom()}
              placeholder="Enter room code..."
              className="flex-1 px-4 py-3 rounded-l-xl bg-gray-900 border border-gray-700 border-r-0 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={joinRoom}
              className="px-5 py-3 rounded-r-xl bg-gray-800 text-gray-300 text-sm font-semibold border border-gray-700 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
            >
              Join
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search rooms..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gray-600"
            />
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent Rooms</h2>
          <span className="text-sm text-gray-500">{filteredRooms.length} rooms</span>
        </div>

        {filteredRooms.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-800 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-gray-400 mb-1">No rooms yet</p>
            <p className="text-gray-600 text-sm">Create a new room or join with a code</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filteredRooms.map((room) => (
              <div
                key={room.id}
                onClick={() => openRoom(room.id)}
                className="group flex items-center gap-4 p-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 hover:bg-gray-900/80 transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 group-hover:bg-gray-700 transition-colors">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  {editingId === room.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={saveRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename()
                        if (e.key === "Escape") setEditingId(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-amber-500"
                    />
                  ) : (
                    <h3 className="text-sm font-semibold text-white truncate">
                      {room.name || "Untitled Room"}
                    </h3>
                  )}
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-500 font-mono">{room.id}</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-xs text-gray-500">{timeAgo(room.lastVisited)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => startRename(e, room)}
                    className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors cursor-pointer"
                    title="Rename"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, room.id)}
                    className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors cursor-pointer"
                    title="Delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                <div className="hidden sm:block shrink-0">
                  <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
