import { Router } from "express"
import { authenticateToken } from "../middleware/auth.js"
import { stopExecution, dockerAvailable } from "../utils/sandboxRunner.js"
import { enqueueExecution } from "../utils/execQueue.js"
import Execution from "../models/Execution.js"

const router = Router()

const LANGUAGES = ["javascript", "python", "java", "cpp", "c", "ruby", "go"]

router.post("/", authenticateToken, async (req, res) => {
  try {
    const { language, code, stdin, roomId } = req.body

    if (!language || !code) {
      return res.status(400).json({ message: "language and code are required" })
    }

    if (!LANGUAGES.includes(language)) {
      return res.status(400).json({
        message: `Language "${language}" is not supported. Supported: ${LANGUAGES.join(", ")}`,
      })
    }

    const { executionId } = await enqueueExecution({
      userId: req.user._id,
      roomId,
      language,
      code,
      stdin,
    })

    res.json({ executionId, status: "queued" })
  } catch (error) {
    console.error("Execute error:", error)
    res.status(500).json({ message: "Execution failed: " + error.message })
  }
})

router.post("/:executionId/stop", authenticateToken, async (req, res) => {
  try {
    const { executionId } = req.params
    await stopExecution(executionId)
    res.json({ stopped: true })
  } catch (error) {
    res.status(500).json({ message: "Failed to stop execution: " + error.message })
  }
})

router.get("/status", authenticateToken, async (_req, res) => {
  res.json({ dockerAvailable })
})

router.get("/history", authenticateToken, async (req, res) => {
  try {
    const { roomId, limit = 20, offset = 0 } = req.query
    const query = { userId: req.user._id }
    if (roomId) query.roomId = roomId

    const executions = await Execution.find(query)
      .sort({ createdAt: -1 })
      .skip(Number(offset))
      .limit(Number(limit))
      .select("-code -__v")
      .lean()

    const total = await Execution.countDocuments(query)

    res.json({ executions, total })
  } catch (error) {
    res.status(500).json({ message: "Failed to load execution history" })
  }
})

router.get("/:executionId", authenticateToken, async (req, res) => {
  try {
    const execution = await Execution.findOne({
      executionId: req.params.executionId,
      userId: req.user._id,
    }).select("-__v").lean()

    if (!execution) {
      return res.status(404).json({ message: "Execution not found" })
    }

    res.json({ execution })
  } catch (error) {
    res.status(500).json({ message: "Failed to load execution" })
  }
})

export default router
