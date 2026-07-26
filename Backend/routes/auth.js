import { Router } from "express"
import passport from "passport"
import User from "../models/User.js"
import { authenticateToken, generateToken, setTokenCookie } from "../middleware/auth.js"

const router = Router()

const ADJECTIVES = [
  "Cosmic", "Nebula", "Stellar", "Lunar", "Solar", "Quantum",
  "Electric", "Mystic", "Phantom", "Turbo", "Hyper", "Ultra",
  "Blazing", "Frozen", "Shadow", "Crystal", "Thunder", "Velvet",
]
const ANIMALS = [
  "Panda", "Falcon", "Wolf", "Tiger", "Dragon", "Phoenix",
  "Dolphin", "Eagle", "Cobra", "Lynx", "Otter", "Fox",
  "Hawk", "Bear", "Shark", "Raven", "Viper", "Mantis",
]

function generateGuestName() {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  const num = Math.floor(Math.random() * 900) + 100
  return `${adj} ${animal} ${num}`
}

function issueToken(req, res) {
  const token = generateToken(req.user._id)
  setTokenCookie(res, token)
  res.redirect(process.env.CLIENT_URL + "?token=" + token)
}

function oauthError(err, req, res, next) {
  const message = encodeURIComponent(err.message || "Authentication failed")
  res.redirect(process.env.CLIENT_URL + "?error=" + message)
}

// Guest login
router.post("/guest", async (req, res) => {
  try {
    const username = generateGuestName()
    const COLORS = [
      "#EF4444", "#F97316", "#EAB308", "#22C55E",
      "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
      "#F43F5E", "#14B8A6", "#6366F1", "#A855F7",
    ]
    const color = COLORS[Math.floor(Math.random() * COLORS.length)]

    const user = await User.create({
      username,
      avatar: "",
      color,
      isGuest: true,
    })

    const token = generateToken(user._id)
    setTokenCookie(res, token)
    res.json({ user: user.toSafeJSON(), token })
  } catch (error) {
    res.status(500).json({ message: "Failed to create guest account" })
  }
})

// Google OAuth
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }))
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login?error=auth_failed", session: false }),
  issueToken,
  oauthError
)

// GitHub OAuth
router.get("/github", passport.authenticate("github", { scope: ["user:email"] }))
router.get(
  "/github/callback",
  passport.authenticate("github", { failureRedirect: "/login?error=auth_failed", session: false }),
  issueToken,
  oauthError
)

// Get current user
router.get("/me", authenticateToken, (req, res) => {
  res.json({ user: req.user.toSafeJSON() })
})

// Get JWT token (for WebSocket auth - httpOnly cookie can't be read by JS)
router.get("/token", authenticateToken, (req, res) => {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).json({ message: "No token" })
  }
  res.json({ token })
})

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token")
  res.json({ message: "Logged out" })
})

export default router
