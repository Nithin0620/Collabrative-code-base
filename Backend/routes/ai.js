import { Router } from "express"
import Project from "../models/Project.js"
import AIEdit from "../models/AIEdit.js"
import AIConversation from "../models/AIConversation.js"
import { authenticateToken, requireRoomAccess, getUserProjectRole } from "../middleware/auth.js"
import { initSSE, sendSSE, sendDone, sendSSEError } from "../utils/sse.js"
import { streamGroqChat } from "../services/groqClient.js"
import { buildContext } from "../services/contextBuilder.js"
import { buildMessages, estimateTokens } from "../services/promptBuilder.js"
import { getRoomIndex, rebuildRoomIndex } from "../services/symbolIndex.js"
import { rebuildRoomVectors } from "../services/retrievalService.js"
import { checkRateLimit } from "../utils/rateLimit.js"
import { semanticSearch } from "../services/retrievalService.js"
import { isEmbeddingEnabled } from "../services/embeddingService.js"
import {
  runAgent,
  getProposal,
  takeProposal,
  buildPathIdMap,
  buildFilesFromYDoc,
  languageFromName,
} from "../services/agentEngine.js"
import { syncProjectToDisk } from "../utils/projectSync.js"

const router = Router()

const DEFAULT_MODEL = "llama-3.3-70b-versatile"

// Models users can pick from in the AI panel. The env default is always first;
// the active selection is validated against this list before being sent to Groq.
const GROQ_MODELS = Array.from(
  new Set([
    process.env.GROQ_MODEL || DEFAULT_MODEL,
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama-3.3-70b-specdec",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
  ])
)

function resolveModel(requested) {
  const pick = String(requested || "").trim()
  return GROQ_MODELS.includes(pick) ? pick : process.env.GROQ_MODEL || DEFAULT_MODEL
}

const MAX_STORED_MESSAGES = 200

async function appendConversation({ roomId, userId, userName, turns }) {
  const extra = turns.map((t) => ({ role: t.role, content: t.content, agent: !!t.agent }))
  if (extra.length === 0) return
  await AIConversation.findOneAndUpdate(
    { roomId, userId },
    {
      $push: { messages: { $each: extra, $slice: -MAX_STORED_MESSAGES } },
      $set: { userName: userName || "", updatedAt: new Date() },
    },
    { upsert: true, setDefaultsOnInsert: true }
  )
}

router.get("/config", (req, res) => {
  res.json({
    enabled: !!process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || DEFAULT_MODEL,
    models: GROQ_MODELS,
    searchEnabled: isEmbeddingEnabled(),
  })
})

// Introspection / debugging endpoint: shows exactly what context the server
// would feed to the model for a given client snapshot (no Groq call).
router.post("/context/:roomId", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const project = await Project.findOne({ roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const context = await buildContext({
      roomId,
      project,
      userId: req.user._id.toString(),
      clientSnapshot: req.body || {},
    })

    const index = await getRoomIndex(roomId, project)
    res.json({
      context,
      index: index
        ? {
            fileCount: index.size,
            paths: Array.from(index.keys()),
          }
        : null,
    })
  } catch (err) {
    console.error("[ai] context error:", err)
    res.status(500).json({ message: "Failed to build context" })
  }
})

// Semantic search over the room's embedded chunks (Phase 3).
router.post("/:roomId/search", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const project = await Project.findOne({ roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const query = String(req.body?.query || "").trim()
    if (!query) {
      return res.status(400).json({ message: "A query is required" })
    }

    const results = await semanticSearch(roomId, project, query, {
      topK: Math.min(Number(req.body?.topK) || 5, 20),
    })

    if (!results) {
      return res.status(503).json({ message: "Search is not available yet (embeddings are still loading or not configured)" })
    }

    res.json({ results, enabled: true })
  } catch (err) {
    console.error("[ai] search error:", err)
    res.status(500).json({ message: "Failed to run search" })
  }
})

// Load the current user's stored AI conversation for a room.
router.get("/:roomId/conversation", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const conv = await AIConversation.findOne({ roomId, userId: req.user._id.toString() })
    res.json({ messages: conv?.messages || [] })
  } catch (err) {
    console.error("[ai] conversation load error:", err)
    res.status(500).json({ message: "Failed to load conversation" })
  }
})

// Clear the current user's stored AI conversation for a room.
router.delete("/:roomId/conversation", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    await AIConversation.deleteOne({ roomId: req.params.roomId, userId: req.user._id.toString() })
    res.json({ success: true })
  } catch (err) {
    console.error("[ai] conversation clear error:", err)
    res.status(500).json({ message: "Failed to clear conversation" })
  }
})

