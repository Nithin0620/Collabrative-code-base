import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import Project from '../models/Project.js'

const PROJECTS_DIR = '/tmp/opencode-projects'

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function getProjectDir(roomId) {
  return path.join(PROJECTS_DIR, roomId)
}

export async function syncProjectToDisk(roomId) {
  const project = await Project.findOne({ roomId })
  if (!project) throw new Error(`Project ${roomId} not found`)

  const projectDir = getProjectDir(roomId)
  ensureDir(projectDir)

  const fileTree = Object.fromEntries(project.fileTree || new Map())
  const files = project.files || []

  function buildPath(itemId, tree) {
    const item = tree[itemId]
    if (!item) return []
    const parentPath = item.parentId ? buildPath(item.parentId, tree) : []
    return [...parentPath, item.name]
  }

  for (const [id, item] of Object.entries(fileTree)) {
    if (item.type === 'file') {
      const parts = buildPath(id, fileTree)
      const filePath = path.join(projectDir, ...parts)
      ensureDir(path.dirname(filePath))
      const file = files.find(f => f.id === item.id)
      fs.writeFileSync(filePath, file?.content || '', 'utf-8')
    } else if (item.type === 'folder') {
      const parts = buildPath(id, fileTree)
      const dirPath = path.join(projectDir, ...parts)
      ensureDir(dirPath)
    }
  }

  return projectDir
}

export function tarProjectDir(roomId) {
  const projectDir = getProjectDir(roomId)
  if (!fs.existsSync(projectDir)) throw new Error(`Project directory not found: ${projectDir}`)
  const tarPath = path.join(PROJECTS_DIR, `${roomId}.tar`)
  execSync(`tar -cf ${tarPath} -C ${projectDir} .`, { stdio: 'ignore' })
  return tarPath
}
