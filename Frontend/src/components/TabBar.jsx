import { useState, useRef, useCallback, useEffect } from 'react'
import { getFileInfo } from '../lib/fileTree'

export default function TabBar({ tabs, activeTabId, onTabClick, onTabDoubleClick, onTabClose, onTabCloseOthers, onTabCloseAll, onTabCloseRight }) {
  const scrollRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, tabId }

  // Auto-scroll active tab into view
  useEffect(() => {
    if (!scrollRef.current || !activeTabId) return
    const activeEl = scrollRef.current.querySelector(`[data-tabid="${activeTabId}"]`)
    if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [activeTabId])

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const handleMouseDown = useCallback((e, tabId) => {
    if (e.button === 1) { // Middle click
      e.preventDefault()
      onTabClose(tabId)
    }
  }, [onTabClose])

  const handleContextMenu = useCallback((e, tabId) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }, [])

  if (tabs.length === 0) return null

  return (
    <div className="relative flex items-stretch bg-gray-950 border-b border-gray-700 h-9 shrink-0" style={{ minHeight: 36 }}>
      <div ref={scrollRef} className="flex-1 flex items-stretch overflow-x-auto overflow-y-hidden" style={{ scrollbarWidth: 'none' }}>
        {tabs.map((tab) => {
          const info = getFileInfo(tab.name)
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              data-tabid={tab.id}
              className={`group flex items-center gap-1.5 px-3 py-1 border-r border-gray-800 cursor-pointer shrink-0 relative select-none transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-950 text-gray-400 hover:bg-gray-900/60 hover:text-gray-200'
              }`}
              style={{ maxWidth: 200, minWidth: 80 }}
              onClick={() => onTabClick(tab.id)}
              onDoubleClick={() => onTabDoubleClick?.(tab.id)}
              onMouseDown={(e) => handleMouseDown(e, tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
            >
              {/* Active tab indicator line at bottom */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-amber-400" />
              )}
              {/* Language color dot */}
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
              {/* Filename */}
              <span className="text-xs font-medium truncate flex-1" style={{ maxWidth: 120 }}>
                {tab.name}
              </span>
              {/* Dirty dot or close button */}
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                {tab.dirty ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400 group-hover:hidden" />
                ) : null}
                <button
                  className={`w-4 h-4 flex items-center justify-center rounded hover:bg-gray-700 text-gray-500 hover:text-white transition-colors ${
                    tab.dirty ? 'hidden group-hover:flex' : 'opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => { e.stopPropagation(); onTabClose(tab.id) }}
                  title="Close (Ctrl+W)"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[999] bg-gray-800 border border-gray-700 rounded shadow-xl text-xs py-1"
          style={{ top: contextMenu.y, left: contextMenu.x, minWidth: 160 }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: 'Close', action: () => onTabClose(contextMenu.tabId) },
            { label: 'Close Others', action: () => onTabCloseOthers?.(contextMenu.tabId) },
            { label: 'Close to the Right', action: () => onTabCloseRight?.(contextMenu.tabId) },
            { label: 'Close All', action: () => onTabCloseAll?.() },
          ].map(({ label, action }) => (
            <button
              key={label}
              className="w-full text-left px-3 py-1.5 text-gray-300 hover:bg-gray-700 hover:text-white transition-colors cursor-pointer"
              onClick={() => { action(); setContextMenu(null) }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
