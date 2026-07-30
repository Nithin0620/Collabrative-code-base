import { useState, useEffect, useCallback } from "react"

function StatusIcon({ status }) {
  if (status === " ") return null
  const colors = { M: "text-amber-400", A: "text-green-400", D: "text-red-400", "?": "text-gray-400", R: "text-blue-400" }
  return <span className={`w-4 text-[10px] font-bold ${colors[status] || "text-gray-400"}`}>{status}</span>
}

export default function SourceControlPanel({ roomId, onClose }) {
  const [status, setStatus] = useState(null)
  const [log, setLog] = useState([])
  const [branches, setBranches] = useState({ branches: [], current: "" })
  const [commitMsg, setCommitMsg] = useState("")
  const [committing, setCommitting] = useState(false)
  const [initLoading, setInitLoading] = useState(false)
  const [branchName, setBranchName] = useState("")
  const [showNewBranch, setShowNewBranch] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [remoteUrl, setRemoteUrl] = useState("")
  const [showRemote, setShowRemote] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [cloneUrl, setCloneUrl] = useState("")
  const [cloning, setCloning] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const [s, l, b] = await Promise.all([
        fetch(`/api/projects/${roomId}/git/status`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/projects/${roomId}/git/log`, { credentials: "include" }).then(r => r.json()),
        fetch(`/api/projects/${roomId}/git/branches`, { credentials: "include" }).then(r => r.json()),
      ])
      setStatus(s)
      setLog(l)
      setBranches(b)
    } catch (e) { console.warn(e) }
  }, [roomId])

  const fetchRemotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${roomId}/git/remote`, { method: "POST", credentials: "include" }).then(r => r.json())
      const origin = res.remotes?.find(r => r.name === 'origin')
      if (origin?.refs?.fetch) {
        const cleanUrl = origin.refs.fetch.replace(/https:\/\/[^@]+@/, 'https://')
        setRemoteUrl(cleanUrl)
      }
    } catch {}
  }, [roomId])

  useEffect(() => { fetchStatus(); fetchRemotes() }, [fetchStatus, fetchRemotes])

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(""), 3000) }

  const handleInit = async () => {
    setInitLoading(true)
    setError("")
    try {
      const res = await fetch(`/api/projects/${roomId}/git/init`, { method: "POST", credentials: "include" }).then(r => r.json())
      if (res.message) showSuccess(res.message)
      await fetchStatus()
    } catch (e) { setError(e.message) }
    setInitLoading(false)
  }

  const handleCommit = async () => {
    if (!commitMsg.trim()) return
    setCommitting(true)
    setError("")
    try {
      const res = await fetch(`/api/projects/${roomId}/git/commit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: commitMsg }),
      }).then(r => r.json())
      if (res.message) showSuccess(res.message)
      setCommitMsg("")
      await fetchStatus()
    } catch (e) { setError(e.message) }
    setCommitting(false)
  }

  const handleCheckout = async (name) => {
    setError("")
    try {
      await fetch(`/api/projects/${roomId}/git/checkout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      await fetchStatus()
    } catch (e) { setError(e.message) }
  }

  const handleCreateBranch = async () => {
    if (!branchName.trim()) return
    setError("")
    try {
      await fetch(`/api/projects/${roomId}/git/branch`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: branchName, checkout: true }),
      })
      setBranchName("")
      setShowNewBranch(false)
      showSuccess(`Switched to ${branchName}`)
      await fetchStatus()
    } catch (e) { setError(e.message) }
  }

  const handleSetRemote = async () => {
    if (!remoteUrl.trim()) return
    setError("")
    try {
      const res = await fetch(`/api/projects/${roomId}/git/remote`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: remoteUrl }),
      }).then(r => r.json())
      if (res.message) showSuccess(res.message)
      setShowRemote(false)
    } catch (e) { setError(e.message) }
  }

  const handlePush = async () => {
    setPushing(true)
    setError("")
    try {
      const res = await fetch(`/api/projects/${roomId}/git/push`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json())
      if (res.message) showSuccess(res.message)
    } catch (e) { setError(e.message) }
    setPushing(false)
  }

  const handlePull = async () => {
    setPulling(true)
    setError("")
    try {
      const res = await fetch(`/api/projects/${roomId}/git/pull`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }).then(r => r.json())
      if (res.message) showSuccess(res.message)
      await fetchStatus()
    } catch (e) { setError(e.message) }
    setPulling(false)
  }

  const handleSyncFromDisk = async () => {
    setSyncing(true)
    setError("")
    try {
      const res = await fetch(`/api/projects/${roomId}/git/sync-from-disk`, {
        method: "POST",
        credentials: "include",
      }).then(r => r.json())
      if (res.message) showSuccess(res.message)
    } catch (e) { setError(e.message) }
    setSyncing(false)
  }

  const handleClone = async () => {
    if (!cloneUrl.trim()) return
    setCloning(true)
    setError("")
    try {
      const res = await fetch(`/api/projects/${roomId}/git/clone`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: cloneUrl }),
      }).then(r => r.json())
      if (res.message) showSuccess(res.message)
    } catch (e) { setError(e.message) }
    setCloning(false)
  }

  const isRepo = status?.isRepo
  const files = status?.status?.files || []
  const staged = files.filter(f => f.index !== " ")
  const unstaged = files.filter(f => f.workingTree !== " " && f.index === " ")
  const logEntries = log?.log || []

  return (
    <div className="w-72 bg-gray-950 border-l border-gray-700 flex flex-col overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Source Control</h2>
        <div className="flex items-center gap-1">
          {isRepo && branches.current && (
            <span className="text-[10px] text-gray-500 font-mono">{branches.current}</span>
          )}
          <button onClick={fetchStatus} className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-gray-300 cursor-pointer" title="Refresh">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded text-gray-500 hover:text-gray-300 cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {error && <div className="mx-3 mt-2 p-1.5 bg-red-900/30 border border-red-800 rounded text-[10px] text-red-400">{error}</div>}
      {success && <div className="mx-3 mt-2 p-1.5 bg-green-900/30 border border-green-800 rounded text-[10px] text-green-400">{success}</div>}

      <div className="flex-1 overflow-y-auto">
        {!isRepo ? (
          <div className="p-4 text-center space-y-3">
            <p className="text-[11px] text-gray-500">This project is not yet a git repository.</p>
            <button
              onClick={handleInit}
              disabled={initLoading}
              className="w-full px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-medium rounded transition-colors cursor-pointer"
            >
              {initLoading ? "Initializing..." : "Initialize Repository"}
            </button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-[10px]">
                <span className="bg-gray-950 px-2 text-gray-500">or clone from GitHub</span>
              </div>
            </div>
            <div className="flex gap-1">
              <input
                value={cloneUrl}
                onChange={e => setCloneUrl(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleClone() }}
                placeholder="https://github.com/user/repo"
                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleClone}
                disabled={cloning || !cloneUrl.trim()}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-[11px] font-medium rounded cursor-pointer"
              >
                {cloning ? "..." : "Clone"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 p-2">
            {staged.length > 0 && (
              <div>
                <p className="text-[10px] text-green-400 font-semibold uppercase px-1 mb-1">Staged ({staged.length})</p>
                {staged.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 hover:bg-gray-800/50 rounded text-[11px]">
                    <StatusIcon status={f.index} />
                    <span className="text-gray-300 truncate">{f.path}</span>
                  </div>
                ))}
              </div>
            )}

            {unstaged.length > 0 && (
              <div>
                <p className="text-[10px] text-amber-400 font-semibold uppercase px-1 mb-1">Changes ({unstaged.length})</p>
                {unstaged.map((f, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 hover:bg-gray-800/50 rounded text-[11px]">
                    <StatusIcon status={f.workingTree} />
                    <span className="text-gray-300 truncate">{f.path}</span>
                  </div>
                ))}
              </div>
            )}

            {staged.length === 0 && unstaged.length === 0 && (
              <p className="text-[11px] text-gray-500 text-center py-4">No changes</p>
            )}

            <div className="space-y-1.5 px-1">
              <input
                value={commitMsg}
                onChange={e => setCommitMsg(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCommit() }}
                placeholder="Commit message (Ctrl+Enter)"
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
              />
              <button
                onClick={handleCommit}
                disabled={committing || !commitMsg.trim() || (staged.length === 0 && unstaged.length === 0)}
                className="w-full py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-[11px] font-medium rounded transition-colors cursor-pointer"
              >
                {committing ? "Committing..." : "Commit"}
              </button>
            </div>

            <div className="border-t border-gray-700 pt-2 px-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-500 font-semibold uppercase">Remote</p>
                <button
                  onClick={() => setShowRemote(!showRemote)}
                  className="text-[10px] text-amber-500 hover:text-amber-400 cursor-pointer"
                >
                  {showRemote ? "Cancel" : remoteUrl ? "Change" : "Add"}
                </button>
              </div>
              {remoteUrl && !showRemote && (
                <p className="text-[10px] text-gray-500 truncate px-1" title={remoteUrl}>{remoteUrl}</p>
              )}
              {showRemote && (
                <div className="flex gap-1">
                  <input
                    value={remoteUrl}
                    onChange={e => setRemoteUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleSetRemote() }}
                    placeholder="https://github.com/user/repo"
                    className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                  <button onClick={handleSetRemote} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] rounded cursor-pointer">Set</button>
                </div>
              )}
              <div className="flex gap-1">
                <button
                  onClick={handlePush}
                  disabled={pushing || !remoteUrl}
                  className="flex-1 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-[10px] font-medium rounded transition-colors cursor-pointer"
                >
                  {pushing ? "Pushing..." : "Push"}
                </button>
                <button
                  onClick={handlePull}
                  disabled={pulling || !remoteUrl}
                  className="flex-1 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-200 text-[10px] font-medium rounded transition-colors cursor-pointer"
                >
                  {pulling ? "Pulling..." : "Pull"}
                </button>
              </div>
            </div>

            <div className="border-t border-gray-700 pt-2 px-1">
              <button
                onClick={handleSyncFromDisk}
                disabled={syncing}
                className="w-full py-1 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 text-[10px] font-medium rounded transition-colors cursor-pointer"
              >
                {syncing ? "Syncing..." : "Sync from Disk → Editor"}
              </button>
            </div>

            <div className="border-t border-gray-700 pt-2 px-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-gray-500 font-semibold uppercase">Branches</p>
                <button
                  onClick={() => setShowNewBranch(!showNewBranch)}
                  className="text-[10px] text-amber-500 hover:text-amber-400 cursor-pointer"
                >
                  {showNewBranch ? "Cancel" : "+ New"}
                </button>
              </div>
              {showNewBranch && (
                <div className="flex gap-1">
                  <input
                    value={branchName}
                    onChange={e => setBranchName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleCreateBranch() }}
                    placeholder="Branch name"
                    className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-[11px] text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
                  />
                  <button onClick={handleCreateBranch} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-200 text-[10px] rounded cursor-pointer">Create</button>
                </div>
              )}
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {branches.branches.map((b, i) => (
                  <div
                    key={i}
                    onClick={() => !b.current && handleCheckout(b.name)}
                    className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[11px] cursor-pointer ${
                      b.current ? "bg-amber-500/10 text-amber-400" : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200"
                    }`}
                  >
                    <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14v-4H8l4-4 4 4h-3v4h-2z"/>
                    </svg>
                    <span className="truncate">{b.name}</span>
                  </div>
                ))}
              </div>
            </div>

            {logEntries.length > 0 && (
              <div className="border-t border-gray-700 pt-2 px-1">
                <p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">History</p>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {logEntries.map((entry, i) => (
                    <div key={i} className="flex items-start gap-1.5 px-1 py-0.5 text-[10px]">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-300 truncate">{entry.message}</p>
                        <p className="text-gray-600 truncate">{entry.author_name} &middot; {new Date(entry.date).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
