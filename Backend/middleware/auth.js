import jwt from "jsonwebtoken"
import User from "../models/User.js"
import Project from "../models/Project.js"

export const authenticateToken = async (req, res, next) => {
  const token = req.cookies?.token

  if (!token) {
    return res.status(401).json({ message: "Not authenticated" })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId).select("-__v")

    if (!user) {
      return res.status(401).json({ message: "User not found" })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" })
  }
}

const ROLE_HIERARCHY = { owner: 3, editor: 2, viewer: 1 }

export function getUserProjectRole(project, userId) {
  if (!project || !userId) return null
  const uStr = userId.toString()
  const isOwner = project.createdBy?.toString() === uStr
  if (isOwner) return "owner"

  // Room readOnly setting forces all non-owners to be viewers
  if (project.settings?.readOnly) {
    return "viewer"
  }

  let member = null
  if (project.members) {
    if (typeof project.members.get === "function") {
      member = project.members.get(uStr)
    }
    if (!member && typeof project.members.entries === "function") {
      for (const [k, v] of project.members.entries()) {
        if (k.toString() === uStr) {
          member = v
          break
        }
      }
    } else if (!member && typeof project.members === "object") {
      member = project.members[uStr]
    }
  }

  if (member && member.role) {
    return member.role
  }

  return "editor"
}

export function hasMinimumRole(userRole, requiredRole) {
  if (!userRole) return false
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0)
}

export function canEdit(userRole, projectSettings) {
  if (projectSettings?.readOnly && userRole !== "owner") return false
  return hasMinimumRole(userRole, "editor")
}

export function requireProjectRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const { roomId } = req.params
      const project = await Project.findOne({ roomId })
      if (!project) {
        return res.status(404).json({ message: "Project not found" })
      }

      const role = getUserProjectRole(project, req.user._id.toString())

      if (!role || !allowedRoles.includes(role)) {
        console.error(`[requireProjectRole] User ${req.user._id} has role "${role}" but ${allowedRoles.join(" or ")} required for room ${roomId}, createdBy=${project.createdBy}`)
        return res.status(403).json({ message: "Insufficient permissions" })
      }

      req.project = project
      req.userRole = role
      next()
    } catch (error) {
      console.error("[requireProjectRole] Error:", error)
      return res.status(500).json({ message: "Permission check failed" })
    }
  }
}

export async function requireRoomAccess(req, res, next) {
  try {
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) return next()

    const userId = req.user._id.toString()

    if (project.bannedUsers?.includes(userId)) {
      return res.status(403).json({ message: "You are banned from this room" })
    }

    const isOwner = project.createdBy?.toString() === userId
    let isMember = false
    if (project.members) {
      if (typeof project.members.has === "function") isMember = project.members.has(userId)
      if (!isMember && typeof project.members.entries === "function") {
        for (const [k] of project.members.entries()) {
          if (k.toString() === userId) { isMember = true; break }
        }
      }
    }

    if (project.settings?.inviteOnly && !isOwner && !isMember) {
      return res.status(403).json({ requiresInvite: true, message: "This room is invite-only" })
    }

    if (project.settings?.password && !isOwner) {
      const pwdCookie = req.cookies?.["pwd_" + req.params.roomId]
      if (pwdCookie !== "verified") {
        return res.status(403).json({ requiresPassword: true, message: "Password required" })
      }
    }

    next()
  } catch {
    res.status(500).json({ message: "Access check failed" })
  }
}

export const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" })
}

export const setTokenCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}
