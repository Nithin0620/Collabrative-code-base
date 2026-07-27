import { Queue, Worker } from "bullmq"
import { randomUUID } from "crypto"
import Execution from "../models/Execution.js"

const QUEUE_NAME = "code-execution"

const connection = { host: "127.0.0.1", port: 6379 }

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

      io.to(room).emit("exec:started", { executionId })

      try {
        const result = await executeCode(language, code, stdin, executionId, (chunk) => {
          io.to(room).emit("exec:chunk", {
            executionId,
            type: chunk.type,
            data: chunk.data,
          })
        })

        await Execution.findOneAndUpdate(
          { executionId },
          {
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            time: result.time,
            memory: result.memory,
            phase: result.phase,
            status: "completed",
            sandboxed: result.sandboxed,
          },
        )

        io.to(room).emit("exec:done", {
          executionId,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          time: result.time,
          memory: result.memory,
          phase: result.phase,
          sandboxed: result.sandboxed,
        })

        return { executionId, status: "completed" }
      } catch (err) {
        await Execution.findOneAndUpdate(
          { executionId },
          {
            stderr: err.message,
            exitCode: 1,
            status: "failed",
          },
        )

        io.to(room).emit("exec:error", {
          executionId,
          message: err.message,
        })

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

  const execution = await Execution.create({
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

async function stopJob(executionId) {
  const job = await execQueue.getJob(executionId)
  if (job) {
    await job.remove()
  }
  await Execution.findOneAndUpdate(
    { executionId },
    { status: "stopped", stderr: "Execution stopped by user.", exitCode: 137 },
  )
}

async function closeQueue() {
  if (activeWorker) {
    await activeWorker.close()
    activeWorker = null
  }
  await execQueue.close()
}

export { execQueue, createWorker, enqueueExecution, stopJob, closeQueue }
