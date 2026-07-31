import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

// Single terminal instance
function TerminalInstance({ terminalId, roomId, socket, isActive, onReady, onClose }) {
  const containerRef = useRef(null)
  const termRef = useRef(null)
  const fitAddonRef = useRef(null)
  const isReadyRef = useRef(false)
  const [ports, setPorts] = useState({})

  const requestPorts = useCallback(() => {
    if (socket && isReadyRef.current) {
      socket.emit('terminal:ports', { terminalId })
    }
  }, [socket, terminalId])

  useEffect(() => {
    if (!containerRef.current) return

    // Create xterm instance
    const term = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#d4d4d4',
        cursor: '#f59e0b',
        cursorAccent: '#0a0a0f',
        selection: 'rgba(245, 158, 11, 0.3)',
        black: '#1e1e2e',
        red: '#f38ba8',
        green: '#a6e3a1',
        yellow: '#f9e2af',
        blue: '#89b4fa',
        magenta: '#cba6f7',
        cyan: '#89dceb',
        white: '#cdd6f4',
        brightBlack: '#585b70',
        brightRed: '#f38ba8',
        brightGreen: '#a6e3a1',
        brightYellow: '#f9e2af',
        brightBlue: '#89b4fa',
        brightMagenta: '#cba6f7',
        brightCyan: '#89dceb',
        brightWhite: '#cdd6f4',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    termRef.current = term
    fitAddonRef.current = fitAddon

    term.open(containerRef.current)
    fitAddon.fit()
    term.writeln('\x1b[36m╔══════════════════════════════════════╗\x1b[0m')
    term.writeln('\x1b[36m║  \x1b[33m🐳 Docker Sandbox Terminal\x1b[36m          ║\x1b[0m')
    term.writeln('\x1b[36m╚══════════════════════════════════════╝\x1b[0m')
    term.writeln('\x1b[90mConnecting to sandbox...\x1b[0m')
    term.writeln('')

    // Send input to server (only after ready)
    term.onData((data) => {
      if (socket && isReadyRef.current) {
        socket.emit('terminal:input', { terminalId, input: data })
      }
    })

    // Register listeners BEFORE emitting create to avoid race
    const onOutput = ({ terminalId: tid, data }) => {
      if (tid === terminalId) term.write(data)
    }
    const onReady_ = ({ terminalId: tid }) => {
      if (tid === terminalId) {
        isReadyRef.current = true
        term.writeln('\x1b[32m✓ Connected to sandbox\x1b[0m')
        term.writeln('')
        requestPorts()
        if (onReady) onReady()
      }
    }
    const onClosed = ({ terminalId: tid }) => {
      if (tid === terminalId) {
        isReadyRef.current = false
        term.writeln('')
        term.writeln('\x1b[31m● Session ended\x1b[0m')
      }
    }
    const onError = ({ terminalId: tid, message }) => {
      if (tid === terminalId) {
        term.writeln(`\x1b[31m✗ Error: ${message}\x1b[0m`)
      }
    }
    const onPorts = ({ terminalId: tid, ports: p }) => {
      if (tid === terminalId) setPorts(p || {})
    }

    if (socket) {
      socket.on('terminal:output', onOutput)
      socket.on('terminal:ready', onReady_)
      socket.on('terminal:closed', onClosed)
      socket.on('terminal:error', onError)
      socket.on('terminal:ports', onPorts)
    }

    // Poll for active dev-server ports while the terminal is open
    const portPoll = setInterval(() => requestPorts(), 5000)

    // Create terminal session on server
    const cols = term.cols
    const rows = term.rows
    if (socket) {
      socket.emit('terminal:create', { terminalId, roomId, cols, rows })
    }

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (socket) {
          socket.emit('terminal:resize', { terminalId, cols: term.cols, rows: term.rows })
        }
      } catch {}
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      clearInterval(portPoll)
      if (socket) {
        socket.off('terminal:output', onOutput)
        socket.off('terminal:ready', onReady_)
        socket.off('terminal:closed', onClosed)
        socket.off('terminal:error', onError)
        socket.off('terminal:ports', onPorts)
        socket.emit('terminal:kill', { terminalId })
      }
      resizeObserver.disconnect()
      term.dispose()
      isReadyRef.current = false
    }
  }, [terminalId, roomId, socket, requestPorts])

  // Focus when active
  useEffect(() => {
    if (isActive && termRef.current) {
      termRef.current.focus()
    }
  }, [isActive])

  const portEntries = Object.entries(ports)
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost'

  return (
    <div
      className="flex-1 overflow-hidden flex flex-col"
      style={{ display: isActive ? 'flex' : 'none' }}
    >
      <div ref={containerRef} className="flex-1 overflow-hidden" />
      {portEntries.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-2 py-1 border-t border-gray-700 bg-gray-900/80 overflow-x-auto">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest shrink-0">
            Ports
          </span>
          {portEntries.map(([cPort, hPort]) => {
            const url = `http://${host}:${hPort}`
            return (
              <a
                key={cPort}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-gray-800 text-green-400 hover:bg-green-500/10 hover:text-green-300 border border-gray-700 hover:border-green-500/40 transition-colors cursor-pointer shrink-0"
                title={`Open port ${cPort}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                <span>{cPort}</span>
                <svg className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Multi-terminal panel
export default function TerminalPanel({ socket, roomId, visible = true, onClose, onHeightChange }) {
  const [terminals, setTerminals] = useState([{ id: 'term-1', label: 'bash' }])
  const [activeTermId, setActiveTermId] = useState('term-1')
  const [counter, setCounter] = useState(2)
  const panelRef = useRef(null)
  const isResizingRef = useRef(false)
  const [panelHeight, setPanelHeight] = useState(300)

  const addTerminal = useCallback(() => {
    const id = `term-${counter}`
    setTerminals((prev) => [...prev, { id, label: `bash ${counter}` }])
    setActiveTermId(id)
    setCounter((c) => c + 1)
  }, [counter])

  const closeTerminal = useCallback((id) => {
    socket?.emit('terminal:kill', { terminalId: id })
    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeTermId === id) {
        setActiveTermId(next.length > 0 ? next[next.length - 1].id : null)
      }
      return next
    })
  }, [activeTermId, socket, onClose])

  // Resize panel by dragging top edge
  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    isResizingRef.current = true
    const startY = e.clientY
    const startHeight = panelHeight

    const onMove = (e) => {
      if (!isResizingRef.current) return
      const delta = startY - e.clientY
      const newHeight = Math.max(120, Math.min(window.innerHeight * 0.7, startHeight + delta))
      setPanelHeight(newHeight)
      onHeightChange?.(newHeight)
    }
    const onUp = () => {
      isResizingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'row-resize'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [panelHeight, onHeightChange])

  return (
    <div
      ref={panelRef}
      className="flex flex-col bg-gray-950 border-t border-gray-700 shrink-0"
      style={{ height: panelHeight, display: visible ? 'flex' : 'none' }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={handleResizeStart}
        className="h-1 bg-transparent hover:bg-amber-500/50 cursor-row-resize transition-colors shrink-0 group"
      >
        <div className="h-px bg-gray-700 group-hover:bg-amber-500/30 transition-colors" />
      </div>

      {/* Terminal tab bar */}
      <div className="flex items-center bg-gray-900 border-b border-gray-700 h-8 px-2 gap-1 shrink-0">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mr-2">Terminal</span>

        <div className="flex-1 flex items-center gap-0.5 overflow-x-auto">
          {terminals.map((t) => (
            <div
              key={t.id}
              className={`group flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm text-[11px] font-medium cursor-pointer transition-colors ${
                activeTermId === t.id
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
              }`}
              onClick={() => setActiveTermId(t.id)}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
              <span>{t.label}</span>
              <button
                className="w-3 h-3 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-gray-600 text-gray-400 hover:text-white transition-all"
                onClick={(e) => { e.stopPropagation(); closeTerminal(t.id) }}
              >
                <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={addTerminal}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="New Terminal (Ctrl+Shift+`)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Hide Terminal"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal instances */}
      <div className="flex-1 overflow-hidden flex flex-col p-1">
        {terminals.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-4 text-center text-gray-500">
            <div className="space-y-3 max-w-sm">
              <p className="text-sm text-gray-300">No terminals are open</p>
              <p className="text-xs leading-5">
                Create a new shell tab to run commands inside the live project workspace.
              </p>
              <button
                onClick={addTerminal}
                className="px-3 py-1.5 rounded bg-amber-500 text-gray-950 text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer"
              >
                New Terminal
              </button>
            </div>
          </div>
        ) : (
          terminals.map((t) => (
            <TerminalInstance
              key={t.id}
              terminalId={t.id}
              roomId={roomId}
              socket={socket}
              isActive={activeTermId === t.id}
              onClose={() => closeTerminal(t.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
