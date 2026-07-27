import { Router } from "express"
import { authenticateToken } from "../middleware/auth.js"
import Snippet from "../models/Snippet.js"

const router = Router()

router.get("/", authenticateToken, async (req, res) => {
  try {
    const snippets = await Snippet.find({ userId: req.user._id })
      .sort({ updatedAt: -1 })
      .select("-__v")
      .lean()
    res.json({ snippets })
  } catch (error) {
    res.status(500).json({ message: "Failed to load snippets" })
  }
})

router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, code, language, tags } = req.body
    if (!title || !code) {
      return res.status(400).json({ message: "title and code are required" })
    }

    const snippet = await Snippet.create({
      userId: req.user._id,
      title,
      code,
      language: language || "plaintext",
      tags: tags || [],
    })

    res.json({ snippet: snippet.toObject() })
  } catch (error) {
    res.status(500).json({ message: "Failed to create snippet" })
  }
})

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, code, language, tags } = req.body
    const update = {}
    if (title !== undefined) update.title = title
    if (code !== undefined) update.code = code
    if (language !== undefined) update.language = language
    if (tags !== undefined) update.tags = tags

    const snippet = await Snippet.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      update,
      { new: true }
    ).select("-__v").lean()

    if (!snippet) {
      return res.status(404).json({ message: "Snippet not found" })
    }

    res.json({ snippet })
  } catch (error) {
    res.status(500).json({ message: "Failed to update snippet" })
  }
})

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const snippet = await Snippet.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!snippet) {
      return res.status(404).json({ message: "Snippet not found" })
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete snippet" })
  }
})

export default router
