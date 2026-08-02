import { Router } from "express"
import simpleGit from "simple-git"
import path from "path"
import fs from "fs"
import { authenticateToken, requireProjectRole } from "../middleware/auth.js"
import { getProjectDir, syncProjectToDisk, buildFileTreeFromDisk, readProjectFromDisk, applyDiskStateToEditor } from "../utils/projectSync.js"
import User from "../models/User.js"
import Project from "../models/Project.js"

const router = Router()

function getGit(roomId) {
  const dir = getProjectDir(roomId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return simpleGit(dir)
}

function gitCredentialsFile(roomId, userId) {
  return `/tmp/.git-credentials-${roomId}-${userId}`
}

async function getGitWithToken(roomId, userId) {
  const dir = getProjectDir(roomId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const git = simpleGit(dir)
  const user = await User.findById(userId).select('+githubToken')
  if (user?.githubToken) {
    const token = user.githubToken.replace(/"/g, '\\"')
    const credFile = gitCredentialsFile(roomId, userId)
    fs.writeFileSync(credFile, `https://${user.username}:${token}@github.com\n`, 'utf-8')
    try { fs.chmodSync(credFile, 0o600) } catch {}
    await git.addConfig('credential.helper', `store --file '${credFile}'`)
  }
  return git
}

function friendlyGitError(err) {
  const msg = String(err?.message || '')
  if (/authentication failed|could not read username|invalid username or password|bad credentials|403|401/i.test(msg)) {
    return 'GitHub authentication failed. Link your GitHub account (or add a Personal Access Token with repo scope) in Settings, then try again.'
  }
  if (/no such remote|does not appear to be a git repository|could not read from remote repository|not found|repository .* not found/i.test(msg)) {
    return 'Remote repository not found or unreachable. Check the remote URL in the Git panel.'
  }
  if (/diverged|fetch first|non-fast-forward|rejected/i.test(msg)) {
    return 'Remote has commits you do not have locally. Pull first, resolve conflicts, then push.'
  }
  if (/not a git repository/i.test(msg)) {
    return 'This project is not a git repository yet. Click "Initialize repo" first.'
  }
  if (/early eof|could not resolve host|unable to access|operation timed out|failed to connect|getaddrinfo/i.test(msg)) {
    return 'Network error while contacting the remote. Check your connection and try again.'
  }
  return msg
}

function generateRoomId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
  let id = ""
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)]
  }
  return id
}

async function cloneRepoIntoRoom(repoUrl, roomId, user) {
  const projectDir = getProjectDir(roomId)
  if (fs.existsSync(projectDir)) {
    fs.rmSync(projectDir, { recursive: true, force: true })
  }
  fs.mkdirSync(projectDir, { recursive: true })

  // Convert SSH/HTTPS URL to authenticated HTTPS URL
  let cloneUrl = repoUrl
  if (user?.githubToken) {
    const match = repoUrl.match(/github\.com[/:](.+?)(?:\.git)?$/)
    if (match) {
      cloneUrl = `https://${user.username}:${user.githubToken}@github.com/${match[1]}`
    }
  }

  const git = simpleGit()
  await git.clone(cloneUrl, projectDir)

  const entries = buildFileTreeFromDisk(projectDir)
  const fileTree = {}
  const files = []

  for (const entry of entries) {
    fileTree[entry.id] = {
      id: entry.id,
      name: entry.name,
      type: entry.type,
      parentId: entry.parentId,
    }
    if (entry.type === 'file') {
      fileTree[entry.id].fileId = entry.fileId
      files.push({ id: entry.fileId, content: entry.content })
    }
  }

  // Reset origin to the clean URL (clone writes the token-embedded URL)
  const repoGit = simpleGit(projectDir)
  try {
    await repoGit.removeRemote('origin')
  } catch {}
  await repoGit.addRemote('origin', repoUrl)
  await repoGit.addConfig("user.name", user?.username || "user")
  await repoGit.addConfig("user.email", user?.email || "user@localhost")

  return { fileTree, files }
}

