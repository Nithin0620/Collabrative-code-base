import mongoose from "mongoose"

const snippetSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  code: {
    type: String,
    required: true,
  },
  language: {
    type: String,
    default: "plaintext",
  },
  tags: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
})

snippetSchema.index({ userId: 1, updatedAt: -1 })

export default mongoose.model("Snippet", snippetSchema)
