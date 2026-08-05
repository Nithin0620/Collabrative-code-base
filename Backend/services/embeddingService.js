// Pluggable embedding provider. Design doc §8.3 / §10: Groq has no embeddings
// endpoint, so this is a config swap:
//   EMBEDDING_PROVIDER=local   (default) -> @xenova/transformers, model downloads
//                                          once from Hugging Face, $0 + private
//   EMBEDDING_PROVIDER=openai|jina|hf    -> OpenAI-compatible /embeddings API
// The provider is selected once at module load and can be swapped via env.

const PROVIDER = String(process.env.EMBEDDING_PROVIDER || "local").toLowerCase()
const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2"
const LOCAL_MODEL = process.env.EMBEDDING_MODEL || DEFAULT_MODEL

let localExtractorPromise = null

async function getLocalExtractor() {
  if (!localExtractorPromise) {
    localExtractorPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers")
      return pipeline("feature-extraction", LOCAL_MODEL)
    })()
  }
  return localExtractorPromise
}

function getApiConfig() {
  const key = process.env.EMBEDDING_API_KEY
  const base = process.env.EMBEDDING_BASE_URL
  if (!key || !base) return null
  return { key, base, model: process.env.EMBEDDING_MODEL || "text-embedding-3-small" }
}

// True when a provider is configured. Local always counts as configured; load
// failures surface at embed time and are caught by callers.
export function isEmbeddingEnabled() {
  if (PROVIDER === "local") return true
  return !!getApiConfig()
}

export function getEmbeddingProvider() {
  return PROVIDER
}

// Embed a list of strings into normalized vectors.
export async function embed(texts) {
  const list = (texts || []).filter((t) => typeof t === "string" && t.trim())
  if (!list.length) return []

  if (PROVIDER === "local") {
    const extractor = await getLocalExtractor()
    const out = await extractor(list, { pooling: "mean", normalize: true })
    if (Array.isArray(out)) {
      return out.map((t) => Array.from(t.data))
    }
    const dims = out.dims || []
    const rows = typeof out.tolist === "function" ? out.tolist() : Array.from(out.data)
    if (dims.length <= 1) return [Array.from(rows)]
    return rows.map((row) => Array.from(row))
  }

  const cfg = getApiConfig()
  if (!cfg) throw new Error("Embedding provider is not configured (EMBEDDING_API_KEY / EMBEDDING_BASE_URL)")

  const res = await fetch(cfg.base.replace(/\/+$/, "") + "/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + cfg.key,
    },
    body: JSON.stringify({ model: cfg.model, input: list }),
  })
  if (!res.ok) {
    throw new Error("Embedding API error (" + res.status + ")")
  }
  const data = await res.json()
  return (data.data || []).map((d) => d.embedding)
}
