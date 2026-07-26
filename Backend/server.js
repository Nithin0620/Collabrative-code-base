import "dotenv/config"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import { createServer } from "http"
import { Server } from "socket.io"
import { YSocketIO } from "y-socket.io/dist/server"
import jwt from "jsonwebtoken"
import passport from "passport"
import connectDB from "./config/db.js"
import { configurePassport } from "./config/passport.js"
import authRoutes from "./routes/auth.js"
import projectRoutes from "./routes/projects.js"
import commentRoutes from "./routes/comments.js"
import chatRoutes from "./routes/chat.js"
import executeRoutes from "./routes/execute.js"
import snippetRoutes from "./routes/snippets.js"
import User from "./models/User.js"

await connectDB()
configurePassport()

const app = express()

app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true,
}))
app.use(express.json())
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

const ySocketIO = new YSocketIO(io)
ySocketIO.initialize()

app.use("/auth", authRoutes)
app.use("/api/projects", projectRoutes)
app.use("/api/comments", commentRoutes)
app.use("/api/chat", chatRoutes)
app.use("/api/execute", executeRoutes)
app.use("/api/snippets", snippetRoutes)

const roomMembers = new Map()

io.on("connection", (socket) => {
  socket.on("chat-message", (data) => {
    socket.to(data.roomId).emit("chat-message", data)
  })
  socket.on("join-room", (roomId) => {
    socket.join(roomId)
    if (!roomMembers.has(roomId)) roomMembers.set(roomId, new Set())
    roomMembers.get(roomId).add(socket.id)
    socket.data.roomId = roomId

    const members = Array.from(roomMembers.get(roomId) || [])
    socket.emit("room-members", { members, selfId: socket.id })
    socket.to(roomId).emit("peer-joined", { peerId: socket.id })
  })

  socket.on("get-room-members", (roomId, cb) => {
    const members = Array.from(roomMembers.get(roomId) || [])
    cb({ members, selfId: socket.id })
  })

  socket.on("webrtc-offer", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-offer", {
        offer: data.offer,
        from: socket.id,
      })
    }
  })

  socket.on("webrtc-answer", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-answer", {
        answer: data.answer,
        from: socket.id,
      })
    }
  })

  socket.on("webrtc-candidate", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-candidate", {
        candidate: data.candidate,
        from: socket.id,
      })
    }
  })

  socket.on("webrtc-end", (data) => {
    if (data.to) {
      io.to(data.to).emit("webrtc-end", { from: socket.id })
    }
  })

  socket.on("disconnect", () => {
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

httpServer.listen(process.env.PORT || 3000, () => {
  console.log(`Server is running on port ${process.env.PORT || 3000}`)
})
