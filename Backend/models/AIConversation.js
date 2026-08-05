import mongoose from "mongoose"

// Per-user AI conversation history for a room (design doc §7.5 Phase 2).
// One document per (roomId, userId); messages array is capped via $slice.
const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant", "system", "tool"], required: true },
    content: { type: String, default: "" },
    agent: { type: Boolean, default: false },
    ts: { type: Date, default: Date.now },
  },
  { _id: false }
)

const aiConversationSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, default: "" },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true }
)

aiConversationSchema.index({ roomId: 1, userId: 1 }, { unique: true })

const AIConversation = mongoose.models.AIConversation || mongoose.model("AIConversation", aiConversationSchema)
export default AIConversation
