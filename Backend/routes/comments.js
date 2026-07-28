import { Router } from "express"
import Comment from "../models/Comment.js"
import { authenticateToken } from "../middleware/auth.js"

const router = Router()

// Get all comments for a room
router.get("/:roomId", authenticateToken, async (req, res) => {
  try {
    const comments = await Comment.find({ roomId: req.params.roomId }).sort({ createdAt: -1 })
    res.json({ comments })
  } catch (error) {
    res.status(500).json({ message: "Failed to load comments" })
  }
})

// Create a comment
router.post("/:roomId", authenticateToken, async (req, res) => {
  try {
    const { fileId, fileName, startLine, endLine, selectedText, author, avatar, color, text } = req.body
    const comment = await Comment.create({
      roomId: req.params.roomId,
      fileId,
      fileName: fileName || "",
      startLine,
      endLine: endLine || startLine,
      selectedText: selectedText || "",
      author,
      avatar: avatar || "",
      color: color || "#888",
      text,
    })
    res.json({ comment })
  } catch (error) {
    res.status(500).json({ message: "Failed to create comment" })
  }
})

// Delete a comment
router.delete("/:roomId/:commentId", authenticateToken, async (req, res) => {
  try {
    const comment = await Comment.findOne({ _id: req.params.commentId, roomId: req.params.roomId })
    if (!comment) return res.status(404).json({ message: "Comment not found" })
    await comment.deleteOne()
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete comment" })
  }
})

// Toggle resolve
router.patch("/:roomId/:commentId/resolve", authenticateToken, async (req, res) => {
  try {
    const comment = await Comment.findOne({ _id: req.params.commentId, roomId: req.params.roomId })
    if (!comment) return res.status(404).json({ message: "Comment not found" })
    comment.resolved = !comment.resolved
    await comment.save()
    res.json({ comment })
  } catch (error) {
    res.status(500).json({ message: "Failed to resolve comment" })
  }
})

// Add a reply
router.post("/:roomId/:commentId/reply", authenticateToken, async (req, res) => {
  try {
    const { author, avatar, color, text } = req.body
    const comment = await Comment.findOne({ _id: req.params.commentId, roomId: req.params.roomId })
    if (!comment) return res.status(404).json({ message: "Comment not found" })
    comment.replies.push({ author, avatar: avatar || "", color: color || "#888", text })
    await comment.save()
    res.json({ comment })
  } catch (error) {
    res.status(500).json({ message: "Failed to add reply" })
  }
})

// Toggle reaction on a comment
router.post("/:roomId/:commentId/react", authenticateToken, async (req, res) => {
  try {
    const { emoji, author } = req.body
    const comment = await Comment.findOne({ _id: req.params.commentId, roomId: req.params.roomId })
    if (!comment) return res.status(404).json({ message: "Comment not found" })
    const reactions = comment.reactions || new Map()
    const users = reactions.get(emoji) || []
    const idx = users.indexOf(author)
    if (idx >= 0) {
      users.splice(idx, 1)
    } else {
      users.push(author)
    }
    if (users.length === 0) {
      reactions.delete(emoji)
    } else {
      reactions.set(emoji, users)
    }
    comment.reactions = reactions
    await comment.save()
    res.json({ comment })
  } catch (error) {
    res.status(500).json({ message: "Failed to toggle reaction" })
  }
})

// Toggle reaction on a reply
router.post("/:roomId/:commentId/reply/:replyId/react", authenticateToken, async (req, res) => {
  try {
    const { emoji, author } = req.body
    const comment = await Comment.findOne({ _id: req.params.commentId, roomId: req.params.roomId })
    if (!comment) return res.status(404).json({ message: "Comment not found" })
    const reply = comment.replies.id(req.params.replyId)
    if (!reply) return res.status(404).json({ message: "Reply not found" })
    const reactions = reply.reactions || new Map()
    const users = reactions.get(emoji) || []
    const idx = users.indexOf(author)
    if (idx >= 0) {
      users.splice(idx, 1)
    } else {
      users.push(author)
    }
    if (users.length === 0) {
      reactions.delete(emoji)
    } else {
      reactions.set(emoji, users)
    }
    reply.reactions = reactions
    await comment.save()
    res.json({ comment })
  } catch (error) {
    res.status(500).json({ message: "Failed to toggle reaction" })
  }
})

export default router
