import Redis from "ioredis"

let client = null
let redisBroken = false

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
  if (redisBroken) return null
  if (client) return client
  try {
    client = createClient()
    client.on("error", () => {
      redisBroken = true
    })
    client.connect().catch(() => {
      redisBroken = true
    })
    return client
  } catch {
    redisBroken = true
    return null
  }
}
