const ROLE_STYLES = {
  owner: { bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30", label: "Owner" },
  editor: { bg: "bg-blue-500/20", text: "text-blue-400", border: "border-blue-500/30", label: "Editor" },
  viewer: { bg: "bg-gray-500/20", text: "text-gray-400", border: "border-gray-500/30", label: "Viewer" },
}

export default function RoleBadge({ role, size = "xs" }) {
  if (!role) return null
  const style = ROLE_STYLES[role] || ROLE_STYLES.viewer
  const sizeClasses = size === "xs"
    ? "text-[8px] px-1 py-px"
    : "text-[10px] px-1.5 py-0.5"

  return (
    <span className={`${style.bg} ${style.text} ${style.border} border rounded font-semibold ${sizeClasses} leading-none whitespace-nowrap`}>
      {style.label}
    </span>
  )
}
