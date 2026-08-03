import { useCallback, useEffect, useRef, useState } from "react"
import { buildContextSnapshot } from "../lib/aiContext"

const STORAGE_PREFIX = "ai-chat:"
const MODEL_STORAGE_PREFIX = "ai-model:"

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// Requests that imply the model should take action on the codebase (create a
// file, add a feature, etc.) get routed through the agent tool flow so the
// result arrives as real file/folder proposals the user can approve. Pure
// informational questions stay on the plain chat path.
const TASK_RE = /\b(create|make|add|build|write|generate|implement|set\s*up|init|scaffold|new\s+(file|folder|project|directory|dir|component)|rename|delete|remove|refactor|convert|move|fix)\b/i
const INFO_RE = /^(what('s| is| are| does)|why|who|when|where|explain|describe|define|tell\s+me\s+(about|what)|summarize|how\s+does|difference\s+between)\b/i

function isTaskRequest(text) {
  const t = String(text || "").trim()
  if (!t) return false
  if (INFO_RE.test(t)) return false
  return TASK_RE.test(t)
}

function storageKey(roomId, userKey) {
  return STORAGE_PREFIX + (userKey || "anonymous") + ":" + roomId
}

function modelStorageKey(roomId, userKey) {
  return MODEL_STORAGE_PREFIX + (userKey || "anonymous") + ":" + roomId
}

function loadHistory(roomId, userKey) {
  try {
    const raw = localStorage.getItem(storageKey(roomId, userKey))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {}
  return []
}

export default function useAIChat({ roomId, user, ydoc, fileTree, selectedFileId, openTabs, onApply }) {
  const userKey = user?._id?.toString() || user?.id?.toString() || user?.username || "anonymous"
  const [messages, setMessages] = useState(() => loadHistory(roomId, userKey))
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState(null)
  const [model, setModel] = useState({ enabled: true })
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [proposals, setProposals] = useState([])
  const [toolLog, setToolLog] = useState([])
  const [agentCanEdit, setAgentCanEdit] = useState(false)
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModelState] = useState(() => {
    try {
      return localStorage.getItem(modelStorageKey(roomId, userKey)) || ""
    } catch {
      return ""
    }
  })
  const abortRef = useRef(null)
  const messagesRef = useRef(messages)
  const proposalsRef = useRef(proposals)
  const streamingRef = useRef(false)
  const searchingRef = useRef(false)
  const selectedModelRef = useRef(selectedModel)
  messagesRef.current = messages
  proposalsRef.current = proposals
  selectedModelRef.current = selectedModel

  useEffect(() => {
    abortRef.current?.abort()
    streamingRef.current = false
    searchingRef.current = false
    setStreaming(false)
    setSearching(false)
    setError(null)
    setSearchError(null)
    setSearchResults([])
    setProposals([])
    setToolLog([])
    setAgentCanEdit(false)
    setMessages(loadHistory(roomId, userKey))
    try {
      setSelectedModelState(localStorage.getItem(modelStorageKey(roomId, userKey)) || "")
    } catch {
      setSelectedModelState("")
    }
  }, [roomId, userKey])

  useEffect(() => {
    try {
      const stored = messages
        .filter((m) => m.role === "user" || (m.role === "assistant" && !m.streaming))
        .map((m) => ({ role: m.role, content: m.content, ts: m.ts }))
      localStorage.setItem(storageKey(roomId, userKey), JSON.stringify(stored))
    } catch {}
  }, [messages, roomId, userKey])

  useEffect(() => {
    let cancelled = false
    fetch("/api/ai/" + roomId + "/conversation", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (d && Array.isArray(d.messages) && d.messages.length > 0 && messagesRef.current.length === 0) {
          setMessages(
            d.messages.map((m) => ({
              id: uid(),
              role: m.role,
              content: m.content || "",
              agent: !!m.agent,
              ts: new Date(m.ts).getTime(),
            }))
          )
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [roomId, userKey])

  useEffect(() => {
    fetch("/api/ai/config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setModel(d)
          setModels(d.models || [])
          setSelectedModelState((prev) => (prev && (d.models || []).includes(prev) ? prev : d.model || ""))
        }
      })
      .catch(() => {})
  }, [])

  const setSelectedModel = useCallback(
    (m) => {
      setSelectedModelState(m)
      try {
        localStorage.setItem(modelStorageKey(roomId, userKey), m)
      } catch {}
    },
    [roomId, userKey]
  )

  const send = useCallback(
    async ({ question, selectionInfo, cursor, useRetrieval, forceAgent }) => {
      const text = String(question || "").trim()
      if (!text || streamingRef.current) return
      streamingRef.current = true

      const isAgent = forceAgent === true || isTaskRequest(text)

      const history = messagesRef.current
        .filter((m) => m.role === "user" || (m.role === "assistant" && !m.streaming))
        .map((m) => ({ role: m.role, content: m.content }))
        .slice(-10)

      const userMsg = { id: uid(), role: "user", content: text, ts: Date.now() }
      const assistantMsg = {
        id: uid(),
        role: "assistant",
        content: "",
        ts: Date.now(),
        streaming: true,
        ...(isAgent ? { agent: true, proposals: [] } : {}),
      }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setError(null)
      setToolLog([])
      setStreaming(true)

      const snapshot = isAgent
        ? null
        : buildContextSnapshot({
            roomId,
            question: text,
            ydoc,
            fileTree,
            selectedFileId,
            openTabs,
            selection: selectionInfo,
            cursor,
            history,
            useRetrieval,
          })

      const controller = new AbortController()
      abortRef.current = controller

      const patchAssistant = (patch) =>
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m
          )
        )

      let usage = null

      try {
        const res = await fetch("/api/ai/" + roomId + (isAgent ? "/agent" : "/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            isAgent
              ? { question: text, history, model: selectedModelRef.current }
              : { ...snapshot, model: selectedModelRef.current }
          ),
          signal: controller.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.message || "Request failed (" + res.status + ")")
        }
        if (!res.body) throw new Error("No response body")

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let finished = false
        let assistantContent = ""

        while (!finished) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop()
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            const payload = trimmed.slice(5).trim()
            if (payload === "[DONE]") {
              finished = true
              break
            }
            let json
            try {
              json = JSON.parse(payload)
            } catch {
              continue
            }
            if (json.error) {
              throw new Error(json.error)
            } else if (json.meta) {
              setAgentCanEdit(json.meta.canEdit === true)
            } else if (typeof json.delta === "string" && json.delta.length > 0) {
              assistantContent += json.delta
              patchAssistant({ content: assistantContent })
            } else if (json.usage && (json.usage.inputTokens || json.usage.outputTokens)) {
              usage = json.usage
            } else if (json.tool && json.tool.name) {
              setToolLog((prev) => [...prev, { name: json.tool.name, args: json.tool.args || {}, ts: Date.now() }])
            } else if (json.proposal && json.proposal.id) {
              const prop = {
                id: json.proposal.id,
                path: json.proposal.path,
                diffText: json.proposal.diffText,
                mode: json.proposal.mode || "edit",
                status: "pending",
                error: null,
              }
              setProposals((prev) => (prev.some((p) => p.id === prop.id) ? prev : [prop, ...prev]))
              patchAssistant((m) => {
                const ids = m.proposals || []
                return { proposals: ids.includes(prop.id) ? ids : [...ids, prop.id] }
              })
            }
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return
        const message = err.message || "Something went wrong"
        setError(message)
        patchAssistant({ error: message })
      } finally {
        setStreaming(false)
        streamingRef.current = false
        patchAssistant({ streaming: false, ...(usage ? { usage } : {}) })
        abortRef.current = null
      }
    },
    [roomId, ydoc, fileTree, selectedFileId, openTabs]
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    setMessages([])
    setError(null)
    fetch("/api/ai/" + roomId + "/conversation", { method: "DELETE", credentials: "include" }).catch(() => {})
  }, [roomId])

  const search = useCallback(
    async (query, { topK = 5 } = {}) => {
      const q = String(query || "").trim()
      if (!q || searchingRef.current) return []
      searchingRef.current = true
      setSearching(true)
      setSearchError(null)
      try {
        const res = await fetch("/api/ai/" + roomId + "/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ query: q, topK }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.message || "Search failed (" + res.status + ")")
        }
        const data = await res.json()
        setSearchResults(data.results || [])
        return data.results || []
      } catch (err) {
        setSearchError(err.message || "Something went wrong")
        setSearchResults([])
        return []
      } finally {
        setSearching(false)
        searchingRef.current = false
      }
    },
    [roomId]
  )

  const updateProposal = useCallback((id, patch) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }, [])

  const sendAgent = useCallback((opts) => send({ ...opts, forceAgent: true }), [send])

  const applyProposal = useCallback(
    async (proposalId) => {
      const proposal = proposalsRef.current.find((p) => p.id === proposalId)
      if (!proposal || proposal.status === "applying" || proposal.status === "applied" || proposal.status === "discarded") {
        return
      }
      updateProposal(proposalId, { status: "applying", error: null })
      abortRef.current?.abort()
      try {
        const res = await fetch("/api/ai/" + roomId + "/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ proposalId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.message || "Apply failed (" + res.status + ")")
        }
        updateProposal(proposalId, { status: "applied", error: null })
        onApply?.(data.path, data.fileId)
      } catch (err) {
        updateProposal(proposalId, { status: "error", error: err.message || "Something went wrong" })
      }
    },
    [roomId, updateProposal, onApply]
  )

  const discardProposal = useCallback(
    async (proposalId) => {
      const proposal = proposalsRef.current.find((p) => p.id === proposalId)
      if (!proposal || proposal.status === "discarded" || proposal.status === "discarding") return
      updateProposal(proposalId, { status: "discarding", error: null })
      try {
        const res = await fetch("/api/ai/" + roomId + "/discard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ proposalId }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.message || "Discard failed (" + res.status + ")")
        }
        updateProposal(proposalId, { status: "discarded", error: null })
      } catch (err) {
        updateProposal(proposalId, { status: "error", error: err.message || "Something went wrong" })
      }
    },
    [roomId, updateProposal]
  )

  return {
    messages,
    streaming,
    error,
    model,
    searchResults,
    searching,
    searchError,
    proposals,
    toolLog,
    agentCanEdit,
    models,
    selectedModel,
    setSelectedModel,
    send,
    sendAgent,
    stop,
    clear,
    search,
    applyProposal,
    discardProposal,
  }
}
