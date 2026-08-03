import Project from "../models/Project.js"
import { getRoomIndex } from "./symbolIndex.js"
import { embed, isEmbeddingEnabled } from "./embeddingService.js"

// Per-room in-memory vector store: roomId -> { chunks, vectors, updatedAt }.
// A Redis/vector-DB swap is hidden behind this module's interface.
const roomVectors = new Map()
const MAX_ROOMS = 50 // evict least-recently-rebuilt rooms when exceeded

const WINDOW = 100 // lines per fixed-size chunk
const OVERLAP = 20 // overlapping lines between windows
const MAX_CHUNK_LINES = 150
const MIN_CHUNK_LINES = 8
const MAX_CHUNK_CHARS = 12000
const EMBED_BATCH = 64
const MAX_TOP_K = 50

function makeChunk(lines, start, end) {
  const parts = []
  let len = 0
  let actualEnd = end
  for (let i = start; i <= end; i++) {
    const line = lines[i - 1] ?? ""
    if (!parts.length && line.length > MAX_CHUNK_CHARS) {
      const text = line.slice(0, MAX_CHUNK_CHARS)
      return text.trim() ? { startLine: start, endLine: start, text } : null
    }
    if (len + line.length + 1 > MAX_CHUNK_CHARS) {
      actualEnd = i - 1
      break
    }
    parts.push(line)
    len += line.length + 1
  }
  const text = parts.join("\n")
  if (!parts.length || !text.trim()) return null
  return { startLine: start, endLine: Math.max(start, actualEnd), text }
}

// Split file content into semantic-ish chunks: prefer symbol boundaries, merge
// tiny segments, and fall back to fixed ~100-line windows with overlap.
function chunkContent(content, symbols) {
  const lines = String(content || "").split("\n")
  if (!lines.length) return []

  const bounds = [1]
  for (const s of symbols || []) {
    const l = Math.min(lines.length, Math.max(1, s.line))
    if (!bounds.includes(l)) bounds.push(l)
  }
  bounds.sort((a, b) => a - b)

  const chunks = []
  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i]
    const end = i + 1 < bounds.length ? bounds[i + 1] - 1 : lines.length
    if (end < start) continue
    const size = end - start + 1

    if (size < MIN_CHUNK_LINES) {
      const prev = chunks[chunks.length - 1]
      if (prev && prev.endLine - prev.startLine < MAX_CHUNK_LINES) {
        const merged = makeChunk(lines, prev.startLine, end)
        if (!merged) continue
        prev.text = merged.text
        prev.endLine = merged.endLine
        continue
      }
    }

    if (size > MAX_CHUNK_LINES) {
      for (let s = start; s <= end; s += WINDOW - OVERLAP) {
        const e = Math.min(s + WINDOW - 1, end)
        const c = makeChunk(lines, s, e)
        if (c) chunks.push(c)
        if (e >= end) break
      }
      continue
    }

    const c = makeChunk(lines, start, end)
    if (c) chunks.push(c)
  }
  return chunks
}

function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

async function buildRoomVectors(roomId, index) {
  if (!isEmbeddingEnabled() || !index) return null

  const chunks = []
  for (const [path, entry] of index) {
    if (!entry.content) continue
    for (const c of chunkContent(entry.content, entry.symbols)) {
      chunks.push({ path, startLine: c.startLine, endLine: c.endLine, text: c.text })
    }
  }
  if (!chunks.length) return null

  const vectors = []
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH).map((c) => c.text)
    const vecs = await embed(batch)
    if (vecs.length !== batch.length) {
      throw new Error("Embedding provider returned a different vector count than requested")
    }
    vectors.push(...vecs)
  }

  const store = { chunks, vectors, updatedAt: Date.now() }
  roomVectors.set(roomId, store)
  evictIfNeeded()
  return store
}

// Bound the in-memory store to MAX_ROOMS by evicting the least-recently-rebuilt
// rooms, so long-running processes cannot leak memory for every room ever seen.
function evictIfNeeded() {
  if (roomVectors.size <= MAX_ROOMS) return
  const overflow = roomVectors.size - MAX_ROOMS
  const oldest = [...roomVectors.entries()]
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    .slice(0, overflow)
  for (const [roomId] of oldest) roomVectors.delete(roomId)
}

// Synchronous check whether a room already has fresh vectors in memory.
export function hasRoomVectors(roomId, updatedAt) {
  const store = roomVectors.get(roomId)
  return !!(store && store.vectors && (!updatedAt || updatedAt <= store.updatedAt))
}

// Rebuild a room's vectors from a freshly built symbol index (called on save).
export async function rebuildRoomVectors(roomId, index) {
  return buildRoomVectors(roomId, index)
}

// Invalidate a room's cached vectors (e.g. after a project restore/sync).
export function clearRoomVectors(roomId) {
  roomVectors.delete(roomId)
}

// Get the vector store for a room, lazily rebuilding it when stale or missing.
export async function getRoomVectors(roomId, project) {
  const updatedAt = project ? new Date(project.updatedAt || 0).getTime() : null
  const existing = roomVectors.get(roomId)
  if (existing && (!updatedAt || updatedAt <= existing.updatedAt)) return existing

  const index = await getRoomIndex(roomId, project)
  return buildRoomVectors(roomId, index)
}

// Embed the query and return the top-k most similar chunks with cosine scores.
export async function semanticSearch(roomId, project, query, { topK = 5 } = {}) {
  if (!isEmbeddingEnabled()) return null
  const q = String(query || "").trim()
  if (!q) return null

  const store = await getRoomVectors(roomId, project)
  if (!store || !store.chunks.length) return null

  const k = Number.isFinite(topK) ? Math.floor(topK) : 5
  const safeTopK = Math.min(Math.max(k, 1), MAX_TOP_K)
  const [queryVec] = await embed([q])
  const scored = store.chunks.map((c, i) => ({ ...c, score: cosine(queryVec, store.vectors[i]) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, safeTopK).map(({ text, ...c }) => ({ ...c, score: Number(c.score.toFixed(4)) }))
}

export { chunkContent, cosine }
