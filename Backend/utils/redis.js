import Redis from "ioredis"

let client = null

function createClient() {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
  }
  if (process.env.UPSTASH_REDIS_URL) {
    return new Redis(process.env.UPSTASH_REDIS_URL, {
      tls: {},
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
  }
  return new Redis({
    host: "127.0.0.1",
    port: 6379,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })
}

export function getRedisClient() {
  if (client) return client
  try {
    client = createClient()
    client.on("error", (err) => {
      // Do not latch a permanent "broken" state: ioredis reconnects on its own,
      // so callers keep trying and fall back to in-memory handling per command.
      console.warn("[redis] connection error:", err?.message || err)
    })
    client.connect().catch((err) => {
      console.warn("[redis] connect failed:", err?.message || err)
    })
    return client
  } catch (err) {
    console.warn("[redis] create failed:", err?.message || err)
    return null
  }
}
