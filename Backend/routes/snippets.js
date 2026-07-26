import { Router } from "express"
import { authenticateToken } from "../middleware/auth.js"

const router = Router()

const snippets = new Map()

router.get("/", authenticateToken, async (req, res) => {
  try {
    const userSnippets = Array.from(snippets.values())
      .filter((s) => s.userId === req.user._id.toString())
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    res.json({ snippets: userSnippets })
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

    const id = "snippet_" + Math.random().toString(36).slice(2, 10)
    const snippet = {
      _id: id,
      userId: req.user._id.toString(),
      title,
      code,
      language: language || "plaintext",
      tags: tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    snippets.set(id, snippet)
    res.json({ snippet })
  } catch (error) {
    res.status(500).json({ message: "Failed to create snippet" })
  }
})

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const snippet = snippets.get(req.params.id)
    if (!snippet || snippet.userId !== req.user._id.toString()) {
      return res.status(404).json({ message: "Snippet not found" })
    }

    const { title, code, language, tags } = req.body
    if (title !== undefined) snippet.title = title
    if (code !== undefined) snippet.code = code
    if (language !== undefined) snippet.language = language
    if (tags !== undefined) snippet.tags = tags
    snippet.updatedAt = new Date().toISOString()

    res.json({ snippet })
  } catch (error) {
    res.status(500).json({ message: "Failed to update snippet" })
  }
})

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const snippet = snippets.get(req.params.id)
    if (!snippet || snippet.userId !== req.user._id.toString()) {
      return res.status(404).json({ message: "Snippet not found" })
    }
    snippets.delete(req.params.id)
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete snippet" })
  }
})

export default router
