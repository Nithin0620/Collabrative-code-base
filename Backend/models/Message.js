import mongoose from "mongoose"

const messageSchema = new mongoose.Schema(
  {
    roomId: { type: String, required: true, index: true },
    author: { type: String, required: true },
    avatar: { type: String, default: "" },
    color: { type: String, default: "#888" },
    text: { type: String, required: true },
  },
  { timestamps: true }
)

messageSchema.index({ roomId: 1, createdAt: -1 })

export default mongoose.model("Message", messageSchema)
