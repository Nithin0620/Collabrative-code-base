import { useState, useRef, useEffect } from "react"

export default function VideoWindow({ stream, label, color, isLocal, onClose, muted }) {
  const videoRef = useRef(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [size, setSize] = useState({ w: 220, h: 165 })
  const [minimized, setMinimized] = useState(false)
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    setPos({
      x: isLocal ? window.innerWidth - 240 : window.innerWidth - 240,
      y: isLocal ? window.innerHeight - 210 : window.innerHeight - 370,
    })
  }, [isLocal])

  useEffect(() => {
    if (!videoRef.current) return
    if (stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    const cleanup = () => {
      if (dragging.current) {
        dragging.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
    window.addEventListener("blur", cleanup)
    return () => window.removeEventListener("blur", cleanup)
  }, [])

  const onPointerDown = (e) => {
    if (e.target.closest("button") || e.target.closest("[data-resize]")) return
    dragging.current = true
    dragOffset.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    }
    e.preventDefault()

    document.body.style.cursor = "move"
    document.body.style.userSelect = "none"

    const onMove = (e) => {
      if (!dragging.current) return
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - size.w, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dragOffset.current.y)),
      })
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.removeEventListener("pointermove", onMove)
      document.removeEventListener("pointerup", onUp)
      document.removeEventListener("pointercancel", onUp)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    document.addEventListener("pointermove", onMove)
    document.addEventListener("pointerup", onUp)
    document.addEventListener("pointercancel", onUp)
  }

  const makeResizeHandler = (edges) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startW = size.w
    const startH = size.h
    const startPosX = pos.x
    const startPosY = pos.y

    const cursorClass = edges.includes("top") && edges.includes("left") ? "nwse-resize"
      : edges.includes("top") && edges.includes("right") ? "nesw-resize"
      : edges.includes("bottom") && edges.includes("left") ? "nesw-resize"
      : edges.includes("top") || edges.includes("bottom") ? "ns-resize"
      : "ew-resize"
    document.body.style.cursor = cursorClass
    document.body.style.userSelect = "none"

    const onMove = (e) => {
      const dx = e.clientX - startX
      const dy = e.clientY - startY

      let newW = startW
      let newH = startH
      let newX = startPosX
      let newY = startPosY

      if (edges.includes("right")) newW = Math.max(140, Math.min(600, startW + dx))
      if (edges.includes("bottom")) newH = Math.max(105, Math.min(400, startH + dy))
      if (edges.includes("left")) {
        newW = Math.max(140, Math.min(600, startW - dx))
        newX = startPosX + (startW - newW)
      }
      if (edges.includes("top")) {
        newH = Math.max(105, Math.min(400, startH - dy))
        newY = startPosY + (startH - newH)
      }

      setSize({ w: newW, h: newH })
      setPos({ x: newX, y: newY })
    }
    const onUp = () => {
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      document.removeEventListener("pointerup", onUp)
      document.removeEventListener("pointercancel", onUp)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
    document.addEventListener("pointerup", onUp)
    document.addEventListener("pointercancel", onUp)
  }

  if (minimized) {
    return (
      <div
        className="fixed z-50 flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-800 border border-gray-600 shadow-lg cursor-move select-none"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={onPointerDown}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color || "#22c55e" }}
        />
        <span className="text-[10px] text-gray-300 font-medium max-w-[80px] truncate">
          {label}
        </span>
        <button
          onClick={() => setMinimized(false)}
          className="text-gray-400 hover:text-white cursor-pointer"
          title="Expand"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        {!isLocal && onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-red-400 cursor-pointer"
            title="Close"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="fixed z-50 bg-gray-900 rounded-lg border border-gray-600 shadow-2xl select-none"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h + 28 }}
    >
      {/* Title bar - drag to move */}
      <div
        className="flex items-center justify-between h-7 px-2 bg-gray-800 cursor-move rounded-t-lg"
        onPointerDown={onPointerDown}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: color || "#22c55e" }}
          />
          <span className="text-[10px] text-gray-300 font-medium truncate max-w-[100px]">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setMinimized(true)}
            className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white cursor-pointer"
            title="Minimize"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
          {!isLocal && onClose && (
            <button
              onClick={onClose}
              className="p-0.5 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 cursor-pointer"
              title="Close"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Video area */}
      <div className="relative overflow-hidden" style={{ height: size.h }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Resize edges */}
      <div data-resize className="absolute top-0 left-0 right-0 h-1.5 cursor-n-resize" onMouseDown={makeResizeHandler(["top"])} />
      <div data-resize className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize" onMouseDown={makeResizeHandler(["bottom"])} />
      <div data-resize className="absolute top-0 bottom-0 left-0 w-1.5 cursor-w-resize" onMouseDown={makeResizeHandler(["left"])} />
      <div data-resize className="absolute top-0 bottom-0 right-0 w-1.5 cursor-e-resize" onMouseDown={makeResizeHandler(["right"])} />

      {/* Corner resize grips */}
      <div data-resize className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize group">
        <svg className="w-3 h-3 text-gray-500 group-hover:text-white m-auto mt-0.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M2 2L2 22L22 22" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <div data-resize className="absolute top-0 right-0 w-4 h-4 cursor-ne-resize group">
        <svg className="w-3 h-3 text-gray-500 group-hover:text-white m-auto mt-0.5 mr-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22 2L22 22L2 22" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <div data-resize className="absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize group">
        <svg className="w-3 h-3 text-gray-500 group-hover:text-white m-auto mb-0.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M2 22L2 2L22 2" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
      <div data-resize className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize group">
        <svg className="w-3 h-3 text-gray-500 group-hover:text-white m-auto mb-0.5 mr-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M22 22L22 2L2 2" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </div>
  )
}
