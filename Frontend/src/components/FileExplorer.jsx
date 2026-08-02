import { useState, useRef, useEffect } from "react"
import { getFileInfo } from "../lib/fileTree"

function FileIcon({ filename, size = 16 }) {
  const info = getFileInfo(filename)
  return (
    <span
      className="inline-flex items-center justify-center text-[9px] font-bold rounded shrink-0"
      style={{ width: size, height: size, backgroundColor: info.color + "22", color: info.color }}
    >
      {info.label.slice(0, 2)}
    </span>
  )
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onCancel}>
      <div
        className="bg-gray-800 border border-gray-600 rounded-xl shadow-2xl p-5 w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-gray-200 mb-4">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-amber-500 hover:bg-amber-400 transition-colors cursor-pointer"
          >
            Move
          </button>
        </div>
      </div>
    </div>
  )
}

function TreeItem({ item, depth, selectedFileId, activeFolderId, draggedId, dragOverId, onSelect, onFolderSelect, onRename, onConfirmDelete, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, children, renamingId, setRenamingId, readOnly }) {
  const isFolder = item.type === "folder"
  const [expanded, setExpanded] = useState(true)
  const [editName, setEditName] = useState(item.name)
  const inputRef = useRef(null)
  const isRenaming = renamingId === item.id

  const isActiveFolder = isFolder && activeFolderId === item.id
  const isSelected = selectedFileId === item.id
  const isDragOver = isFolder && dragOverId === item.id
  const isDragging = draggedId === item.id

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const saveRename = () => {
    const name = editName.trim()
    if (name && name !== item.name) {
      onRename(item.id, name)
    }
    setRenamingId(null)
  }

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1 text-sm cursor-pointer group transition-colors ${
          isSelected
            ? "bg-gray-800 text-white"
            : isActiveFolder
              ? "bg-gray-800/50 text-gray-200"
              : isDragOver
                ? "bg-amber-500/10 text-gray-200 ring-1 ring-amber-500/40"
                : isDragging
                  ? "opacity-40 text-gray-300"
                  : "text-gray-300 hover:bg-gray-800/50"
        }`}
        style={{ paddingLeft: `${Math.min(depth * 10 + 6, 40)}px` }}
        draggable={!isRenaming && !readOnly}
        onDragStart={(e) => onDragStart(e, item.id)}
        onDragEnd={onDragEnd}
        onDragOver={isFolder && !readOnly ? (e) => onDragOver(e, item.id) : undefined}
        onDragLeave={isFolder && !readOnly ? onDragLeave : undefined}
        onDrop={isFolder && !readOnly ? (e) => onDrop(e, item.id) : undefined}
        onClick={() => {
          if (isFolder) {
            setExpanded(!expanded)
            onFolderSelect(item.id)
          } else {
            onSelect(item)
          }
        }}
      >
        {isFolder && (
          <svg
            className={`w-3 h-3 text-gray-500 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
        {!isFolder && <span className="w-3" />}

        {isFolder ? (
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
        ) : (
          <FileIcon filename={item.name} />
        )}

        {isRenaming && !readOnly ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={saveRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveRename()
              if (e.key === "Escape") setRenamingId(null)
            }}
            className="flex-1 min-w-0 bg-gray-700 text-white text-sm px-1 rounded border border-gray-500 focus:outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm">{item.name}</span>
        )}

        {!readOnly && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
            <button
              onClick={(e) => { e.stopPropagation(); setRenamingId(item.id); setEditName(item.name) }}
              className="p-0.5 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 cursor-pointer"
              title="Rename"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onConfirmDelete({ id: item.id, name: item.name, type: item.type })
              }}
              className="p-0.5 rounded hover:bg-red-900/30 text-gray-500 hover:text-red-400 cursor-pointer"
              title="Delete"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {isFolder && expanded && children}
    </div>
  )
}

