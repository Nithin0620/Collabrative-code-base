import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { THEMES } from "../lib/themes"
import { getFileInfo } from "../lib/fileTree"

const H_PADDING = 24
const ITEM_GAP = 8
const BURGER_RESERVE = 40

const RANK = {
  save: 0,
  snapshot: 0,
  run: 0,
  markdown: 0,
  theme: 1,
  size: 1,
  history: 1,
  snippets: 2,
  tests: 2,
  download: 2,
  ai: 3,
  git: 3,
  terminal: 3,
  comments: 3,
  saved: 4,
}
const DIVIDER_RANK = 5

const MENU_ROW = "w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors cursor-pointer"

const MENU_STYLE = `
  @keyframes toolbarMenuIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes toolbarMenuOut {
    from { opacity: 1; transform: translateY(0) scale(1); }
    to { opacity: 0; transform: translateY(-6px) scale(0.97); }
  }
  .toolbar-menu-in { animation: toolbarMenuIn 0.2s cubic-bezier(0.16, 1, 0.3, 1); transform-origin: top right; }
  .toolbar-menu-out { animation: toolbarMenuOut 0.15s ease-in forwards; transform-origin: top right; }
  .toolbar-menu-item { opacity: 0; animation: toolbarMenuIn 0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
`

export default function EditorToolbar({
  filename,
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  onSave,
  onSnapshot,
  onShowHistory,
  onToggleComments,
  showComments,
  lastSaved,
  isSaving,
  onRun,
  onSnippets,
  onTestCases,
  onDownloadFile,
  onDownloadProject,
  readOnly,
  showTerminal,
  onToggleTerminal,
  onToggleGit,
  showGit,
  showAI,
  onToggleAI,
  showMarkdown,
  onToggleMarkdown,
}) {
  const lang = filename ? getFileInfo(filename) : null

  const rootRef = useRef(null)
  const fixedRef = useRef(null)
  const measureRef = useRef(null)
  const burgerRef = useRef(null)
  const menuRef = useRef(null)

  const [menuOpen, setMenuOpen] = useState(false)
  const [menuClosing, setMenuClosing] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [measurements, setMeasurements] = useState(null)

  const closeMenu = useCallback(() => {
    setDownloadOpen(false)
    setMenuClosing(true)
    window.setTimeout(() => {
      setMenuOpen(false)
      setMenuClosing(false)
    }, 150)
  }, [])

  const toggleMenu = useCallback(() => {
    if (menuOpen) {
      closeMenu()
    } else {
      setMenuClosing(false)
      setDownloadOpen(false)
      setMenuOpen(true)
    }
  }, [menuOpen, closeMenu])

  const items = useMemo(() => {
    const list = []

    list.push({
      key: "theme",
      rank: RANK.theme,
      render: (inMenu) =>
        inMenu ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-xs text-gray-400">Theme</span>
            <select
              value={theme}
              onChange={(e) => onThemeChange(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500 cursor-pointer"
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <label className="flex items-center gap-1.5 text-gray-400">
            <span className="text-xs">Theme</span>
            <select
              value={theme}
              onChange={(e) => onThemeChange(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500 cursor-pointer"
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ),
    })

    list.push({
      key: "size",
      rank: RANK.size,
      render: (inMenu) =>
        inMenu ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-xs text-gray-400">Font size</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))}
                className="w-6 h-6 flex items-center justify-center rounded bg-gray-900 border border-gray-700 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer"
              >
                -
              </button>
              <span className="text-xs text-gray-300 w-6 text-center tabular-nums">{fontSize}</span>
              <button
                onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
                className="w-6 h-6 flex items-center justify-center rounded bg-gray-900 border border-gray-700 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-gray-400">
            <span className="text-xs">Size</span>
            <button
              onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))}
              className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer"
            >
              -
            </button>
            <span className="text-xs text-gray-300 w-6 text-center tabular-nums">{fontSize}</span>
            <button
              onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
              className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer"
            >
              +
            </button>
          </div>
        ),
    })

    list.push({
      key: "spacer",
      type: "spacer",
      rank: -1,
      render: () => <div className="flex-1" />,
    })

    list.push({
      key: "d1",
      type: "divider",
      rank: DIVIDER_RANK,
      render: () => <div className="w-px h-4 bg-gray-700 shrink-0" />,
    })

    if (lastSaved) {
      list.push({
        key: "saved",
        rank: RANK.saved,
        render: (inMenu) =>
          inMenu ? (
            <div className="px-3 py-2 text-[10px] text-gray-500 border-b border-gray-700">
              {isSaving ? "Saving..." : `Saved ${lastSaved}`}
            </div>
          ) : (
            <span className="text-[10px] text-gray-500 whitespace-nowrap">
              {isSaving ? "Saving..." : `Saved ${lastSaved}`}
            </span>
          ),
      })
    }

    if (!readOnly) {
      list.push({
        key: "save",
        rank: RANK.save,
        render: (inMenu) => (
          <button
            onClick={onSave}
            disabled={isSaving}
            className={
              inMenu
                ? `${MENU_ROW} text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-50`
                : "px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
            }
          >
            Save
          </button>
        ),
      })
      list.push({
        key: "snapshot",
        rank: RANK.snapshot,
        render: (inMenu) => (
          <button
            onClick={onSnapshot}
            className={
              inMenu
                ? `${MENU_ROW} font-semibold text-amber-400 hover:bg-gray-700`
                : "px-2.5 py-1 rounded bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
            }
          >
            Snapshot
          </button>
        ),
      })
    }

    list.push({
      key: "history",
      rank: RANK.history,
      render: (inMenu) => (
        <button
          onClick={onShowHistory}
          className={
            inMenu
              ? `${MENU_ROW} text-gray-300 hover:bg-gray-700 hover:text-white`
              : "px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          }
        >
          History
        </button>
      ),
    })

    list.push({
      key: "d2",
      type: "divider",
      rank: DIVIDER_RANK,
      render: () => <div className="w-px h-4 bg-gray-700 shrink-0" />,
    })

    if (filename && (filename.endsWith('.md') || filename.endsWith('.markdown') || filename.toLowerCase() === 'readme')) {
      list.push({
        key: "markdown",
        rank: RANK.markdown,
        render: (inMenu) => (
          <button
            onClick={onToggleMarkdown}
            title="Toggle Markdown Preview"
            className={
              inMenu
                ? `${MENU_ROW} ${showMarkdown ? "text-amber-400 font-semibold" : "text-gray-300 hover:text-white"}`
                : `px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    showMarkdown
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm"
                      : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                  }`
            }
          >
            <span>👁️</span>
            <span>{showMarkdown ? "Hide Preview" : "Preview"}</span>
          </button>
        ),
      })
    }

    if (!readOnly) {
      list.push({
        key: "run",
        rank: RANK.run,
        render: (inMenu) => (
          <button
            onClick={onRun}
            title="Run code (Ctrl+Enter)"
            className={
              inMenu
                ? `${MENU_ROW} font-semibold text-green-400 hover:bg-gray-700`
                : "px-2.5 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors cursor-pointer"
            }
          >
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run
            </span>
          </button>
        ),
      })
    }

    list.push({
      key: "snippets",
      rank: RANK.snippets,
      render: (inMenu) => (
        <button
          onClick={onSnippets}
          title="Snippets"
          className={
            inMenu
              ? `${MENU_ROW} text-gray-300 hover:bg-gray-700 hover:text-white`
              : "px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          }
        >
          Snippets
        </button>
      ),
    })

    list.push({
      key: "tests",
      rank: RANK.tests,
      render: (inMenu) => (
        <button
          onClick={onTestCases}
          title="Custom Test Cases"
          className={
            inMenu
              ? `${MENU_ROW} text-gray-300 hover:bg-gray-700 hover:text-white`
              : "px-2.5 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
          }
        >
          Tests
        </button>
      ),
    })

    list.push({
      key: "d3",
      type: "divider",
      rank: DIVIDER_RANK,
      render: () => <div className="w-px h-4 bg-gray-700 shrink-0" />,
    })

    list.push({
      key: "download",
      rank: RANK.download,
      render: (inMenu) =>
        inMenu ? (
          <div>
            <button
              onClick={() => setDownloadOpen((o) => !o)}
              className={`${MENU_ROW} justify-between text-gray-300 hover:bg-gray-700 hover:text-white`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </span>
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${downloadOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {downloadOpen && (
              <div className="pl-8 pb-1.5">
                <button
                  onClick={onDownloadFile}
                  className="block w-full text-left px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  Current File
                </button>
                <button
                  onClick={onDownloadProject}
                  className="block w-full text-left px-3 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-gray-700 transition-colors cursor-pointer"
                >
                  Project (.zip)
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative group">
            <button
              className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-300 text-xs hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
              title="Download"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
            <div className="absolute right-0 top-full pt-1 z-50 hidden group-hover:block">
              <div className="bg-gray-800 border border-gray-700 rounded shadow-lg min-w-[120px]">
                <button
                  onClick={onDownloadFile}
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
                >
                  Current File
                </button>
                <button
                  onClick={onDownloadProject}
                  className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors border-t border-gray-700 cursor-pointer"
                >
                  Project (.zip)
                </button>
              </div>
            </div>
          </div>
        ),
    })

    list.push({
      key: "d4",
      type: "divider",
      rank: DIVIDER_RANK,
      render: () => <div className="w-px h-4 bg-gray-700 shrink-0" />,
    })

    list.push({
      key: "ai",
      rank: RANK.ai,
      render: (inMenu) => (
        <button
          onClick={onToggleAI}
          title="Toggle AI Assistant (Ctrl+K)"
          className={
            inMenu
              ? `${MENU_ROW} ${showAI ? "text-amber-400" : "text-gray-300 hover:text-white"}`
              : `px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  showAI
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`
          }
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          AI
        </button>
      ),
    })

    list.push({
      key: "git",
      rank: RANK.git,
      render: (inMenu) => (
        <button
          onClick={onToggleGit}
          title="Source Control"
          className={
            inMenu
              ? `${MENU_ROW} ${showGit ? "text-amber-400" : "text-gray-300 hover:text-white"}`
              : `px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  showGit
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`
          }
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-4H8l4-4 4 4h-3v4h-2z"/>
          </svg>
          Git
        </button>
      ),
    })

    list.push({
      key: "terminal",
      rank: RANK.terminal,
      render: (inMenu) => (
        <button
          onClick={onToggleTerminal}
          title="Toggle Terminal (Ctrl+`)"
          className={
            inMenu
              ? `${MENU_ROW} ${showTerminal ? "text-green-400" : "text-gray-300 hover:text-white"}`
              : `px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  showTerminal
                    ? "bg-green-500/20 text-green-400 border border-green-500/30"
                    : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`
          }
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Terminal
        </button>
      ),
    })

    list.push({
      key: "comments",
      rank: RANK.comments,
      render: (inMenu) => (
        <button
          onClick={onToggleComments}
          className={
            inMenu
              ? `${MENU_ROW} ${showComments ? "text-amber-400" : "text-gray-300 hover:text-white"}`
              : `px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                  showComments
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white"
                }`
          }
        >
          Comments
        </button>
      ),
    })

    return list
  }, [
    theme,
    onThemeChange,
    fontSize,
    onFontSizeChange,
    lastSaved,
    isSaving,
    readOnly,
    onSave,
    onSnapshot,
    onShowHistory,
    onRun,
    onSnippets,
    onTestCases,
    onDownloadFile,
    onDownloadProject,
    showAI,
    onToggleAI,
    showGit,
    onToggleGit,
    showTerminal,
    onToggleTerminal,
    showComments,
    onToggleComments,
    downloadOpen,
    filename,
    onToggleMarkdown,
    showMarkdown,
  ])

  const { visibleItems, overflowItems, hasOverflow } = useMemo(() => {
    if (!measurements || !items.length) {
      return { visibleItems: items, overflowItems: [], hasOverflow: false }
    }
    const { available, widths } = measurements
    const itemW = (it) => (it.type === "spacer" ? 0 : widths[it.key] || 0)
    const keptTotal = (flow) => flow.reduce((s, it) => s + itemW(it) + ITEM_GAP, 0)

    const total = keptTotal(items)
    if (total <= available + ITEM_GAP) {
      return { visibleItems: items, overflowItems: [], hasOverflow: false }
    }

    const budget = available - BURGER_RESERVE
    const overflowKeys = new Set()
    const removalOrder = [...items]
      .filter((it) => it.type !== "spacer")
      .sort((a, b) => {
        if (a.rank !== b.rank) return b.rank - a.rank
        return items.indexOf(b) - items.indexOf(a)
      })

    for (const it of removalOrder) {
      if (keptTotal(items.filter((x) => !overflowKeys.has(x.key))) <= budget) break
      overflowKeys.add(it.key)
    }

    const visible = items.filter((it) => !overflowKeys.has(it.key))
    const overflow = items.filter((it) => overflowKeys.has(it.key))
    while (visible.length && visible[visible.length - 1].type === "divider") visible.pop()
    return { visibleItems: visible, overflowItems: overflow, hasOverflow: true }
  }, [measurements, items])

  useLayoutEffect(() => {
    const measure = () => {
      const root = rootRef.current
      const fixed = fixedRef.current
      const measureEl = measureRef.current
      if (!root || !fixed || !measureEl) return
      const widths = {}
      for (const child of measureEl.children) {
        widths[child.dataset.key] = child.getBoundingClientRect().width
      }
      setMeasurements({
        available: root.getBoundingClientRect().width - fixed.getBoundingClientRect().width - H_PADDING,
        widths,
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (rootRef.current) ro.observe(rootRef.current)
    if (fixedRef.current) ro.observe(fixedRef.current)
    return () => ro.disconnect()
  }, [items])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target)) return
      if (burgerRef.current?.contains(e.target)) return
      closeMenu()
    }
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuOpen, closeMenu])

  useEffect(() => {
    if (!hasOverflow) {
      setMenuOpen(false)
      setMenuClosing(false)
      setDownloadOpen(false)
    }
  }, [hasOverflow])

  return (
    <>
      <style>{MENU_STYLE}</style>
      <div
        ref={rootRef}
        className="relative flex items-center gap-2 h-10 px-3 py-1.5 bg-gray-950 border-b border-gray-700 text-sm shrink-0"
      >
        <div ref={fixedRef} className="flex items-center gap-1.5 min-w-0">
          {filename && (
            <div className="flex items-center gap-1.5 text-gray-300 min-w-0">
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                style={{ backgroundColor: lang.color + "22", color: lang.color }}
              >
                {lang.label}
              </span>
              <span className="font-mono text-xs truncate">{filename}</span>
            </div>
          )}
          {readOnly && (
            <span className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-amber-400 text-[10px] font-semibold shrink-0">
              Read Only
            </span>
          )}
        </div>

        {visibleItems.map((it) => <Fragment key={it.key}>{it.render(false)}</Fragment>)}

        {hasOverflow && (
          <div className="relative" ref={burgerRef}>
            <button
              onClick={toggleMenu}
              title="More actions"
              className="relative w-8 h-8 flex items-center justify-center rounded bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
            >
              <span className="relative w-4 h-3">
                <span
                  className={`absolute left-0 top-0 h-0.5 w-4 bg-current transition-all duration-200 ${
                    menuOpen ? "translate-y-[5px] rotate-45" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 top-[5px] h-0.5 w-4 bg-current transition-all duration-200 ${
                    menuOpen ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`absolute left-0 bottom-0 h-0.5 w-4 bg-current transition-all duration-200 ${
                    menuOpen ? "-translate-y-[5px] -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
                className={`absolute right-0 top-full mt-1 z-50 min-w-[200px] ${
                  menuClosing ? "toolbar-menu-out" : "toolbar-menu-in"
                }`}
              >
                <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-2xl max-h-[70vh] overflow-y-auto py-1">
                  {overflowItems.map((it, idx) => {
                    if (it.type === "divider" || it.type === "spacer") return null
                    return (
                      <div
                        key={it.key}
                        className="toolbar-menu-item"
                        style={{ animationDelay: `${Math.min(idx * 20, 120)}ms` }}
                      >
                        {it.render(true)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div
          ref={measureRef}
          aria-hidden
          className="absolute top-0 -left-[9999px] flex items-center gap-2 invisible pointer-events-none whitespace-nowrap"
        >
          {items.map((it) => (
            <span key={it.key} data-key={it.key} className="inline-flex items-center">
              {it.render(false)}
            </span>
          ))}
        </div>
      </div>
    </>
  )
}
