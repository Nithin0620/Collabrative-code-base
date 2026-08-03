import mongoose from "mongoose"

// Audit trail for AI apply_edit operations (design doc §9.6). Every AI edit is
// recorded here so changes are reversible via snapshots / git history.
const aiEditSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  proposalId: { type: String, required: true },
  path: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  userName: { type: String, default: "" },
  oldContent: { type: String, default: "" },
  newContent: { type: String, default: "" },
  appliedAt: { type: Date, default: Date.now },
})

aiEditSchema.index({ roomId: 1, appliedAt: -1 })

const AIEdit = mongoose.models.AIEdit || mongoose.model("AIEdit", aiEditSchema)
export default AIEdit
