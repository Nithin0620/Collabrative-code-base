import { Queue, Worker } from "bullmq"
import { randomUUID } from "crypto"
import Execution from "../models/Execution.js"
import { dockerAvailable } from "./sandboxRunner.js"

const QUEUE_NAME = "code-execution"

function getConnection() {
  if (process.env.REDIS_URL) {
    return { url: process.env.REDIS_URL }
  }
  if (process.env.UPSTASH_REDIS_URL) {
    return { url: process.env.UPSTASH_REDIS_URL, tls: {} }
  }
  return { host: "127.0.0.1", port: 6379 }
}

const connection = getConnection()

const execQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
    timeout: 30000,
  },
})

let activeWorker = null

function createWorker(executeCode, io) {
  if (activeWorker) {
    activeWorker.close()
  }

  activeWorker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { executionId, userId, roomId, language, code, stdin } = job.data
      const room = `exec:${executionId}`

      try {
        const claim = await Execution.findOneAndUpdate(
          { executionId, status: "queued" },
          { status: "running" },
          { new: true },
        )
        if (!claim) {
          io.to(room).emit("exec:stopped", { executionId })
          return { executionId, status: "stopped" }
        }
        io.to(room).emit("exec:started", { executionId })

        const result = await executeCode(language, code, stdin, executionId, (chunk) => {
          io.to(room).emit("exec:chunk", {
            executionId,
            type: chunk.type,
            data: chunk.data,
          })
        })

        const finished = await Execution.findOneAndUpdate(
          { executionId, status: "running" },
          {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            time: result.time,
            memory: result.memory,
            phase: result.phase,
            status: "completed",
            sandboxed: dockerAvailable,
          },
        )
        if (!finished) {
          io.to(room).emit("exec:stopped", { executionId })
          return { executionId, status: "stopped" }
        }

        io.to(room).emit("exec:done", {
          executionId,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          time: result.time,
          memory: result.memory,
          phase: result.phase,
          sandboxed: dockerAvailable,
        })

        return { executionId, status: "completed" }
      } catch (err) {
        const markFailed = await Execution.findOneAndUpdate(
          { executionId, status: { $in: ["queued", "running"] } },
          {
            stderr: err.message,
            exitCode: 1,
            status: "failed",
          },
        ).catch(() => null)
        if (markFailed) {
          io.to(room).emit("exec:error", {
            executionId,
            message: err.message,
          })
        }

        throw err
      }
    },
    {
      connection,
      concurrency: 5,
    },
  )

  activeWorker.on("failed", (job, err) => {
    console.error(`[queue] Job ${job?.id} failed:`, err.message)
  })

  return activeWorker
}

async function enqueueExecution({ userId, roomId, language, code, stdin }) {
  const executionId = randomUUID().slice(0, 12)

  await Execution.create({
    executionId,
    userId,
    roomId: roomId || null,
    language,
    code,
    stdin: stdin || "",
    status: "queued",
  })

  await execQueue.add(
    "run",
    {
      executionId,
      userId,
      roomId,
      language,
      code,
      stdin,
    },
    { jobId: executionId },
  )

  return { executionId, status: "queued" }
}

async function stopJob(executionId, sandboxStopFn) {
  const job = await execQueue.getJob(executionId)
  if (job && await job.isWaiting()) {
    await job.remove()
  } else {
    if (sandboxStopFn) await sandboxStopFn(executionId)
  }
}

async function closeQueue() {
  if (activeWorker) {
    await activeWorker.close()
    activeWorker = null
  }
  await execQueue.close()
}

export { execQueue, createWorker, enqueueExecution, stopJob, closeQueue }
