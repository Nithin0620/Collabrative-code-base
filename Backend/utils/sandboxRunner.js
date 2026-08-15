import { spawn } from "child_process"
import { writeFile, mkdir, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"

let Docker = null
let dockerAvailable = false

try {
  Docker = (await import("dockerode")).default
  const docker = new Docker()
  await docker.ping()
  dockerAvailable = true
  console.log("[sandbox] Docker detected — running in sandboxed mode")
} catch {
  dockerAvailable = false
  console.log("[sandbox] Docker not available — falling back to child_process (NOT SANDBOXED)")
}

export { dockerAvailable }

const LANG_CONFIG = {
  javascript: { ext: ".js" },
  python:     { ext: ".py" },
  java:       { ext: ".java" },
  cpp:        { ext: ".cpp" },
  c:          { ext: ".c" },
  ruby:       { ext: ".rb" },
  go:         { ext: ".go" },
}

const MAX_TIMEOUT = 15000
const MAX_OUTPUT = 65536
const MEMORY_LIMIT = 256 * 1024 * 1024
const CPU_QUOTA = 50000
const CPU_PERIOD = 100000

const runningContainers = new Map()

export function getRunningContainers() {
  return runningContainers
}

export async function stopExecution(executionId) {
  const handle = runningContainers.get(executionId)
  if (!handle) return false

  try {
    if (dockerAvailable && !handle.startsWith("pid:")) {
      const docker = new Docker()
      const container = docker.getContainer(handle)
      await container.kill().catch(() => {})
      await container.remove({ force: true }).catch(() => {})
    } else if (handle.startsWith("pid:")) {
      const pid = parseInt(handle.split(":")[1])
      try {
        process.kill(pid, "SIGKILL")
      } catch {}
    }
  } catch (err) {
    console.error("[sandbox] Error stopping execution:", err.message)
  } finally {
    runningContainers.delete(executionId)
  }
  return true
}

function getMainClassName(code) {
  const match = code.match(/class\s+(\w+)/)
  return match ? match[1] : "Main"
}

function getFileName(language, code) {
  const config = LANG_CONFIG[language]
  if (language === "java") {
    return getMainClassName(code) + config.ext
  }
  return "prog" + config.ext
}

export async function executeCode(language, code, stdin, executionId, onChunk) {
  if (dockerAvailable) {
    return executeInDocker(language, code, stdin, executionId, onChunk)
  }
  return executeWithChildProcess(language, code, stdin, executionId, onChunk)
}

async function executeInDocker(language, code, stdin, executionId, onChunk) {
  const docker = new Docker()
  const runDir = join(tmpdir(), "coderunner-" + executionId)
  await mkdir(runDir, { recursive: true })

  const fileName = getFileName(language, code)
  const filePath = join(runDir, fileName)
  await writeFile(filePath, code, "utf-8")
  if (stdin) {
    await writeFile(join(runDir, "stdin.txt"), stdin, "utf-8")
  }

  const containerConfig = {
    Image: process.env.SANDBOX_IMAGE || "sandbox-runner:latest",
    Cmd: [language, "/code/" + fileName, stdin ? "/code/stdin.txt" : ""],
    WorkingDir: "/home/sandbox",
    HostConfig: {
      Memory: MEMORY_LIMIT,
      MemorySwap: MEMORY_LIMIT,
      CpuQuota: CPU_QUOTA,
      CpuPeriod: CPU_PERIOD,
      NetworkMode: "none",
      Binds: [runDir + ":/code"],
      AutoRemove: false,
      PidsLimit: 100,
    },
    NetworkDisabled: true,
  }

  const start = Date.now()
  let container
  try {
    container = await docker.createContainer(containerConfig)
    runningContainers.set(executionId, container.id)
    await container.start()
  } catch (err) {
    cleanupDir(runDir)
    return {
      stdout: "",
      stderr: "Sandbox error: " + err.message,
      exitCode: 1,
      time: 0,
      memory: 0,
      phase: "run",
    }
  }

  let result = { stdout: "", stderr: "", exitCode: 0, time: 0, memory: 0 }

  try {
    const statsStream = await container.stats({ stream: true })
    await new Promise((resolve) => {
      const timeout = setTimeout(() => { statsStream.destroy(); resolve() }, 3000)
      statsStream.once("data", (chunk) => {
        const stats = JSON.parse(chunk.toString())
        result.memory = stats.memory_stats?.usage || 0
        statsStream.destroy()
        clearTimeout(timeout)
        resolve()
      })
      statsStream.on("error", () => { clearTimeout(timeout); resolve() })
    })
  } catch {}

  try {
    const logs = await container.logs({ follow: true, stdout: true, stderr: true })
    const stdoutBuf = []
    const stderrBuf = []
    let frameBuf = Buffer.alloc(0)

    for await (const chunk of logs) {
      frameBuf = Buffer.concat([frameBuf, chunk])

      while (frameBuf.length >= 8) {
        const streamType = frameBuf[0]
        const size = frameBuf.readUInt32BE(4)
        if (frameBuf.length < 8 + size) break

        const data = frameBuf.slice(8, 8 + size)
        frameBuf = frameBuf.slice(8 + size)
        const str = data.toString("utf-8")

        if (streamType === 2) {
          stderrBuf.push(str)
          if (onChunk) onChunk({ type: "stderr", data: str })
        } else {
          stdoutBuf.push(str)
          if (onChunk) onChunk({ type: "stdout", data: str })
        }
      }
    }

    result.stdout = stdoutBuf.join("").trim().slice(0, MAX_OUTPUT)
    result.stderr = stderrBuf.join("").trim().slice(0, MAX_OUTPUT)
  } catch (err) {
    result.stderr = "Failed to read container output: " + err.message
  }

  try {
    const inspectData = await container.inspect()
    result.exitCode = inspectData.State?.ExitCode ?? 1
    if (inspectData.State?.Error) {
      result.stderr = result.stderr || inspectData.State.Error
    }
  } catch {}

  result.time = Date.now() - start

  try {
    await container.kill().catch(() => {})
    await container.remove({ force: true }).catch(() => {})
  } catch {}

  runningContainers.delete(executionId)
  cleanupDir(runDir)

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    time: result.time,
    memory: result.memory,
    phase: "run",
  }
}

