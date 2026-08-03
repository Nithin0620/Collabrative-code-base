const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1"
const GROQ_TIMEOUT_MS = parseInt(process.env.GROQ_TIMEOUT_MS || "120000", 10)

// Stream an OpenAI-compatible chat completion from Groq. Calls onToken with
// each content delta. Throws on upstream errors. Respects `signal` for abort.
export async function streamGroqChat({ messages, model, temperature = 0.3, maxTokens, signal, onToken }) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error("AI assistant is not configured (missing GROQ_API_KEY)")
  }

  const timeoutSignal = AbortSignal.timeout(GROQ_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true,
      max_tokens: maxTokens,
    }),
    signal: combined,
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "")
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop()
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith("data:")) continue
      const payload = trimmed.slice(5).trim()
      if (payload === "[DONE]") return
      let json
      try {
        json = JSON.parse(payload)
      } catch {
        continue
      }
      if (json.error) {
        throw new Error(json.error.message || json.error || "AI stream error")
      }
      const delta = json.choices?.[0]?.delta?.content
      if (typeof delta === "string" && delta.length > 0) {
        onToken?.(delta)
      }
    }
  }
}
