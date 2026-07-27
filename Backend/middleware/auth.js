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
  if (!project) return null
  const member = project.members?.get(userId)
  if (member) return member.role
  if (project.createdBy?.toString() === userId) return "owner"
  return null
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
        return res.status(403).json({ message: "Insufficient permissions" })
      }

      req.project = project
      req.userRole = role
      next()
    } catch (error) {
      return res.status(500).json({ message: "Permission check failed" })
    }
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
