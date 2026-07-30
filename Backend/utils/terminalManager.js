import Docker from 'dockerode'
import { EventEmitter } from 'events'
import { spawn, execSync } from 'child_process'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { fileURLToPath } from 'url'
import { syncProjectToDisk, getProjectDir } from './projectSync.js'
import User from '../models/User.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const docker = new Docker()
const terminals = new Map()
const TERMINAL_IMAGE = 'opencode-terminal:latest'
const DOCKERFILE_PATH = path.resolve(__dirname, '../sandbox/terminal.Dockerfile')
const CONTAINER_LABEL = 'opencode-terminal'

let imageBuilt = false

async function cleanupOrphanedContainers() {
  try {
    const containers = await docker.listContainers({ all: true, filters: { label: [CONTAINER_LABEL] } })
    for (const info of containers) {
      try {
        const container = docker.getContainer(info.Id)
        await container.kill().catch(() => {})
        await container.remove({ force: true }).catch(() => {})
        console.log(`[terminal] Cleaned up orphaned container: ${info.Id.slice(0, 12)}`)
      } catch {}
    }
  } catch (err) {
    console.warn('[terminal] Orphan cleanup failed:', err.message)
  }
}

// Cleanup orphans on startup
cleanupOrphanedContainers()

async function ensureDockerImage() {
  if (imageBuilt) return
  try {
    await docker.getImage(TERMINAL_IMAGE).inspect()
    imageBuilt = true
    return
  } catch {}

  console.log('[terminal] Building opencode-terminal image...')
  const buildContextDir = path.resolve(__dirname, '../sandbox')
  const tarPath = path.join(os.tmpdir(), `terminal-build-${Date.now()}.tar`)

  try {
    execSync(`tar -cf "${tarPath}" -C "${buildContextDir}" .`, { stdio: 'ignore' })
    const tarStream = fs.createReadStream(tarPath)
    const stream = await docker.buildImage(tarStream, {
      t: TERMINAL_IMAGE,
      dockerfile: 'terminal.Dockerfile',
    })
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res))
    })
    imageBuilt = true
    console.log('[terminal] Image built successfully')
  } catch (err) {
    console.warn('[terminal] Failed to build image, will pull node:20-slim as fallback:', err.message)
  } finally {
    try { fs.unlinkSync(tarPath) } catch {}
  }
}

function tarDirectory(sourceDir) {
  const tarPath = path.join(os.tmpdir(), `project-${Date.now()}.tar`)
  execSync(`tar -cf "${tarPath}" -C "${sourceDir}" .`, { stdio: 'ignore' })
  return tarPath
}

class TerminalSession extends EventEmitter {
  constructor(terminalId, roomId, userId) {
    super()
    this.terminalId = terminalId
    this.roomId = roomId
    this.userId = userId
    this.userName = ''
    this.userEmail = ''
    this.githubToken = ''
    this.container = null
    this.stream = null
    this.alive = false
    this.localProcess = null
    this.isDocker = false
  }

  async loadUser() {
    try {
      const user = await User.findById(this.userId).select('+githubToken')
      if (user) {
        this.userName = user.username || ''
        this.userEmail = user.email || ''
        this.githubToken = user.githubToken || ''
      }
    } catch {}
  }

  async start(cols = 80, rows = 24) {
    try {
      await docker.ping()
      this.isDocker = true
    } catch (err) {
      console.warn('[terminal] Docker not available, falling back to local process', err.message)
      this.isDocker = false
    }

    if (this.isDocker) {
      try {
        await this.startDocker(cols, rows)
      } catch (err) {
        console.warn('[terminal] Docker start failed, falling back to local:', err.message)
        this.isDocker = false
        await this.startLocal(cols, rows)
      }
    } else {
      await this.startLocal(cols, rows)
    }
  }

  async startDocker(cols, rows) {
    await ensureDockerImage()
    await this.loadUser()

    let projectDir = null
    try {
      projectDir = await syncProjectToDisk(this.roomId)
    } catch (err) {
      console.warn('[terminal] Could not sync project files:', err.message)
    }

    const envVars = [
      'TERM=xterm-256color',
      'HOME=/home/sandbox',
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      'NODE_ENV=development',
    ]
    if (this.userName) envVars.push(`GIT_AUTHOR_NAME=${this.userName}`, `GIT_COMMITTER_NAME=${this.userName}`)
    if (this.userEmail) envVars.push(`GIT_AUTHOR_EMAIL=${this.userEmail}`, `GIT_COMMITTER_EMAIL=${this.userEmail}`)

    this.container = await docker.createContainer({
      Image: TERMINAL_IMAGE,
      Cmd: ['/bin/bash', '-i'],
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/workspace',
      Env: envVars,
      Labels: { [CONTAINER_LABEL]: 'true' },
      HostConfig: {
        Init: true,
        Memory: 512 * 1024 * 1024,
        MemorySwap: 512 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 50000,
        PidsLimit: 512,
      }
    })

    await this.container.start()
    this.alive = true

    if (projectDir) {
      try {
        const tarPath = tarDirectory(projectDir)
        const tarStream = fs.createReadStream(tarPath)
        await this.container.putArchive(tarStream, { path: '/workspace' })
        tarStream.destroy()
        fs.unlinkSync(tarPath)
        await this.container.exec({
          Cmd: ['/bin/chown', '-R', 'sandbox:sandbox', '/workspace'],
          AttachStdout: true,
          AttachStderr: true,
        }).then(e => e.start({ Tty: true }).then(s => new Promise(r => { s.on('end', r); s.on('error', r); setTimeout(r, 5000) }))).catch(() => {})
      } catch (err) {
        console.warn('[terminal] Could not copy project files into container:', err.message)
      }
    }

    try {
      await this.setupGitConfig()
    } catch (err) {
      console.warn('[terminal] Git config setup failed:', err.message)
    }

    this.stream = await this.container.attach({
      stream: true,
      stdin: true,
      stdout: true,
      stderr: true,
      hijack: true,
    })

    this.stream.on('data', (chunk) => {
      this.emit('data', chunk.toString('utf8'))
    })

    this.stream.on('end', () => {
      console.log(`[terminal] Stream ended: ${this.terminalId}`)
      this.alive = false
      this.emit('close')
    })

    this.stream.on('error', (err) => {
      this.emit('error', err)
    })

    if (cols && rows) {
      await this.resize(cols, rows)
    }
  }

