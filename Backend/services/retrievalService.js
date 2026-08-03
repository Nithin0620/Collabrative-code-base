import Project from "../models/Project.js"
import { getRoomIndex } from "./symbolIndex.js"
import { embed, isEmbeddingEnabled } from "./embeddingService.js"

// Per-room in-memory vector store: roomId -> { chunks, vectors, updatedAt }.
// A Redis/vector-DB swap is hidden behind this module's interface.
const roomVectors = new Map()

const WINDOW = 100 // lines per fixed-size chunk
const OVERLAP = 20 // overlapping lines between windows
const MAX_CHUNK_LINES = 150
const MIN_CHUNK_LINES = 8
const MAX_CHUNK_CHARS = 12000
const EMBED_BATCH = 64

function makeChunk(lines, start, end) {
  const parts = []
  let len = 0
  let actualEnd = end
  for (let i = start; i <= end; i++) {
    const line = lines[i - 1] ?? ""
    if (len + line.length + 1 > MAX_CHUNK_CHARS) {
      actualEnd = i - 1
      break
    }
    parts.push(line)
    len += line.length + 1
  }
  if (!parts.length) return null
  return { startLine: start, endLine: Math.max(start, actualEnd), text: parts.join("\n") }
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
        prev.endLine = end
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
    vectors.push(...vecs)
  }

  const store = { chunks, vectors, updatedAt: Date.now() }
  roomVectors.set(roomId, store)
  return store
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

  const [queryVec] = await embed([q])
  const scored = store.chunks.map((c, i) => ({ ...c, score: cosine(queryVec, store.vectors[i]) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topK).map(({ text, ...c }) => ({ ...c, score: Number(c.score.toFixed(4)) }))
}

export { chunkContent, cosine }
