import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import ignore from 'ignore'
import simpleGit from 'simple-git'
import Project from '../models/Project.js'
import { isSecretPath } from '../services/sanitize.js'

const PROJECTS_DIR = '/tmp/opencode-projects'

// Paths never shown in the collaborative editor, regardless of .gitignore
const ALWAYS_IGNORED = ['node_modules', '.git', '.DS_Store']

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function getProjectDir(roomId) {
  return path.join(PROJECTS_DIR, roomId)
}

function getIgnoreMatcher(projectDir) {
  const ig = ignore()
  ig.add(ALWAYS_IGNORED)
  try {
    const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf-8')
    ig.add(gitignore.split(/\r?\n/))
  } catch {}
  ig.add('!.gitignore')
  return ig
}

function isIgnored(ig, relPath) {
  if (relPath === '.gitignore') return false
  return ig.ignores(relPath)
}

// Walk a directory on disk into editor entries, honoring .gitignore and
// always skipping node_modules / .git.
export function buildFileTreeFromDisk(dir) {
  const ig = getIgnoreMatcher(dir)
  const entries = []
  function walk(currentPath, parentId, relParts) {
    let names
    try {
      names = fs.readdirSync(currentPath)
    } catch {
      return
    }
    names.sort()
    for (const name of names) {
      const fullPath = path.join(currentPath, name)
      const rel = [...relParts, name].join('/')
      if (isIgnored(ig, rel)) continue
      let stat
      try {
        stat = fs.statSync(fullPath)
      } catch {
        continue
      }
      const id = `disk-${entries.length}`
      if (stat.isDirectory()) {
        entries.push({ id, name, type: 'folder', parentId })
        walk(fullPath, id, [...relParts, name])
      } else {
        let content = ''
        try {
          content = fs.readFileSync(fullPath, 'utf-8')
        } catch {}
        entries.push({ id, name, type: 'file', parentId, fileId: id, content })
      }
    }
  }
  walk(dir, null, [])
  return entries
}

// Build a { fileTree, files } payload from the on-disk state (used by sync-to-editor).
export function readProjectFromDisk(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) throw new Error(`No project files on disk: ${projectDir}`)
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
  return { fileTree, files }
}

// Classify editor { fileTree, files } entries against exclusion rules and the
// project's .gitignore (if the .gitignore file itself is part of the project).
// Returns the keys to keep and the relative paths that are ignored.
function classifyEditorEntries(fileTree, files) {
  const entries = Object.entries(fileTree || {})
  if (entries.length === 0) return { keptKeys: new Set(), ignoredPaths: [] }

  const childrenMap = {}
  let gitignoreContent = ''
  for (const [key, item] of entries) {
    const parentKey = item.parentId || '__root__'
    if (!childrenMap[parentKey]) childrenMap[parentKey] = []
    childrenMap[parentKey].push({ key, item })
    if (item.type === 'file' && item.name === '.gitignore') {
      gitignoreContent = (files || []).find(f => f.id === key)?.content || ''
    }
  }

  const ig = ignore()
  ig.add(ALWAYS_IGNORED)
  if (gitignoreContent) ig.add(gitignoreContent.split(/\r?\n/))
  ig.add('!.gitignore')

  const relOf = {}
  const walkPaths = (parentKey, parts) => {
    for (const child of childrenMap[parentKey] || []) {
      const rel = [...parts, child.item.name].join('/')
      relOf[child.key] = rel
      if (child.item.type === 'folder') walkPaths(child.key, [...parts, child.item.name])
    }
  }
  walkPaths('__root__', [])

  const dropped = new Set()
  const ignoredPaths = []
  const markDrop = (key) => {
    if (dropped.has(key)) return
    dropped.add(key)
    const item = fileTree[key]
    const rel = relOf[key]
    if (rel) ignoredPaths.push(rel + (item?.type === 'folder' ? '/' : ''))
    ;(childrenMap[key] || []).forEach(c => markDrop(c.key))
  }

  for (const [key, item] of entries) {
    const rel = relOf[key]
    if (!rel || rel === '.gitignore') continue
    if (isIgnored(ig, rel)) markDrop(key)
  }

  const keptKeys = new Set(entries.map(([key]) => key).filter(k => !dropped.has(k)))
  return { keptKeys, ignoredPaths }
}

