export function initSSE(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })
  res.flushHeaders?.()
}

export function sendSSE(res, data) {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

export function sendDone(res) {
  if (res.writableEnded) return
  res.write("data: [DONE]\n\n")
  res.end()
}

export function sendSSEError(res, error) {
  if (res.writableEnded) return
  res.write(`data: ${JSON.stringify({ error: error?.message || String(error) })}\n\n`)
  res.end()
}
