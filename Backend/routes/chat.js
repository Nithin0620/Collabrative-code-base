import { Router } from "express"
import Message from "../models/Message.js"
import { authenticateToken, requireRoomAccess } from "../middleware/auth.js"

const router = Router()

router.get("/:roomId", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)
    const before = req.query.before

    const query = { roomId }
    if (before) query.createdAt = { $lt: new Date(before) }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    res.json({ messages: messages.reverse() })
  } catch (err) {
    console.error("Failed to fetch messages:", err)
    res.status(500).json({ error: "Failed to fetch messages" })
  }
})

router.post("/:roomId", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const { author, avatar, color, text } = req.body

    if (!author || !text?.trim()) {
      return res.status(400).json({ error: "Author and text are required" })
    }

    const message = await Message.create({
      roomId,
      author,
      avatar: avatar || "",
      color: color || "#888",
      text: text.trim(),
    })

    res.status(201).json({ message })
  } catch (err) {
    console.error("Failed to send message:", err)
    res.status(500).json({ error: "Failed to send message" })
  }
})

router.delete("/:roomId/:messageId", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { messageId } = req.params
    await Message.findByIdAndDelete(messageId)
    res.json({ success: true })
  } catch (err) {
    console.error("Failed to delete message:", err)
    res.status(500).json({ error: "Failed to delete message" })
  }
})

export default router
