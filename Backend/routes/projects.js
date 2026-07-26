import { Router } from "express"
import Project from "../models/Project.js"
import { authenticateToken } from "../middleware/auth.js"

const router = Router()

function defaultFileTree() {
  const fileId = "file_" + Math.random().toString(36).slice(2, 10)
  return {
    [fileId]: {
      id: fileId,
      name: "index.js",
      type: "file",
      parentId: null,
    },
  }
}

function defaultFiles() {
  const fileId = "file_" + Math.random().toString(36).slice(2, 10)
  return [{
    id: fileId,
    content: "// Start coding together!\n",
    language: "javascript",
  }]
}

// Load or create project
router.get("/:roomId", authenticateToken, async (req, res) => {
  try {
    let project = await Project.findOne({ roomId: req.params.roomId })

    if (!project) {
      const files = defaultFiles()
      const fileTree = {
        [files[0].id]: {
          id: files[0].id,
          name: "index.js",
          type: "file",
          parentId: null,
        },
      }

      project = await Project.create({
        roomId: req.params.roomId,
        fileTree,
        files,
        createdBy: req.user._id,
      })
    }

    res.json({ project })
  } catch (error) {
    res.status(500).json({ message: "Failed to load project" })
  }
})

// Save project state
router.post("/:roomId/save", authenticateToken, async (req, res) => {
  try {
    const { fileTree, files, settings } = req.body

    const project = await Project.findOneAndUpdate(
      { roomId: req.params.roomId },
      { fileTree, files, settings, updatedAt: new Date() },
      { new: true, upsert: true }
    )

    res.json({ success: true, updatedAt: project.updatedAt })
  } catch (error) {
    res.status(500).json({ message: "Failed to save project" })
  }
})

// Save snapshot
router.post("/:roomId/snapshot", authenticateToken, async (req, res) => {
  try {
    const { data, label, message, author, filesCount, fileNames } = req.body

    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    project.history.push({
      data,
      label: label || "",
      message: message || "",
      author: author || "",
      filesCount: filesCount || 0,
      fileNames: fileNames || [],
    })
    if (project.history.length > 20) {
      project.history = project.history.slice(-20)
    }
    await project.save()

    res.json({ success: true, history: project.history })
  } catch (error) {
    res.status(500).json({ message: "Failed to save snapshot" })
  }
})

// Get history
router.get("/:roomId/history", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    res.json({ history: project.history })
  } catch (error) {
    res.status(500).json({ message: "Failed to load history" })
  }
})

// Delete snapshot
router.delete("/:roomId/snapshot/:snapshotId", authenticateToken, async (req, res) => {
  try {
    const project = await Project.findOne({ roomId: req.params.roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    project.history = project.history.filter(
      (s) => s._id.toString() !== req.params.snapshotId
    )
    await project.save()

    res.json({ success: true, history: project.history })
  } catch (error) {
    res.status(500).json({ message: "Failed to delete snapshot" })
  }
})

export default router
