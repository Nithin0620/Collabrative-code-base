import { Router } from "express"
import bcrypt from "bcryptjs"
import Project from "../models/Project.js"
import User from "../models/User.js"
import { authenticateToken, requireProjectRole, getUserProjectRole } from "../middleware/auth.js"

const router = Router()

function defaultFileTree() {
  const fileId = "file_" + Math.random().toString(36).slice(2, 10)
  return {
    [fileId]: {
      id: fileId,
      name: "index.js",
      type: "file",
      parentId: null,
    },
  }
}

function defaultFiles() {
  const fileId = "file_" + Math.random().toString(36).slice(2, 10)
  return [{
    id: fileId,
    content: "// Start coding together!\n",
    language: "javascript",
  }]
}

router.get("/:roomId", authenticateToken, async (req, res) => {
  try {
    let project = await Project.findOne({ roomId: req.params.roomId })

    if (!project) {
      const files = defaultFiles()
      const fileTree = {
        [files[0].id]: {
          id: files[0].id,
          name: "index.js",
          type: "file",
          parentId: null,
        },
      }

      project = await Project.create({
        roomId: req.params.roomId,
        fileTree,
        files,
        createdBy: req.user._id,
        members: new Map([
          [req.user._id.toString(), { role: "owner", joinedAt: new Date() }],
        ]),
      })
    }

    const creatorId = project.createdBy?.toString()
    const userId = req.user._id.toString()
    if (creatorId && project.members && !project.members.has(creatorId)) {
      project.members.set(creatorId, { role: "owner", joinedAt: project.createdAt || new Date() })
      await project.save()
    }

    const projectObj = project.toObject()
    if (projectObj.settings?.password) {
      projectObj.settings.hasPassword = true
      projectObj.settings.password = undefined
    }

    const role = getUserProjectRole(project, req.user._id.toString())
    projectObj.userRole = role

    const membersObj = {}
    if (project.members) {
      for (const [userId, val] of project.members.entries()) {
        membersObj[userId] = val
      }
    }
    projectObj.members = membersObj

    if (project.bannedUsers?.includes(req.user._id.toString())) {
      return res.status(403).json({ message: "You are banned from this room" })
    }

    res.json({ project: projectObj })
  } catch (error) {
    res.status(500).json({ message: "Failed to load project" })
  }
})

router.post("/:roomId/save", authenticateToken, async (req, res) => {
  try {
    const { fileTree, files, settings } = req.body
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const role = getUserProjectRole(project, req.user._id.toString())
    if (!role || (role === "viewer")) {
      return res.status(403).json({ message: "Viewers cannot save" })
    }
    if (project.settings?.readOnly && role !== "owner") {
      return res.status(403).json({ message: "Room is in read-only mode" })
    }

    const updated = await Project.findOneAndUpdate(
      { roomId: req.params.roomId },
      { fileTree, files, settings, updatedAt: new Date() },
      { new: true }
    )

    res.json({ success: true, updatedAt: updated.updatedAt })
  } catch (error) {
    res.status(500).json({ message: "Failed to save project" })
  }
})

router.post("/:roomId/snapshot", authenticateToken, async (req, res) => {
  try {
    const { data, label, message, author, authorAvatar, filesCount, fileNames } = req.body

    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    project.history.push({
      data, label: label || "", message: message || "",
      author: author || "", authorAvatar: authorAvatar || "",
      filesCount: filesCount || 0, fileNames: fileNames || [],
    })
    if (project.history.length > 20) {
      project.history = project.history.slice(-20)
    }
    await project.save()

    res.json({ success: true, history: project.history })
  } catch (error) {
    res.status(500).json({ message: "Failed to save snapshot" })
  }
})

router.get("/:roomId/history", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }
    res.json({ history: project.history })
  } catch (error) {
    res.status(500).json({ message: "Failed to load history" })
  }
})

router.delete("/:roomId/snapshot/:snapshotId", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const role = getUserProjectRole(project, req.user._id.toString())
    if (!role || role === "viewer") {
      return res.status(403).json({ message: "Insufficient permissions" })
    }

    project.history = project.history.filter(
      (s) => s._id.toString() !== req.params.snapshotId
    )
    await project.save()

    res.json({ success: true, history: project.history })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete snapshot" })
  }
})

router.get("/:roomId/members", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const memberIds = Array.from(project.members?.keys() || [])
    if (project.createdBy && !memberIds.includes(project.createdBy.toString())) {
      memberIds.push(project.createdBy.toString())
    }

    const users = await User.find({ _id: { $in: memberIds } })
      .select("username avatar color isGuest")

    const members = users.map((u) => {
      const uid = u._id.toString()
      const memberData = project.members?.get(uid) || { role: "owner", joinedAt: project.createdAt }
      return {
        _id: uid,
        username: u.username,
        avatar: u.avatar,
        color: u.color,
        isGuest: u.isGuest,
        role: uid === project.createdBy?.toString() ? "owner" : memberData.role,
        joinedAt: memberData.joinedAt,
      }
    })

    res.json({ members, bannedUsers: project.bannedUsers || [] })
  } catch (error) {
    res.status(500).json({ message: "Failed to load members" })
  }
})

