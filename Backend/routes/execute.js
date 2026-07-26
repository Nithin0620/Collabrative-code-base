import { Router } from "express"
import { execFile, spawn } from "child_process"
import { writeFile, unlink, mkdir } from "fs/promises"
import { join } from "path"
import { randomUUID } from "crypto"
import { tmpdir } from "os"
import { authenticateToken } from "../middleware/auth.js"

const router = Router()

const LANG_CONFIG = {
  javascript: {
    ext: ".js",
    cmd: "node",
    args: (f) => [f],
    image: null,
  },
  python: {
    ext: ".py",
    cmd: "python3",
    args: (f) => [f],
    image: null,
  },
  java: {
    ext: ".java",
    cmd: null,
    compile: (f, dir) => ({
      cmd: "javac",
      args: [f],
      cwd: dir,
    }),
    run: (f, dir) => ({
      cmd: "java",
      args: ["-cp", dir, f.replace(".java", "")],
      cwd: dir,
    }),
    getMainFile: (code) => {
      const match = code.match(/class\s+(\w+)/)
      return match ? match[1] : "Main"
    },
    image: null,
  },
  cpp: {
    ext: ".cpp",
    cmd: null,
    compile: (f) => ({
      cmd: "g++",
      args: [f, "-o", f + ".out", "-std=c++17"],
    }),
    run: (f) => ({
      cmd: f + ".out",
      args: [],
    }),
    image: null,
  },
  c: {
    ext: ".c",
    cmd: null,
    compile: (f) => ({
      cmd: "gcc",
      args: [f, "-o", f + ".out"],
    }),
    run: (f) => ({
      cmd: f + ".out",
      args: [],
    }),
    image: null,
  },
  ruby: {
    ext: ".rb",
    cmd: "ruby",
    args: (f) => [f],
    image: null,
  },
  go: {
    ext: ".go",
    cmd: null,
    compile: (f) => ({
      cmd: "go",
      args: ["build", "-o", f + ".out", f],
    }),
    run: (f) => ({
      cmd: f + ".out",
      args: [],
    }),
    image: null,
  },
}

const MAX_TIMEOUT = 15000
const MAX_OUTPUT = 65536

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const start = Date.now()
    const child = spawn(cmd, args, {
      cwd: opts.cwd || tmpdir(),
      timeout: MAX_TIMEOUT,
      maxBuffer: MAX_OUTPUT,
      env: { ...process.env, PATH: process.env.PATH },
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (data) => {
      stdout += data.toString()
      if (stdout.length > MAX_OUTPUT) {
        stdout = stdout.slice(0, MAX_OUTPUT) + "\n... (output truncated)"
        child.kill("SIGKILL")
      }
    })

    child.stderr.on("data", (data) => {
      stderr += data.toString()
      if (stderr.length > MAX_OUTPUT) {
        stderr = stderr.slice(0, MAX_OUTPUT) + "\n... (output truncated)"
        child.kill("SIGKILL")
      }
    })

    child.on("close", (code) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code,
        time: Date.now() - start,
      })
    })

    child.on("error", (err) => {
      resolve({
        stdout: "",
        stderr: err.message,
        exitCode: 1,
        time: Date.now() - start,
      })
    })
  })
}

router.post("/", authenticateToken, async (req, res) => {
  try {
    const { language, code, stdin } = req.body

    if (!language || !code) {
      return res.status(400).json({ message: "language and code are required" })
    }

    const config = LANG_CONFIG[language]
    if (!config) {
      return res.status(400).json({
        message: `Language "${language}" is not supported. Supported: ${Object.keys(LANG_CONFIG).join(", ")}`,
      })
    }

    const runId = randomUUID().slice(0, 8)
    const runDir = join(tmpdir(), "coderunner-" + runId)
    await mkdir(runDir, { recursive: true })

    let fileName = "prog" + config.ext
    if (language === "java") {
      const mainClass = config.getMainFile(code)
      fileName = mainClass + ".java"
    }
    const filePath = join(runDir, fileName)

    await writeFile(filePath, code, "utf-8")

    if (stdin) {
      await writeFile(join(runDir, "stdin.txt"), stdin, "utf-8")
    }

    let result

    if (config.compile) {
      const compilation = config.compile(filePath, runDir)
      const compileResult = await runCommand(compilation.cmd, compilation.args, {
        cwd: compilation.cwd || runDir,
      })

      if (compileResult.exitCode !== 0) {
        cleanupDir(runDir)
        return res.json({
          stdout: "",
          stderr: compileResult.stderr || "Compilation failed",
          exitCode: compileResult.exitCode,
          time: compileResult.time,
          phase: "compile",
        })
      }

      const runConf = config.run(filePath, runDir)
      result = await runCommand(runConf.cmd, runConf.args, { cwd: runDir })
    } else {
      const cmdArgs = config.args(filePath)
      result = await runCommand(config.cmd, cmdArgs, { cwd: runDir })
    }

    if (stdin) {
      try {
        await unlink(join(runDir, "stdin.txt"))
      } catch {}
    }

    cleanupDir(runDir)

    res.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      time: result.time,
      phase: "run",
    })
  } catch (error) {
    console.error("Execute error:", error)
    res.status(500).json({ message: "Execution failed: " + error.message })
  }
})

function cleanupDir(dir) {
  import("fs").then((fs) => {
    fs.rm(dir, { recursive: true, force: true }, () => {})
  })
}

export default router
