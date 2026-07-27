import mongoose from "mongoose"

const fileSchema = new mongoose.Schema({
  id: { type: String, required: true },
  content: { type: String, default: "" },
  language: { type: String, default: "plaintext" },
})

const snapshotSchema = new mongoose.Schema({
  data: { type: String, required: true },
  label: { type: String, default: "" },
  message: { type: String, default: "" },
  author: { type: String, default: "" },
  authorAvatar: { type: String, default: "" },
  filesCount: { type: Number, default: 0 },
  fileNames: { type: [String], default: [] },
  timestamp: { type: Date, default: Date.now },
})

const projectSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fileTree: {
      type: Map,
      of: new mongoose.Schema({
        id: String,
        name: String,
        type: { type: String, enum: ["file", "folder"] },
        parentId: { type: String, default: null },
      }, { _id: false }),
      default: new Map(),
    },
    files: [fileSchema],
    settings: {
      theme: { type: String, default: "vs-dark" },
      fontSize: { type: Number, default: 14 },
      inviteOnly: { type: Boolean, default: false },
      readOnly: { type: Boolean, default: false },
      password: { type: String, default: "" },
    },
    members: {
      type: Map,
      of: new mongoose.Schema({
        role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
        joinedAt: { type: Date, default: Date.now },
      }, { _id: false }),
      default: new Map(),
    },
    bannedUsers: {
      type: [String],
      default: [],
    },
    history: [snapshotSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
)

const Project = mongoose.model("Project", projectSchema)

export default Project
