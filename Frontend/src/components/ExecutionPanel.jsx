import { useState, useRef, useEffect } from "react"

const LANGUAGES = [
  { id: "javascript", label: "JavaScript", ext: ".js" },
  { id: "python", label: "Python", ext: ".py" },
  { id: "java", label: "Java", ext: ".java" },
  { id: "cpp", label: "C++", ext: ".cpp" },
  { id: "c", label: "C", ext: ".c" },
  { id: "ruby", label: "Ruby", ext: ".rb" },
  { id: "go", label: "Go", ext: ".go" },
]

export default function ExecutionPanel({
  code,
  language: fileLanguage,
  onClose,
  onInsertSnippet,
}) {
  const [stdin, setStdin] = useState("")
  const [output, setOutput] = useState(null)
  const [running, setRunning] = useState(false)
  const [selectedLang, setSelectedLang] = useState(fileLanguage || "javascript")
  const outputRef = useRef(null)

  useEffect(() => {
    if (fileLanguage) {
      const match = LANGUAGES.find((l) => l.id === fileLanguage)
      if (match) setSelectedLang(fileLanguage)
    }
  }, [fileLanguage])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output])

  const handleRun = async () => {
    if (!code?.trim()) return
    setRunning(true)
    setOutput(null)
    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          language: selectedLang,
          code,
          stdin: stdin || undefined,
        }),
      })
      const data = await res.json()
      setOutput(data)
    } catch (err) {
      setOutput({
        stdout: "",
        stderr: "Network error: " + err.message,
        exitCode: 1,
        time: 0,
      })
    } finally {
      setRunning(false)
    }
  }

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      handleRun()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "70vw", height: "75vh", maxWidth: 900 }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700 bg-gray-800/50">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-white">Code Runner</h2>
            <select
              value={selectedLang}
              onChange={(e) => setSelectedLang(e.target.value)}
              className="bg-gray-700 border border-gray-600 text-gray-200 text-xs rounded px-2 py-1 focus:outline-none focus:border-gray-500 cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-gray-500">Ctrl+Enter to run</span>
          </div>
          <div className="flex items-center gap-2">
            {onInsertSnippet && (
              <button
                onClick={() => onInsertSnippet(code, selectedLang)}
                className="px-2.5 py-1 rounded bg-gray-700 border border-gray-600 text-gray-300 text-xs hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
              >
                Save Snippet
              </button>
            )}
            <button
              onClick={handleRun}
              disabled={running || !code?.trim()}
              className="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {running ? (
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Run
                </span>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Stdin panel */}
          <div className="w-1/2 flex flex-col border-r border-gray-700">
            <div className="px-3 py-1.5 border-b border-gray-700 bg-gray-800/30">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Input (stdin)</span>
            </div>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Optional input for your program..."
              className="flex-1 bg-transparent text-gray-200 text-xs font-mono p-3 resize-none focus:outline-none placeholder:text-gray-600"
              spellCheck={false}
            />
          </div>

          {/* Output panel */}
          <div className="w-1/2 flex flex-col">
            <div className="px-3 py-1.5 border-b border-gray-700 bg-gray-800/30 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Output</span>
              {output && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`font-mono ${output.exitCode === 0 ? "text-green-400" : "text-red-400"}`}>
                    exit: {output.exitCode}
                  </span>
                  {output.time != null && (
                    <span className="text-gray-500">{output.time}ms</span>
                  )}
                  {output.phase === "compile" && (
                    <span className="text-yellow-400">compile error</span>
                  )}
                </div>
              )}
            </div>
            <div
              ref={outputRef}
              className="flex-1 overflow-y-auto p-3 text-xs font-mono whitespace-pre-wrap"
            >
              {!output && !running && (
                <span className="text-gray-600">Click "Run" or press Ctrl+Enter to execute...</span>
              )}
              {running && (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="w-3 h-3 border-2 border-gray-600 border-t-green-400 rounded-full animate-spin" />
                  Executing...
                </div>
              )}
              {output && !running && (
                <>
                  {output.stderr ? (
                    <span className="text-red-400">{output.stderr}</span>
                  ) : output.stdout ? (
                    <span className="text-green-300">{output.stdout}</span>
                  ) : (
                    <span className="text-gray-500">(no output)</span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
