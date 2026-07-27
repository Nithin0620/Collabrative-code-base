import JSZip from "jszip"
import { saveAs } from "file-saver"

export async function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  saveAs(blob, filename)
}

export async function downloadSnapshotAsZip(snapshot) {
  const zip = new JSZip()
  const parsed = JSON.parse(snapshot.data)
  const fileTree = parsed.fileTree || {}
  const files = parsed.files || []

  const buildPath = (item, currentPath) => {
    if (item.parentId && fileTree[item.parentId]) {
      return buildPath(fileTree[item.parentId], currentPath) + "/" + item.name
    }
    return currentPath ? currentPath + "/" + item.name : item.name
  }

  Object.values(fileTree).forEach((item) => {
    if (item.type === "file") {
      const file = files.find((f) => f.id === item.id)
      const path = buildPath(item, "")
      zip.file(path, file?.content || "")
    }
  })

  const blob = await zip.generateAsync({ type: "blob" })
  const label = snapshot.message || snapshot.label || "snapshot"
  const safeName = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50)
  saveAs(blob, safeName + ".zip")
}

export async function downloadProjectAsZip(fileTree, getFileContent) {
  const zip = new JSZip()

  const buildPath = (item, currentPath) => {
    if (item.parentId && fileTree[item.parentId]) {
      return buildPath(fileTree[item.parentId], currentPath) + "/" + item.name
    }
    return currentPath ? currentPath + "/" + item.name : item.name
  }

  Object.values(fileTree).forEach((item) => {
    if (item.type === "file") {
      const path = buildPath(item, "")
      const content = getFileContent(item.id)
      zip.file(path, content || "")
    }
  })

  const blob = await zip.generateAsync({ type: "blob" })
  const folderName = fileTree && Object.values(fileTree).length > 0
    ? (Object.values(fileTree)[0]?.name || "project")
    : "project"
  saveAs(blob, (folderName.split(".")[0] || "project") + ".zip")
}