// Phase 4: autonomous agent loop with tool calls. Streams answer deltas, tool
// activity, and edit proposals (proposals are applied via /apply, never inline).
router.post("/:roomId/agent", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const project = await Project.findOne({ roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const rl = await checkRateLimit(req.user._id.toString(), roomId)
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return res.status(429).json({
        message: "You are sending requests too quickly. Please wait a moment and try again.",
        retryAfter,
      })
    }

    const question = String(req.body?.question || "").trim()
    if (!question) {
      return res.status(400).json({ message: "A question is required" })
    }

    const role = getUserProjectRole(project, req.user._id.toString())
    const readOnly = !!(project.settings?.readOnly && role !== "owner")
    const canEdit = !!role && role !== "viewer" && !readOnly

    const model = resolveModel(req.body?.model)

    initSSE(res)
    sendSSE(res, {
      meta: { model, mode: "agent", canEdit },
    })

    const controller = new AbortController()
    req.on("close", () => {
      if (!res.writableEnded) controller.abort()
    })

    let agentContent = ""

    try {
      const agentResult = await runAgent({
        roomId,
        project,
        userId: req.user._id.toString(),
        role,
        readOnly,
        question,
        history: req.body?.history,
        signal: controller.signal,
        model,
        onDelta: (delta) => {
          agentContent += delta
          sendSSE(res, { delta })
        },
        onTool: (t) => sendSSE(res, { tool: t }),
        onProposal: (p) => sendSSE(res, { proposal: { id: p.id, path: p.path, diffText: p.diffText, mode: p.mode } }),
      })
      const agentUsage = agentResult?.usage
      if (agentUsage) {
        const inputTokens = agentUsage.inputTokens || 0
        const outputTokens = agentUsage.outputTokens || 0
        sendSSE(res, { usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } })
      }
      sendDone(res)
      appendConversation({
        roomId,
        userId: req.user._id.toString(),
        userName: req.user.username || "",
        turns: [
          { role: "user", content: question },
          { role: "assistant", content: agentContent, agent: true },
        ],
      }).catch((err) => console.warn("[ai] conversation save failed:", err.message))
    } catch (err) {
      if (controller.signal.aborted) return
      sendSSEError(res, err)
    }
  } catch (err) {
    console.error("[ai] agent error:", err)
    if (!res.headersSent) {
      return res.status(500).json({ message: "Failed to run agent" })
    }
    sendSSEError(res, err)
  }
})

// Apply an approved edit proposal to the live Yjs doc so all collaborators see
// it, then refresh the AI index/vectors and persist for git/disk.
router.post("/:roomId/apply", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const project = await Project.findOne({ roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const role = getUserProjectRole(project, req.user._id.toString())
    if (!role || role === "viewer") {
      return res.status(403).json({ message: "Viewers cannot apply edits" })
    }
    if (project.settings?.readOnly && role !== "owner") {
      return res.status(403).json({ message: "Room is in read-only mode" })
    }

    const proposal = getProposal(roomId, String(req.body?.proposalId || ""))
    if (!proposal) {
      return res.status(404).json({ message: "Proposal not found or expired" })
    }

    const ySocketIO = req.app.get("ySocketIO")
    const yDoc = ySocketIO?.documents.get(roomId)
    if (!yDoc) {
      return res.status(409).json({ message: "No live editor session for this room. Please open the room first." })
    }

    const tree =
      project.fileTree instanceof Map
        ? Object.fromEntries(project.fileTree)
        : Object.fromEntries(Object.entries(project.fileTree || {}))
    const fileId = buildPathIdMap(tree).get(proposal.path)
    const isCreate = proposal.mode === "create" || !fileId

    let appliedFileId = fileId
    let resultTree = tree
    if (!isCreate) {
      // --- Edit existing file ------------------------------------------------
      if (!fileId) {
        return res.status(404).json({ message: "File no longer exists in the project" })
      }

      const yText = yDoc.getText("file:" + fileId)
      if (yText.toString() !== proposal.oldContent) {
        return res.status(409).json({ message: "The file changed after this edit was proposed. Please ask the agent to re-propose it." })
      }

      yDoc.transact(() => {
        yText.delete(0, yText.length)
        yText.insert(0, proposal.newContent)
      })

      // Persist the single file so Mongo/disk/git catch up (fire-and-forget).
      await Project.findOneAndUpdate(
        { roomId },
        { $set: { "files.$[f].content": proposal.newContent, updatedAt: new Date() } },
        { arrayFilters: [{ "f.id": fileId }] }
      ).catch(() => {})
    } else {
      // --- Create new file (and any missing folders) -------------------------
      if (fileId) {
        return res.status(409).json({ message: `File already exists: ${proposal.path}` })
      }

      const segments = proposal.path.replace(/\\/g, "/").split("/").filter(Boolean)
      const fileName = segments.pop()
      if (!fileName) {
        return res.status(400).json({ message: "Invalid file path" })
      }

      const yTree = yDoc.getMap("fileTree")
      const newNodes = {} // nodes to add to the shared tree
      let parentId = null
      for (const seg of segments) {
        let nodeId = null
        for (const [id, item] of Object.entries(tree)) {
          if (item && item.type === "folder" && item.name === seg && (item.parentId || null) === (parentId || null)) {
            nodeId = id
            break
          }
        }
        if (!nodeId) {
          nodeId = "folder_" + Math.random().toString(36).slice(2, 12)
          newNodes[nodeId] = { id: nodeId, name: seg, type: "folder", parentId }
        }
        parentId = nodeId
      }

      const newFileId = "file_" + Math.random().toString(36).slice(2, 12)
      newNodes[newFileId] = { id: newFileId, name: fileName, type: "file", parentId }

      yDoc.transact(() => {
        for (const [id, node] of Object.entries(newNodes)) {
          yTree.set(id, node)
        }
        yDoc.getText("file:" + newFileId).insert(0, proposal.newContent)
      })

      const treeMap = new Map(Object.entries(tree))
      for (const [id, node] of Object.entries(newNodes)) {
        treeMap.set(id, node)
      }
      resultTree = Object.fromEntries(treeMap)
      await Project.findOneAndUpdate(
        { roomId },
        {
          $set: { fileTree: treeMap, updatedAt: new Date() },
          $push: { files: { id: newFileId, content: proposal.newContent, language: languageFromName(fileName) } },
        }
      ).catch(() => {})

      appliedFileId = newFileId
    }

    // Keep AI context fresh from the live doc (source of truth).
    const files = buildFilesFromYDoc(yDoc, resultTree)
    const index = rebuildRoomIndex(roomId, resultTree, files)
    rebuildRoomVectors(roomId, index).catch((err) => {
      console.warn("[retrieval] vector rebuild after apply failed:", err.message)
    })

    syncProjectToDisk(roomId).catch((err) => {
      console.warn("[ai] disk sync after apply failed:", err.message)
    })

    AIEdit.create({
      roomId,
      proposalId: proposal.id,
      path: proposal.path,
      userId: req.user._id.toString(),
      userName: req.user.username || "",
      oldContent: proposal.oldContent,
      newContent: proposal.newContent,
    }).catch((err) => {
      console.warn("[ai] audit log failed:", err.message)
    })

    takeProposal(roomId, proposal.id)
    res.json({ success: true, path: proposal.path, fileId: appliedFileId })
  } catch (err) {
    console.error("[ai] apply error:", err)
    res.status(500).json({ message: "Failed to apply edit" })
  }
})

