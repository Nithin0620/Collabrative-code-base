import Redis from "ioredis"

let client = null
let lastErrorAt = 0

// After a connection error, stop handing out the broken client for a short
// cooldown so the hot rate-limit path falls back to in-memory handling instead
// of failing (and warning) on every request. ioredis keeps reconnecting in the
// background; once it recovers, the 'ready' event resets the breaker.
const COOLDOWN_MS = 30_000

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
  if (client && lastErrorAt && Date.now() - lastErrorAt < COOLDOWN_MS) {
    return null
  }
  if (client) return client
  try {
    client = createClient()
    client.on("error", (err) => {
      // Do not latch a permanent "broken" state: ioredis reconnects on its own,
      // so callers keep trying and fall back to in-memory handling per command.
      lastErrorAt = Date.now()
      console.warn("[redis] connection error:", err?.message || err)
    })
    client.on("ready", () => {
      lastErrorAt = 0
    })
    client.connect().catch((err) => {
      lastErrorAt = Date.now()
      console.warn("[redis] connect failed:", err?.message || err)
    })
    return client
  } catch (err) {
    lastErrorAt = Date.now()
    console.warn("[redis] create failed:", err?.message || err)
    return null
  }
}
