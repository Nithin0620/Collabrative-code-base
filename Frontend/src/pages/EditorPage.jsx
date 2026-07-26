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

  const handleSnapshot = useCallback(async () => {
    setIsSnapshotting(true)
    try {
      const ft = getFileTreeObj()
      const files = Object.values(ft)
        .filter((item) => item.type === "file")
        .map((item) => ({
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
        body: JSON.stringify({ data, label: "v" + version }),
      })
    } catch (err) {
      console.error("Snapshot failed:", err)
    } finally {
      setIsSnapshotting(false)
    }
  }, [roomId, theme, fontSize, getFileTreeObj, getFileContent])

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
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleSave])

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

        <div className="p-3 border-t border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <UserAvatar user={user} />
              <span className="absolute -bottom-0.5 -right-0.5 block w-3 h-3 rounded-full border-2 border-gray-900">
                <StatusDot status={usersMap.get(user.username)?.status || "active"} />
              </span>
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className="text-sm font-semibold truncate"
                style={{ color: user.color }}
              >
                {user.username}
              </span>
              <span className="text-[10px] text-gray-400">
                {user.isGuest ? "Guest" : "Signed in"}
              </span>
            </div>
          </div>
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
          onSnapshot={handleSnapshot}
          onShowHistory={() => setShowHistory(true)}
          lastSaved={lastSavedTime ? new Date(lastSavedTime).toLocaleTimeString() : null}
          isSaving={isSaving}
        />

        <div className="flex-1 overflow-hidden">
          {selectedFileId ? (
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
              }}
            />
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

      {showHistory && (
        <SnapshotHistory
          roomId={roomId}
          onClose={() => setShowHistory(false)}
          onRestore={handleRestore}
        />
      )}
    </main>
  )
}
