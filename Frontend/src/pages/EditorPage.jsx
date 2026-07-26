import { Editor, useMonaco } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"
import { useAuth } from "../hooks/useAuth"
import { saveRoom } from "../lib/rooms"
import { getFileInfo, generateId } from "../lib/fileTree"
import { defineCustomThemes } from "../lib/themes"
import FileExplorer from "../components/FileExplorer"
import EditorToolbar from "../components/EditorToolbar"
import StatusBar from "../components/StatusBar"
import SnapshotHistory from "../components/SnapshotHistory"
import SnapshotDialog from "../components/SnapshotDialog"
import DiffView from "../components/DiffView"
import CommentsPanel from "../components/CommentsPanel"

const IDLE_TIMEOUT = 30000
const TYPING_TIMEOUT = 2000
const AUTO_SAVE_INTERVAL = 10000

function UserAvatar({ user }) {
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        className="w-8 h-8 rounded-full object-cover"
      />
    )
  }
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
      style={{ backgroundColor: user.color }}
    >
      {user.username.charAt(0).toUpperCase()}
    </div>
  )
}

function StatusDot({ status }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${
        status === "idle" ? "bg-yellow-400" : "bg-green-400"
      }`}
      title={status === "idle" ? "Idle" : "Active"}
    />
  )
}

function injectCursorStyles(awareness, localClientID) {
  let styleEl = document.getElementById("y-monaco-cursors")
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = "y-monaco-cursors"
    document.head.appendChild(styleEl)
  }

  const states = awareness.getStates()
  let css = ""

  states.forEach((state, clientID) => {
    if (clientID === localClientID) return
    const u = state.user
    if (!u || !u.color) return

    const color = u.color
    const name = (u.name || "Anonymous").replace(/"/g, '\\"')
    css += `
      .yRemoteSelection-${clientID} {
        background-color: ${color}33;
      }
      .yRemoteSelectionHead-${clientID} {
        position: relative;
        border-left: 2px solid ${color};
        margin-left: -1px;
        box-sizing: border-box;
      }
      .yRemoteSelectionHead-${clientID}::after {
        content: "${name}";
        position: absolute;
        top: -1.6em;
        left: -1px;
        font-size: 11px;
        font-family: system-ui, sans-serif;
        font-weight: 600;
        line-height: normal;
        padding: 1px 5px;
        border-radius: 4px 4px 4px 0;
        white-space: nowrap;
        color: white;
        background-color: ${color};
        pointer-events: none;
        z-index: 10;
      }
    `
  })

  styleEl.textContent = css
}

export default function EditorPage({ roomId }) {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const monaco = useMonaco()
  const editorRef = useRef(null)
  const providerRef = useRef(null)
  const bindingRef = useRef(null)
  const fileTreeRef = useRef({})
  const lastActivityRef = useRef(Date.now())
  const typingTimeoutRef = useRef(null)
  const autoSaveRef = useRef(null)
  const saveProjectRef = useRef(null)

  const [users, setUsers] = useState([])
  const [usersMap, setUsersMap] = useState(new Map())
  const [typingUsers, setTypingUsers] = useState([])
  const [copied, setCopied] = useState(false)

  const [fileTree, setFileTree] = useState({})
  const [selectedFileId, setSelectedFileId] = useState(null)
  const [theme, setTheme] = useState("vs-dark")
  const [fontSize, setFontSize] = useState(14)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedTime, setLastSavedTime] = useState(null)
  const [isSnapshotting, setIsSnapshotting] = useState(false)
  const [statusContent, setStatusContent] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [diffSnapshot, setDiffSnapshot] = useState(null)
  const [showComments, setShowComments] = useState(false)
  const [selectionInfo, setSelectionInfo] = useState(null)
  const [fileComments, setFileComments] = useState([])
  const [focusedCommentId, setFocusedCommentId] = useState(null)
  const [pendingPrefill, setPendingPrefill] = useState(null)
  const [commentVersion, setCommentVersion] = useState(0)
  const decorationIdsRef = useRef([])
  const commentLineMapRef = useRef(new Map())

  const ydoc = useMemo(() => new Y.Doc(), [])
  const yFileTree = useMemo(() => ydoc.getMap("fileTree"), [ydoc])

  fileTreeRef.current = fileTree

  const selectedFile = selectedFileId ? fileTree[selectedFileId] : null
  const selectedFileName = selectedFile?.name || null
  const selectedFileLanguage = selectedFileName
    ? getFileInfo(selectedFileName).language
    : "plaintext"

  const inviteLink = typeof window !== "undefined"
    ? `${window.location.origin}/room/${roomId}`
    : ""

  const copyInviteLink = useCallback(() => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [inviteLink])

  const getFileTreeObj = useCallback(() => {
    const obj = {}
    yFileTree.forEach((val, key) => {
      obj[key] = val
    })
    return obj
  }, [yFileTree])

  const getFileContent = useCallback((fileId) => {
    return ydoc.getText("file:" + fileId).toString()
  }, [ydoc])

  const saveProject = useCallback(async () => {
    try {
      const ft = getFileTreeObj()
      const files = Object.values(ft)
        .filter((item) => item.type === "file")
        .map((item) => ({
          id: item.id,
          content: getFileContent(item.id),
          language: getFileInfo(item.name).language,
        }))

      await fetch("/api/projects/" + roomId + "/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileTree: ft, files, settings: { theme, fontSize } }),
      })
      setLastSavedTime(Date.now())
    } catch (err) {
      console.error("Auto-save failed:", err)
    }
  }, [roomId, theme, fontSize, getFileTreeObj, getFileContent])

  saveProjectRef.current = saveProject

  const handleSave = useCallback(() => {
    setIsSaving(true)
    saveProject().finally(() => setIsSaving(false))
  }, [saveProject])

  const handleSnapshot = useCallback(async (message) => {
    setIsSnapshotting(true)
    try {
      const ft = getFileTreeObj()
      const fileItems = Object.values(ft).filter((item) => item.type === "file")
      const files = fileItems.map((item) => ({
        id: item.id,
        content: getFileContent(item.id),
        language: getFileInfo(item.name).language,
      }))

      const data = JSON.stringify({ fileTree: ft, files, settings: { theme, fontSize } })

      const historyRes = await fetch("/api/projects/" + roomId + "/history", {
        credentials: "include",
      })
      const historyData = await historyRes.json()
      const version = (historyData.history?.length || 0) + 1

      await fetch("/api/projects/" + roomId + "/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          data,
          label: "v" + version,
          message: message || "",
          author: user?.username || "",
          filesCount: fileItems.length,
          fileNames: fileItems.map((item) => item.name),
        }),
      })
    } catch (err) {
      console.error("Snapshot failed:", err)
    } finally {
      setIsSnapshotting(false)
    }
  }, [roomId, theme, fontSize, getFileTreeObj, getFileContent, user])

  useEffect(() => {
    if (!selectedFileId) {
      setStatusContent("")
      return
    }
    const text = ydoc.getText("file:" + selectedFileId)
    const update = () => setStatusContent(text.toString())
    update()
    text.observe(update)
    return () => text.unobserve(update)
  }, [selectedFileId, ydoc])

  useEffect(() => {
    const observe = () => {
      const obj = {}
      yFileTree.forEach((val, key) => {
        obj[key] = val
      })
      setFileTree(obj)
    }
    observe()
    yFileTree.observe(observe)
    return () => yFileTree.unobserve(observe)
  }, [yFileTree])

  useEffect(() => {
    if (monaco) {
      defineCustomThemes(monaco)
    }
  }, [monaco])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !selectedFileId) return

    setSelectionInfo(null)

    const handler = (e) => {
      const selection = e.selection
      const model = editor.getModel()
      if (!model) return

      const isEmpty = selection.startLineNumber === selection.endLineNumber && selection.startColumn === selection.endColumn
      if (isEmpty) {
        setSelectionInfo(null)
        return
      }

      const selectedText = model.getValueInRange(selection)
      if (!selectedText.trim()) {
        setSelectionInfo(null)
        return
      }

      const editorDom = editor.getDomNode()
      if (!editorDom) return
      const editorRect = editorDom.getBoundingClientRect()
      const topLine = editor.getTopForLineNumber(selection.startLineNumber)
      const bottomLine = editor.getBottomForLineNumber(selection.endLineNumber)
      const scrollTop = editor.getScrollTop()
      const top = editorRect.top + topLine - scrollTop + 8

      const endCol = selection.endColumn
      const fontSize = editor.getOption(monaco.editor.EditorOption.fontSize)
      const charWidth = fontSize * 0.602
      const gutterWidth = 60
      const rawLeft = editorRect.left + gutterWidth + endCol * charWidth - editor.getScrollLeft()
      const left = Math.min(rawLeft, window.innerWidth - 100)

      setSelectionInfo({
        startLine: selection.startLineNumber,
        endLine: selection.endLineNumber,
        selectedText,
        top: Math.max(editorRect.top + 10, Math.min(top, editorRect.bottom - 30)),
        left,
      })
    }

    const disposable = editor.onDidChangeCursorSelection(handler)
    return () => {
      disposable.dispose()
    }
  }, [selectedFileId, monaco])

  useEffect(() => {
    if (!selectedFileId) {
      setFileComments([])
      return
    }
    const fetchComments = async () => {
      try {
        const res = await fetch("/api/comments/" + roomId, { credentials: "include" })
        const data = await res.json()
        setFileComments((data.comments || []).filter((c) => c.fileId === selectedFileId && !c.resolved))
      } catch {
        setFileComments([])
      }
    }
    fetchComments()
  }, [selectedFileId, roomId, commentVersion])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return

    decorationIdsRef.current = model.deltaDecorations(decorationIdsRef.current, [])
    commentLineMapRef.current.clear()

    fileComments.forEach((comment) => {
      const startLine = comment.startLine || 1
      const endLine = comment.endLine || startLine
      for (let l = startLine; l <= endLine; l++) {
        commentLineMapRef.current.set(l, comment)
      }
    })

    if (fileComments.length === 0) return

    const decorations = fileComments.map((comment) => {
      const startLine = comment.startLine || 1
      const endLine = comment.endLine || startLine
      return {
        range: new monaco.Range(startLine, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: "comment-highlight-" + (comment.color || "default").replace("#", ""),
          overviewRuler: {
            color: comment.color || "#eab308",
            position: monaco.editor.OverviewRulerLane.Right,
          },
          linesDecorations: [{
            icon: "comment-icon",
            color: comment.color || "#eab308",
          }],
          glyphMarginClassName: "comment-glyph-" + (comment.color || "default").replace("#", ""),
          minimap: { color: comment.color || "#eab308", position: 1 },
          commentId: comment._id,
        },
      }
    })

    decorationIdsRef.current = model.deltaDecorations([], decorations)
  }, [fileComments, monaco, selectedFileId])

  useEffect(() => {
    if (fileComments.length === 0) {
      const el = document.getElementById("comment-decorations")
      if (el) el.remove()
      return
    }
    let styleEl = document.getElementById("comment-decorations")
    if (!styleEl) {
      styleEl = document.createElement("style")
      styleEl.id = "comment-decorations"
      document.head.appendChild(styleEl)
    }
    const rules = fileComments.map((c) => {
      const id = (c.color || "#eab308").replace("#", "")
      return `
        .comment-highlight-${id} { background-color: ${c.color || "#eab308"}11 !important; }
        .comment-glyph-${id} {
          background: ${c.color || "#eab308"};
          width: 6px !important; height: 6px !important;
          border-radius: 50%; margin-left: 3px; margin-top: 2px;
        }
      `
    }).join("\n")
    styleEl.textContent = rules
    return () => { document.getElementById("comment-decorations")?.remove() }
  }, [fileComments])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !monaco) return
    const editorDom = editor.getDomNode()
    if (!editorDom) return

    const handler = (e) => {
      const editorRect = editorDom.getBoundingClientRect()
      const layout = editor.getLayoutInfo()
      const glyphMarginRight = editorRect.left + layout.glyphMarginLeft + layout.glyphMarginWidth
      const gutterRight = glyphMarginRight + layout.lineNumbersWidth
      if (e.clientX > gutterRight) return

      const scrollTop = editor.getScrollTop()
      const lineHeight = editor.getOption(monaco.editor.EditorOption.lineHeight)
      const line = Math.floor((e.clientY - editorRect.top + scrollTop) / lineHeight) + 1
      if (line < 1) return

      const comment = commentLineMapRef.current.get(line)
      if (comment) {
        e.preventDefault()
        e.stopPropagation()
        setShowComments(true)
        setFocusedCommentId(comment._id)
        setTimeout(() => setFocusedCommentId(null), 5000)
      }
    }

    editorDom.addEventListener("click", handler, true)
    return () => editorDom.removeEventListener("click", handler, true)
  }, [monaco, selectedFileId])

  useEffect(() => {
    if (!user || !providerRef.current || !editorRef.current) return
    if (!selectedFileId) return

    if (bindingRef.current) {
      bindingRef.current.destroy()
      bindingRef.current = null
    }

    const text = ydoc.getText("file:" + selectedFileId)
    const lang = getFileInfo(fileTreeRef.current[selectedFileId]?.name || "").language

    if (monaco && editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, lang)
      }
    }

    bindingRef.current = new MonacoBinding(
      text,
      editorRef.current.getModel(),
      new Set([editorRef.current]),
      providerRef.current.awareness
    )

    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
    }
  }, [selectedFileId, monaco, ydoc, user])

  useEffect(() => {
    if (!user) return

    saveRoom({ id: roomId })

    const provider = new SocketIOProvider("/", roomId, ydoc, {
      autoConnect: true,
      auth: { token: token || "" },
    })
    providerRef.current = provider

    const awareness = provider.awareness

    awareness.setLocalStateField("user", {
      name: user.username,
      username: user.username,
      avatar: user.avatar,
      color: user.color,
      isGuest: user.isGuest,
      status: "active",
      typing: false,
      lastActive: Date.now(),
    })

    const fetchProject = async () => {
      try {
        const res = await fetch("/api/projects/" + roomId, { credentials: "include" })
        const data = await res.json()
        const project = data.project

        ydoc.transact(() => {
          if (project.fileTree) {
            const entries = Object.entries(project.fileTree)
            entries.forEach(([key, val]) => {
              yFileTree.set(key, val)
            })
          }

          if (project.files && Array.isArray(project.files)) {
            project.files.forEach((f) => {
              const text = ydoc.getText("file:" + f.id)
              if (f.content && text.toString() === "") {
                text.insert(0, f.content)
              }
            })
          }
        })

        if (project.settings) {
          if (project.settings.theme) setTheme(project.settings.theme)
          if (project.settings.fontSize) setFontSize(project.settings.fontSize)
        }

        const tree = {}
        yFileTree.forEach((val, key) => { tree[key] = val })
        const firstFile = Object.values(tree).find((item) => item.type === "file")
        if (firstFile) {
          setSelectedFileId(firstFile.id)
        }
      } catch (err) {
        console.error("Failed to load project:", err)
      }
    }

    fetchProject()

    const activityEvents = ["mousemove", "click", "mousedown", "touchstart"]
    const onActivity = () => {
      lastActivityRef.current = Date.now()
      const state = awareness.getLocalState()
      if (state?.user && state.user.status !== "active") {
        awareness.setLocalStateField("user", {
          ...state.user,
          status: "active",
          lastActive: Date.now(),
        })
      }
    }

    activityEvents.forEach((event) => document.addEventListener(event, onActivity))

    const onTyping = () => {
      const state = awareness.getLocalState()
      if (!state?.user) return

      lastActivityRef.current = Date.now()

      if (!state.user.typing) {
        awareness.setLocalStateField("user", {
          ...state.user,
          typing: true,
          status: "active",
          lastActive: Date.now(),
        })
      }

      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        const currentState = awareness.getLocalState()
        if (currentState?.user?.typing) {
          awareness.setLocalStateField("user", {
            ...currentState.user,
            typing: false,
          })
        }
      }, TYPING_TIMEOUT)
    }

    const idleCheck = setInterval(() => {
      const state = awareness.getLocalState()
      if (!state?.user) return

      const elapsed = Date.now() - lastActivityRef.current
      if (elapsed > IDLE_TIMEOUT && state.user.status !== "idle") {
        awareness.setLocalStateField("user", {
          ...state.user,
          status: "idle",
          lastActive: lastActivityRef.current,
        })
      }
    }, 5000)

    autoSaveRef.current = setInterval(() => {
      saveProjectRef.current()
    }, AUTO_SAVE_INTERVAL)

    const updateUsers = () => {
      const states = Array.from(awareness.getStates().values())
      const filtered = states
        .filter((s) => s.user && s.user.username)
        .map((s) => s.user)

      setUsers(filtered)

      const map = new Map()
      filtered.forEach((u) => map.set(u.username, u))
      setUsersMap(map)

      const typing = filtered
        .filter((u) => u.typing && u.username !== user.username)
        .map((u) => u.username)
      setTypingUsers(typing)

      injectCursorStyles(awareness, ydoc.clientID)
    }

    updateUsers()
    awareness.on("change", updateUsers)

    window.addEventListener("keydown", onTyping)

    function handleBeforeUnload() {
      awareness.setLocalStateField("user", null)
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      awareness.setLocalStateField("user", null)
      activityEvents.forEach((event) => document.removeEventListener(event, onActivity))
      window.removeEventListener("keydown", onTyping)
      clearTimeout(typingTimeoutRef.current)
      clearInterval(idleCheck)
      clearInterval(autoSaveRef.current)
      awareness.off("change", updateUsers)
      if (bindingRef.current) {
        bindingRef.current.destroy()
        bindingRef.current = null
      }
      provider.disconnect()
      providerRef.current = null
      window.removeEventListener("beforeunload", handleBeforeUnload)

      const styleEl = document.getElementById("y-monaco-cursors")
      if (styleEl) styleEl.remove()
    }
  }, [user, token, ydoc, yFileTree, roomId])

  const addCommentRef = useRef(null)

  const handleMount = (editor) => {
    editorRef.current = editor

    if (providerRef.current && !bindingRef.current && selectedFileId) {
      const text = ydoc.getText("file:" + selectedFileId)
      bindingRef.current = new MonacoBinding(
        text,
        editor.getModel(),
        new Set([editor]),
        providerRef.current.awareness
      )
    }
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !monaco) return

    const disposable = editor.addAction({
      id: "add-comment",
      label: "Add Comment",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.5,
      run: (ed) => {
        const selection = ed.getSelection()
        const model = ed.getModel()
        if (!model || !selection) return
        const startLine = selection.startLineNumber
        const endLine = selection.endLineNumber
        const selectedText = model.getValueInRange(selection)
        setPendingPrefill({ startLine, endLine, selectedText })
        setShowComments(true)
      },
    })
    return () => disposable.dispose()
  }, [monaco, selectedFileId])

  const handleCreateFile = useCallback((name, parentId) => {
    const id = "file_" + generateId()
    yFileTree.set(id, { id, name, type: "file", parentId: parentId || null })
    const text = ydoc.getText("file:" + id)
    if (text.toString() === "") {
      text.insert(0, "")
    }
    setSelectedFileId(id)
  }, [yFileTree, ydoc])

  const handleCreateFolder = useCallback((name, parentId) => {
    const id = "folder_" + generateId()
    yFileTree.set(id, { id, name, type: "folder", parentId: parentId || null })
  }, [yFileTree])

  const handleRename = useCallback((id, newName) => {
    const item = yFileTree.get(id)
    if (item) {
      yFileTree.set(id, { ...item, name: newName })
    }
  }, [yFileTree])

  const handleDelete = useCallback((id) => {
    const toDelete = [id]
    yFileTree.forEach((val, key) => {
      if (val.parentId === id) toDelete.push(key)
    })

    ydoc.transact(() => {
      toDelete.forEach((key) => yFileTree.delete(key))
    })

    if (selectedFileId === id) {
      const tree = getFileTreeObj()
      const remaining = Object.values(tree).filter((item) => item.type === "file" && !toDelete.includes(item.id))
      setSelectedFileId(remaining[0]?.id || null)
    }
  }, [yFileTree, ydoc, selectedFileId, getFileTreeObj])

  const handleMove = useCallback((itemId, newParentId) => {
    const item = yFileTree.get(itemId)
    if (item) {
      yFileTree.set(itemId, { ...item, parentId: newParentId })
    }
  }, [yFileTree])

  const handleRestore = useCallback((snapshot) => {
    const currentTree = getFileTreeObj()

    ydoc.transact(() => {
      Object.values(currentTree)
        .filter((item) => item.type === "file")
        .forEach((item) => {
          const text = ydoc.getText("file:" + item.id)
          if (text.length > 0) text.delete(0, text.length)
        })

      yFileTree.clear()
      if (snapshot.fileTree) {
        Object.entries(snapshot.fileTree).forEach(([key, val]) => {
          yFileTree.set(key, val)
        })
      }

      if (snapshot.files && Array.isArray(snapshot.files)) {
        snapshot.files.forEach((f) => {
          const text = ydoc.getText("file:" + f.id)
          if (text.length > 0) text.delete(0, text.length)
          if (f.content) text.insert(0, f.content)
        })
      }
    })

    if (snapshot.settings) {
      if (snapshot.settings.theme) setTheme(snapshot.settings.theme)
      if (snapshot.settings.fontSize) setFontSize(snapshot.settings.fontSize)
    }

    const tree = {}
    yFileTree.forEach((val, key) => { tree[key] = val })
    const firstFile = Object.values(tree).find((item) => item.type === "file")
    if (firstFile) {
      setSelectedFileId(firstFile.id)
    } else {
      setSelectedFileId(null)
    }
  }, [ydoc, yFileTree, getFileTreeObj])

  const handleDiff = useCallback((snapshot) => {
    setDiffSnapshot(snapshot)
    setShowHistory(false)
  }, [])

  const handleSnapshotClick = useCallback(() => {
    setShowSnapshotDialog(true)
  }, [])

  const handleSnapshotDialogSave = useCallback((message) => {
    setShowSnapshotDialog(false)
    handleSnapshot(message)
  }, [handleSnapshot])

  const handleQuickSnapshot = useCallback(() => {
    const now = new Date()
    const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    handleSnapshot("Quick snapshot at " + time)
  }, [handleSnapshot])

  const handleJumpToLine = useCallback((fileId, line) => {
    setSelectedFileId(fileId)
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.revealLineInCenter(line)
        editorRef.current.setPosition({ lineNumber: line, column: 1 })
        editorRef.current.focus()
      }
    }, 100)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
        e.preventDefault()
        handleQuickSnapshot()
      } else if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave, handleQuickSnapshot])

  return (
    <main className="h-screen w-full bg-gray-950 flex gap-4 p-4">
      <aside className="h-full w-64 bg-gray-900 rounded-lg flex flex-col border border-gray-700">
        <div className="p-3 border-b border-gray-700">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </button>
        </div>
        <div className="p-4 border-b border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-white">Users</h2>
            <span className="text-xs text-gray-300">
              {users.length} {users.length === 1 ? "user" : "users"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyInviteLink}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: "Join my room", url: inviteLink })
                } else {
                  copyInviteLink()
                }
              }}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700 hover:text-white border border-gray-600 transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share
            </button>
          </div>
        </div>

        <FileExplorer
          fileTree={fileTree}
          selectedFileId={selectedFileId}
          onSelect={(item) => setSelectedFileId(item.id)}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onRename={handleRename}
          onDelete={handleDelete}
          onMove={handleMove}
        />

        <ul className="p-3 border-t border-gray-700 max-h-40 overflow-y-auto">
          {users.map((u, index) => (
            <li
              key={index}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors mb-1"
            >
              <div className="relative">
                <UserAvatar user={u} />
                <span className="absolute -bottom-0.5 -right-0.5 block w-3 h-3 rounded-full border-2 border-gray-900">
                  <StatusDot status={u.status || "active"} />
                </span>
              </div>
              <div className="flex flex-col min-w-0">
                <span
                  className="text-sm font-semibold truncate"
                  style={{ color: u.color }}
                >
                  {u.username}
                </span>
                <span className="text-[10px] text-gray-400">
                  {u.isGuest ? "Guest" : "Signed in"}
                  {u.status === "idle" && " · Idle"}
                  {u.typing && u.username !== user.username && " · Typing..."}
                </span>
              </div>
              {u.username === user.username && (
                <span className="ml-auto text-[10px] text-gray-400 shrink-0">(you)</span>
              )}
            </li>
          ))}
        </ul>

        {typingUsers.length > 0 && (
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700">
              <span className="flex gap-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              <span className="text-xs text-gray-300">
                {typingUsers.length === 1
                  ? `${typingUsers[0]} is typing`
                  : `${typingUsers.length} users typing`}
              </span>
            </div>
          </div>
        )}

        <div className="p-3 border-t border-gray-700 mt-auto">
          <button
            onClick={logout}
            className="w-full p-2 rounded-lg bg-gray-800 text-gray-300 text-sm font-medium hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </aside>

      <section className="flex-1 bg-gray-900 rounded-lg overflow-hidden border border-gray-700 flex flex-col">
        <EditorToolbar
          filename={selectedFileName}
          theme={theme}
          onThemeChange={setTheme}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          onSave={handleSave}
          onSnapshot={handleSnapshotClick}
          onShowHistory={() => setShowHistory(true)}
          onToggleComments={() => setShowComments(!showComments)}
          showComments={showComments}
          lastSaved={lastSavedTime ? new Date(lastSavedTime).toLocaleTimeString() : null}
          isSaving={isSaving}
        />

        <div className="flex-1 overflow-hidden relative">
          {selectedFileId ? (
            <>
              <Editor
                height="100%"
                language={selectedFileLanguage}
                theme={theme}
                onMount={handleMount}
                options={{
                  fontSize,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  wordWrap: "on",
                  automaticLayout: true,
                  tabSize: 2,
                  glyphMargin: true,
                }}
              />
              {selectionInfo && (
                <button
                  onClick={() => {
                    setPendingPrefill({
                      startLine: selectionInfo.startLine,
                      endLine: selectionInfo.endLine,
                      selectedText: selectionInfo.selectedText,
                    })
                    setShowComments(true)
                  }}
                  className="fixed z-50 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500 text-gray-950 text-xs font-semibold shadow-lg hover:bg-amber-400 transition-colors cursor-pointer"
                  style={{ top: selectionInfo.top, left: selectionInfo.left }}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                  </svg>
                  Comment
                </button>
              )}
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">No file selected</p>
                <p className="text-sm">Create a file in the explorer to get started</p>
              </div>
            </div>
          )}
        </div>

        <StatusBar
          filename={selectedFileName}
          content={statusContent}
          isSaving={isSaving}
          lastSavedTime={lastSavedTime}
          usersCount={users.length}
          isSnapshotting={isSnapshotting}
        />
      </section>

      {showComments && (
        <CommentsPanel
          roomId={roomId}
          user={user}
          selectedFileId={selectedFileId}
          selectedFileName={selectedFileName}
          onJumpToLine={handleJumpToLine}
          onClose={() => setShowComments(false)}
          addCommentRef={addCommentRef}
          focusedCommentId={focusedCommentId}
          pendingPrefill={pendingPrefill}
          onPrefillConsumed={() => setPendingPrefill(null)}
          onCommentChanged={() => setCommentVersion((v) => v + 1)}
        />
      )}

      {showHistory && (
        <SnapshotHistory
          roomId={roomId}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestore}
          onDiff={handleDiff}
        />
      )}

      {showSnapshotDialog && (
        <SnapshotDialog
          roomId={roomId}
          currentFiles={Object.values(getFileTreeObj())
            .filter((item) => item.type === "file")
            .map((item) => ({
              id: item.id,
              name: item.name,
              content: getFileContent(item.id),
            }))}
          onSave={handleSnapshotDialogSave}
          onClose={() => setShowSnapshotDialog(false)}
        />
      )}

      {diffSnapshot && (
        <DiffView
          label={diffSnapshot.message || diffSnapshot.label}
          currentFiles={Object.values(getFileTreeObj())
            .filter((item) => item.type === "file")
            .map((item) => ({
              id: item.id,
              name: item.name,
              content: getFileContent(item.id),
              language: getFileInfo(item.name).language,
            }))}
          snapshotFiles={(() => {
            try {
              const parsed = JSON.parse(diffSnapshot.data)
              return (parsed.files || []).map((f) => ({
                ...f,
                name: parsed.fileTree?.[f.id]?.name || f.id,
              }))
            } catch {
              return []
            }
          })()}
          onClose={() => setDiffSnapshot(null)}
        />
      )}
    </main>
  )
}
