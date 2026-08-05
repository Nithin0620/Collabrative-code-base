import "dotenv/config"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { createServer } from "http"
import { Server } from "socket.io"
import { YSocketIO } from "y-socket.io/dist/server"
import jwt from "jsonwebtoken"
import passport from "passport"
import { AccessToken } from "livekit-server-sdk"
import connectDB from "./config/db.js"
import { configurePassport } from "./config/passport.js"
import authRoutes from "./routes/auth.js"
import projectRoutes from "./routes/projects.js"
import commentRoutes from "./routes/comments.js"
import chatRoutes from "./routes/chat.js"
import executeRoutes, { setIO } from "./routes/execute.js"
import { createWorker } from "./utils/execQueue.js"
import { executeCode } from "./utils/sandboxRunner.js"
import snippetRoutes from "./routes/snippets.js"
import testCaseRoutes from "./routes/testCases.js"
import terminalRoutes from "./routes/terminal.js"
import gitRoutes from "./routes/git.js"
import aiRoutes from "./routes/ai.js"
import { createTerminal, getTerminal, killTerminal } from "./utils/terminalManager.js"
import User from "./models/User.js"
import Project from "./models/Project.js"
import Execution from "./models/Execution.js"
import { getUserProjectRole } from "./middleware/auth.js"

await connectDB()
configurePassport()

const app = express()

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}))
app.use(express.json({ limit: "50mb" }))
app.use(cookieParser())
app.use(passport.initialize())

const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
})

setIO(io)
app.set('io', io)
createWorker(executeCode, io)

io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token
  if (!token) {
    socket.user = null
    return next()
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId).select("-__v")
    socket.user = user ? user.toSafeJSON() : null
    next()
  } catch {
    socket.user = null
    next()
  }
})

const ySocketIO = new YSocketIO(io, {
  async authenticate(handshake) {
    const nsp = handshake.nsp || ''
    if (!nsp.startsWith('/yjs|')) return true
    const roomId = nsp.replace('/yjs|', '')
    if (!roomId) return true

    const token = handshake.auth?.token || handshake.query?.token
    if (!token) return false

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      const user = await User.findById(decoded.userId).select('-__v')
      if (!user) return false

      const project = await Project.findOne({ roomId })
      if (!project) return true

      const userId = user._id.toString()
      const isOwner = project.createdBy?.toString() === userId

      if (project.bannedUsers?.includes(userId)) return false

      if (project.settings?.inviteOnly && !isOwner) {
        const members = project.members
        let isMember = false
        if (members) {
          if (typeof members.has === 'function') isMember = members.has(userId)
          if (!isMember && typeof members.entries === 'function') {
            for (const [k] of members.entries()) {
              if (k.toString() === userId) { isMember = true; break }
            }
          }
        }
        if (!isMember) return false
      }

      if (project.settings?.password && !isOwner) {
        const cookieHeader = handshake.headers?.cookie || ''
        if (!cookieHeader.includes(`pwd_${roomId}=verified`)) return false
      }

      return true
    } catch {
      return false
    }
  }
})
ySocketIO.initialize()
app.set('ySocketIO', ySocketIO)

// Enforce read-only and project role for Yjs document sync
const yjsNsp = io.of(/^\/yjs\|.*$/)
yjsNsp.use((socket, next) => {
  const roomId = (socket.nsp.name || '').replace('/yjs|', '')
  const userId = socket.user?._id?.toString()
  if (userId && roomId) {
    Project.findOne({ roomId }).then(project => {
      if (project) {
        socket.data.yRole = getUserProjectRole(project, userId)
      }
      next()
    }).catch(() => next())
  } else {
    next()
  }
})
yjsNsp.on("connection", (socket) => {
  const listeners = socket.listeners("sync-update")
  if (listeners.length > 0) {
    socket.removeAllListeners("sync-update")
    socket.on("sync-update", (update) => {
      if (socket.data.yRole === "viewer") return
      for (const fn of listeners) fn(update)
    })
  }
})

app.use("/auth", authRoutes)
app.use("/api/projects", projectRoutes)
app.use("/api/comments", commentRoutes)
app.use("/api/chat", chatRoutes)
app.use("/api/execute", executeRoutes)
app.use("/api/snippets", snippetRoutes)
app.use("/api/testcases", testCaseRoutes)
app.use("/api/projects", gitRoutes)
app.use("/api/terminal", terminalRoutes)
app.use("/api/ai", aiRoutes)

