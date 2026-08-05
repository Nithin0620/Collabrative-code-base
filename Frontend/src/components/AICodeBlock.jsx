import { useState } from "react"

export default function AICodeBlock({ language, code, onInsert }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700">
      <div className="flex items-center justify-between px-2 py-1 bg-gray-950 border-b border-gray-700">
        <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
          {language || "code"}
        </span>
        <div className="flex items-center gap-1">
          {onInsert && (
            <button
              onClick={() => onInsert(code)}
              className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
              title="Insert at cursor"
            >
              Insert
            </button>
          )}
          <button
            onClick={copy}
            className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors cursor-pointer"
            title="Copy code"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="bg-gray-950 p-2 overflow-x-auto text-xs leading-relaxed">
        <code className="font-mono text-gray-200 whitespace-pre">{code}</code>
      </pre>
    </div>
  )
}
