import mongoose from "mongoose"

const testCaseSchema = new mongoose.Schema({
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
  language: {
    type: String,
    required: true,
    enum: ["javascript", "python", "java", "cpp", "c", "ruby", "go"],
  },
  stdin: {
    type: String,
    default: "",
  },
  expectedOutput: {
    type: String,
    default: "",
  },
  tags: {
    type: [String],
    default: [],
  },
}, {
  timestamps: true,
})

testCaseSchema.index({ userId: 1, language: 1 })
testCaseSchema.index({ userId: 1, updatedAt: -1 })

export default mongoose.model("TestCase", testCaseSchema)
