// Centralized AI configuration — single source of truth for the AI Assistant
// (chat), AI Semantic Search, and the AI Agent engine. Every value can be
// overridden via environment variables (see ../.env.example).

export const DEFAULT_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile"
export const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
export const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || "120000", 10)
export const GROQ_MAX_TOKENS = parseInt(process.env.GROQ_MAX_TOKENS || "4096", 10)
export const AGENT_MAX_TURNS = parseInt(process.env.AI_AGENT_MAX_TURNS || "8", 10)
export const MAX_EDIT_CHARS = 200000
export const MAX_GREP_MATCHES = parseInt(process.env.MAX_GREP_MATCHES || "60", 10)
export const MAX_TOOL_OUTPUT_CHARS = 12000
export const MAX_AI_CONVERSATION_MESSAGES = parseInt(process.env.MAX_AI_CONVERSATION_MESSAGES || "200", 10)
export const MAX_AGENT_INPUT_CHARS = parseInt(process.env.MAX_AGENT_INPUT_CHARS || "20000", 10)
export const PENDING_EDIT_TTL_MS = parseInt(process.env.AI_PROPOSAL_TTL_MS || String(30 * 60 * 1000), 10)
