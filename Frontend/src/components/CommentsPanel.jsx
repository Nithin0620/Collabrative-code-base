import { useState, useEffect, useRef } from "react"

const EMOJIS = ["👍", "❤️", "🔥"]

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function UserAvatar({ name, avatar, color, size = "sm" }) {
  const s = size === "sm" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]"
  if (avatar) {
    return <img src={avatar} alt={name} className={`${s} rounded-full object-cover`} />
  }
  return (
    <div className={`${s} rounded-full flex items-center justify-center font-bold text-white shrink-0`} style={{ backgroundColor: color }}>
      {name?.charAt(0).toUpperCase()}
    </div>
  )
}

function ReactionBar({ reactions, onReact, currentAuthor }) {
  const [showPicker, setShowPicker] = useState(false)
  const entries = reactions ? Object.entries(reactions) : []

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {entries.map(([emoji, users]) => (
        <button
          key={emoji}
          onClick={() => onReact(emoji)}
          className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] border transition-colors cursor-pointer ${
            users.includes(currentAuthor)
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : "bg-gray-700/50 border-gray-600 text-gray-400 hover:border-gray-500"
          }`}
        >
          <span>{emoji}</span>
          <span>{users.length}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-700/50 border border-gray-600 text-gray-500 hover:text-gray-300 hover:border-gray-500 text-[10px] transition-colors cursor-pointer"
        >
          +
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 flex gap-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 shadow-xl z-10">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { onReact(emoji); setShowPicker(false) }}
                className="text-sm hover:scale-125 transition-transform cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CommentCard({ comment, currentAuthor, onReply, onResolve, onDelete, onReact, onReactReply, onJumpToLine }) {
  const [replyText, setReplyText] = useState("")
  const [showReply, setShowReply] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const replyRef = useRef(null)

  useEffect(() => {
    if (showReply && replyRef.current) replyRef.current.focus()
  }, [showReply])

  const submitReply = () => {
    if (!replyText.trim()) return
    onReply(comment._id, replyText.trim())
    setReplyText("")
    setShowReply(false)
  }

  return (
    <div className={`rounded-lg border transition-colors ${
      comment.resolved ? "bg-gray-900/30 border-gray-700/50 opacity-60" : "bg-gray-900 border-gray-700"
    }`}>
      <div className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <UserAvatar name={comment.author} avatar={comment.avatar} color={comment.color} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold" style={{ color: comment.color }}>{comment.author}</span>
              <span className="text-[10px] text-gray-500">{timeAgo(comment.createdAt)}</span>
            </div>
            <button
              onClick={() => onJumpToLine(comment.fileId, comment.startLine)}
              className="text-[10px] text-gray-500 hover:text-amber-400 transition-colors cursor-pointer"
            >
              {comment.fileName} : L{comment.startLine}{comment.endLine !== comment.startLine ? `-L${comment.endLine}` : ""}
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onResolve(comment._id)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                comment.resolved
                  ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
                  : "bg-gray-700 text-gray-400 hover:text-green-400 hover:bg-gray-600"
              }`}
              title={comment.resolved ? "Unresolve" : "Resolve"}
            >
              {comment.resolved ? "Resolved" : "Resolve"}
            </button>
            {comment.author === currentAuthor && (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-0.5 rounded text-gray-600 hover:text-red-400 hover:bg-red-900/20 transition-colors cursor-pointer"
                title="Delete"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {comment.selectedText && (
          <div className="mb-2 px-2 py-1 rounded bg-gray-800 border-l-2 border-amber-500/50 text-[10px] text-gray-400 font-mono truncate">
            {comment.selectedText}
          </div>
        )}

        <p className="text-xs text-gray-300 whitespace-pre-wrap">{comment.text}</p>

        <div className="mt-2">
          <ReactionBar reactions={comment.reactions} onReact={(emoji) => onReact(comment._id, emoji)} currentAuthor={currentAuthor} />
        </div>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="border-t border-gray-700/50">
          {comment.replies.map((reply) => (
            <div key={reply._id} className="px-3 py-2 border-b border-gray-700/50 last:border-b-0">
              <div className="flex items-start gap-2">
                <UserAvatar name={reply.author} avatar={reply.avatar} color={reply.color} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: reply.color }}>{reply.author}</span>
                    <span className="text-[10px] text-gray-500">{timeAgo(reply.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-gray-300 whitespace-pre-wrap mt-0.5">{reply.text}</p>
                  <div className="mt-1">
                    <ReactionBar reactions={reply.reactions} onReact={(emoji) => onReactReply(comment._id, reply._id, emoji)} currentAuthor={currentAuthor} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 py-2 border-t border-gray-700/50">
        {showReply ? (
          <div className="flex gap-2">
            <input
              ref={replyRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitReply(); if (e.key === "Escape") setShowReply(false) }}
              placeholder="Reply..."
              className="flex-1 px-2 py-1 rounded bg-gray-800 border border-gray-600 text-[11px] text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              onClick={submitReply}
              disabled={!replyText.trim()}
              className="px-2 py-1 rounded text-[10px] font-medium bg-amber-500 text-gray-950 hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              Send
            </button>
            <button
              onClick={() => { setShowReply(false); setReplyText("") }}
              className="px-2 py-1 rounded text-[10px] text-gray-400 hover:text-white cursor-pointer"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowReply(true)}
            className="text-[10px] text-gray-500 hover:text-amber-400 transition-colors cursor-pointer"
          >
            Reply...
          </button>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={() => setConfirmDelete(false)}>
          <div className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 w-72" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-gray-200 mb-1">Delete this comment?</p>
            <p className="text-[11px] text-gray-400 mb-4 line-clamp-2">{comment.text}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(comment._id); setConfirmDelete(false) }}
                className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-400 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CommentsPanel({ roomId, user, selectedFileId, selectedFileName, onJumpToLine, onClose, addCommentRef, focusedCommentId, pendingPrefill, onPrefillConsumed, onCommentChanged }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState("")
  const [filter, setFilter] = useState("file")
  const [prefill, setPrefill] = useState(null)
  const newCommentRef = useRef(null)
  const cardRefsMap = useRef({})

  useEffect(() => {
    if (addCommentRef) {
      addCommentRef.current = ({ startLine, endLine, selectedText }) => {
        setPrefill({ startLine, endLine, selectedText })
        setNewComment("")
        setTimeout(() => newCommentRef.current?.focus(), 100)
      }
    }
  }, [addCommentRef])

  useEffect(() => {
    if (pendingPrefill) {
      setPrefill(pendingPrefill)
      setNewComment("")
      onPrefillConsumed?.()
      setTimeout(() => newCommentRef.current?.focus(), 100)
    }
  }, [pendingPrefill, onPrefillConsumed])

  useEffect(() => {
    if (!focusedCommentId) return
    let timer
    const tryScroll = (attempts) => {
      const el = cardRefsMap.current[focusedCommentId]
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        el.style.transition = "none"
        el.style.backgroundColor = "rgba(120, 80, 20, 0.3)"
        el.style.boxShadow = "0 0 0 2px #f59e0b"
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = "background-color 1.5s ease-out, box-shadow 1.5s ease-out"
          })
        })
        timer = setTimeout(() => {
          el.style.backgroundColor = ""
          el.style.boxShadow = ""
        }, 3000)
      } else if (attempts > 0) {
        timer = setTimeout(() => tryScroll(attempts - 1), 100)
      }
    }
    tryScroll(10)
    return () => clearTimeout(timer)
  }, [focusedCommentId])

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const res = await fetch("/api/comments/" + roomId, { credentials: "include" })
        const data = await res.json()
        setComments(data.comments || [])
      } catch {
        console.error("Failed to load comments")
      } finally {
        setLoading(false)
      }
    }
    fetchComments()
  }, [roomId])

  const filteredComments = comments.filter((c) => {
    if (filter === "file") return c.fileId === selectedFileId
    if (filter === "open") return !c.resolved
    return true
  })

  const openCount = comments.filter((c) => !c.resolved).length
  const fileCount = comments.filter((c) => c.fileId === selectedFileId).length

  const handleCreateComment = async () => {
    if (!newComment.trim() || !selectedFileId) return
    const startLine = prefill?.startLine || 1
    const endLine = prefill?.endLine || startLine
    const selectedText = prefill?.selectedText || ""
    try {
      const res = await fetch("/api/comments/" + roomId, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fileId: selectedFileId,
          fileName: selectedFileName || "",
          startLine,
          endLine,
          selectedText,
          author: user.username,
          avatar: user.avatar || "",
          color: user.color,
          text: newComment.trim(),
        }),
      })
      const data = await res.json()
      setComments((prev) => [data.comment, ...prev])
      setNewComment("")
      setPrefill(null)
      onCommentChanged?.()
    } catch {
      console.error("Failed to create comment")
    }
  }

  const handleReply = async (commentId, text) => {
    try {
      const res = await fetch("/api/comments/" + roomId + "/" + commentId + "/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ author: user.username, avatar: user.avatar || "", color: user.color, text }),
      })
      const data = await res.json()
      setComments((prev) => prev.map((c) => c._id === commentId ? data.comment : c))
    } catch {
      console.error("Failed to add reply")
    }
  }

  const handleResolve = async (commentId) => {
    try {
      const res = await fetch("/api/comments/" + roomId + "/" + commentId + "/resolve", {
        method: "PATCH",
        credentials: "include",
      })
      const data = await res.json()
      setComments((prev) => prev.map((c) => c._id === commentId ? data.comment : c))
    } catch {
      console.error("Failed to resolve comment")
    }
  }

  const handleDelete = async (commentId) => {
    try {
      await fetch("/api/comments/" + roomId + "/" + commentId, {
        method: "DELETE",
        credentials: "include",
      })
      setComments((prev) => prev.filter((c) => c._id !== commentId))
      onCommentChanged?.()
    } catch {
      console.error("Failed to delete comment")
    }
  }

  const handleReact = async (commentId, emoji) => {
    try {
      const res = await fetch("/api/comments/" + roomId + "/" + commentId + "/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji, author: user.username }),
      })
      const data = await res.json()
      setComments((prev) => prev.map((c) => c._id === commentId ? data.comment : c))
    } catch {
      console.error("Failed to toggle reaction")
    }
  }

  const handleReactReply = async (commentId, replyId, emoji) => {
    try {
      const res = await fetch("/api/comments/" + roomId + "/" + commentId + "/reply/" + replyId + "/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ emoji, author: user.username }),
      })
      const data = await res.json()
      setComments((prev) => prev.map((c) => c._id === commentId ? data.comment : c))
    } catch {
      console.error("Failed to toggle reply reaction")
    }
  }

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-700 flex flex-col h-full">
      <div className="p-3 border-b border-gray-700 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <h3 className="text-sm font-bold text-white">Comments</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex gap-1 mb-2">
          {[
            { key: "file", label: "File", count: fileCount },
            { key: "open", label: "Open", count: openCount },
            { key: "all", label: "All", count: comments.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex-1 px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                filter === tab.key ? "bg-gray-700 text-white" : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {selectedFileId && (
          <div>
            {prefill && (
              <div className="flex items-center gap-2 mb-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
                <svg className="w-3 h-3 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
                <span className="text-[10px] text-amber-400 truncate">
                  Commenting on L{prefill.startLine}{prefill.endLine !== prefill.startLine ? `–L${prefill.endLine}` : ""}
                  {prefill.selectedText && `: "${prefill.selectedText.slice(0, 40)}${prefill.selectedText.length > 40 ? "..." : ""}"`}
                </span>
                <button
                  onClick={() => setPrefill(null)}
                  className="text-amber-400/60 hover:text-amber-400 ml-auto shrink-0 cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex gap-2">
            <input
              ref={newCommentRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCreateComment() } }}
              placeholder="Add a comment..."
              className="flex-1 px-2 py-1.5 rounded bg-gray-800 border border-gray-600 text-xs text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              onClick={handleCreateComment}
              disabled={!newComment.trim()}
              className="px-2 py-1.5 rounded bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
            >
              Post
            </button>
          </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading ? (
          <p className="text-xs text-gray-500 text-center py-4">Loading...</p>
        ) : filteredComments.length === 0 ? (
          <div className="text-center py-8">
            <svg className="w-8 h-8 mx-auto mb-2 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <p className="text-xs text-gray-500">No comments yet</p>
            <p className="text-[10px] text-gray-600 mt-1">Select code and click the comment icon, or type above</p>
          </div>
        ) : (
          filteredComments.map((comment) => (
            <div
              key={comment._id}
              ref={(el) => { if (el) cardRefsMap.current[comment._id] = el }}
            >
              <CommentCard
                comment={comment}
                currentAuthor={user.username}
                onReply={handleReply}
                onResolve={handleResolve}
                onDelete={handleDelete}
                onReact={handleReact}
                onReactReply={handleReactReply}
                onJumpToLine={onJumpToLine}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
