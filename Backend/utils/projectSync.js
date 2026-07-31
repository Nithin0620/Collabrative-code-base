import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import ignore from 'ignore'
import simpleGit from 'simple-git'
import Project from '../models/Project.js'

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

export function tarProjectDir(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) throw new Error(`Project directory not found: ${projectDir}`)
  const tarPath = path.join(PROJECTS_DIR, `${roomId}.tar`)
  execSync(`tar -cf ${tarPath} -C ${projectDir} .`, { stdio: 'ignore' })
  return tarPath
}