router.post("/clone-from-github", authenticateToken, async (req, res) => {
  try {
    const { repoUrl, roomId } = req.body || {}
    if (!repoUrl) return res.status(400).json({ message: "Repository URL required" })

    const newRoomId = String(roomId || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 64) || generateRoomId()
    if (await Project.findOne({ roomId: newRoomId })) {
      return res.status(409).json({ message: "A room with this code already exists" })
    }

    const { fileTree, files } = await cloneRepoIntoRoom(repoUrl, newRoomId, req.user)

    await Project.create({
      roomId: newRoomId,
      fileTree,
      files,
      createdBy: req.user._id,
      members: new Map([
        [req.user._id.toString(), { role: "owner", joinedAt: new Date() }],
      ]),
    })

    res.json({ success: true, roomId: newRoomId, message: `Cloned ${repoUrl}`, filesCount: files.length })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

// GitHub credential management for authenticated pushes/pulls/clones.
router.get("/github/status", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+githubToken")
    if (!user) return res.status(404).json({ message: "User not found" })
    res.json({
      linked: !!user.githubToken,
      username: user.username,
      githubId: user.githubId || null,
    })
  } catch (error) {
    res.status(500).json({ message: "Failed to load GitHub status" })
  }
})

router.post("/github/token", authenticateToken, async (req, res) => {
  try {
    const { token } = req.body || {}
    const pat = String(token || "").trim()
    if (!pat) return res.status(400).json({ message: "A GitHub Personal Access Token is required" })
    if (pat.length < 20) return res.status(400).json({ message: "That does not look like a valid GitHub token" })

    await User.updateOne(
      { _id: req.user._id },
      { $set: { githubToken: pat } }
    )
    res.json({ success: true, message: "GitHub token saved" })
  } catch (error) {
    res.status(500).json({ message: "Failed to save GitHub token" })
  }
})

router.delete("/github/token", authenticateToken, async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $unset: { githubToken: "" } }
    )
    res.json({ success: true, message: "GitHub token removed" })
  } catch (error) {
    res.status(500).json({ message: "Failed to remove GitHub token" })
  }
})

