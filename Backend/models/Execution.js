import mongoose from "mongoose"

const executionSchema = new mongoose.Schema({
  executionId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  roomId: {
    type: String,
    default: null,
    index: true,
  },
  language: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  stdin: {
    type: String,
    default: "",
  },
  stdout: {
    type: String,
    default: "",
  },
  stderr: {
    type: String,
    default: "",
  },
  exitCode: {
    type: Number,
    default: null,
  },
  time: {
    type: Number,
    default: 0,
  },
  memory: {
    type: Number,
    default: 0,
  },
  phase: {
    type: String,
    enum: ["run", "compile", "queue"],
    default: "queue",
  },
  status: {
    type: String,
    enum: ["queued", "running", "completed", "failed", "stopped"],
    default: "queued",
  },
  sandboxed: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
})

executionSchema.index({ userId: 1, createdAt: -1 })
executionSchema.index({ roomId: 1, createdAt: -1 })

export default mongoose.model("Execution", executionSchema)