// Filter an editor { fileTree, files } payload so node_modules, .git and any
// .gitignore'd files never reach the collaborative editor / Yjs document.
export function filterEditorProject(fileTree, files) {
  const { keptKeys, ignoredPaths } = classifyEditorEntries(fileTree, files)
  const filtered = {}
  for (const [key, item] of Object.entries(fileTree || {})) {
    if (keptKeys.has(key)) filtered[key] = item
  }
  const filteredFiles = (files || []).filter(f => keptKeys.has(f.id))
  return { fileTree: filtered, files: filteredFiles, ignoredPaths }
}

// List relative paths hidden by exclusion rules, e.g. for a "hidden files" badge.
export function getHiddenPaths(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) return []
  const ig = getIgnoreMatcher(projectDir)
  const hidden = []
  function walk(currentPath, relParts) {
    let names
    try {
      names = fs.readdirSync(currentPath)
    } catch {
      return
    }
    for (const name of names) {
      const rel = [...relParts, name].join('/')
      const fullPath = path.join(currentPath, name)
      let stat
      try {
        stat = fs.statSync(fullPath)
      } catch {
        continue
      }
      if (isIgnored(ig, rel)) {
        hidden.push(rel + (stat.isDirectory() ? '/' : ''))
        continue
      }
      if (stat.isDirectory()) walk(fullPath, [...relParts, name])
    }
  }
  walk(projectDir, [])
  return hidden
}

function buildPath(itemId, tree) {
  const item = tree[itemId]
  if (!item) return []
  const parentPath = item.parentId ? buildPath(item.parentId, tree) : []
  return [...parentPath, item.name]
}

function pruneEmptyDirs(currentPath, root) {
  let names
  try {
    names = fs.readdirSync(currentPath)
  } catch {
    return
  }
  for (const name of names) {
    const fullPath = path.join(currentPath, name)
    try {
      if (fs.statSync(fullPath).isDirectory()) pruneEmptyDirs(fullPath, root)
    } catch {}
  }
  let remaining
  try {
    remaining = fs.readdirSync(currentPath)
  } catch {
    return
  }
  if (remaining.length === 0 && currentPath !== root) {
    try {
      fs.rmdirSync(currentPath)
    } catch {}
  }
}

// Write editor state to disk. Files removed from the editor are removed from disk
// too, except anything hidden by gitignore / exclusion rules.
export async function syncProjectToDisk(roomId) {
  const project = await Project.findOne({ roomId })
  if (!project) throw new Error(`Project ${roomId} not found`)

  const projectDir = getProjectDir(roomId)
  ensureDir(projectDir)

  const fileTree = Object.fromEntries(project.fileTree || new Map())
  const files = project.files || []
  const editorRelPaths = new Set()

  for (const [id, item] of Object.entries(fileTree)) {
    if (item.type === 'file') {
      const parts = buildPath(id, fileTree)
      const filePath = path.join(projectDir, ...parts)
      ensureDir(path.dirname(filePath))
      const file = files.find(f => f.id === item.id)
      fs.writeFileSync(filePath, file?.content || '', 'utf-8')
      editorRelPaths.add(parts.join('/'))
    } else if (item.type === 'folder') {
      const parts = buildPath(id, fileTree)
      ensureDir(path.join(projectDir, ...parts))
    }
  }

  const diskFiles = []
  const ig = getIgnoreMatcher(projectDir)
  function collectFiles(currentPath, relParts) {
    let names
    try {
      names = fs.readdirSync(currentPath)
    } catch {
      return
    }
    for (const name of names) {
      const rel = [...relParts, name].join('/')
      if (isIgnored(ig, rel)) continue
      const fullPath = path.join(currentPath, name)
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          collectFiles(fullPath, [...relParts, name])
        } else {
          diskFiles.push(rel)
        }
      } catch {}
    }
  }
  collectFiles(projectDir, [])

  for (const rel of diskFiles) {
    if (!editorRelPaths.has(rel)) {
      try {
        fs.rmSync(path.join(projectDir, rel), { force: true })
      } catch {}
    }
  }
  pruneEmptyDirs(projectDir, projectDir)

  return projectDir
}

