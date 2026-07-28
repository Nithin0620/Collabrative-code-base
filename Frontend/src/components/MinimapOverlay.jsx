import { memo, useCallback, useRef, useState, useEffect } from "react"

function MinimapOverlay({ editorRef, users, localUsername, monaco }) {
  const [dots, setDots] = useState([])

  useEffect(() => {
    if (!editorRef?.current || !monaco) return
    const editor = editorRef.current

    const calculateDots = () => {
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

      const newDots = []

      users.forEach((u) => {
        if (u.username === localUsername) return
        if (!u.cursorPos || u.status === "offline") return

        const line = u.cursorPos.line || 1
        const lineFraction = totalLines > 1 ? (line - 1) / (totalLines - 1) : 0
        const dotY = Math.max(4, Math.min(minimapHeight - 4, lineFraction * (minimapHeight - 8)))

        newDots.push({
          id: u.username,
          y: dotY,
          color: u.color || "#60a5fa",
          name: u.username,
          line,
        })
      })

      setDots(newDots)
    }

    calculateDots()

    const disposable = editor.onDidScrollChange(calculateDots)
    const resizeDisposable = editor.onDidLayoutChange(calculateDots)
    return () => {
      disposable.dispose()
      resizeDisposable.dispose()
    }
  }, [editorRef, users, localUsername, monaco])

  const handleClick = useCallback((e, dot) => {
    e.preventDefault()
    e.stopPropagation()
    const editor = editorRef?.current
    if (!editor || !dot.line) return
    editor.revealLineInCenter(dot.line, monaco.editor.ScrollType.Smooth)
    editor.setPosition({ lineNumber: dot.line, column: 1 })
  }, [editorRef, monaco])

  if (dots.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {dots.map((dot) => (
        <div
          key={dot.id}
          className="absolute pointer-events-auto cursor-pointer flex items-center justify-end"
          style={{
            right: 8,
            top: dot.y,
            transform: "translateY(-50%)",
          }}
          title={`${dot.name} (Line ${dot.line}) - Click to jump`}
          onClick={(e) => handleClick(e, dot)}
        >
          <span className="text-[9px] font-semibold text-white px-1 py-0.2 bg-gray-900/80 rounded mr-1 opacity-0 hover:opacity-100 transition-opacity">
            {dot.name}
          </span>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: dot.color,
              boxShadow: `0 0 6px ${dot.color}`,
              border: "1px solid rgba(255,255,255,0.8)",
            }}
          />
        </div>
      ))}
    </div>
  )
}

export default memo(MinimapOverlay)
