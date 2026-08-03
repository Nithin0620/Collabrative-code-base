import { Router } from "express"
import { authenticateToken, getUserProjectRole } from "../middleware/auth.js"
import { stopExecution, dockerAvailable } from "../utils/sandboxRunner.js"
import { enqueueExecution, stopJob } from "../utils/execQueue.js"
import Execution from "../models/Execution.js"
import Project from "../models/Project.js"

const router = Router()

export function setIO(io) {}

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

    if (roomId) {
      const project = await Project.findOne({ roomId })
      if (project) {
        const userId = req.user._id.toString()
        if (project.bannedUsers?.includes(userId)) {
          return res.status(403).json({ message: "You are banned from this room" })
        }
        const role = getUserProjectRole(project, userId)
        if (!role || role === "viewer") {
          return res.status(403).json({ message: "Viewers cannot execute code" })
        }
      }
    }

    const result = await enqueueExecution({
      userId: req.user._id,
      roomId,
      language,
      code,
      stdin: stdin || "",
    })

    res.json(result)
  } catch (error) {
    console.error("Execute error:", error)
    res.status(500).json({ message: "Execution failed: " + error.message })
  }
})

router.post("/:executionId/stop", authenticateToken, async (req, res) => {
  try {
    const { executionId } = req.params
    const execution = await Execution.findOne({ executionId }).select("userId roomId status").lean()
    if (!execution) {
      return res.status(404).json({ message: "Execution not found" })
    }
    if (execution.userId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You can only stop your own executions" })
    }
    if (execution.status !== "queued" && execution.status !== "running") {
      return res.status(409).json({ message: "Execution is not running" })
    }
    await stopJob(executionId, stopExecution)
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
