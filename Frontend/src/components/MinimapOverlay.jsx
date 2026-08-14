import { memo, useCallback, useState, useEffect, useRef } from "react"

function MinimapOverlay({ editorRef, users, localUsername, monaco }) {
  const [dots, setDots] = useState([])
  const [heatBars, setHeatBars] = useState([])
  const editHistoryRef = useRef(new Map()) // line -> timestamp[]

  // Track edit activity in the current editor model
  useEffect(() => {
    if (!editorRef?.current) return
    const editor = editorRef.current

    const handleContentChange = (e) => {
      const now = Date.now()
      const history = editHistoryRef.current

      e.changes.forEach((change) => {
        const startLine = change.range.startLineNumber
        const endLine = change.range.endLineNumber
        for (let l = startLine; l <= endLine; l++) {
          const timestamps = history.get(l) || []
          // Keep recent edits within last 2 minutes
          const recent = timestamps.filter((t) => now - t < 120000)
          recent.push(now)
          history.set(l, recent)
        }
      })
    }

    const disposable = editor.onDidChangeModelContent(handleContentChange)
    return () => {
      disposable.dispose()
    }
  }, [editorRef])

  useEffect(() => {
    if (!editorRef?.current || !monaco) return
    const editor = editorRef.current

    const calculateMinimapPositions = () => {
      const editorDom = editor.getDomNode()
      if (!editorDom) return

      const minimapEl = editorDom.querySelector(".minimap")
      if (!minimapEl) return

      const model = editor.getModel()
      if (!model) return
      const totalLines = model.getLineCount()
      if (totalLines === 0) return

      const minimapRect = minimapEl.getBoundingClientRect()
      const minimapHeight = minimapRect.height
      if (minimapHeight === 0) return

      // Calculate user presence dots
      const newDots = []
      users.forEach((u) => {
        if (u.username === localUsername) return
        if (!u.cursorPos || u.status === "offline") return

        const line = u.cursorPos.line || 1
        const lineFraction = totalLines > 1 ? (line - 1) / (totalLines - 1) : 0
        const dotY = Math.max(6, Math.min(minimapHeight - 6, lineFraction * (minimapHeight - 12)))

        newDots.push({
          id: u.username,
          y: dotY,
          color: u.color || "#60a5fa",
          name: u.username,
          line,
          status: u.status,
          isSpeaking: u.isSpeaking,
        })
      })
      setDots(newDots)

      // Calculate heatmap hotspots
      const now = Date.now()
      const history = editHistoryRef.current
      const newHeatBars = []

      history.forEach((timestamps, line) => {
        const recent = timestamps.filter((t) => now - t < 90000)
        if (recent.length === 0) {
          history.delete(line)
          return
        }
        history.set(line, recent)

        const lineFraction = totalLines > 1 ? (line - 1) / (totalLines - 1) : 0
        const barY = Math.max(2, Math.min(minimapHeight - 2, lineFraction * minimapHeight))
        const intensity = Math.min(1, recent.length / 5) // max intensity at 5 edits

        newHeatBars.push({
          line,
          y: barY,
          intensity,
          count: recent.length,
        })
      })

      setHeatBars(newHeatBars)
    }

    calculateMinimapPositions()

    const scrollDisp = editor.onDidScrollChange(calculateMinimapPositions)
    const layoutDisp = editor.onDidLayoutChange(calculateMinimapPositions)
    const interval = setInterval(calculateMinimapPositions, 2000) // decay heatmap over time

    return () => {
      scrollDisp.dispose()
      layoutDisp.dispose()
      clearInterval(interval)
    }
  }, [editorRef, users, localUsername, monaco])

  const handleClick = useCallback(
    (e, line) => {
      e.preventDefault()
      e.stopPropagation()
      const editor = editorRef?.current
      if (!editor || !line) return
      editor.revealLineInCenter(line, monaco.editor.ScrollType.Smooth)
      editor.setPosition({ lineNumber: line, column: 1 })
    },
    [editorRef, monaco]
  )

  if (dots.length === 0 && heatBars.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {/* Heatmap intensity bars */}
      {heatBars.map((bar) => {
        const alpha = Math.max(0.2, bar.intensity * 0.75)
        return (
          <div
            key={`heat-${bar.line}`}
            className="absolute pointer-events-auto cursor-pointer transition-all duration-300 hover:scale-x-125"
            style={{
              right: 0,
              top: bar.y,
              width: 14,
              height: 4,
              backgroundColor: `rgba(245, 158, 11, ${alpha})`,
              boxShadow: `0 0 8px rgba(245, 158, 11, ${alpha * 0.8})`,
              borderRadius: "2px 0 0 2px",
              transform: "translateY(-50%)",
            }}
            title={`Hotspot at Line ${bar.line} (${bar.count} recent edits) - Click to jump`}
            onClick={(e) => handleClick(e, bar.line)}
          />
        )
      })}

      {/* Collaborator presence cursor markers */}
      {dots.map((dot) => (
        <div
          key={`user-${dot.id}`}
          className="absolute pointer-events-auto cursor-pointer flex items-center justify-end group transition-all duration-150"
          style={{
            right: 6,
            top: dot.y,
            transform: "translateY(-50%)",
          }}
          title={`${dot.name} (Line ${dot.line}) - Click to jump`}
          onClick={(e) => handleClick(e, dot.line)}
        >
          <span className="text-[9px] font-semibold text-white px-1.5 py-0.5 bg-gray-950/90 border border-gray-700 rounded-md mr-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-md whitespace-nowrap">
            {dot.name} (L{dot.line})
          </span>
          <div
            className={`relative flex items-center justify-center transition-transform group-hover:scale-125 ${
              dot.isSpeaking ? "ring-2 ring-green-400" : ""
            }`}
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: dot.color,
              boxShadow: `0 0 8px ${dot.color}`,
              border: "1.5px solid rgba(255,255,255,0.9)",
            }}
          >
            {dot.status === "idle" && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default memo(MinimapOverlay)
