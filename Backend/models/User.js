import mongoose from "mongoose"

const COLORS = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
  "#F43F5E", "#14B8A6", "#6366F1", "#A855F7",
]

function hashToColor(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

const userSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      select: false,
    },
    avatar: {
      type: String,
      default: "",
    },
    color: {
      type: String,
      default: function () {
        return hashToColor(this._id?.toString() || Math.random().toString())
      },
    },
    isGuest: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
)

userSchema.methods.toSafeJSON = function () {
  return {
    _id: this._id,
    username: this.username,
    email: this.email,
    avatar: this.avatar,
    color: this.color,
    isGuest: this.isGuest,
    createdAt: this.createdAt,
  }
}

import bcrypt from "bcryptjs"

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false
  return bcrypt.compare(candidatePassword, this.password)
}

userSchema.pre("save", async function () {
  if (!this.color) {
    this.color = hashToColor(this._id?.toString() || Math.random().toString())
  }
  if (this.isModified("password") && this.password) {
    this.password = await bcrypt.hash(this.password, 10)
  }
})

const User = mongoose.model("User", userSchema)

export default User
