import { memo } from "react"

function MouseOverlay({ positions }) {
  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {Object.entries(positions).map(([id, pos]) => (
        <div
          key={id}
          className="absolute transition-all duration-100 ease-out"
          style={{
            left: pos.x,
            top: pos.y,
            transform: "translate(-1px, -1px)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="drop-shadow-md"
          >
            <path
              d="M1 1L6 14L8 8L14 6L1 1Z"
              fill={pos.color || "#60a5fa"}
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className="absolute top-3 left-3 text-[10px] font-semibold text-white px-1.5 py-0.5 rounded whitespace-nowrap"
            style={{ backgroundColor: pos.color || "#60a5fa" }}
          >
            {pos.name || "User"}
          </span>
        </div>
      ))}
    </div>
  )
}

export default memo(MouseOverlay)
