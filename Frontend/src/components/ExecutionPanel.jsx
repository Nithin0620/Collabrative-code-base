import { useState, useRef, useEffect, useCallback } from "react"
import { io } from "socket.io-client"

const LANGUAGES = [
  { id: "javascript", label: "JavaScript", ext: ".js" },
  { id: "python", label: "Python", ext: ".py" },
  { id: "java", label: "Java", ext: ".java" },
  { id: "cpp", label: "C++", ext: ".cpp" },
  { id: "c", label: "C", ext: ".c" },
  { id: "ruby", label: "Ruby", ext: ".rb" },
  { id: "go", label: "Go", ext: ".go" },
]

function formatMemory(bytes) {
  if (!bytes || bytes === 0) return "—"
  if (bytes < 1024) return bytes + " B"
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
  return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}

export default function ExecutionPanel({
  code,
  language: fileLanguage,
  onClose,
  onInsertSnippet,
  onOpenTestCases,
  testCases,
  onTestCasesConsumed,
  token,
}) {
  const [stdin, setStdin] = useState("")
  const [output, setOutput] = useState(null)
  const [running, setRunning] = useState(false)
  const [selectedLang, setSelectedLang] = useState(fileLanguage || "javascript")
  const [executionId, setExecutionId] = useState(null)
  const [sandboxed, setSandboxed] = useState(null)
  const [testResults, setTestResults] = useState(null)
  const [streamingStdout, setStreamingStdout] = useState("")
  const [streamingStderr, setStreamingStderr] = useState("")
  const outputRef = useRef(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (fileLanguage) {
      const match = LANGUAGES.find((l) => l.id === fileLanguage)
      if (match) setSelectedLang(fileLanguage)
    }
  }, [fileLanguage])

  useEffect(() => {
    if (testCases?.length && code?.trim()) {
      handleRunAllTests(testCases)
      if (onTestCasesConsumed) onTestCasesConsumed()
    }
  }, [testCases, code, handleRunAllTests, onTestCasesConsumed])

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [output, streamingStdout, streamingStderr, testResults])

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  const getExecSocket = useCallback(() => {
    if (socketRef.current?.connected) return socketRef.current

    const sock = io("/", {
      transports: ["websocket"],
      auth: { token: token || "" },
    })
    socketRef.current = sock
    return sock
  }, [token])

  const handleRun = useCallback(async (stdinOverride) => {
    if (!code?.trim()) return
    setRunning(true)
    setOutput(null)
    setTestResults(null)
    setExecutionId(null)
    setStreamingStdout("")
    setStreamingStderr("")

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          language: selectedLang,
          code,
          stdin: stdinOverride !== undefined ? stdinOverride : (stdin || undefined),
        }),
      })
      const data = await res.json()
      const execId = data.executionId
      setExecutionId(execId)

      const sock = getExecSocket()
      sock.emit("join-execution", execId)

      const onStarted = () => {}
      const onChunk = (chunk) => {
        if (chunk.type === "stdout") {
          setStreamingStdout((prev) => prev + chunk.data)
        } else {
          setStreamingStderr((prev) => prev + chunk.data)
        }
      }
      const onDone = (result) => {
        setOutput(result)
        if (result.sandboxed !== undefined) setSandboxed(result.sandboxed)
        setRunning(false)
        sock.off("exec:started", onStarted)
        sock.off("exec:chunk", onChunk)
        sock.off("exec:done", onDone)
        sock.off("exec:error", onError)
      }
      const onError = (err) => {
        setOutput({
          stdout: "",
          stderr: err.message || "Execution failed",
          exitCode: 1,
          time: 0,
          memory: 0,
        })
        setRunning(false)
        sock.off("exec:started", onStarted)
        sock.off("exec:chunk", onChunk)
        sock.off("exec:done", onDone)
        sock.off("exec:error", onError)
      }

      sock.on("exec:started", onStarted)
      sock.on("exec:chunk", onChunk)
      sock.on("exec:done", onDone)
      sock.on("exec:error", onError)
    } catch (err) {
      setOutput({
        stdout: "",
        stderr: "Network error: " + err.message,
        exitCode: 1,
        time: 0,
        memory: 0,
      })
      setRunning(false)
    }
  }, [code, selectedLang, stdin, getExecSocket])

  const handleStop = useCallback(async () => {
    if (executionId) {
      try {
        await fetch(`/api/execute/${executionId}/stop`, {
          method: "POST",
          credentials: "include",
        })
      } catch {}
    }
    setRunning(false)
    setOutput((prev) => ({
      ...(prev || {}),
      stderr: (prev?.stderr ? prev.stderr + "\n" : "") + "Execution stopped by user.",
      exitCode: prev?.exitCode ?? 137,
      time: prev?.time || 0,
      memory: prev?.memory || 0,
    }))
  }, [executionId])

  const handleRunAllTests = useCallback(async (testCases) => {
    if (!code?.trim() || !testCases?.length) return
    setRunning(true)
    setOutput(null)
    setTestResults(null)

    const results = []
    for (const tc of testCases) {
      try {
        const res = await fetch("/api/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            language: selectedLang,
            code,
            stdin: tc.stdin || undefined,
          }),
        })
        const data = await res.json()
        const actual = (data.stdout || "").trim()
        const expected = (tc.expectedOutput || "").trim()
        results.push({
          ...tc,
          actual: data.stdout || "",
          stderr: data.stderr || "",
          exitCode: data.exitCode,
          time: data.time,
          memory: data.memory,
          passed: data.exitCode === 0 && actual === expected,
        })
      } catch (err) {
        results.push({
          ...tc,
          actual: "",
          stderr: "Network error: " + err.message,
          exitCode: 1,
          time: 0,
          memory: 0,
          passed: false,
        })
      }
    }

    setTestResults(results)
    setRunning(false)
  }, [code, selectedLang])

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault()
      if (running) {
        handleStop()
      } else {
        handleRun()
      }
    }
  }

  const isStreaming = running && !output

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
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
            {sandboxed !== null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${sandboxed ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                {sandboxed ? "Docker Sandbox" : "No Sandbox"}
              </span>
            )}
            <span className="text-[10px] text-gray-500">Ctrl+Enter to {running ? "stop" : "run"}</span>
          </div>
          <div className="flex items-center gap-2">
            {onOpenTestCases && (
              <button
                onClick={onOpenTestCases}
                className="px-2.5 py-1 rounded bg-purple-600 text-white text-xs font-semibold hover:bg-purple-500 transition-colors cursor-pointer"
              >
                Test Cases
              </button>
            )}
            {onInsertSnippet && (
              <button
                onClick={() => onInsertSnippet(code, selectedLang)}
                className="px-2.5 py-1 rounded bg-gray-700 border border-gray-600 text-gray-300 text-xs hover:bg-gray-600 hover:text-white transition-colors cursor-pointer"
              >
                Save Snippet
              </button>
            )}
            {running ? (
              <button
                onClick={handleStop}
                className="px-3 py-1 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-500 transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="1" />
                  </svg>
                  Stop
                </span>
              </button>
            ) : (
              <button
                onClick={() => handleRun()}
                disabled={!code?.trim()}
                className="px-3 py-1 rounded bg-green-600 text-white text-xs font-semibold hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Run
                </span>
              </button>
            )}
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
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                Output
                {isStreaming && <span className="ml-2 text-green-400">streaming...</span>}
              </span>
              {output && !testResults && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`font-mono ${output.exitCode === 0 ? "text-green-400" : "text-red-400"}`}>
                    exit: {output.exitCode}
                  </span>
                  {output.time != null && (
                    <span className="text-gray-500">{output.time}ms</span>
                  )}
                  {output.memory > 0 && (
                    <span className="text-gray-500">{formatMemory(output.memory)}</span>
                  )}
                  {output.phase === "compile" && (
                    <span className="text-yellow-400">compile error</span>
                  )}
                </div>
              )}
              {testResults && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={`font-semibold ${testResults.every((t) => t.passed) ? "text-green-400" : "text-red-400"}`}>
                    {testResults.filter((t) => t.passed).length}/{testResults.length} passed
                  </span>
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
              {running && !output && (
                <div className="flex items-center gap-2 text-gray-400">
                  <span className="w-3 h-3 border-2 border-gray-600 border-t-green-400 rounded-full animate-spin" />
                  {streamingStdout || streamingStderr ? "Executing..." : "Queued..."}
                </div>
              )}
              {(isStreaming || (running && (streamingStdout || streamingStderr))) && (
                <>
                  {streamingStderr && (
                    <span className="text-red-400">{streamingStderr}</span>
                  )}
                  {streamingStdout && (
                    <span className="text-green-300">{streamingStdout}</span>
                  )}
                </>
              )}
              {output && !running && !testResults && (
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
              {testResults && (
                <div className="space-y-3">
                  {testResults.map((result, i) => (
                    <div key={i} className={`p-2 rounded border ${result.passed ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-gray-300">{result.title}</span>
                        <div className="flex items-center gap-2 text-[10px]">
                          <span className={result.passed ? "text-green-400" : "text-red-400"}>
                            {result.passed ? "PASSED" : "FAILED"}
                          </span>
                          {result.time != null && (
                            <span className="text-gray-500">{result.time}ms</span>
                          )}
                        </div>
                      </div>
                      {!result.passed && (
                        <div className="text-[10px] space-y-1">
                          {result.stderr && (
                            <div><span className="text-gray-500">stderr: </span><span className="text-red-400">{result.stderr}</span></div>
                          )}
                          <div>
                            <span className="text-gray-500">expected: </span>
                            <span className="text-green-400">{result.expectedOutput || "(empty)"}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">actual: </span>
                            <span className="text-yellow-400">{result.actual || "(empty)"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