// Discard a pending edit proposal without applying it.
router.post("/:roomId/discard", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const removed = takeProposal(req.params.roomId, String(req.body?.proposalId || ""))
    res.json({ success: !!removed })
  } catch (err) {
    res.status(500).json({ message: "Failed to discard proposal" })
  }
})

router.post("/:roomId/chat", authenticateToken, requireRoomAccess, async (req, res) => {
  try {
    const { roomId } = req.params
    const project = await Project.findOne({ roomId })
    if (!project) {
      return res.status(404).json({ message: "Project not found" })
    }

    const rl = await checkRateLimit(req.user._id.toString(), roomId)
    if (!rl.ok) {
      const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
      return res.status(429).json({
        message: "You are sending requests too quickly. Please wait a moment and try again.",
        retryAfter,
      })
    }

    const context = await buildContext({
      roomId,
      project,
      userId: req.user._id.toString(),
      clientSnapshot: req.body || {},
    })

    if (!context.question || !context.question.trim()) {
      return res.status(400).json({ message: "A question is required" })
    }

    const { messages, usage } = buildMessages(context)
    const model = resolveModel(req.body?.model)
    const maxTokens = parseInt(process.env.GROQ_MAX_TOKENS || "2048", 10)

    initSSE(res)
    sendSSE(res, { meta: { model, inputTokens: usage.inputTokens } })

    const controller = new AbortController()
    req.on("close", () => {
      if (!res.writableEnded) controller.abort()
    })

    let chatContent = ""

    try {
      await streamGroqChat({
        messages,
        model,
        temperature: 0.3,
        maxTokens,
        signal: controller.signal,
        onToken: (delta) => {
          chatContent += delta
          sendSSE(res, { delta })
        },
      })
      const inputTokens = usage.inputTokens || 0
      const outputTokens = estimateTokens(chatContent)
      sendSSE(res, { usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } })
      sendDone(res)
      appendConversation({
        roomId,
        userId: req.user._id.toString(),
        userName: req.user.username || "",
        turns: [
          { role: "user", content: context.question },
          { role: "assistant", content: chatContent, agent: false },
        ],
      }).catch((err) => console.warn("[ai] conversation save failed:", err.message))
    } catch (err) {
      if (controller.signal.aborted) return
      sendSSEError(res, err)
    }
  } catch (err) {
    console.error("[ai] chat error:", err)
    if (!res.headersSent) {
      return res.status(500).json({ message: "Failed to process request" })
    }
    sendSSEError(res, err)
  }
})

export default router
