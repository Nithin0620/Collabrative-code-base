const STORAGE_KEY = "collab-rooms"

export function getRooms() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveRoom(room) {
  const rooms = getRooms()
  const existing = rooms.find((r) => r.id === room.id)

  if (existing) {
    existing.lastVisited = Date.now()
    if (room.name) existing.name = room.name
  } else {
    rooms.unshift({
      id: room.id,
      name: room.name || "",
      createdAt: Date.now(),
      lastVisited: Date.now(),
    })
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms))
  return rooms
}

export function updateRoomName(id, name) {
  const rooms = getRooms()
  const room = rooms.find((r) => r.id === id)
  if (room) {
    room.name = name
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms))
  }
  return rooms
}

export function deleteRoom(id) {
  const rooms = getRooms().filter((r) => r.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms))
  return rooms
}

export function generateRoomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
