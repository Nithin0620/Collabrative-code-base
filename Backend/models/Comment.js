import mongoose from "mongoose"

const replySchema = new mongoose.Schema({
  author: { type: String, required: true },
  avatar: { type: String, default: "" },
  color: { type: String, default: "#888" },
  text: { type: String, required: true },
  reactions: { type: Map, of: [String], default: new Map() },
  createdAt: { type: Date, default: Date.now },
}, { _id: true })

const commentSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  fileId: { type: String, required: true },
  fileName: { type: String, default: "" },
  startLine: { type: Number, required: true },
  endLine: { type: Number, required: true },
  selectedText: { type: String, default: "" },
  author: { type: String, required: true },
  avatar: { type: String, default: "" },
  color: { type: String, default: "#888" },
  text: { type: String, required: true },
  replies: [replySchema],
  reactions: { type: Map, of: [String], default: new Map() },
  resolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

const Comment = mongoose.model("Comment", commentSchema)

export default Comment
