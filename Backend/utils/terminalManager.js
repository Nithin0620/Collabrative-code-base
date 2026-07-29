import Docker from 'dockerode'
import { EventEmitter } from 'events'
import { spawn } from 'child_process'

const docker = new Docker()
const terminals = new Map() // terminalId -> TerminalSession

class TerminalSession extends EventEmitter {
  constructor(terminalId, roomId, userId) {
    super()
    this.terminalId = terminalId
    this.roomId = roomId
    this.userId = userId
    this.container = null
    this.exec = null
    this.stream = null
    this.alive = false
    this.localProcess = null
    this.isDocker = false
  }

  async start(cols = 80, rows = 24) {
    try {
      // Check if Docker is available
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
    this.container = await docker.createContainer({
      Image: 'node:20-slim',
      Cmd: ['/bin/bash'],
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: '/workspace',
      Env: [
        'TERM=xterm-256color',
        'HOME=/root',
        'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/node_modules/.bin'
      ],
      HostConfig: {
        Memory: 512 * 1024 * 1024,
        MemorySwap: 512 * 1024 * 1024,
        CpuPeriod: 100000,
        CpuQuota: 50000,
        PidsLimit: 256,
      }
    })

    await this.container.start()
    this.alive = true

    const execInstance = await this.container.exec({
      Cmd: ['/bin/bash'],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Env: ['TERM=xterm-256color'],
    })

    this.exec = execInstance
    this.stream = await execInstance.start({
      hijack: true,
      stdin: true,
      Tty: true,
    })

    this.stream.on('data', (chunk) => {
      this.emit('data', chunk.toString('utf8'))
    })

    this.stream.on('end', () => {
      this.alive = false
      this.emit('close')
    })

    this.stream.on('error', (err) => {
      this.emit('error', err)
    })

    await this.resize(cols, rows)
  }

  async startLocal(cols, rows) {
    this.localProcess = spawn('/bin/bash', ['-i'], {
      env: { ...process.env, TERM: 'xterm-256color' },
      cwd: process.env.HOME,
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
    if (this.isDocker && this.exec) {
      try {
        await this.exec.resize({ w: cols, h: rows })
      } catch {}
    }
    // Local process resizing not easily supported without node-pty
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
  if (session) await session.kill()
}

export async function killRoomTerminals(roomId) {
  const toKill = []
  terminals.forEach((session) => {
    if (session.roomId === roomId) toKill.push(session)
  })
  await Promise.all(toKill.map((s) => s.kill()))
}
