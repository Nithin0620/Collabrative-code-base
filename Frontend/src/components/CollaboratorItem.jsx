import React, { useState, useEffect } from "react"

export function UserAvatar({ user }) {
  const speakingClass = user?.isSpeaking ? "ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900 animate-pulse" : ""
  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username || "User"}
        className={`w-8 h-8 rounded-full object-cover shrink-0 ${speakingClass}`}
      />
    )
  }
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${speakingClass}`}
      style={{ backgroundColor: user?.color || "#6366f1" }}
    >
      {(user?.username || "A").charAt(0).toUpperCase()}
    </div>
  )
}

export function StatusDot({ status }) {
  const color = status === "offline" ? "bg-gray-500" : status === "idle" ? "bg-yellow-400" : "bg-green-400"
  const title = status === "offline" ? "Offline" : status === "idle" ? "Idle" : "Active"
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${color}`}
      title={title}
    />
  )
}

export function RelativeTime({ timestamp }) {
  const [text, setText] = useState(() => formatRelativeTime(timestamp))

  useEffect(() => {
    setText(formatRelativeTime(timestamp))
    const interval = setInterval(() => setText(formatRelativeTime(timestamp)), 10000)
    return () => clearInterval(interval)
  }, [timestamp])

  return <span title={new Date(timestamp).toLocaleString()}>{text}</span>
}

export function formatRelativeTime(ts) {
  if (!ts) return ""
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 5) return "just now"
  if (seconds < 60) return seconds + "s ago"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return minutes + "m ago"
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours + "h ago"
  return Math.floor(hours / 24) + "d ago"
}
