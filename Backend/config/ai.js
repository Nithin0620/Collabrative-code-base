// Centralized AI configuration — single source of truth for the AI Assistant
// (chat), AI Semantic Search, and the AI Agent engine. Every value can be
// overridden via environment variables (see ../.env.example).

// Parse a positive integer from the environment, falling back to `fallback`
// when the value is missing or malformed, so a single typo cannot disable the
// agent/chat path (e.g. NaN reaching AbortSignal.timeout).
function positiveInt(raw, fallback) {
  const n = Number.parseInt(raw, 10)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
export const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
export const GROQ_TIMEOUT_MS = positiveInt(process.env.GROQ_TIMEOUT_MS, 120000)
export const GROQ_MAX_TOKENS = positiveInt(process.env.GROQ_MAX_TOKENS, 4096)
export const AGENT_MAX_TURNS = positiveInt(process.env.AI_AGENT_MAX_TURNS, 8)
export const MAX_EDIT_CHARS = 200000
export const MAX_GREP_MATCHES = positiveInt(process.env.MAX_GREP_MATCHES, 60)
export const MAX_TOOL_OUTPUT_CHARS = positiveInt(process.env.MAX_TOOL_OUTPUT_CHARS, 12000)
export const MAX_AI_CONVERSATION_MESSAGES = positiveInt(process.env.MAX_AI_CONVERSATION_MESSAGES, 200)
export const MAX_AGENT_INPUT_CHARS = positiveInt(process.env.MAX_AGENT_INPUT_CHARS, 20000)
export const PENDING_EDIT_TTL_MS = positiveInt(process.env.AI_PROPOSAL_TTL_MS, 30 * 60 * 1000)
