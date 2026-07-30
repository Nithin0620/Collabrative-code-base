import { Editor, useMonaco } from "@monaco-editor/react"
import { MonacoBinding } from "y-monaco"
import { useRef, useMemo, useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import * as Y from "yjs"
import { SocketIOProvider } from "y-socket.io"
import { io } from "socket.io-client"
import { useAuth } from "../hooks/useAuth"
import { saveRoom } from "../lib/rooms"
import { getFileInfo, generateId } from "../lib/fileTree"
import { defineCustomThemes } from "../lib/themes"
import FileExplorer from "../components/FileExplorer"
import EditorToolbar from "../components/EditorToolbar"
import TabBar from "../components/TabBar"
import TerminalPanel from "../components/TerminalPanel"
import StatusBar from "../components/StatusBar"
import SnapshotHistory from "../components/SnapshotHistory"
import SnapshotDialog from "../components/SnapshotDialog"
import DiffView from "../components/DiffView"
import CommentsPanel from "../components/CommentsPanel"
import ChatPanel from "../components/ChatPanel"
import ExecutionPanel from "../components/ExecutionPanel"
import SnippetManager from "../components/SnippetManager"
import TestCaseManager from "../components/TestCaseManager"
import MouseOverlay from "../components/MouseOverlay"
import MinimapOverlay from "../components/MinimapOverlay"
import VideoWindow from "../components/VideoWindow"
import VideoGallery from "../components/VideoGallery"
import useLiveKit from "../hooks/useLiveKit"
import useProjectRole from "../hooks/useProjectRole"
import RoleBadge from "../components/RoleBadge"
import RoleManager from "../components/RoleManager"
import PasswordPrompt from "../components/PasswordPrompt"
import ShareModal from "../components/ShareModal"
import ShortcutsModal from "../components/ShortcutsModal"
import SourceControlPanel from "../components/SourceControlPanel"
import ToastNotification from "../components/ToastNotification"
import { downloadFile, downloadProjectAsZip } from "../lib/download"

const IDLE_TIMEOUT = 30000
const TYPING_TIMEOUT = 2000
const AUTO_SAVE_INTERVAL = 10000

function UserAvatar({ user }) {
  const speakingClass = user?.isSpeaking ? "ring-2 ring-green-400 ring-offset-2 ring-offset-gray-900 animate-pulse" : ""
  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        className={`w-8 h-8 rounded-full object-cover ${speakingClass}`}
      />
    )
  }
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${speakingClass}`}
      style={{ backgroundColor: user.color }}
    >
      {user.username.charAt(0).toUpperCase()}
    </div>
  )
}

function StatusDot({ status }) {
  const color = status === "offline" ? "bg-gray-500" : status === "idle" ? "bg-yellow-400" : "bg-green-400"
  const title = status === "offline" ? "Offline" : status === "idle" ? "Idle" : "Active"
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${color}`}
      title={title}
    />
  )
}

function RelativeTime({ timestamp }) {
  const [text, setText] = useState(() => formatRelativeTime(timestamp))

  useEffect(() => {
    setText(formatRelativeTime(timestamp))
    const interval = setInterval(() => setText(formatRelativeTime(timestamp)), 10000)
    return () => clearInterval(interval)
  }, [timestamp])

  return <span title={new Date(timestamp).toLocaleString()}>{text}</span>
}

