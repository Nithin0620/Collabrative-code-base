import React from "react"

export default function MarkdownPreview({ content, filename, onClose }) {
  // Simple, safe client-side markdown formatter
  const renderMarkdown = (md) => {
    if (!md) return "<p class='text-gray-500 italic'>No content to preview</p>"

    let html = md
      // Escape basic HTML
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")

      // Code blocks (fenced)
      .replace(/```([a-zA-Z0-9_]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="bg-gray-950 p-3 rounded-lg border border-gray-700 text-xs font-mono overflow-x-auto my-3 text-amber-200"><code>${code.trim()}</code></pre>`
      })

      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-gray-800 text-amber-400 px-1.5 py-0.5 rounded text-xs font-mono">$1</code>')

      // Headings
      .replace(/^### (.*$)/gim, '<h3 class="text-base font-bold text-gray-200 mt-4 mb-2 border-b border-gray-700/50 pb-1">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold text-white mt-5 mb-2 border-b border-gray-700 pb-1">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-xl font-extrabold text-amber-400 mt-6 mb-3 border-b border-amber-500/30 pb-2">$1</h1>')

      // Blockquotes
      .replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-amber-500 bg-amber-500/10 px-3 py-1.5 my-2 text-gray-300 italic rounded-r">$1</blockquote>')

      // Bold & Italic
      .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-white">$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em class="italic text-gray-300">$1</em>')

      // Task lists
      .replace(/- \[x\] (.*$)/gim, '<li class="flex items-center gap-2 my-1 text-green-400"><input type="checkbox" checked disabled class="rounded" /> <span>$1</span></li>')
      .replace(/- \[ \] (.*$)/gim, '<li class="flex items-center gap-2 my-1 text-gray-400"><input type="checkbox" disabled class="rounded" /> <span>$1</span></li>')

      // Unordered Lists
      .replace(/^- (.*$)/gim, '<li class="ml-4 list-disc text-gray-300 my-0.5">$1</li>')
      .replace(/^\* (.*$)/gim, '<li class="ml-4 list-disc text-gray-300 my-0.5">$1</li>')

      // Horizontal Rule
      .replace(/^---$/gim, '<hr class="my-4 border-gray-700" />')

      // Paragraphs
      .replace(/\n\n/g, '</p><p class="my-2 text-gray-300 leading-relaxed text-sm">')

    return `<p class="my-2 text-gray-300 leading-relaxed text-sm">${html}</p>`
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 border-l border-gray-700 select-text overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-gray-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-amber-400">📄 Markdown Preview</span>
          {filename && <span className="text-[11px] text-gray-400 font-mono">({filename})</span>}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer text-xs"
            title="Close Preview"
          >
            ✕
          </button>
        )}
      </div>

      {/* Rendered Preview */}
      <div
        className="flex-1 overflow-y-auto p-4 prose prose-invert max-w-none text-sm"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  )
}