async function executeWithChildProcess(language, code, stdin, executionId, onChunk) {
  const runDir = join(tmpdir(), "coderunner-" + executionId)
  await mkdir(runDir, { recursive: true })

  const fileName = getFileName(language, code)
  const filePath = join(runDir, fileName)
  await writeFile(filePath, code, "utf-8")

  const result = await runCompiled(language, code, filePath, runDir, executionId, stdin, onChunk)
  cleanupDir(runDir)
  return result
}

function spawnAsync(cmd, args, opts, stdinData, onChunk) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, opts)
    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (d) => {
      const str = d.toString()
      stdout += str
      if (onChunk) onChunk({ type: "stdout", data: str })
    })
    child.stderr?.on("data", (d) => {
      const str = d.toString()
      stderr += str
      if (onChunk) onChunk({ type: "stderr", data: str })
    })

    if (stdinData) {
      child.stdin.write(stdinData)
    }
    child.stdin.end()

    child.on("close", (code) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code }))
    child.on("error", (err) => resolve({ stdout: "", stderr: err.message, exitCode: 1 }))
  })
}

async function runCompiled(language, code, filePath, runDir, executionId, stdin, onChunk) {
  const start = Date.now()
  const baseOpts = { cwd: runDir, timeout: MAX_TIMEOUT, env: { ...process.env } }

  if (language === "java") {
    const className = getMainClassName(code)
    const compileResult = await spawnAsync("javac", [filePath], baseOpts)
    if (compileResult.exitCode !== 0) {
      runningContainers.delete(executionId)
      return {
        stdout: "",
        stderr: compileResult.stderr || "Compilation failed",
        exitCode: compileResult.exitCode,
        time: Date.now() - start,
        memory: 0,
        phase: "compile",
      }
    }
    runningContainers.set(executionId, "pid:compiling")
    const runResult = await spawnAsync("java", ["-cp", runDir, className], baseOpts, stdin, onChunk)
    runningContainers.delete(executionId)
    return {
      stdout: runResult.stdout.slice(0, MAX_OUTPUT),
      stderr: runResult.stderr.slice(0, MAX_OUTPUT),
      exitCode: runResult.exitCode,
      time: Date.now() - start,
      memory: 0,
      phase: "run",
    }
  }

  if (language === "cpp") {
    const compileResult = await spawnAsync("g++", [filePath, "-o", filePath + ".out", "-std=c++17"], baseOpts)
    if (compileResult.exitCode !== 0) {
      runningContainers.delete(executionId)
      return {
        stdout: "",
        stderr: compileResult.stderr || "Compilation failed",
        exitCode: compileResult.exitCode,
        time: Date.now() - start,
        memory: 0,
        phase: "compile",
      }
    }
    runningContainers.set(executionId, "pid:running")
    const runResult = await spawnAsync(filePath + ".out", [], baseOpts, stdin, onChunk)
    runningContainers.delete(executionId)
    return {
      stdout: runResult.stdout.slice(0, MAX_OUTPUT),
      stderr: runResult.stderr.slice(0, MAX_OUTPUT),
      exitCode: runResult.exitCode,
      time: Date.now() - start,
      memory: 0,
      phase: "run",
    }
  }

  if (language === "c") {
    const compileResult = await spawnAsync("gcc", [filePath, "-o", filePath + ".out"], baseOpts)
    if (compileResult.exitCode !== 0) {
      runningContainers.delete(executionId)
      return {
        stdout: "",
        stderr: compileResult.stderr || "Compilation failed",
        exitCode: compileResult.exitCode,
        time: Date.now() - start,
        memory: 0,
        phase: "compile",
      }
    }
    runningContainers.set(executionId, "pid:running")
    const runResult = await spawnAsync(filePath + ".out", [], baseOpts, stdin, onChunk)
    runningContainers.delete(executionId)
    return {
      stdout: runResult.stdout.slice(0, MAX_OUTPUT),
      stderr: runResult.stderr.slice(0, MAX_OUTPUT),
      exitCode: runResult.exitCode,
      time: Date.now() - start,
      memory: 0,
      phase: "run",
    }
  }

  if (language === "go") {
    const compileResult = await spawnAsync("go", ["build", "-o", filePath + ".out", filePath], baseOpts)
    if (compileResult.exitCode !== 0) {
      runningContainers.delete(executionId)
      return {
        stdout: "",
        stderr: compileResult.stderr || "Compilation failed",
        exitCode: compileResult.exitCode,
        time: Date.now() - start,
        memory: 0,
        phase: "compile",
      }
    }
    runningContainers.set(executionId, "pid:running")
    const runResult = await spawnAsync(filePath + ".out", [], baseOpts, stdin, onChunk)
    runningContainers.delete(executionId)
    return {
      stdout: runResult.stdout.slice(0, MAX_OUTPUT),
      stderr: runResult.stderr.slice(0, MAX_OUTPUT),
      exitCode: runResult.exitCode,
      time: Date.now() - start,
      memory: 0,
      phase: "run",
    }
  }

  const cmdMap = {
    javascript: { cmd: "node", args: [filePath] },
    python:     { cmd: "python3", args: [filePath] },
    ruby:       { cmd: "ruby", args: [filePath] },
  }

  const conf = cmdMap[language]
  if (!conf) {
    return {
      stdout: "",
      stderr: "Unsupported language: " + language,
      exitCode: 1,
      time: 0,
      memory: 0,
      phase: "run",
    }
  }

  runningContainers.set(executionId, "pid:running")
  const runResult = await spawnAsync(conf.cmd, conf.args, baseOpts, stdin, onChunk)
  runningContainers.delete(executionId)

  return {
    stdout: runResult.stdout.slice(0, MAX_OUTPUT),
    stderr: runResult.stderr.slice(0, MAX_OUTPUT),
    exitCode: runResult.exitCode,
    time: Date.now() - start,
    memory: 0,
    phase: "run",
  }
}

function cleanupDir(dir) {
  rm(dir, { recursive: true, force: true }).catch(() => {})
}
