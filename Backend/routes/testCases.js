import { Router } from "express"
import { authenticateToken } from "../middleware/auth.js"
import TestCase from "../models/TestCase.js"

const router = Router()

router.get("/", authenticateToken, async (req, res) => {
  try {
    const { language } = req.query
    const query = { userId: req.user._id }
    if (language) query.language = language

    const testCases = await TestCase.find(query)
      .sort({ updatedAt: -1 })
      .select("-__v")
      .lean()
    res.json({ testCases })
  } catch (error) {
    res.status(500).json({ message: "Failed to load test cases" })
  }
})

router.post("/", authenticateToken, async (req, res) => {
  try {
    const { title, language, stdin, expectedOutput, tags } = req.body
    if (!title || !language) {
      return res.status(400).json({ message: "title and language are required" })
    }

    const testCase = await TestCase.create({
      userId: req.user._id,
      title,
      language,
      stdin: stdin || "",
      expectedOutput: expectedOutput || "",
      tags: tags || [],
    })

    res.json({ testCase: testCase.toObject() })
  } catch (error) {
    res.status(500).json({ message: "Failed to create test case" })
  }
})

router.put("/:id", authenticateToken, async (req, res) => {
  try {
    const { title, language, stdin, expectedOutput, tags } = req.body
    const update = {}
    if (title !== undefined) update.title = title
    if (language !== undefined) update.language = language
    if (stdin !== undefined) update.stdin = stdin
    if (expectedOutput !== undefined) update.expectedOutput = expectedOutput
    if (tags !== undefined) update.tags = tags

    const testCase = await TestCase.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      update,
      { new: true }
    ).select("-__v").lean()

    if (!testCase) {
      return res.status(404).json({ message: "Test case not found" })
    }

    res.json({ testCase })
  } catch (error) {
    res.status(500).json({ message: "Failed to update test case" })
  }
})

router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const testCase = await TestCase.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    })

    if (!testCase) {
      return res.status(404).json({ message: "Test case not found" })
    }

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete test case" })
  }
})

export default router
