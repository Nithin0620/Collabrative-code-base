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
      const minimapWidth = minimapRect.width
      const minimapHeight = minimapRect.height
      if (minimapHeight === 0 || minimapWidth === 0) return

      const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight)
      const scrollHeight = editor.getScrollHeight()
      const viewportHeight = editor.getLayoutInfo().height
      if (scrollHeight <= viewportHeight) {
        setDots([])
        return
      }

      const newDots = []

      users.forEach((u) => {
        if (u.username === localUsername) return
        if (!u.cursorPos || u.status === "offline") return

        const line = u.cursorPos.line || 1
        const lineY = (line - 1) * lineHeight

        const fraction = lineY / (scrollHeight - viewportHeight)
        const minimapSliderHeight = (viewportHeight / scrollHeight) * minimapHeight
        const minimapSliderMaxTop = minimapHeight - minimapSliderHeight
        const dotY = Math.max(0, Math.min(minimapHeight - 4, fraction * minimapSliderMaxTop))

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
    editor.revealLineInCenter(dot.line)
    editor.setPosition({ lineNumber: dot.line, column: 1 })
  }, [editorRef])

  if (dots.length === 0) return null

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {dots.map((dot) => (
        <div
          key={dot.id}
          className="absolute pointer-events-auto cursor-pointer"
          style={{
            right: 10,
            top: dot.y,
            width: 6,
            height: 6,
            borderRadius: "50%",
            backgroundColor: dot.color,
            boxShadow: `0 0 6px ${dot.color}`,
            border: "1px solid rgba(255,255,255,0.6)",
            transform: "translateY(-50%)",
          }}
          title={dot.name + " (line " + dot.line + ")"}
          onClick={(e) => handleClick(e, dot)}
        />
      ))}
    </div>
  )
}

export default memo(MinimapOverlay)