function TreeRecursive({ items, depth, selectedFileId, activeFolderId, draggedId, dragOverId, onSelect, onFolderSelect, onRename, onConfirmDelete, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, renamingId, setRenamingId, childrenMap, readOnly }) {
  return items.map((item) => (
    <TreeItem
      key={item.id}
      item={item}
      depth={depth}
      selectedFileId={selectedFileId}
      activeFolderId={activeFolderId}
      draggedId={draggedId}
      dragOverId={dragOverId}
      onSelect={onSelect}
      onFolderSelect={onFolderSelect}
      onRename={onRename}
      onConfirmDelete={onConfirmDelete}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      renamingId={renamingId}
      setRenamingId={setRenamingId}
      readOnly={readOnly}
    >
      {childrenMap[item.id] && (
        <TreeRecursive
          items={childrenMap[item.id]}
          depth={depth + 1}
          selectedFileId={selectedFileId}
          activeFolderId={activeFolderId}
          draggedId={draggedId}
          dragOverId={dragOverId}
          onSelect={onSelect}
          onFolderSelect={onFolderSelect}
          onRename={onRename}
          onConfirmDelete={onConfirmDelete}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          childrenMap={childrenMap}
          readOnly={readOnly}
        />
      )}
    </TreeItem>
  ))
}