app.post("/api/livekit/token", async (req, res) => {
  try {
    const { roomName, identity, name } = req.body
    if (!roomName || !identity) {
      return res.status(400).json({ error: "roomName and identity are required" })
    }
    const apiKey = process.env.LIVEKIT_API_KEY || "devkey"
    const apiSecret = process.env.LIVEKIT_API_SECRET || "secret"
    const wsUrl = process.env.LIVEKIT_WS_URL || "ws://localhost:7880"

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name || "User",
    })
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })
    const token = await at.toJwt()
    res.json({ token, url: wsUrl })
  } catch (err) {
    console.error("LiveKit token error:", err)
    res.status(500).json({ error: "Failed to generate token" })
  }
})

const roomMembers = new Map()
const socketTerminals = new Map() // socket.id -> Set of terminalIds

io.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    const roomId = socket.data.roomId
    if (roomId) {
      socket.to(roomId).emit("chat-message", data)
    }
  })

  // Real-Time Member Management
  socket.on("member-action", (data) => {
    const roomId = socket.data.roomId
    if (roomId) {
      io.to(roomId).emit("member-action-event", data)
    }
  })

  socket.on("join-room", async (roomId) => {
    if (!socket.user) {
      socket.emit("room-error", { message: "Authentication required" })
      return
    }

    try {
      const project = await Project.findOne({ roomId })
      if (project) {
        const userId = socket.user._id.toString()
        const isOwner = project.createdBy?.toString() === userId

        if (project.bannedUsers?.includes(userId)) {
          socket.emit("room-error", { message: "You are banned from this room" })
          return
        }

        let isMember = false
        if (project.members) {
          if (typeof project.members.has === "function") isMember = project.members.has(userId)
          if (!isMember && typeof project.members.entries === "function") {
            for (const [k] of project.members.entries()) {
              if (k.toString() === userId) { isMember = true; break }
            }
          }
        }

        if (project.settings?.inviteOnly && !isOwner && !isMember) {
          socket.emit("room-error", { message: "This room is invite-only. You must be invited by the room owner to join.", requiresInvite: true })
          return
        }

        if (project.settings?.password && !isOwner) {
          const cookieHeader = socket.handshake.headers?.cookie || ""
          if (!cookieHeader.includes(`pwd_${roomId}=verified`)) {
            socket.emit("room-error", { message: "Password required to enter this room", requiresPassword: true })
            return
          }
        }

        let role = getUserProjectRole(project, userId)
        if (project.settings?.readOnly && !isOwner) {
          role = "viewer"
        }
        socket.data.userRole = role || "viewer"
      }
    } catch (err) {
      socket.data.userRole = "viewer"
    }

    socket.join(roomId)
    if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Set())
    roomMembers.get(roomId).add(socket.id)
    socket.data.roomId = roomId

    const members = Array.from(roomMembers.get(roomId) || [])
    socket.emit("room-members", { members, selfId: socket.id, userRole: socket.data.userRole })
    socket.to(roomId).emit("peer-joined", { peerId: socket.id, userRole: socket.data.userRole })
  })

  socket.on("join-execution", async (executionId) => {
    if (!socket.user || !socket.user._id) {
      socket.emit("exec:error", { executionId, message: "Authentication required" })
      return
    }
    try {
      const execution = await Execution.findOne({ executionId: String(executionId || "") }).select("userId roomId").lean()
      if (!execution) {
        socket.emit("exec:error", { executionId, message: "Execution not found" })
        return
      }
      const userId = String(socket.user._id)
      const ownsExecution = execution.userId ? String(execution.userId) === userId : false
      // Resolve room membership from the DB (not socket.data.roomId), so this
      // works even when join-execution is called on a socket that never ran
      // join-room (e.g. the code runner panel).
      let sameRoom = false
      if (execution.roomId) {
        const project = await Project.findOne({ roomId: execution.roomId }).select("createdBy members settings")
        const role = getUserProjectRole(project, userId)
        sameRoom = !!role && role !== "viewer"
      }
      if (!ownsExecution && !sameRoom) {
        socket.emit("exec:error", { executionId, message: "Not authorized for this execution" })
        return
      }
      socket.join("exec:" + String(executionId || ""))
    } catch {
      socket.emit("exec:error", { executionId, message: "Failed to join execution stream" })
    }
  })

  socket.on("get-room-members", (roomId, cb) => {
    if (socket.data.roomId !== roomId) {
      if (typeof cb === "function") cb({ members: [], selfId: socket.id })
      return
    }
    const members = Array.from(roomMembers.get(roomId) || [])
    if (typeof cb === "function") {
      cb({ members, selfId: socket.id })
    }
  })

  socket.on("webrtc-offer", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-offer", { offer: data.offer, from: socket.id })
    }
  })

  socket.on("webrtc-answer", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-answer", { answer: data.answer, from: socket.id })
    }
  })

  socket.on("webrtc-candidate", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-candidate", { candidate: data.candidate, from: socket.id })
    }
  })

  socket.on("webrtc-end", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-end", { from: socket.id })
    }
  })

  // ---- TERMINAL HANDLERS ----
  socket.on('terminal:create', async (data) => {
    const { terminalId, cols = 80, rows = 24 } = data
    const sanitize = (id) => String(id || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 64)
    const clientRoomId = sanitize(data.roomId)
    const joinedRoomId = sanitize(socket.data.roomId)
    const roomId = joinedRoomId || clientRoomId
    console.log(`[terminal] create: id=${terminalId} room=${roomId} socket=${socket.id}`)
    if (!socket.user || !roomId) {
      socket.emit('terminal:error', { terminalId, message: 'Not in a room' })
      return
    }
    if (joinedRoomId && clientRoomId && joinedRoomId !== clientRoomId) {
      socket.emit('terminal:error', { terminalId, message: 'Room mismatch' })
      return
    }
    try {
      const session = await createTerminal(terminalId, roomId, socket.user._id?.toString(), cols, rows)
      
      if (!socketTerminals.has(socket.id)) {
        socketTerminals.set(socket.id, new Set())
      }
      socketTerminals.get(socket.id).add(terminalId)

      session.on('data', (output) => {
        socket.emit('terminal:output', { terminalId, data: output })
      })
      session.on('close', () => {
        console.log(`[terminal] session closed: id=${terminalId}`)
        socket.emit('terminal:closed', { terminalId })
      })
      if (session.alive) {
        console.log(`[terminal] ready: id=${terminalId}`)
        socket.emit('terminal:ready', { terminalId })
      } else {
        console.log(`[terminal] session died during setup: id=${terminalId}`)
      }
    } catch (err) {
      console.error('[terminal] Create error:', err)
      socket.emit('terminal:error', { terminalId, message: err.message })
    }
  })

  socket.on('terminal:input', (data) => {
    const { terminalId, input } = data
    const session = getTerminal(terminalId)
    if (session) session.write(input)
  })

  socket.on('terminal:resize', async (data) => {
    const { terminalId, cols, rows } = data
    const session = getTerminal(terminalId)
    if (session) await session.resize(cols, rows)
  })

  socket.on('terminal:ports', async ({ terminalId }) => {
    const session = getTerminal(terminalId)
    if (!session) return
    const ports = await session.getActivePorts()
    socket.emit('terminal:ports', { terminalId, ports })
  })

  socket.on('terminal:kill', async (data) => {
    const { terminalId } = data
    console.log(`[terminal] kill: id=${terminalId} socket=${socket.id}`)
    await killTerminal(terminalId)
    if (socketTerminals.has(socket.id)) {
      socketTerminals.get(socket.id).delete(terminalId)
    }
  })

  socket.on("disconnect", async () => {
    if (socketTerminals.has(socket.id)) {
      const tIds = Array.from(socketTerminals.get(socket.id))
      console.log(`[terminal] disconnect cleaning ${tIds.length} terminals: ${tIds.join(',')}`)
      for (const tId of tIds) {
        await killTerminal(tId).catch(() => {})
      }
      socketTerminals.delete(socket.id)
    }

    const roomId = socket.data.roomId
    if (roomId && roomMembers.has(roomId)) {
      roomMembers.get(roomId).delete(socket.id)
      if (roomMembers.get(roomId).size === 0) {
        roomMembers.delete(roomId)
      }
      socket.to(roomId).emit("peer-left", { peerId: socket.id })
    }
  })
})

app.get("/health", (req, res) => {
  res.status(200).json({ message: "ok", success: true })
})

app.use(express.static("public"))

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${process.env.PORT || 3000} is already in use.`)
    console.error(`[server] Run: pkill -9 -f 'node server.js' && npm run dev`)
    process.exit(1)
  }
  throw err
})

httpServer.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`)
})