function formatRelativeTime(ts) {
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
  const knownUsersRef = useRef(new Map())

  const [users, setUsers] = useState([])
  const [usersMap, setUsersMap] = useState(new Map())
  const [typingUsers, setTypingUsers] = useState([])
  const [copied, setCopied] = useState(false)
  const [followedUser, setFollowedUser] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [chatSocket, setChatSocket] = useState(null)
  const [sidebarWidth, setSidebarWidth] = useState(224)
  const isResizingRef = useRef(false)
  const [pinnedUser, setPinnedUser] = useState(null)
  const [showGallery, setShowGallery] = useState(false)
  const [cameraToastDismissed, setCameraToastDismissed] = useState(false)
  const [scrollSyncEnabled, setScrollSyncEnabled] = useState(true)
  const [remoteMousePositions, setRemoteMousePositions] = useState({})
  const [showRoleManager, setShowRoleManager] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [passwordVerified, setPasswordVerified] = useState(false)
  const [editorInstance, setEditorInstance] = useState(null)
  const [showShare, setShowShare] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((title, message, type = "info") => {
    const id = Date.now() + Math.random().toString(36).slice(2, 6)
    setToasts((prev) => [...prev, { id, title, message, type }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault()
        setShowShortcuts((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const { role, members, bannedUsers, settings, canEdit, isOwner, requiresPassword, requiresInvite, fetchProject, fetchMembers, addMember, changeRole, kickUser, banUser, unbanUser, updateSettings } = useProjectRole(roomId)

  const {
    localStream,
    remoteStreams,
    audioEnabled,
    videoEnabled,
    isSpeaking,
    handRaised,
    setHandRaised,
    toggleAudio,
    toggleVideo,
    toggleHand,
    callPeer,
    cleanupPeer,
    cleanup: cleanupWebRTC,
    getLocalStream,
  } = useLiveKit(chatSocket, roomId, user)

  const [fileTree, setFileTree] = useState({})
  const [selectedFileId, setSelectedFileId] = useState(null)
  const [openTabs, setOpenTabs] = useState([])
  const [showTerminal, setShowTerminal] = useState(false)

  const previewFileIdRef = useRef(null)

  const openTab = useCallback((fileId) => {
    setOpenTabs((prev) => {
      if (prev.includes(fileId)) {
        setSelectedFileId(fileId)
        return prev
      }
      const prevPreview = previewFileIdRef.current
      previewFileIdRef.current = fileId
      setSelectedFileId(fileId)
      if (prevPreview && prev.includes(prevPreview)) {
        return prev.map((id) => id === prevPreview ? fileId : id)
      }
      return [...prev, fileId]
    })
  }, [])

  const closeTab = useCallback((fileId) => {
    if (previewFileIdRef.current === fileId) previewFileIdRef.current = null
    setOpenTabs((prev) => {
      const idx = prev.indexOf(fileId)
      const next = prev.filter((id) => id !== fileId)
      if (selectedFileId === fileId) {
        const nextActive = next[idx] || next[idx - 1] || next[0] || null
        setSelectedFileId(nextActive)
      }
      return next
    })
  }, [selectedFileId])

  const closeOtherTabs = useCallback((fileId) => {
    setOpenTabs([fileId])
    setSelectedFileId(fileId)
  }, [])

  const closeAllTabs = useCallback(() => {
    setOpenTabs([])
    setSelectedFileId(null)
  }, [])

  const closeTabsToRight = useCallback((fileId) => {
    setOpenTabs((prev) => {
      const idx = prev.indexOf(fileId)
      return prev.slice(0, idx + 1)
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "`") {
        e.preventDefault()
        setShowTerminal((prev) => !prev)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  useEffect(() => {
    const handleTabShortcuts = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        if (selectedFileId) closeTab(selectedFileId)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        if (openTabs.length > 1) {
          e.preventDefault()
          const idx = openTabs.indexOf(selectedFileId)
          if (e.shiftKey) {
            const nextIdx = idx > 0 ? idx - 1 : openTabs.length - 1
            setSelectedFileId(openTabs[nextIdx])
          } else {
            const nextIdx = idx < openTabs.length - 1 ? idx + 1 : 0
            setSelectedFileId(openTabs[nextIdx])
          }
        }
      }
    }
    window.addEventListener("keydown", handleTabShortcuts)
    return () => window.removeEventListener("keydown", handleTabShortcuts)
  }, [selectedFileId, openTabs])

  const [theme, setTheme] = useState("vs-dark")
  const [fontSize, setFontSize] = useState(14)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedTime, setLastSavedTime] = useState(null)
  const [isSnapshotting, setIsSnapshotting] = useState(false)
  const [statusContent, setStatusContent] = useState("")
  const [showGit, setShowGit] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false)
  const [diffSnapshot, setDiffSnapshot] = useState(null)
  const [compareSnapshots, setCompareSnapshots] = useState(null)
  const [showComments, setShowComments] = useState(false)
  const [showRunner, setShowRunner] = useState(false)
  const [showSnippets, setShowSnippets] = useState(false)
  const [showTestCases, setShowTestCases] = useState(false)
  const [pendingTestCases, setPendingTestCases] = useState(null)
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

  const loadProjectData = useCallback(async (overwrite = false) => {
    try {
      const res = await fetch("/api/projects/" + roomId, { credentials: "include" })
      const data = await res.json()
      if (data.requiresPassword) {
        setNeedsPassword(true)
        return
      }
      if (data.requiresInvite) {
        setRoomAccessError("This room is invite-only. Please request an invitation from the room owner.")
        return
      }
      if (!res.ok || !data.project) return

      const project = data.project

      ydoc.transact(() => {
        if (project.fileTree) {
          yFileTree.clear()
          const entries = Object.entries(project.fileTree)
          entries.forEach(([key, val]) => {
            yFileTree.set(key, val)
          })
        }

        if (project.files && Array.isArray(project.files)) {
          project.files.forEach((f) => {
            const text = ydoc.getText("file:" + f.id)
            if (f.content) {
              if (overwrite || text.toString() === "") {
                text.delete(0, text.length)
                text.insert(0, f.content)
              }
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
        setOpenTabs([firstFile.id])
      }
    } catch (err) {
      console.error("Failed to load project:", err)
    }
  }, [roomId, ydoc, yFileTree])

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
          authorAvatar: user?.avatar || "",
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
    const editor = editorRef.current || editorInstance
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
      const scrollTop = editor.getScrollTop()
      const top = editorRect.top + topLine - scrollTop - 32

      const endCol = selection.endColumn
      const fontSize = editor.getOption(monaco.editor.EditorOption.fontSize) || 14
      const charWidth = fontSize * 0.602
      const gutterWidth = 60
      const rawLeft = editorRect.left + gutterWidth + endCol * charWidth - editor.getScrollLeft()
      const left = Math.min(Math.max(editorRect.left + 10, rawLeft), window.innerWidth - 120)

      setSelectionInfo({
        startLine: selection.startLineNumber,
        endLine: selection.endLineNumber,
        selectedText,
        top: Math.max(editorRect.top + 10, Math.min(top, editorRect.bottom - 40)),
        left,
      })
    }

    const disposable = editor.onDidChangeCursorSelection(handler)
    return () => {
      disposable.dispose()
    }
  }, [editorInstance, selectedFileId, monaco])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !selectedFileId || !providerRef.current) return
    const awareness = providerRef.current.awareness

    const disposable = editor.onDidChangeCursorPosition((e) => {
      const state = awareness.getLocalState()
      if (!state?.user) return
      awareness.setLocalStateField("user", {
        ...state.user,
        cursorPos: {
          line: e.position.lineNumber,
          column: e.position.column,
          fileId: selectedFileId,
        },
      })
    })
    return () => disposable.dispose()
  }, [selectedFileId, monaco])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !providerRef.current) return
    const awareness = providerRef.current.awareness

    const disposableMouse = editor.onMouseMove((e) => {
      const state = awareness.getLocalState()
      if (!state?.user) return
      const editorDom = editor.getDomNode()
      if (!editorDom) return
      const rect = editorDom.getBoundingClientRect()
      const nativeEvent = e.browserEvent
      if (!nativeEvent) return
      awareness.setLocalStateField("user", {
        ...state.user,
        mousePos: {
          x: nativeEvent.clientX - rect.left,
          y: nativeEvent.clientY - rect.top,
          pageX: nativeEvent.pageX,
          pageY: nativeEvent.pageY,
          fileId: selectedFileId,
        },
      })
    })

    const disposableCursor = editor.onDidChangeCursorPosition((e) => {
      const state = awareness.getLocalState()
      if (!state?.user) return
      awareness.setLocalStateField("user", {
        ...state.user,
        currentFileId: selectedFileId,
        cursorPos: {
          line: e.position.lineNumber,
          column: e.position.column,
          fileId: selectedFileId,
        },
      })
    })

    const disposableScroll = editor.onDidScrollChange(() => {
      const state = awareness.getLocalState()
      if (!state?.user) return
      const visibleRanges = editor.getVisibleRanges()
      const topRange = visibleRanges[0]
      if (topRange) {
        awareness.setLocalStateField("user", {
          ...state.user,
          currentFileId: selectedFileId,
          cursorPos: {
            line: topRange.startLineNumber,
            column: topRange.startColumn,
            fileId: selectedFileId,
          },
        })
      }
    })

    return () => {
      disposableMouse.dispose()
      disposableCursor.dispose()
      disposableScroll.dispose()
    }
  }, [selectedFileId, monaco])

  useEffect(() => {
    if (!providerRef.current) return
    const awareness = providerRef.current.awareness

    const onAwareness = () => {
      const states = Array.from(awareness.getStates().entries())
      const positions = {}
      const localId = ydoc.clientID
      for (const [clientID, state] of states) {
        if (clientID === localId) continue
        if (state.user?.mousePos && state.user.mousePos.fileId === selectedFileId) {
          positions[clientID] = { ...state.user.mousePos, color: state.user.color, name: state.user.name || state.user.username }
        }
      }
      setRemoteMousePositions(positions)
    }
    awareness.on("change", onAwareness)
    return () => awareness.off("change", onAwareness)
  }, [selectedFileId, ydoc])

  useEffect(() => {
    if (!followedUser || !providerRef.current) return
    const awareness = providerRef.current.awareness

    const onAwareness = () => {
      const states = Array.from(awareness.getStates().entries())
      for (const [clientID, state] of states) {
        if (state.user?.username !== followedUser) continue
        const pos = state.user?.cursorPos
        const targetFileId = state.user?.currentFileId || pos?.fileId

        if (targetFileId && targetFileId !== selectedFileId) {
          setSelectedFileId(targetFileId)
          if (scrollSyncEnabled && pos?.line) {
            setTimeout(() => {
              const e = editorRef.current
              if (e && pos.line) {
                e.revealLineInCenter(pos.line, 1)
                e.setPosition({ lineNumber: pos.line, column: pos.column || 1 })
              }
            }, 100)
          }
        } else if (scrollSyncEnabled && editorRef.current && pos?.line) {
          editorRef.current.revealLineInCenter(pos.line, 1)
          editorRef.current.setPosition({ lineNumber: pos.line, column: pos.column || 1 })
        }
        break
      }
    }

    onAwareness()
    awareness.on("change", onAwareness)
    return () => awareness.off("change", onAwareness)
  }, [followedUser, selectedFileId, scrollSyncEnabled, monaco])

  useEffect(() => {
    if (!providerRef.current) return
    const awareness = providerRef.current.awareness
    const state = awareness.getLocalState()
    if (!state?.user) return
    awareness.setLocalStateField("user", {
      ...state.user,
      audioEnabled,
      videoEnabled,
      isSpeaking,
      handRaised,
      currentFileId: selectedFileId,
      role: role || "editor",
    })
  }, [audioEnabled, videoEnabled, isSpeaking, handRaised, selectedFileId, role])

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
    if (editorRef.current) {
      editorRef.current.updateOptions({ readOnly: !canEdit })
    }
  }, [canEdit])

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
        setShowChat(false)
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

    // First local edit pins the preview tab
    const pinTab = (event, transaction) => {
      if (transaction.local) {
        previewFileIdRef.current = null
        text.unobserve(pinTab)
      }
    }
    text.observe(pinTab)

    return () => {
      text.unobserve(pinTab)
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

    const chatSocket = io("/", {
      auth: { token: token || "" },
      transports: ["websocket"],
    })
    chatSocket.on("connect", () => {
      chatSocket.emit("join-room", roomId)
    })
    chatSocket.on("room-error", (data) => {
      if (data.requiresPassword) {
        setNeedsPassword(true)
        return
      }
      if (data.requiresInvite) {
        setRoomAccessError(data.message || "This room is invite-only.")
        return
      }
      alert(data.message || "Access denied")
      navigate("/")
    })
    chatSocket.on("member-action-event", (data) => {
      try {
        if (data.targetUserId && data.targetUserId === (user._id?.toString() || user.id?.toString())) {
          if (data.action === "kick") {
            alert("You have been kicked from this room by the owner")
            navigate("/")
            return
          }
          if (data.action === "ban") {
            alert("You have been banned from this room by the owner")
            navigate("/")
            return
          }
        }
        fetchProject()
        fetchMembers()
      } catch (err) {
        console.error("member-action-event handler error:", err)
      }
    })
    setChatSocket(chatSocket)

    const awareness = provider.awareness

    awareness.setLocalStateField("user", {
      name: user.username,
      username: user.username,
      avatar: user.avatar,
      color: user.color,
      isGuest: user.isGuest,
      status: "active",
      typing: false,
      audioEnabled: false,
      videoEnabled: false,
      handRaised: false,
      lastActive: Date.now(),
      role: role || "editor",
    })

    loadProjectData()

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
      const states = Array.from(awareness.getStates().entries())
      const activeUsers = states
        .filter(([, s]) => s.user && s.user.username)
        .map(([, s]) => s.user)

      const now = Date.now()
      const OFFLINE_GRACE_MS = 30000

      activeUsers.forEach((u) => {
        knownUsersRef.current.set(u.username, { ...u, status: u.status || "active" })
      })

      const allKnown = Array.from(knownUsersRef.current.values())
      const merged = allKnown.map((u) => {
        const isActive = activeUsers.some((a) => a.username === u.username)
        if (isActive) return u
        const lastSeen = u.lastActive || 0
        if (now - lastSeen < OFFLINE_GRACE_MS) return { ...u, status: "idle" }
        return { ...u, status: "offline" }
      }).filter((u) => {
        if (u.status === "offline" && now - (u.lastActive || 0) > OFFLINE_GRACE_MS * 3) {
          knownUsersRef.current.delete(u.username)
          return false
        }
        return true
      })

      const localUsername = user.username
      const withSelf = merged.filter((u) => u.username === localUsername)
      const others = merged.filter((u) => u.username !== localUsername)
      const final = [...withSelf, ...others]

      setUsers(final)

      const map = new Map()
      final.forEach((u) => map.set(u.username, u))
      setUsersMap(map)

      const typing = final
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
      if (chatSocket) {
        chatSocket.disconnect()
      }
      window.removeEventListener("beforeunload", handleBeforeUnload)

      const styleEl = document.getElementById("y-monaco-cursors")
      if (styleEl) styleEl.remove()
    }
  }, [user, token, ydoc, yFileTree, roomId, loadProjectData])

  const [roomAccessError, setRoomAccessError] = useState("")

  useEffect(() => {
    if (!roomId) return

    const searchParams = new URLSearchParams(window.location.search)
    const inviteToken = searchParams.get("inviteToken")

    if (inviteToken) {
      fetch("/api/projects/" + roomId + "/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ inviteToken }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            // Remove token from URL
            window.history.replaceState({}, document.title, window.location.pathname)
            fetchProject()
            fetchMembers()
          }
        })
        .catch(() => {})
    }
  }, [roomId, fetchProject, fetchMembers])

  useEffect(() => {
    if (requiresPassword && !passwordVerified) {
      setNeedsPassword(true)
    }
    if (requiresInvite) {
      setRoomAccessError("This room is invite-only. Please request an invitation from the room owner.")
    }
  }, [requiresPassword, requiresInvite, passwordVerified])

  useEffect(() => {
    if (!roomId || passwordVerified) return
    fetch("/api/projects/" + roomId + "/join", { method: "POST", credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.requiresPassword) {
          setNeedsPassword(true)
        } else if (data.requiresApproval) {
          setRoomAccessError("This room is invite-only. Please request an invitation from the room owner.")
        } else if (data.success) {
          fetchProject()
          fetchMembers()
        }
      })
      .catch(() => {})
  }, [roomId, passwordVerified, fetchProject, fetchMembers])

  const addCommentRef = useRef(null)

  const handleMount = (editor) => {
    editorRef.current = editor
    setEditorInstance(editor)

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
        setShowChat(false)
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
    openTab(id)
  }, [yFileTree, ydoc, openTab])

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

    toDelete.forEach((key) => closeTab(key))
  }, [yFileTree, ydoc, closeTab])

  const handleMove = useCallback((itemId, newParentId) => {
    const item = yFileTree.get(itemId)
    if (item) {
      yFileTree.set(itemId, { ...item, parentId: newParentId })
    }
  }, [yFileTree])

  const handleRestore = useCallback((snapshot) => {
    handleSnapshot("Auto-saved before restore").then(() => {
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
    })
  }, [ydoc, yFileTree, getFileTreeObj, handleSnapshot])

  const handleDiff = useCallback((snapshot) => {
    setDiffSnapshot(snapshot)
    setShowHistory(false)
  }, [])

  const handleCompareTwoSnapshots = useCallback((snap1, snap2) => {
    setCompareSnapshots({ left: snap1, right: snap2 })
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

  const sidebarCollapsed = sidebarWidth < 80

  const handleDownloadFile = useCallback(() => {
    if (!selectedFile || !selectedFileId) return
    const content = getFileContent(selectedFileId)
    downloadFile(selectedFile.name, content)
  }, [selectedFile, selectedFileId, getFileContent])

  const handleDownloadProject = useCallback(() => {
    downloadProjectAsZip(getFileTreeObj(), getFileContent)
  }, [getFileTreeObj, getFileContent])

  const handleInsertSnippet = useCallback((code) => {
    const editor = editorRef.current
    if (!editor) return
    const selection = editor.getSelection()
    const model = editor.getModel()
    if (!model || !selection) return
    editor.executeEdits("snippet-insert", [{
      range: selection,
      text: code,
    }])
  }, [])

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    isResizingRef.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth

    const onMouseMove = (e) => {
      if (!isResizingRef.current) return
      const delta = e.clientX - startX
      const newWidth = Math.max(44, Math.min(320, startWidth + delta))
      setSidebarWidth(newWidth)
    }

    const onMouseUp = () => {
      isResizingRef.current = false
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
    }

    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }, [sidebarWidth])

  useEffect(() => {
    setCameraToastDismissed(false)
  }, [Object.keys(remoteStreams).length])

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
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault()
        setShowRunner(true)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave, handleQuickSnapshot])

  return (
    <main className="h-screen w-full bg-gray-950 flex gap-4 p-4">
      <aside
        className="h-full bg-gray-900 rounded-lg flex flex-col border border-gray-700 shrink-0 relative overflow-hidden"
        style={{ width: sidebarWidth, minWidth: 44, maxWidth: 320 }}
      >
        {/* Dashboard */}
        {sidebarCollapsed ? (
          <div className="flex justify-center py-2">
            <button
              onClick={() => navigate("/")}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Dashboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="px-3 py-2 border-b border-gray-700">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Dashboard
            </button>
          </div>
        )}

        {/* File Explorer */}
        {sidebarCollapsed ? (
          <div className="flex justify-center py-2 border-b border-gray-700">
            <button
              onClick={() => {
                if (Object.keys(fileTree).length > 0) {
                  const firstFile = Object.values(fileTree).find((item) => item.type === "file")
                  if (firstFile) openTab(firstFile.id)
                }
              }}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="File Explorer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
          </div>
        ) : (
          <FileExplorer
            fileTree={fileTree}
            selectedFileId={selectedFileId}
            onSelect={(item) => openTab(item.id)}
            onCreateFile={handleCreateFile}
            onCreateFolder={handleCreateFolder}
            onRename={handleRename}
            onDelete={handleDelete}
            onMove={handleMove}
            readOnly={!canEdit}
          />
        )}

        {/* Users */}
        {sidebarCollapsed ? (
          <div className="px-2 py-2 border-t border-gray-700 flex flex-col items-center gap-1.5">
            {users.slice(0, 3).map((u, index) => (
              <div key={index} className="relative shrink-0" title={u.username + (u.username === user.username ? " (you)" : "")}>
                <UserAvatar user={u} />
                <span className="absolute bottom-0 right-0 block w-2 h-2 rounded-full border-2 border-gray-900">
                  <StatusDot status={u.status || "active"} />
                </span>
              </div>
            ))}
            {users.length > 3 && (
              <span className="text-[9px] text-gray-500">+{users.length - 3}</span>
            )}
          </div>
        ) : (
          <div className="px-2 py-1.5 border-t border-gray-700">
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Users ({users.length})</span>
            </div>
            <ul className="max-h-28 overflow-y-auto space-y-0.5">
              {users.map((u, index) => {
                const isMe = u.username === user.username
                const isFollowed = followedUser === u.username
                return (
                  <li
                    key={index}
                    className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-gray-800 transition-colors"
                  >
                  <div className="relative shrink-0">
                    <UserAvatar user={u} />
                    <span className="absolute bottom-0 right-0 block w-2.5 h-2.5 rounded-full border-2 border-gray-900">
                      <StatusDot status={u.status || "active"} />
                    </span>
                  </div>
                    <span className="text-xs font-medium truncate min-w-0" style={{ color: u.color }}>
                      {u.username}{isMe ? " (you)" : ""}
                    </span>
                    <RoleBadge role={u.role} />
                    <div className="flex items-center gap-0.5 shrink-0">
                      {u.handRaised && (
                        <span
                          className="text-[11px] cursor-pointer"
                          title={isOwner || isMe ? "Click to lower hand" : "Hand raised"}
                          onClick={() => {
                            if (isMe) toggleHand()
                          }}
                        >
                          &#9995;
                        </span>
                      )}
                      {u.audioEnabled && (
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 24 24" title="Mic On">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                      )}
                      {u.videoEnabled && (
                        <svg className="w-3 h-3 text-blue-400" fill="currentColor" viewBox="0 0 24 24" title="Video On">
                          <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                        </svg>
                      )}
                    </div>
                    <span className="text-[9px] text-gray-500 shrink-0">
                      {u.lastActive ? <RelativeTime timestamp={u.lastActive} /> : u.status}
                      {u.typing && !isMe && " ...typing"}
                    </span>
                    {!isMe && (
                      <button
                        onClick={() => setFollowedUser(isFollowed ? null : u.username)}
                        className={`ml-auto shrink-0 px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors cursor-pointer ${
                          isFollowed
                            ? "bg-amber-500 text-gray-950"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        {isFollowed ? "Unfollow" : "Follow"}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* Typing indicator */}
        {!sidebarCollapsed && typingUsers.length > 0 && (
          <div className="px-3 py-1">
            <div className="flex items-center gap-1.5">
              <span className="flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
              <span className="text-[10px] text-gray-400">
                {typingUsers.length === 1 ? `${typingUsers[0]} typing` : `${typingUsers.length} typing`}
              </span>
            </div>
          </div>
        )}

        {sidebarCollapsed && typingUsers.length > 0 && (
          <div className="flex justify-center py-1">
            <div className="flex gap-0.5" title={typingUsers.join(", ") + " typing"}>
              <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        {/* Following indicator */}
        {!sidebarCollapsed && followedUser && (
          <div className="px-3 py-1">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-[10px] text-amber-300 flex-1 truncate">Following {followedUser}</span>
              <button
                onClick={() => setScrollSyncEnabled(!scrollSyncEnabled)}
                className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors cursor-pointer ${
                  scrollSyncEnabled
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-gray-700 text-gray-400 border border-gray-600"
                }`}
                title={scrollSyncEnabled ? "Scroll sync ON - click to disable" : "Scroll sync OFF - click to enable"}
              >
                {scrollSyncEnabled ? "Scroll" : "NoScroll"}
              </button>
              <button
                onClick={() => setFollowedUser(null)}
                className="text-[9px] text-amber-400 hover:text-amber-300 font-semibold cursor-pointer"
              >
                Stop
              </button>
            </div>
          </div>
        )}

        {sidebarCollapsed && followedUser && (
          <div className="flex justify-center py-1">
            <button
              onClick={() => setFollowedUser(null)}
              className="p-1 rounded bg-amber-500/20 cursor-pointer"
              title={"Following " + followedUser + " - click to stop"}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse block" />
            </button>
          </div>
        )}

        {/* Bottom actions */}
        <div className={`mt-auto border-t border-gray-700 ${sidebarCollapsed ? "px-1.5 py-2 flex flex-col items-center gap-1.5" : "px-2 py-2 space-y-1.5"}`}>
          {!sidebarCollapsed && (
            <>
              {isOwner && (
                <button
                  onClick={() => setShowRoleManager(true)}
                  className="w-full flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors cursor-pointer"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Manage Room
                </button>
              )}
              <div className="flex gap-1">
                <button
                  onClick={toggleAudio}
                  className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    audioEnabled
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-600"
                  }`}
                  title={audioEnabled ? "Mute mic" : "Enable mic"}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                  {audioEnabled ? "Mute" : "Mic"}
                </button>
                <button
                  onClick={toggleVideo}
                  className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    videoEnabled
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-600"
                  }`}
                  title={videoEnabled ? "Stop video" : "Start video"}
                >
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                  </svg>
                  {videoEnabled ? "Stop" : "Cam"}
                </button>
                <button
                  onClick={toggleHand}
                  className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    handRaised
                      ? "bg-amber-500 text-gray-950"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-600"
                  }`}
                  title={handRaised ? "Lower hand" : "Raise hand"}
                >
                  &#9995;
                  {handRaised ? "Lower" : "Hand"}
                </button>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setShowGallery(true)}
                  className="flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-600 transition-colors cursor-pointer"
                  title="Video Gallery"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                  Gallery
                </button>
                <button
                  onClick={() => { setShowChat(!showChat); if (!showChat) setShowComments(false) }}
                  className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    showChat
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                      : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white border border-gray-600"
                  }`}
                  title="Chat"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Chat
                </button>
                <button
                  onClick={() => setShowShare(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 text-gray-950 hover:bg-amber-400 transition-all duration-200 shadow-md hover:scale-[1.02] active:scale-95 cursor-pointer"
                  title="Share Room (QR Code, Copy Link & Social)"
                >
                  <span>🔗</span>
                  <span>Share</span>
                </button>
              </div>
              <button
                onClick={logout}
                className="w-full px-1.5 py-1 rounded text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </>
          )}
          {sidebarCollapsed && (
            <>
              <button
                onClick={toggleAudio}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  audioEnabled
                    ? "bg-green-500/20 text-green-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
                title={audioEnabled ? "Mute mic" : "Enable mic"}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </button>
              <button
                onClick={toggleVideo}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  videoEnabled
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
                title={videoEnabled ? "Stop video" : "Start video"}
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                </svg>
              </button>
              <button
                onClick={toggleHand}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  handRaised
                    ? "bg-amber-500 text-gray-950"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
                title={handRaised ? "Lower hand" : "Raise hand"}
              >
                &#9995;
              </button>
              <button
                onClick={() => setShowGallery(true)}
                className="p-1.5 rounded text-gray-400 hover:bg-gray-800 hover:text-white transition-colors cursor-pointer"
                title="Video Gallery"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => { setShowChat(!showChat); if (!showChat) setShowComments(false) }}
                className={`p-1.5 rounded transition-colors cursor-pointer ${
                  showChat
                    ? "bg-amber-500/20 text-amber-400"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
                }`}
                title="Chat"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
              <button
                onClick={() => setShowShare(true)}
                className="p-1.5 rounded text-amber-400 hover:bg-amber-500/20 transition-colors cursor-pointer"
                title="Share Room (QR Code & Social)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
              <button
                onClick={logout}
                className="p-1.5 rounded text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
                title="Sign out"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 right-0 h-full w-1 cursor-col-resize group z-10"
        >
          <div className="w-px h-full bg-transparent group-hover:bg-gray-500 transition-colors" />
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
          onToggleComments={() => { setShowComments(!showComments); if (!showComments) setShowChat(false) }}
          showComments={showComments}

          lastSaved={lastSavedTime ? new Date(lastSavedTime).toLocaleTimeString() : null}
          isSaving={isSaving}
          onRun={() => setShowRunner(true)}
          onSnippets={() => setShowSnippets(true)}
          onTestCases={() => setShowTestCases(true)}
          onDownloadFile={handleDownloadFile}
          onDownloadProject={handleDownloadProject}
          readOnly={!canEdit}
          onOpenShare={() => setShowShare(true)}
          showTerminal={showTerminal}
          onToggleTerminal={() => setShowTerminal(!showTerminal)}
          showGit={showGit}
          onToggleGit={() => { setShowGit(!showGit); if (!showGit) { setShowComments(false); setShowChat(false) } }}
        />
        <TabBar
          tabs={openTabs.map(id => ({
            id,
            name: fileTree[id]?.name || id,
            dirty: false
          })).filter(t => fileTree[t.id])}
          activeTabId={selectedFileId}
          onTabClick={openTab}
          onTabDoubleClick={(id) => { if (previewFileIdRef.current === id) previewFileIdRef.current = null }}
          onTabClose={closeTab}
          onTabCloseOthers={closeOtherTabs}
          onTabCloseAll={closeAllTabs}
          onTabCloseRight={closeTabsToRight}
        />

        <div className="flex-1 overflow-hidden relative flex flex-col">
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
                    minimap: { enabled: true, scale: 1 },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    tabSize: 2,
                    glyphMargin: true,
                    readOnly: !canEdit,
                  }}
                />
                <MouseOverlay positions={remoteMousePositions} />
                <MinimapOverlay
                  editorRef={editorRef}
                  users={users}
                  localUsername={user?.username}
                  monaco={monaco}
                />
                {selectionInfo && (
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setPendingPrefill({
                        startLine: selectionInfo.startLine,
                        endLine: selectionInfo.endLine,
                        selectedText: selectionInfo.selectedText,
                      })
                      setShowComments(true)
                      setShowChat(false)
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
          {showTerminal && (
            <TerminalPanel
              socket={chatSocket}
              roomId={roomId}
              onClose={() => setShowTerminal(false)}
            />
          )}
        </div>

        <StatusBar
          filename={selectedFileName}
          content={statusContent}
          isSaving={isSaving}
          lastSavedTime={lastSavedTime}
          usersCount={users.length}
          isSnapshotting={isSnapshotting}
          connectionStatus={chatSocket?.connected ? "connected" : "reconnecting"}
          onOpenShortcuts={() => setShowShortcuts(true)}
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

      {showGit && (
        <SourceControlPanel
          roomId={roomId}
          onClose={() => setShowGit(false)}
        />
      )}

      {showChat && (
        <div className="h-full w-80 bg-gray-900 rounded-lg border border-gray-700 flex flex-col shrink-0">
          <div className="flex items-center justify-between p-3 border-b border-gray-700">
            <h3 className="text-sm font-bold text-white">Chat</h3>
            <button
              onClick={() => setShowChat(false)}
              className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <ChatPanel roomId={roomId} user={user} socket={chatSocket} />
          </div>
        </div>
      )}

      {showHistory && (
        <SnapshotHistory
          roomId={roomId}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestore}
          onDiff={handleDiff}
          onCompareTwoSnapshots={handleCompareTwoSnapshots}
        />
      )}

      {showRoleManager && (
        <RoleManager
          roomId={roomId}
          members={members}
          bannedUsers={bannedUsers}
          settings={settings}
          isOwner={isOwner}
          onAddMember={addMember}
          onChangeRole={changeRole}
          onKick={kickUser}
          onBan={banUser}
          onUnban={unbanUser}
          onUpdateSettings={updateSettings}
          onRefresh={fetchMembers}
          onClose={() => setShowRoleManager(false)}
        />
      )}

      {showShare && (
        <ShareModal
          roomId={roomId}
          roomName={settings?.roomName}
          onClose={() => setShowShare(false)}
        />
      )}

      {showShortcuts && (
        <ShortcutsModal onClose={() => setShowShortcuts(false)} />
      )}

      <ToastNotification toasts={toasts} onDismiss={removeToast} />

      {roomAccessError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-2xl">
              🔒
            </div>
            <h3 className="text-base font-bold text-white">Invite Only Room</h3>
            <p className="text-xs text-gray-400">{roomAccessError}</p>
            <button
              onClick={() => navigate("/")}
              className="w-full px-4 py-2 rounded-lg bg-amber-500 text-gray-950 font-semibold text-xs hover:bg-amber-400 transition-colors cursor-pointer"
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {needsPassword && (
        <PasswordPrompt
          roomId={roomId}
          onVerified={() => {
            setNeedsPassword(false)
            setPasswordVerified(true)
            fetchProject()
            fetchMembers()
            if (chatSocket) {
              chatSocket.close()
              chatSocket.connect()
            }
          }}
          onCancel={() => navigate("/")}
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

      {showRunner && (
        <ExecutionPanel
          code={selectedFileId ? getFileContent(selectedFileId) : ""}
          language={selectedFileLanguage}
          onClose={() => { setShowRunner(false); setPendingTestCases(null) }}
          onInsertSnippet={(code, lang) => {
            setShowRunner(false)
            setShowSnippets(true)
          }}
          onOpenTestCases={() => {
            setShowRunner(false)
            setShowTestCases(true)
          }}
          testCases={pendingTestCases}
          onTestCasesConsumed={() => setPendingTestCases(null)}
        />
      )}

      {showTestCases && (
        <TestCaseManager
          currentLanguage={selectedFileLanguage}
          onClose={() => setShowTestCases(false)}
          onRunTestCases={(testCases) => {
            setShowTestCases(false)
            setPendingTestCases(testCases)
            setShowRunner(true)
          }}
        />
      )}

      {showSnippets && (
        <SnippetManager
          onInsertCode={handleInsertSnippet}
          onClose={() => setShowSnippets(false)}
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

      {compareSnapshots && (
        <DiffView
          leftLabel={compareSnapshots.left.message || compareSnapshots.left.label || "Snapshot 1"}
          rightLabel={compareSnapshots.right.message || compareSnapshots.right.label || "Snapshot 2"}
          snapshotFiles={(() => {
            try {
              const parsed = JSON.parse(compareSnapshots.left.data)
              return (parsed.files || []).map((f) => ({
                ...f,
                name: parsed.fileTree?.[f.id]?.name || f.id,
              }))
            } catch { return [] }
          })()}
          currentFiles={(() => {
            try {
              const parsed = JSON.parse(compareSnapshots.right.data)
              return (parsed.files || []).map((f) => ({
                ...f,
                name: parsed.fileTree?.[f.id]?.name || f.id,
              }))
            } catch { return [] }
          })()}
          onClose={() => setCompareSnapshots(null)}
        />
      )}
      {/* Raise hand notifications */}
      {showGallery && (
        <VideoGallery
          remoteStreams={remoteStreams}
          localStream={videoEnabled ? localStream : null}
          users={users}
          user={user}
          pinnedUser={pinnedUser}
          onPin={setPinnedUser}
          onClose={() => setShowGallery(false)}
        />
      )}
      {users.filter((u) => u.handRaised && u.username !== user?.username).map((u) => (
        <div
          key={u.username}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 shadow-lg backdrop-blur-sm"
        >
          <span className="text-lg">&#9995;</span>
          <span className="text-sm font-medium text-amber-300">{u.username} raised their hand</span>
          {isOwner && (
            <button
              onClick={() => {
                if (chatSocket) {
                  chatSocket.emit("chat-message", { roomId, text: `📢 Owner called on @${u.username}`, author: "System", isSystem: true })
                }
              }}
              className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500 text-gray-950 hover:bg-amber-400 cursor-pointer"
            >
              Call On
            </button>
          )}
        </div>
      ))}

      {/* Pinned user floating video window */}
      {pinnedUser && (() => {
        const pinnedUserData = users.find((u) => u.username === pinnedUser)
        if (!pinnedUserData) return null
        const stream = remoteStreams[pinnedUserData.username] || remoteStreams[pinnedUserData._id]
        if (!stream) return null
        return (
          <VideoWindow
            key={pinnedUser}
            stream={stream}
            label={pinnedUserData.username}
            color={pinnedUserData.color || "#60a5fa"}
            isLocal={false}
            onClose={() => setPinnedUser(null)}
          />
        )
      })()}

      {/* Camera on toast */}
      {(() => {
        const remoteCameraCount = Object.keys(remoteStreams).length
        if (remoteCameraCount === 0 || cameraToastDismissed) return null
        return (
          <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-gray-800/95 border border-gray-600 shadow-lg backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
            <span className="text-xs text-gray-300">
              {remoteCameraCount === 1 ? "1 person has" : `${remoteCameraCount} people have`} their camera on
            </span>
            <button
              onClick={() => { setShowGallery(true); setCameraToastDismissed(true) }}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer shrink-0"
            >
              See in Gallery
            </button>
            <button
              onClick={() => setCameraToastDismissed(true)}
              className="text-gray-500 hover:text-gray-300 transition-colors cursor-pointer shrink-0"
              title="Dismiss"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )
      })()}

      {/* Voice chat indicator bar */}
      {(audioEnabled || videoEnabled) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800/90 border border-gray-600 shadow-lg backdrop-blur-sm">
          {audioEnabled && (
            <span className="flex items-center gap-1 text-[10px] text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              Mic On
            </span>
          )}
          {videoEnabled && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              Video On
            </span>
          )}
          {Object.keys(remoteStreams).length > 0 && (
            <span className="text-[10px] text-gray-400">
              {Object.keys(remoteStreams).length} connected
            </span>
          )}
        </div>
      )}
    </main>
  )
}