export default function FileExplorer({ fileTree, selectedFileId, hiddenPaths, onSelect, onCreateFile, onCreateFolder, onRename, onDelete, onMove, readOnly }) {
  const [contextMenu, setContextMenu] = useState(null)
  const [showNew, setShowNew] = useState(null)
  const [newName, setNewName] = useState("")
  const [renamingId, setRenamingId] = useState(null)
  const [activeFolderId, setActiveFolderId] = useState(null)
  const [draggedId, setDraggedId] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [confirmMove, setConfirmMove] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [showHidden, setShowHidden] = useState(false)
  const menuRef = useRef(null)
  const inputRef = useRef(null)

  const items = Object.values(fileTree)
  const roots = items.filter((i) => !i.parentId)
  const childrenMap = {}
  items.forEach((item) => {
    if (item.parentId) {
      if (!childrenMap[item.parentId]) childrenMap[item.parentId] = []
      childrenMap[item.parentId].push(item)
    }
  })

  const sortItems = (arr) => arr.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name)
    return a.type === "folder" ? -1 : 1
  })
  sortItems(roots)
  Object.values(childrenMap).forEach(sortItems)

  useEffect(() => {
    if (showNew && inputRef.current) {
      inputRef.current.focus()
    }
  }, [showNew])

  useEffect(() => {
    const handleClick = () => { setContextMenu(null); setShowNew(null) }
    document.addEventListener("click", handleClick)
    return () => document.removeEventListener("click", handleClick)
  }, [])

  const getParentId = () => {
    if (contextMenu?.id) return contextMenu.id
    if (activeFolderId && fileTree[activeFolderId]?.type === "folder") return activeFolderId
    return null
  }

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    const parentId = getParentId()
    if (showNew === "file") {
      onCreateFile(name, parentId)
    } else {
      onCreateFolder(name, parentId)
    }
    setNewName("")
    setShowNew(null)
  }

  const isDescendant = (parentId, checkId) => {
    if (parentId === checkId) return true
    return (childrenMap[parentId] || []).some((c) => isDescendant(c.id, checkId))
  }

  const handleDragStart = (e, itemId) => {
    if (readOnly) return
    setDraggedId(itemId)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", itemId)
  }

  const handleDragEnd = () => {
    setDraggedId(null)
    setDragOverId(null)
  }

  const handleDragOver = (e, folderId) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    setDragOverId(folderId)
  }

  const handleDragLeave = () => {
    setDragOverId(null)
  }

  const handleDrop = (e, targetFolderId) => {
    e.preventDefault()
    setDragOverId(null)
    const itemId = e.dataTransfer.getData("text/plain")
    if (!itemId || itemId === targetFolderId) return

    const draggedItem = fileTree[itemId]
    if (!draggedItem) return

    if (draggedItem.type === "folder" && isDescendant(itemId, targetFolderId)) return

    if (draggedItem.parentId === targetFolderId) return

    setConfirmMove({
      itemId,
      targetFolderId,
      itemName: draggedItem.name,
      targetName: fileTree[targetFolderId]?.name || "root",
    })
  }

  const handleConfirmMove = () => {
    if (confirmMove) {
      onMove(confirmMove.itemId, confirmMove.targetFolderId)
      setConfirmMove(null)
    }
  }

  const parentLabel = (() => {
    const pid = getParentId()
    if (!pid) return "root"
    return fileTree[pid]?.name || "root"
  })()

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {confirmMove && (
        <ConfirmModal
          message={`Move "${confirmMove.itemName}" into "${confirmMove.targetName}"?`}
          onConfirm={handleConfirmMove}
          onCancel={() => setConfirmMove(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          message={confirmDelete.type === "folder"
            ? `Delete folder "${confirmDelete.name}" and all its contents?`
            : `Delete "${confirmDelete.name}"?`}
          onConfirm={() => { onDelete(confirmDelete.id); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      <div className="px-2 py-2 border-b border-gray-800">
        {!readOnly && (
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); setShowNew("file"); setContextMenu(null) }}
              className="flex-1 min-w-0 px-2 py-1 rounded text-[11px] text-gray-400 bg-gray-800 hover:bg-gray-700 hover:text-gray-300 transition-colors cursor-pointer truncate"
            >
              + File
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowNew("folder"); setContextMenu(null) }}
              className="flex-1 min-w-0 px-2 py-1 rounded text-[11px] text-gray-400 bg-gray-800 hover:bg-gray-700 hover:text-gray-300 transition-colors cursor-pointer truncate"
            >
              + Folder
            </button>
          </div>
        )}
        {readOnly && (
          <p className="text-[10px] text-gray-500 text-center">Read-only mode</p>
        )}
        {activeFolderId && fileTree[activeFolderId] && (
          <p className="text-[10px] text-gray-500 mt-1 truncate">
            Creating in: {fileTree[activeFolderId].name}
          </p>
        )}
        {hiddenPaths && hiddenPaths.length > 0 && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowHidden((prev) => !prev)}
              className="w-full flex items-center gap-1 px-1.5 py-1 rounded text-[10px] text-gray-500 bg-gray-800/50 hover:bg-gray-800 hover:text-gray-300 transition-colors cursor-pointer"
              title="node_modules, .git and .gitignore'd files are excluded from the editor"
            >
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="flex-1 text-left truncate">
                {hiddenPaths.length} hidden file{hiddenPaths.length !== 1 ? "s" : ""}
              </span>
              <svg className={`w-3 h-3 shrink-0 transition-transform ${showHidden ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            {showHidden && (
              <div className="mt-1 p-1.5 rounded bg-gray-800/40 border border-gray-800 max-h-24 overflow-y-auto">
                {hiddenPaths.map((p, i) => (
                  <p key={i} className="text-[10px] font-mono text-gray-500 truncate px-1 py-0.5">
                    {p}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto"
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY, id: null })
        }}
      >
        {roots.length === 0 && !showNew ? (
          <div className="px-3 py-6 text-center">
            <p className="text-gray-500 text-xs mb-2">No files yet</p>
            <button
              onClick={(e) => { e.stopPropagation(); setShowNew("file"); setContextMenu(null) }}
              className="text-xs text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              + Create a file
            </button>
          </div>
        ) : (
          <TreeRecursive
            items={roots}
            depth={0}
            selectedFileId={selectedFileId}
            activeFolderId={activeFolderId}
            draggedId={draggedId}
            dragOverId={dragOverId}
            onSelect={onSelect}
            onFolderSelect={(id) => setActiveFolderId(id === activeFolderId ? null : id)}
            onRename={onRename}
            onConfirmDelete={(item) => setConfirmDelete(item)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            childrenMap={childrenMap}
            readOnly={readOnly}
          />
        )}

        {showNew && (
          <div className="px-3 py-1">
            <div className="flex items-center gap-1.5" style={{ paddingLeft: "12px" }}>
              <FileIcon filename={newName || (showNew === "file" ? "a.txt" : "folder")} />
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                  if (e.key === "Escape") { setShowNew(null); setNewName("") }
                }}
                onBlur={handleCreate}
                placeholder={showNew === "file" ? "filename.ext" : "folder name"}
                className="flex-1 min-w-0 bg-gray-700 text-white text-sm px-1.5 py-0.5 rounded border border-gray-500 focus:outline-none"
              />
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5" style={{ paddingLeft: "24px" }}>
              in {parentLabel}
            </p>
          </div>
        )}

        {contextMenu && !readOnly && (
          <div
            ref={menuRef}
            className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setShowNew("file"); setContextMenu(null) }}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              New File
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowNew("folder"); setContextMenu(null) }}
              className="w-full px-3 py-1.5 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center gap-2 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              New Folder
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
