import { getRedisClient } from "./redis.js"

const WINDOW_MS = 5 * 60 * 1000
const memBuckets = new Map()
let memWrites = 0

function memCheck(key, limit, now = Date.now()) {
  if (memWrites >= 1000) {
    memWrites = 0
    for (const [k, b] of memBuckets) {
      if (now >= b.resetAt) memBuckets.delete(k)
    }
  }
  let bucket = memBuckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS }
    memBuckets.set(key, bucket)
  }
  memWrites += 1
  bucket.count += 1
  if (bucket.count > limit) {
    return { ok: false, remaining: 0, resetAt: bucket.resetAt }
  }
  return { ok: true, remaining: limit - bucket.count, resetAt: bucket.resetAt }
}

export async function checkRateLimit(userId, roomId) {
  const limit = parseInt(process.env.AI_RATE_LIMIT || "20", 10)
  const key = `ai:rl:${userId}:${roomId}`
  const redis = getRedisClient()

  if (redis) {
    try {
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, WINDOW_MS / 1000)
      if (count > limit) {
        const ttl = await redis.ttl(key)
        return { ok: false, remaining: 0, resetAt: Date.now() + Math.max(0, ttl) * 1000 }
      }
      return { ok: true, remaining: Math.max(0, limit - count), resetAt: Date.now() + WINDOW_MS }
    } catch {
      return memCheck(key, limit)
    }
  }

  return memCheck(key, limit)
}
