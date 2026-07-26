import { useState, useEffect, useRef } from "react"

export default function ChatPanel({ roomId, user, socket }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await fetch("/api/chat/" + roomId, { credentials: "include" })
        const data = await res.json()
        setMessages(data.messages || [])
      } catch {
        console.error("Failed to load messages")
      } finally {
        setLoading(false)
      }
    }
    fetchMessages()
  }, [roomId])

  useEffect(() => {
    if (!socket) return
    const handler = (msg) => {
      setMessages((prev) => [...prev, msg])
    }
    socket.on("chat-message", handler)
    return () => socket.off("chat-message", handler)
  }, [socket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim()) return
    const text = input.trim()
    setInput("")

    try {
      const res = await fetch("/api/chat/" + roomId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          author: user.username,
          avatar: user.avatar || "",
          color: user.color,
          text,
        }),
      })
      const data = await res.json()
      if (data.message) {
        setMessages((prev) => [...prev, data.message])
        if (socket) {
          socket.emit("chat-message", { ...data.message, roomId })
        }
      }
    } catch {
      console.error("Failed to send message")
    }
  }

  const formatTime = (ts) => {
    const d = new Date(ts)
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3" ref={containerRef}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-gray-500">Loading messages...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <svg className="w-8 h-8 mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-xs text-gray-500">No messages yet</p>
            <p className="text-[10px] text-gray-600 mt-1">Start the conversation</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.author === user.username
            return (
              <div key={msg._id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: (msg.color || "#888") + "33", color: msg.color || "#888" }}
                >
                  {msg.author?.[0]?.toUpperCase() || "?"}
                </div>
                <div className={`flex flex-col max-w-[75%] ${isMe ? "items-end" : ""}`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold" style={{ color: msg.color || "#888" }}>
                      {isMe ? "You" : msg.author}
                    </span>
                    <span className="text-[9px] text-gray-600">{formatTime(msg.createdAt)}</span>
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-lg text-sm ${
                      isMe
                        ? "bg-amber-500/20 text-amber-100 rounded-tr-sm"
                        : "bg-gray-800 text-gray-200 rounded-tl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm border border-gray-700 focus:border-amber-500 focus:outline-none placeholder:text-gray-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="px-3 py-2 rounded-lg bg-amber-500 text-gray-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
