import { useState, useEffect, useCallback } from "react"

export default function useProjectRole(roomId) {
  const [role, setRole] = useState(null)
  const [project, setProject] = useState(null)
  const [members, setMembers] = useState([])
  const [bannedUsers, setBannedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState({})

  const fetchProject = useCallback(async () => {
    if (!roomId) return
    try {
      const res = await fetch("/api/projects/" + roomId, { credentials: "include" })
      const data = await res.json()
      if (data.project) {
        setProject(data.project)
        setRole(data.project.userRole ?? null)
        setSettings(data.project.settings || {})
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

  const addMember = useCallback(async (username, memberRole) => {
    const res = await fetch("/api/projects/" + roomId + "/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, role: memberRole }),
    })
    if (res.ok) {
      await fetchMembers()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers])

  const changeRole = useCallback(async (userId, newRole) => {
    const res = await fetch("/api/projects/" + roomId + "/members/" + userId + "/role", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ role: newRole }),
    })
    if (res.ok) {
      await fetchMembers()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers])

  const kickUser = useCallback(async (userId) => {
    const res = await fetch("/api/projects/" + roomId + "/kick/" + userId, {
      method: "POST",
      credentials: "include",
    })
    if (res.ok) {
      await fetchMembers()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers])

  const banUser = useCallback(async (userId) => {
    const res = await fetch("/api/projects/" + roomId + "/ban/" + userId, {
      method: "POST",
      credentials: "include",
    })
    if (res.ok) {
      await fetchMembers()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers])

  const unbanUser = useCallback(async (userId) => {
    const res = await fetch("/api/projects/" + roomId + "/unban/" + userId, {
      method: "POST",
      credentials: "include",
    })
    if (res.ok) {
      await fetchMembers()
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId, fetchMembers])

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
      return true
    }
    const err = await res.json()
    return { error: err.message }
  }, [roomId])

  return {
    role, project, members, bannedUsers, loading, settings,
    canEdit: role === "owner" || role === "editor",
    isOwner: role === "owner",
    fetchProject, fetchMembers, addMember, changeRole,
    kickUser, banUser, unbanUser, updateSettings,
  }
}
