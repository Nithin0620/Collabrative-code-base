import { encode } from "gpt-tokenizer"

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