// If the project dir is a git repo, stage everything and commit. Returns the
// commit hash, or null if there is nothing to commit / no repo.
export async function commitProjectToGit(roomId, message, identity = {}) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) return null
  const git = simpleGit(projectDir)
  let isRepo = false
  try {
    isRepo = await git.checkIsRepo()
  } catch {
    return null
  }
  if (!isRepo) return null
  try {
    if (identity.name) await git.addConfig('user.name', identity.name)
    if (identity.email) await git.addConfig('user.email', identity.email)
  } catch {}
  try {
    await git.add(['.'])
    const result = await git.commit(message || 'Snapshot')
    return result?.commit || null
  } catch {
    return null
  }
}

export async function getCurrentBranch(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) return ""
  const git = simpleGit(projectDir)
  try {
    if (!(await git.checkIsRepo())) return ""
    const branchSummary = await git.branch()
    return branchSummary.current || ""
  } catch {
    return ""
  }
}

// Fetch recent commit hashes/messages so snapshots and git history can coexist.
export async function getRecentGitCommits(roomId, maxCount = 20) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) return []
  const git = simpleGit(projectDir)
  try {
    if (!(await git.checkIsRepo())) return []
    const log = await git.log({ maxCount })
    return log.all.map((c) => ({
      hash: c.hash,
      date: c.date,
      message: c.message,
      author: c.author_name,
      refs: c.refs || "",
    }))
  } catch {
    return []
  }
}

// Summarize uncommitted git changes so the UI can warn before snapshotting.
export async function getGitStatus(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) return null
  const git = simpleGit(projectDir)
  try {
    if (!(await git.checkIsRepo())) return { isRepo: false, uncommitted: 0 }
    const status = await git.status()
    return {
      isRepo: true,
      uncommitted: status.files.length,
      staged: status.files.filter(f => f.index !== ' ').length,
      workingTree: status.files.filter(f => f.workingTree !== ' ').length,
      branch: status.current,
    }
  } catch {
    return null
  }
}

// Compact uncommitted diff summary (staged + unstaged) for prompt context.
// Protected paths (e.g. .env, credentials) are filtered out so secrets never
// reach the model via the git diff tool.
export async function getGitDiffStat(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) return null
  const git = simpleGit(projectDir)
  try {
    if (!(await git.checkIsRepo())) return null
    const [unstaged, staged, unstagedNames, stagedNames, status] = await Promise.all([
      git.diff(['--stat']),
      git.diff(['--cached', '--stat']),
      git.diff(['--name-only']),
      git.diff(['--cached', '--name-only']),
      git.status(),
    ])
    const stat = [unstaged, staged].map((s) => s.trim()).filter(Boolean).join('\n')
    const files = [...new Set(
      [
        ...unstagedNames.split('\n'),
        ...stagedNames.split('\n'),
        ...status.files.filter((f) => f.working_dir === '?').map((f) => f.path),
      ]
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((p) => !isSecretPath(p))
    )]
    if (!files.length) return null
    if (!stat && !status.files.some((f) => f.working_dir === '?' && files.includes(f.path))) return null
    const kept = new Set(files)
    const filteredTrackedStat = stat
      .split('\n')
      .filter((line) => {
        const filePart = line.split('|')[0]?.trim()
        if (!filePart || !line.includes('|')) return true
        return kept.has(filePart)
      })
      .join('\n')
    const untracked = status.files
      .filter((f) => f.working_dir === '?' && kept.has(f.path))
      .map((f) => ` ?? ${f.path}`)
    const filteredStat = [filteredTrackedStat, ...untracked].filter(Boolean).join('\n')
    return { stat: filteredStat, files }
  } catch {
    return null
  }
}

// Read the on-disk state, persist it back to MongoDB and overwrite the live Yjs
// document so every connected editor reflects what is on disk (used after git
// pull/checkout/clone and by the "Sync Disk → Editor" button).
export async function applyDiskStateToEditor(ySocketIO, roomId) {
  const { fileTree, files } = readProjectFromDisk(roomId)
  await Project.findOneAndUpdate(
    { roomId },
    { $set: { fileTree, files, updatedAt: new Date() } }
  )

  const yDoc = ySocketIO?.documents.get(roomId)
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

  return { fileTree, files }
}

export function tarProjectDir(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) throw new Error(`Project directory not found: ${projectDir}`)
  const tarPath = path.join(PROJECTS_DIR, `${roomId}.tar`)
  execSync(`tar -cf ${tarPath} -C ${projectDir} .`, { stdio: 'ignore' })
  return tarPath
}