router.post("/:roomId/members", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { username, role } = req.body
    if (!username) {
      return res.status(400).json({ message: "Username is required" })
    }

    const targetUser = await User.findOne({ username })
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" })
    }

    const targetId = targetUser._id.toString()
    const project = req.project

    if (project.bannedUsers?.includes(targetId)) {
      return res.status(400).json({ message: "User is banned from this room" })
    }

    const validRole = ["editor", "viewer"].includes(role) ? role : "editor"
    project.members.set(targetId, { role: validRole, joinedAt: new Date() })
    await project.save()

    res.json({ success: true, member: { _id: targetId, username: targetUser.username, avatar: targetUser.avatar, color: targetUser.color, role: validRole } })
  } catch (error) {
    res.status(500).json({ message: "Failed to add member" })
  }
})

router.patch("/:roomId/members/:userId/role", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { role } = req.body
    const { userId } = req.params
    const project = req.project

    if (!["editor", "viewer"].includes(role)) {
      return res.status(400).json({ message: "Invalid role" })
    }

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot change your own role" })
    }

    if (!project.members?.has(userId)) {
      return res.status(404).json({ message: "Member not found" })
    }

    const current = project.members.get(userId)
    project.members.set(userId, { ...current, role })
    await project.save()

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to update role" })
  }
})

router.delete("/:roomId/members/:userId", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { userId } = req.params
    const project = req.project

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot remove yourself" })
    }

    project.members?.delete(userId)
    await project.save()

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to remove member" })
  }
})

router.post("/:roomId/kick/:userId", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { userId } = req.params
    const project = req.project

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot kick yourself" })
    }

    project.members?.delete(userId)
    await project.save()

    res.json({ success: true, kicked: userId })
  } catch (error) {
    res.status(500).json({ message: "Failed to kick user" })
  }
})

router.post("/:roomId/ban/:userId", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { userId } = req.params
    const project = req.project

    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: "Cannot ban yourself" })
    }

    if (!project.bannedUsers) project.bannedUsers = []
    if (!project.bannedUsers.includes(userId)) {
      project.bannedUsers.push(userId)
    }

    project.members?.delete(userId)
    await project.save()

    res.json({ success: true, banned: userId })
  } catch (error) {
    res.status(500).json({ message: "Failed to ban user" })
  }
})

router.post("/:roomId/unban/:userId", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { userId } = req.params
    const project = req.project

    project.bannedUsers = (project.bannedUsers || []).filter((id) => id !== userId)
    await project.save()

    res.json({ success: true, unbanned: userId })
  } catch (error) {
    res.status(500).json({ message: "Failed to unban user" })
  }
})

router.patch("/:roomId/settings", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { inviteOnly, readOnly, password } = req.body
    const project = req.project

    if (typeof inviteOnly === "boolean") project.settings.inviteOnly = inviteOnly
    if (typeof readOnly === "boolean") project.settings.readOnly = readOnly
    if (typeof password === "string") {
      project.settings.password = password ? await bcrypt.hash(password, 10) : ""
    }

    await project.save()

    const settingsObj = { ...project.settings.toObject() }
    settingsObj.hasPassword = !!settingsObj.password
    settingsObj.password = undefined

    res.json({ success: true, settings: settingsObj })
  } catch (error) {
    res.status(500).json({ message: "Failed to update settings" })
  }
})

router.post("/:roomId/verify-password", authenticateToken, async (req, res) => {
  try {
    const { password } = req.body
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    if (!project.settings?.password) {
      return res.json({ success: true, message: "No password required" })
    }

    const valid = await bcrypt.compare(password || "", project.settings.password)
    if (!valid) {
      return res.status(403).json({ message: "Invalid password" })
    }

    const userId = req.user._id.toString()
    if (project.bannedUsers?.includes(userId)) {
      return res.status(403).json({ message: "You are banned from this room" })
    }

    if (!project.members?.has(userId) && project.createdBy?.toString() !== userId) {
      project.members.set(userId, { role: "editor", joinedAt: new Date() })
      await project.save()
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to verify password" })
  }
})

router.post("/:roomId/join", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const userId = req.user._id.toString()

    if (project.bannedUsers?.includes(userId)) {
      return res.status(403).json({ message: "You are banned from this room" })
    }

    if (project.createdBy?.toString() === userId) {
      return res.json({ success: true, role: "owner" })
    }

    const existingMember = project.members?.get(userId)
    if (existingMember) {
      return res.json({ success: true, role: existingMember.role })
    }

    if (project.settings?.inviteOnly) {
      return res.json({ success: false, requiresApproval: true, message: "This room is invite-only" })
    }

    if (project.settings?.password) {
      return res.json({ success: false, requiresPassword: true, message: "This room requires a password" })
    }

    project.members.set(userId, { role: "editor", joinedAt: new Date() })
    await project.save()

    res.json({ success: true, role: "editor" })
  } catch (error) {
    res.status(500).json({ message: "Failed to join room" })
  }
})

export default router