router.get("/:roomId/git/status", authenticateToken, requireProjectRole("owner", "editor", "viewer"), async (req, res) => {
  try {
    const git = getGit(req.params.roomId)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) return res.json({ isRepo: false })
    const status = await git.status()
    res.json({ isRepo: true, status })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.get("/:roomId/git/log", authenticateToken, requireProjectRole("owner", "editor", "viewer"), async (req, res) => {
  try {
    const git = getGit(req.params.roomId)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) return res.json({ isRepo: false, log: [] })
    const log = await git.log({ maxCount: 50 })
    res.json({ isRepo: true, log: log.all })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.get("/:roomId/git/branches", authenticateToken, requireProjectRole("owner", "editor", "viewer"), async (req, res) => {
  try {
    const git = getGit(req.params.roomId)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) return res.json({ isRepo: false, branches: [], current: "" })
    const branchSummary = await git.branch()
    const branches = Object.entries(branchSummary.branches).map(([name, info]) => ({
      name,
      current: info.current,
      label: info.label,
    }))
    res.json({ isRepo: true, branches, current: branchSummary.current })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/init", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    await syncProjectToDisk(req.params.roomId)
    const git = getGit(req.params.roomId)
    await git.init()
    await git.addConfig("user.name", req.user.username || "user")
    await git.addConfig("user.email", req.user.email || "user@localhost")
    res.json({ message: "Git repository initialized" })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/add", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const git = getGit(req.params.roomId)
    await git.add(req.body.file || ".")
    res.json({ message: "Staged" })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/commit", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const { message } = req.body
    if (!message) return res.status(400).json({ message: "Commit message required" })
    await syncProjectToDisk(req.params.roomId)
    const git = getGit(req.params.roomId)
    await git.add(".")
    const result = await git.commit(message)
    res.json({ message: "Committed", result })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/branch", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const { name, checkout } = req.body
    if (!name) return res.status(400).json({ message: "Branch name required" })
    const git = getGit(req.params.roomId)
    await git.branch([name])
    if (checkout) await git.checkout(name)
    res.json({ message: `Branch ${name} created` })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/checkout", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ message: "Branch name required" })
    const git = getGit(req.params.roomId)
    await git.checkout(name)
    await applyDiskStateToEditor(req.app.get('ySocketIO'), req.params.roomId)
    res.json({ message: `Switched to ${name}` })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/remote", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const { url } = req.body || {}
    const git = getGit(req.params.roomId)
    const remotes = await git.getRemotes(true)
    if (url) {
      if (remotes.find(r => r.name === 'origin')) {
        await git.removeRemote('origin')
      }
      await git.addRemote('origin', url)
      return res.json({ message: `Remote origin set to ${url}` })
    }
    res.json({ remotes })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/push", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const { remote = 'origin', branch } = req.body
    await syncProjectToDisk(req.params.roomId)
    const git = await getGitWithToken(req.params.roomId, req.user._id)
    const branchSummary = await git.branch()
    const pushBranch = branch || branchSummary.current
    const result = await git.push(remote, pushBranch)
    res.json({ message: `Pushed to ${remote}/${pushBranch}`, result })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/pull", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const { remote = 'origin', branch } = req.body
    const git = await getGitWithToken(req.params.roomId, req.user._id)
    const branchSummary = await git.branch()
    const pullBranch = branch || branchSummary.current
    await git.pull(remote, pullBranch)
    await applyDiskStateToEditor(req.app.get('ySocketIO'), req.params.roomId)
    res.json({ message: `Pulled from ${remote}/${pullBranch}` })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/sync-from-disk", authenticateToken, requireProjectRole("owner", "editor"), async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.roomId)
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ message: "No project files on disk" })
    }

    // Read current disk state and sync it back to MongoDB
    const { fileTree, files } = readProjectFromDisk(req.params.roomId)

    await Project.findOneAndUpdate(
      { roomId: req.params.roomId },
      { $set: { fileTree, files } }
    )

    const ySocketIO = req.app.get('ySocketIO')
    const yDoc = ySocketIO?.documents.get(req.params.roomId)
    if (yDoc) {
      yDoc.transact(() => {
        const yFileTree = yDoc.getMap('fileTree')
        yFileTree.clear()
        Object.entries(fileTree).forEach(([key, val]) => {
          yFileTree.set(key, val)
        })
        files.forEach((f) => {
          const text = yDoc.getText('file:' + f.id)
          text.delete(0, text.length)
          text.insert(0, f.content || '')
        })
      })
    }

    res.json({ message: "Project synced from disk", filesCount: files.length })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

router.post("/:roomId/git/clone", authenticateToken, requireProjectRole("owner"), async (req, res) => {
  try {
    const { repoUrl } = req.body
    if (!repoUrl) return res.status(400).json({ message: "Repository URL required" })

    const user = await User.findById(req.user._id).select('+githubToken')
    const { fileTree, files } = await cloneRepoIntoRoom(repoUrl, req.params.roomId, user)

    await Project.findOneAndUpdate(
      { roomId: req.params.roomId },
      { $set: { fileTree, files } }
    )

    const ySocketIO = req.app.get('ySocketIO')
    const yDoc = ySocketIO?.documents.get(req.params.roomId)
    if (yDoc) {
      yDoc.transact(() => {
        const yFileTree = yDoc.getMap('fileTree')
        yFileTree.clear()
        Object.entries(fileTree).forEach(([key, val]) => {
          yFileTree.set(key, val)
        })
        files.forEach((f) => {
          const text = yDoc.getText('file:' + f.id)
          text.delete(0, text.length)
          text.insert(0, f.content || '')
        })
      })
    }

    res.json({ message: `Cloned ${repoUrl}`, filesCount: files.length })
  } catch (err) {
    res.status(500).json({ message: friendlyGitError(err) })
  }
})

export default router
