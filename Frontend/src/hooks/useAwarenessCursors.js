

export function injectCursorStyles(awareness, localClientID) {
  if (!awareness) return
  let styleEl = document.getElementById("y-monaco-cursors")
  if (!styleEl) {
    styleEl = document.createElement("style")
    styleEl.id = "y-monaco-cursors"
    document.head.appendChild(styleEl)
  }

  const states = awareness.getStates()
  let css = ""

  states.forEach((state, clientID) => {
    if (clientID === localClientID) return
    const u = state.user
    if (!u || !u.color) return

    const color = u.color
    const name = (u.name || "Anonymous").replace(/"/g, '\\"')
    css += `
      .yRemoteSelection-${clientID} {
        background-color: ${color}33;
      }
      .yRemoteSelectionHead-${clientID} {
        position: relative;
        border-left: 2px solid ${color};
        margin-left: -1px;
        box-sizing: border-box;
      }
      .yRemoteSelectionHead-${clientID}::after {
        content: "${name}";
        position: absolute;
        top: -1.6em;
        left: -1px;
        font-size: 11px;
        font-family: system-ui, sans-serif;
        font-weight: 600;
        line-height: normal;
        padding: 1px 5px;
        border-radius: 4px 4px 4px 0;
        white-space: nowrap;
        color: white;
        background-color: ${color};
        pointer-events: none;
        z-index: 10;
      }
    `
  })

  styleEl.textContent = css
}
