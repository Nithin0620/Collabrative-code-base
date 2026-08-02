import { useState, useEffect, useCallback } from "react"

export default function useProjectRole(roomId) {
  const [role, setRole] = useState(null)
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [bannedUsers, setBannedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({})

  const [requiresPassword, setRequiresPassword] = useState(false)
  const [requiresInvite, setRequiresInvite] = useState(false)
  const [roomName, setRoomName] = useState("")

  const fetchProject = useCallback(async () => {
    if (!roomId) return
    try {
      const res = await fetch("/api/projects/" + roomId, { credentials: "include" })
      const data = await res.json()
      if (data.requiresPassword) {
        setRequiresPassword(true)
        return
      } else {
        setRequiresPassword(false)
      }
      if (data.requiresInvite) {
        setRequiresInvite(true)
        return
      } else {
        setRequiresInvite(false)
      }
      if (data.project) {
        setProject(data.project)
        setRole(data.project.userRole ?? null)
        setSettings(data.project.settings || {})
        setRoomName(data.project.settings?.roomName || "")
        setBannedUsers(data.project.bannedUsers || [])
      }
    } catch (err) {
      console.error("Failed to load project role:", err)
    } finally {
      setLoading(false)
    }
  }, [roomId])

  const fetchMembers = useCallback(async () => {
    if (!roomId) return
    try {
      const res = await fetch("/api/projects/" + roomId + "/members", { credentials: "include" })
      const data = await res.json()
      setMembers(data.members || [])
      setBannedUsers(data.bannedUsers || [])
    } catch (err) {
      console.error("Failed to load members:", err)
    }
  }, [roomId])

  useEffect(() => {
    fetchProject()
    fetchMembers()
  }, [fetchProject, fetchMembers])

  const sendInvite = useCallback(async (emailOrUsername, memberRole) => {
    const isEmail = emailOrUsername.includes("@")
    const payload = isEmail
      ? { email: emailOrUsername, role: memberRole }
      : { username: emailOrUsername, role: memberRole }

    const res = await fetch("/api/projects/" + roomId + "/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      const data = await res.json()
      await fetchMembers()
      await fetchProject()
      return data
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers, fetchProject])

  const changeRole = useCallback(async (userId, newRole) => {
    const res = await fetch("/api/projects/" + roomId + "/members/" + userId + "/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      await fetchMembers()
      await fetchProject()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers, fetchProject])

  const kickUser = useCallback(async (userId) => {
    const res = await fetch("/api/projects/" + roomId + "/kick/" + userId, {
      method: "POST",
      credentials: "include",
    })
    if (res.ok) {
      await fetchMembers()
      await fetchProject()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers, fetchProject])

  const banUser = useCallback(async (userId) => {
    const res = await fetch("/api/projects/" + roomId + "/ban/" + userId, {
      method: "POST",
      credentials: "include",
    })
    if (res.ok) {
      await fetchMembers()
      await fetchProject()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers, fetchProject])

  const unbanUser = useCallback(async (userId) => {
    const res = await fetch("/api/projects/" + roomId + "/unban/" + userId, {
      method: "POST",
      credentials: "include",
    })
    if (res.ok) {
      await fetchMembers()
      await fetchProject()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers, fetchProject])

  const updateSettings = useCallback(async (newSettings) => {
    const res = await fetch("/api/projects/" + roomId + "/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(newSettings),
    })
    if (res.ok) {
      const data = await res.json()
      setSettings(data.settings)
      await fetchProject()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchProject])

  const renameRoom = useCallback(async (name) => {
    const res = await fetch("/api/projects/" + roomId + "/name", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ roomName: name }),
    })
    if (res.ok) {
      const data = await res.json()
      setRoomName(data.roomName)
      await fetchProject()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchProject])

  const canEdit = role === "owner" || (role === "editor" && !settings?.readOnly)

  return {
    role, project, members, bannedUsers, loading, settings,
    roomName, setRoomName, renameRoom,
    canEdit,
    requiresPassword,
    requiresInvite,
    isOwner: role === "owner",
    fetchProject, fetchMembers, addMember: sendInvite, sendInvite, changeRole,
    kickUser, banUser, unbanUser, updateSettings,
  }
}
