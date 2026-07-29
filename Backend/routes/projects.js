import { Router } from "express"
import bcrypt from "bcryptjs"
import Project from "../models/Project.js"
import User from "../models/User.js"
import { authenticateToken, requireProjectRole, getUserProjectRole, requireRoomAccess } from "../middleware/auth.js"

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

import jwt from "jsonwebtoken"
import { sendInviteEmail } from "../utils/mailer.js"

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
    const isOwner = creatorId === userId
    let isMember = false
    if (project.members) {
      const uStr = userId.toString()
      if (typeof project.members.has === "function") {
        isMember = project.members.has(uStr)
      }
      if (!isMember && typeof project.members.entries === "function") {
        for (const [k] of project.members.entries()) {
          if (k.toString() === uStr) {
            isMember = true
            break
          }
        }
      } else if (!isMember && typeof project.members === "object") {
        isMember = !!project.members[uStr]
      }
    }

    if (project.bannedUsers?.includes(userId)) {
      return res.status(403).json({ message: "You are banned from this room" })
    }

    // Check Invite Only requirement
    if (project.settings?.inviteOnly && !isOwner && !isMember) {
      return res.status(403).json({ requiresInvite: true, message: "This room is invite-only. Please request an invitation from the room owner." })
    }

    // Check Password requirement
    if (project.settings?.password && !isOwner) {
      const pwdCookie = req.cookies?.["pwd_" + req.params.roomId]
      if (pwdCookie !== "verified") {
        return res.status(403).json({ requiresPassword: true, message: "Password required to enter this room" })
      }
    }

    if (creatorId && project.members && !project.members.has(creatorId)) {
      project.members.set(creatorId, { role: "owner", joinedAt: project.createdAt || new Date() })
      await project.save()
    }

    const projectObj = project.toObject()
    if (projectObj.settings?.password) {
      projectObj.settings.hasPassword = true
      projectObj.settings.password = undefined
    }

    let role = getUserProjectRole(project, userId)
    if (project.settings?.readOnly && !isOwner) {
      role = "viewer"
    }
    projectObj.userRole = role

    const membersObj = {}
    if (project.members) {
      for (const [mId, val] of project.members.entries()) {
        membersObj[mId] = val
      }
    }
    projectObj.members = membersObj

    res.json({ project: projectObj })
  } catch (error) {
    res.status(500).json({ message: "Failed to load project" })
  }
})

router.post("/:roomId/save", authenticateToken, requireRoomAccess, async (req, res) => {
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

router.post("/:roomId/snapshot", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { data, label, message, author, authorAvatar, filesCount, fileNames } = req.body

    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const role = getUserProjectRole(project, req.user._id.toString())
    if (!role || role === "viewer") {
      return res.status(403).json({ message: "Viewers cannot create snapshots" })
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

router.get("/:roomId/history", authenticateToken, requireRoomAccess, async (req, res) => {
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

router.delete("/:roomId/snapshot/:snapshotId", authenticateToken, requireRoomAccess, async (req, res) => {
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

router.get("/:roomId/members", authenticateToken, requireRoomAccess, async (req, res) => {
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
    project.markModified("members")
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

    const current = project.members?.get(userId) || {}
    project.members.set(userId, { ...current, role })
    project.markModified("members")
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
    project.markModified("members")
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
    project.markModified("members")
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
    project.markModified("members")
    project.markModified("bannedUsers")
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
    project.markModified("bannedUsers")
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

    project.markModified("settings")
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

    const assignedRole = project.settings?.readOnly ? "viewer" : "editor"
    if (!project.members?.has(userId) && project.createdBy?.toString() !== userId) {
      project.members.set(userId, { role: assignedRole, joinedAt: new Date() })
      await project.save()
    }

    res.cookie("pwd_" + req.params.roomId, "verified", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to verify password" })
  }
})

router.post("/:roomId/invite", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { email, username, role } = req.body
    const project = req.project

    if (!email && !username) {
      return res.status(400).json({ message: "Email or username is required" })
    }

    let targetEmail = email
    let targetUser = null

    if (username) {
      targetUser = await User.findOne({ username })
      if (targetUser && targetUser.email) {
        targetEmail = targetUser.email
      }
    } else if (email) {
      targetUser = await User.findOne({ email })
    }

    const validRole = ["editor", "viewer"].includes(role) ? role : "editor"

    if (targetUser) {
      const targetId = targetUser._id.toString()
      if (project.bannedUsers?.includes(targetId)) {
        return res.status(400).json({ message: "User is banned from this room" })
      }
      project.members.set(targetId, { role: validRole, joinedAt: new Date() })
      project.markModified("members")
      await project.save()
    }

    let emailResult = { success: false }
    if (targetEmail) {
      const inviteToken = jwt.sign(
        { roomId: req.params.roomId, email: targetEmail, role: validRole },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      )
      emailResult = await sendInviteEmail({
        toEmail: targetEmail,
        inviterName: req.user.username,
        roomName: req.params.roomId,
        roomId: req.params.roomId,
        inviteToken,
        role: validRole,
      })
    }

    res.json({
      success: true,
      emailSent: emailResult.success,
      memberAdded: !!targetUser,
      message: emailResult.success
        ? `Invitation sent to ${targetEmail}`
        : targetUser
          ? `User ${targetUser.username} added to room`
          : "Member processed",
    })
  } catch (error) {
    console.error("Invite error:", error)
    res.status(500).json({ message: "Failed to send invitation" })
  }
})

router.post("/:roomId/accept-invite", authenticateToken, async (req, res) => {
  try {
    const { inviteToken } = req.body
    if (!inviteToken) {
      return res.status(400).json({ message: "Invite token is required" })
    }

    const decoded = jwt.verify(inviteToken, process.env.JWT_SECRET)
    if (decoded.roomId !== req.params.roomId) {
      return res.status(400).json({ message: "Invalid invite token for this room" })
    }

    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const userId = req.user._id.toString()
    if (project.bannedUsers?.includes(userId)) {
      return res.status(403).json({ message: "You are banned from this room" })
    }

    const role = decoded.role || "editor"
    project.members.set(userId, { role, joinedAt: new Date() })
    project.markModified("members")
    await project.save()

    res.json({ success: true, role })
  } catch (error) {
    res.status(400).json({ message: "Invalid or expired invitation token" })
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

    const isOwner = project.createdBy?.toString() === userId
    if (isOwner) {
      return res.json({ success: true, role: "owner" })
    }

    if (project.settings?.password) {
      const pwdCookie = req.cookies?.["pwd_" + req.params.roomId]
      if (pwdCookie !== "verified") {
        return res.status(403).json({ success: false, requiresPassword: true, message: "This room requires a password" })
      }
    }

    const existingMember = project.members?.get(userId)

    if (project.settings?.inviteOnly && !isOwner && !existingMember) {
      return res.status(403).json({
        success: false,
        requiresInvite: true,
        requiresApproval: true,
        message: "This room is invite-only. You must be invited by the room owner to join.",
      })
    }

    if (existingMember) {
      const role = project.settings?.readOnly ? "viewer" : existingMember.role
      return res.json({ success: true, role })
    }

    const assignedRole = project.settings?.readOnly ? "viewer" : "editor"
    project.members.set(userId, { role: assignedRole, joinedAt: new Date() })
    project.markModified("members")
    await project.save()

    res.json({ success: true, role: assignedRole })
  } catch (error) {
    res.status(500).json({ message: "Failed to join room" })
  }
})

export default router
