import { useState } from "react"
import RoleBadge from "./RoleBadge"

export default function RoleManager({ roomId, members, bannedUsers, settings, isOwner, onAddMember, onChangeRole, onKick, onBan, onUnban, onUpdateSettings, onClose, onRefresh }) {
  const [addUsername, setAddUsername] = useState("")
  const [addRole, setAddRole] = useState("editor")
  const [error, setError] = useState("")
  const [showBanned, setShowBanned] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inviteOnly, setInviteOnly] = useState(settings.inviteOnly || false)
  const [readOnly, setReadOnly] = useState(settings.readOnly || false)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [performingAction, setPerformingAction] = useState(null)

  const [successMessage, setSuccessMessage] = useState("")

  const handleAction = async (action, actionFn, ...args) => {
    setError("")
    setSuccessMessage("")
    setPerformingAction(action)
    try {
      const result = await actionFn(...args)
      if (result?.error) {
        setError(`Failed to ${action}: ${result.error}`)
      } else {
        setSuccessMessage(`${action.charAt(0).toUpperCase() + action.slice(1)} successful`)
        if (onRefresh) onRefresh()
      }
    } catch (err) {
      setError(`Failed to ${action}: ${err.message}`)
    } finally {
      setPerformingAction(null)
    }
  }

  const handleAdd = async () => {
    if (!addUsername.trim()) return
    setError("")
    setSuccessMessage("")
    const result = await onAddMember(addUsername.trim(), addRole)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccessMessage(result?.message || (addUsername.includes("@") ? `Invite email sent to ${addUsername}` : `User ${addUsername} added`))
      setAddUsername("")
    }
  }

  const handleSaveSettings = async () => {
    if (password && password !== confirmPassword) {
      setError("Passwords don't match")
      return
    }
    setError("")
    setSuccessMessage("")
    const update = { inviteOnly, readOnly, password: password.trim() }
    if (update.password && update.password !== confirmPassword) return
    const result = await onUpdateSettings(update)
    if (result?.error) {
      setError(result.error)
    } else {
      setSuccessMessage("Settings updated successfully")
      setPassword("")
      setConfirmPassword("")
      setSettingsOpen(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[90vw] max-w-lg max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <h3 className="text-sm font-bold text-white">Room Management</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">{error}</div>
          )}
          {successMessage && (
            <div className="px-3 py-2 rounded bg-green-500/10 border border-green-500/30 text-green-400 text-xs">{successMessage}</div>
          )}

          {isOwner && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Invite Member (Email or Username)</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={addUsername}
                  onChange={(e) => setAddUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  placeholder="user@example.com or Username..."
                  className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500"
                />
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button onClick={handleAdd} className="px-3 py-1.5 bg-amber-500 text-gray-950 rounded text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer">Send Invite</button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Members ({members.length})</h4>
            <ul className="space-y-1">
              {members.map((m) => (
                <li key={m._id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-800/50 hover:bg-gray-800 transition-colors">
                  {m.avatar ? (
                    <img src={m.avatar} alt={m.username} className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: m.color }}>{m.username.charAt(0).toUpperCase()}</div>
                  )}
                  <span className="text-xs font-medium truncate min-w-0" style={{ color: m.color }}>{m.username}</span>
                  <RoleBadge role={m.role} />
                  {isOwner && m.role !== "owner" && (
                    <div className="ml-auto flex items-center gap-1 shrink-0">
                      {m.role !== "viewer" && (
                        <button onClick={() => handleAction("change role", onChangeRole, m._id, "viewer")} disabled={performingAction} className="text-[9px] text-gray-500 hover:text-gray-300 disabled:opacity-40 cursor-pointer" title="Make viewer">Viewer</button>
                      )}
                      {m.role !== "editor" && (
                        <button onClick={() => handleAction("change role", onChangeRole, m._id, "editor")} disabled={performingAction} className="text-[9px] text-gray-500 hover:text-gray-300 disabled:opacity-40 cursor-pointer" title="Make editor">Editor</button>
                      )}
                      <button onClick={() => handleAction("kick", onKick, m._id)} disabled={performingAction} className="text-[9px] text-orange-400 hover:text-orange-300 disabled:opacity-40 cursor-pointer" title="Kick">Kick</button>
                      <button onClick={() => handleAction("ban", onBan, m._id)} disabled={performingAction} className="text-[9px] text-red-400 hover:text-red-300 disabled:opacity-40 cursor-pointer" title="Ban">Ban</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {isOwner && (
            <>
              <button onClick={() => setSettingsOpen(!settingsOpen)} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer text-left">
                Room Settings {settingsOpen ? "▲" : "▼"}
              </button>
              {settingsOpen && (
                <div className="space-y-3 p-3 bg-gray-800/50 rounded border border-gray-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={inviteOnly} onChange={(e) => setInviteOnly(e.target.checked)} className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500" />
                    <span className="text-xs text-gray-300">Invite Only (require approval to join)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500" />
                    <span className="text-xs text-gray-300">Read Only (all non-owners become viewers)</span>
                  </label>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">
                      Password {settings.hasPassword ? <span className="text-amber-400">(already set)</span> : "(optional)"}
                    </label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={settings.hasPassword ? "New password (blank = remove)" : "Set password"} className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
                  </div>
                  {password && (
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Confirm Password</label>
                      <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="w-full px-3 py-1.5 bg-gray-900 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-amber-500" />
                    </div>
                  )}
                  <button onClick={handleSaveSettings} className="w-full px-3 py-1.5 bg-amber-500 text-gray-950 rounded text-xs font-semibold hover:bg-amber-400 transition-colors cursor-pointer">Save Settings</button>
                </div>
              )}

              <button onClick={() => setShowBanned(!showBanned)} className="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-xs text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer text-left">
                Banned Users ({bannedUsers.length}) {showBanned ? "▲" : "▼"}
              </button>
              {showBanned && (
                <div className="space-y-1">
                  {bannedUsers.length === 0 ? (
                    <p className="text-xs text-gray-500 px-2">No banned users</p>
                  ) : (
                    bannedUsers.map((uid) => (
                      <div key={uid} className="flex items-center justify-between px-2 py-1.5 rounded bg-gray-800/50">
                        <span className="text-xs text-gray-400 truncate">{uid}</span>
                        <button onClick={() => onUnban(uid)} className="text-[9px] text-green-400 hover:text-green-300 cursor-pointer">Unban</button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
