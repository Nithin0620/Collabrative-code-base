import { decode, encode } from "gpt-tokenizer"

// Token estimation shared by the prompt builder. Uses the GPT-4 (cl100k_base)
// tokenizer for accuracy; falls back to the chars/4 heuristic if the package
// ever fails to load. Per design doc §8.1, this is the Phase 2 upgrade.
export default function estimateTokens(text) {
  const s = text || ""
  if (!s) return 0
  try {
    return encode(s).length
  } catch {
    return Math.ceil(s.length / 4)
  }
}

export function truncateMiddleByTokens(text, maxTokens) {
  const s = String(text || "")
  if (!s) return ""
  const limit = Math.max(1, Number.parseInt(maxTokens, 10) || 1)
  try {
    const tokens = encode(s)
    if (tokens.length <= limit) return s
    const marker = "\n... [truncated] ...\n"
    const markerTokens = encode(marker)
    if (markerTokens.length >= limit) return decode(tokens.slice(0, limit))
    const contentBudget = limit - markerTokens.length
    const headCount = Math.ceil(contentBudget / 2)
    const tailCount = Math.floor(contentBudget / 2)
    return decode(tokens.slice(0, headCount)) + marker + decode(tokens.slice(tokens.length - tailCount))
  } catch {
    const maxChars = limit * 4
    if (s.length <= maxChars) return s
    const marker = "\n... [truncated] ...\n"
    if (maxChars <= marker.length) return s.slice(0, maxChars)
    const budget = maxChars - marker.length
    const head = Math.floor(budget * 0.5)
    const tail = budget - head
    return s.slice(0, head) + marker + s.slice(-tail)
  }
}