  async setupGitConfig() {
    const cmds = []
    if (this.userName) {
      cmds.push(`git config --global user.name "${this.userName.replace(/"/g, '\\"')}"`)
    }
    if (this.userEmail) {
      cmds.push(`git config --global user.email "${this.userEmail.replace(/"/g, '\\"')}"`)
    }
    if (this.githubToken && this.userName) {
      const credsDir = '/home/sandbox'
      const credsFile = `${credsDir}/.git-credentials`
      const token = this.githubToken.replace(/"/g, '\\"')
      cmds.push(`mkdir -p ${credsDir}`)
      cmds.push(`echo "https://${this.userName}:${token}@github.com" > ${credsFile}`)
      cmds.push(`chmod 600 ${credsFile}`)
      cmds.push('git config --global credential.helper store')
    }
    if (cmds.length === 0) return

    const execInstance = await this.container.exec({
      Cmd: ['/bin/bash', '-c', cmds.join(' && ')],
      AttachStdout: true,
      AttachStderr: true,
    })
    const execStream = await execInstance.start({ Tty: true })
    await new Promise((resolve) => {
      execStream.on('end', resolve)
      execStream.on('error', resolve)
      setTimeout(() => resolve(), 5000)
    })
  }

  async startLocal(cols, rows) {
    let cwd = process.env.HOME
    try {
      cwd = getProjectDir(this.roomId)
      if (!fs.existsSync(cwd)) cwd = process.env.HOME
    } catch {}

    this.localProcess = spawn('/bin/bash', ['-i'], {
      env: { ...process.env, TERM: 'xterm-256color' },
      cwd,
    })
    this.alive = true

    this.localProcess.stdout.on('data', (chunk) => {
      this.emit('data', chunk.toString('utf8'))
    })
    this.localProcess.stderr.on('data', (chunk) => {
      this.emit('data', chunk.toString('utf8'))
    })

    this.localProcess.on('exit', () => {
      this.alive = false
      this.emit('close')
    })

    this.localProcess.on('error', (err) => {
      this.emit('error', err)
    })
  }

  write(data) {
    if (this.alive) {
      if (this.isDocker && this.stream) {
        this.stream.write(data)
      } else if (!this.isDocker && this.localProcess) {
        this.localProcess.stdin.write(data)
      }
    }
  }

  async resize(cols, rows) {
    if (this.isDocker && this.container) {
      try {
        await this.container.resize({ w: cols, h: rows })
      } catch {}
    }
  }

  async kill() {
    this.alive = false
    try {
      if (this.isDocker) {
        if (this.stream) this.stream.end()
        if (this.container) {
          await this.container.kill().catch(() => {})
          await this.container.remove({ force: true }).catch(() => {})
        }
      } else {
        if (this.localProcess) {
          this.localProcess.kill()
        }
      }
    } catch {}
    terminals.delete(this.terminalId)
  }
}

export async function createTerminal(terminalId, roomId, userId, cols, rows) {
  if (terminals.has(terminalId)) {
    console.log(`[terminal] Replacing existing terminal: ${terminalId}`)
    await terminals.get(terminalId).kill()
  }
  const session = new TerminalSession(terminalId, roomId, userId)
  terminals.set(terminalId, session)
  await session.start(cols, rows)
  return session
}

export function getTerminal(terminalId) {
  return terminals.get(terminalId)
}

export async function killTerminal(terminalId) {
  const session = terminals.get(terminalId)
  if (session) {
    console.log(`[terminal] Killing terminal: ${terminalId}`)
    await session.kill()
  } else {
    console.log(`[terminal] Terminal not found for kill: ${terminalId}`)
  }
}

export async function killRoomTerminals(roomId) {
  const toKill = []
  terminals.forEach((session) => {
    if (session.roomId === roomId) toKill.push(session)
  })
  await Promise.all(toKill.map((s) => s.kill()))
}
