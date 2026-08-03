import { Fragment, useEffect, useRef, useState } from "react"
import AICodeBlock from "./AICodeBlock"

// ---- Lightweight Markdown renderer (fenced code, inline code, bold, italic,
// headings, lists, blockquotes, links, paragraphs). No HTML injection. ----

function renderInline(text) {
  const parts = String(text).split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]*\]\([^)]*\))/g)
  return parts
    .map((part, i) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return (
          <code key={i} className="px-1 py-0.5 rounded bg-gray-950 text-amber-300 text-[11px] font-mono">
            {part.slice(1, -1)}
          </code>
        )
      }
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        return <em key={i}>{part.slice(1, -1)}</em>
      }
      const link = part.match(/^\[([^\]]*)\]\(([^)]*)\)$/)
      if (link) {
        const href = safeLinkHref(link[2])
        if (!href) return <Fragment key={i}>{link[1] || link[2]}</Fragment>
        return (
          <a
            key={i}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-amber-400 hover:underline break-all"
          >
            {link[1] || link[2]}
          </a>
        )
      }
      return <Fragment key={i}>{part}</Fragment>
    })
    .filter((node) => node !== "")
}

function safeLinkHref(rawHref) {
  const href = String(rawHref || "").trim()
  if (!href) return null
  try {
    const parsed = new URL(href, window.location.origin)
    if (parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:") return href
  } catch {}
  return null
}

function renderTextBlock(text, onInsert, keyBase) {
  const lines = String(text).split("\n")
  const elements = []
  let paragraph = []
  let list = []
  let listKey = 0

  const flushParagraph = () => {
    if (paragraph.length) {
      elements.push(
        <p key={keyBase + "-p" + elements.length} className="text-sm text-gray-200 leading-relaxed">
          {paragraph.map((line, i) => (
            <Fragment key={i}>
              {renderInline(line)}
              {i < paragraph.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      )
      paragraph = []
    }
  }

  const flushList = () => {
    if (list.length) {
      elements.push(
        <ul key={keyBase + "-ul" + listKey++} className="text-sm text-gray-200 list-disc pl-4 space-y-1">
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flushParagraph()
      flushList()
      const level = heading[1].length
      const Tag = level === 1 ? "h3" : level === 2 ? "h4" : "h5"
      elements.push(
        <Tag key={keyBase + "-h" + elements.length} className="text-gray-100 font-semibold">
          {renderInline(heading[2])}
        </Tag>
      )
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      flushList()
      elements.push(
        <blockquote
          key={keyBase + "-q" + elements.length}
          className="text-sm text-gray-300 border-l-2 border-gray-600 pl-2"
        >
          {renderInline(quote[1])}
        </blockquote>
      )
      continue
    }

    const listItem = line.match(/^([-*]|\d+\.)\s+(.*)$/)
    if (listItem) {
      flushParagraph()
      list.push(renderInline(listItem[2]))
      continue
    }

    paragraph.push(raw)
  }

  flushParagraph()
  flushList()
  return elements
}

function Markdown({ text, onInsert }) {
  const blocks = []
  const codeRe = /```(\w+)?\n?([\s\S]*?)```/g
  let lastIndex = 0
  let match
  while ((match = codeRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({ type: "text", text: text.slice(lastIndex, match.index) })
    }
    blocks.push({ type: "code", language: match[1] || "", code: match[2].replace(/\n$/, "") })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) blocks.push({ type: "text", text: text.slice(lastIndex) })

  return (
    <div className="space-y-2">
      {blocks.map((block, i) =>
        block.type === "code" ? (
          <AICodeBlock key={i} language={block.language} code={block.code} onInsert={onInsert} />
        ) : (
          <Fragment key={i}>{renderTextBlock(block.text, onInsert, "b" + i)}</Fragment>
        )
      )}
    </div>
  )
}

function ProposalCard({ proposal, onApply, onDiscard }) {
  const busy = proposal.status === "applying" || proposal.status === "discarding"
  const done = proposal.status === "applied" || proposal.status === "discarded"
  return (
    <div className="rounded-lg border border-amber-500/40 bg-gray-900/80 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-700">
        <span className="text-[11px] text-amber-300 font-mono truncate" title={proposal.path}>
          {proposal.path}
        </span>
        <span className="text-[9px] text-gray-500 shrink-0">
          {proposal.mode === "create" ? "new file" : "proposed edit"}
        </span>
      </div>
      <pre className="max-h-40 overflow-auto text-[10px] text-gray-300 p-2 whitespace-pre-wrap font-mono">
        {proposal.diffText}
      </pre>
      <div className="flex items-center gap-2 px-3 py-2">
        {proposal.status === "applied" ? (
          <span className="text-[10px] text-green-400">Applied</span>
        ) : proposal.status === "discarded" ? (
          <span className="text-[10px] text-gray-500">Discarded</span>
        ) : (
          proposal.error && <span className="text-[10px] text-red-400 flex-1 min-w-0 truncate">{proposal.error}</span>
        )}
        <div className="flex gap-1 ml-auto shrink-0">
          <button
            onClick={() => onDiscard(proposal.id)}
            disabled={busy || done}
            className="px-2 py-1 text-[10px] rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Reject
          </button>
          <button
            onClick={() => onApply(proposal.id)}
            disabled={busy || done}
            className="px-2 py-1 text-[10px] rounded bg-green-500/20 text-green-300 hover:bg-green-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {proposal.status === "applying" ? "Applying…" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AIChatPanel({
  messages,
  streaming,
  error,
  model,
  models,
  selectedModel,
  onModelChange,
  search,
  searching,
  searchError,
  searchResults,
  proposals,
  toolLog,
  agentCanEdit,
  onSend,
  sendAgent,
  stop,
  clear,
  applyProposal,
  discardProposal,
  onClose,
  onInsertAtCursor,
  onOpenFile,
}) {
  const [input, setInput] = useState("")
  const [tab, setTab] = useState("chat")
  const [query, setQuery] = useState("")
  const useRetrievalRef = useRef(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streaming])

  const handleSend = () => {
    if (!input.trim() || streaming) return
    if (tab === "agent") {
      sendAgent({ question: input.trim() })
    } else {
      onSend({ question: input.trim(), useRetrieval: useRetrievalRef.current })
      useRetrievalRef.current = false
    }
    setInput("")
  }

  const runSearch = () => {
    const q = query.trim()
    if (!q || searching) return
    search(q)
  }

  const askAboutResult = (r) => {
    setTab("chat")
    useRetrievalRef.current = true
    setInput(`Explain ${r.path} (lines ${r.startLine}-${r.endLine})`)
  }

  const searchEnabled = model?.searchEnabled === true

  const fmtTokens = (n) => (n == null ? "–" : n.toLocaleString("en-US"))

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-bold text-white">AI Assistant</h3>
          {models.length > 0 ? (
            <select
              value={selectedModel || model?.model || ""}
              onChange={(e) => onModelChange?.(e.target.value)}
              disabled={streaming}
              title="Model"
              className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 font-mono truncate max-w-[150px] focus:border-amber-500 focus:outline-none disabled:opacity-50 cursor-pointer"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            model?.model && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 font-mono truncate max-w-[140px]">
                {model.model}
              </span>
            )
          )}
          {model?.enabled === false && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30 text-red-400">
              not configured
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {messages.length > 0 && tab === "chat" && (
            <button
              onClick={clear}
              className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Clear conversation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Close AI Assistant"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex items-center px-3 pt-2 pb-1 gap-1 shrink-0">
        <button
          onClick={() => setTab("chat")}
          className={`px-2.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
            tab === "chat" ? "bg-amber-500/20 text-amber-300" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setTab("agent")}
          className={`px-2.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
            tab === "agent" ? "bg-amber-500/20 text-amber-300" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Agent
        </button>
        {searchEnabled && (
          <button
            onClick={() => setTab("search")}
            className={`px-2.5 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
              tab === "search" ? "bg-amber-500/20 text-amber-300" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Search
          </button>
        )}
      </div>

      {tab === "search" ? (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  runSearch()
                }
              }}
              placeholder="Search the repo... (semantic)"
              className="flex-1 px-3 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm border border-gray-700 focus:border-amber-500 focus:outline-none placeholder:text-gray-500"
            />
            <button
              onClick={runSearch}
              disabled={!query.trim() || searching}
              className="px-3 py-2 rounded-lg bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>

          {searchError && (
            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {searchError}
            </p>
          )}

          {searching && <p className="text-[11px] text-gray-500 animate-pulse">Searching…</p>}

          {!searching && !searchError && query && searchResults.length === 0 && (
            <p className="text-[11px] text-gray-500">No results.</p>
          )}

          {searchResults.map((r, i) => (
            <div key={i} className="rounded-lg bg-gray-800 border border-gray-700 p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-amber-300 font-mono truncate" title={r.path}>
                  {r.path}
                </span>
                <span className="text-[9px] text-gray-500 shrink-0">
                  L{r.startLine}-{r.endLine} · {r.score}
                </span>
              </div>
              <pre className="mt-1 text-[10px] text-gray-400 whitespace-pre-wrap line-clamp-4 font-mono">
                {r.text}
              </pre>
              <div className="mt-1.5 flex gap-1">
                <button
                  onClick={() => onOpenFile?.(r.path)}
                  className="px-2 py-1 text-[10px] rounded bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors cursor-pointer"
                >
                  Open
                </button>
                <button
                  onClick={() => askAboutResult(r)}
                  className="px-2 py-1 text-[10px] rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition-colors cursor-pointer"
                >
                  Ask AI
                </button>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {toolLog.length > 0 && (
              <details className="text-[10px] text-gray-500">
                <summary className="cursor-pointer select-none">
                  Tool activity ({toolLog.length})
                </summary>
                <div className="mt-1 space-y-0.5 font-mono">
                  {toolLog.map((t, i) => (
                    <div key={i} className="break-all">
                      <span className="text-amber-400/80">{t.name}</span>{" "}
                      <span className="text-gray-600">{JSON.stringify(t.args).slice(0, 120)}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-1">
                <svg className="w-8 h-8 mb-1 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-gray-500">Ask about this project</p>
                <p className="text-[10px] text-gray-600 max-w-[220px]">
                  Explain the current file, debug an error, refactor a selection, or ask how something works
                  across the repo.
                </p>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <div className="max-w-[85%] bg-amber-500/20 text-amber-100 rounded-lg rounded-tr-sm px-3 py-2 text-sm whitespace-pre-wrap">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="flex justify-start">
                    <div className="max-w-[95%] bg-gray-800 rounded-lg rounded-tl-sm px-3 py-2 text-sm text-gray-200">
                      {m.content ? <Markdown text={m.content} onInsert={onInsertAtCursor} /> : null}
                      {m.error && !m.content && (
                        <span className="text-red-400 text-xs">{m.error}</span>
                      )}
                      {m.streaming && (
                        <span className="inline-block w-1.5 h-3.5 bg-amber-400 animate-pulse align-middle" />
                      )}
                      {m.agent && !m.streaming && !m.content && !m.error && (
                        <span className="text-gray-500 text-xs">(no text response)</span>
                      )}
                      {m.proposals?.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {m.proposals.map((pid) => {
                            const prop = proposals.find((p) => p.id === pid)
                            return prop ? (
                              <ProposalCard
                                key={pid}
                                proposal={prop}
                                onApply={applyProposal}
                                onDiscard={discardProposal}
                              />
                            ) : null
                          })}
                        </div>
                      )}
                      {m.usage && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-gray-500 font-mono">
                          <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span>
                            {fmtTokens(m.usage.inputTokens)} in · {fmtTokens(m.usage.outputTokens)} out ·{" "}
                            {fmtTokens(m.usage.totalTokens)} total
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )
            )}
            <div ref={endRef} />
          </div>

          {error && (
            <div className="mx-3 mb-1 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="p-3 border-t border-gray-700 shrink-0">
            {tab === "agent" && agentCanEdit === false && (
              <p className="mb-2 text-[10px] text-gray-500">
                Read-only mode: the agent can inspect and propose edits, but they cannot be applied.
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
                placeholder={tab === "agent" ? "Ask the agent to edit, explain, or debug... (Ctrl+K)" : "Ask about this project, or ask it to create/edit files... (Ctrl+K)"}
                className="flex-1 px-3 py-2 rounded-lg bg-gray-800 text-gray-200 text-sm border border-gray-700 focus:border-amber-500 focus:outline-none placeholder:text-gray-500"
                disabled={model?.enabled === false}
              />
              {streaming ? (
                <button
                  onClick={stop}
                  className="px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30 border border-red-500/30 transition-colors cursor-pointer"
                >
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || model?.enabled === false}
                  className="px-3 py-2 rounded-lg bg-amber-500 text-gray-950 text-sm font-semibold hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  title="Send (Enter)"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
