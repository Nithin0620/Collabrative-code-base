import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"

export default function ShareModal({ roomId, roomName, onClose }) {
  const [copied, setCopied] = useState(false)
  const roomUrl = `${window.location.origin}/room/${roomId}`

  const copyUrl = () => {
    navigator.clipboard.writeText(roomUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const shareText = `Join my collaborative coding room: ${roomName || roomId}`

  const socialShares = [
    {
      name: "WhatsApp",
      color: "bg-emerald-600 hover:bg-emerald-500",
      icon: "💬",
      url: `https://api.whatsapp.com/send?text=${encodeURIComponent(`${shareText} ${roomUrl}`)}`,
    },
    {
      name: "X (Twitter)",
      color: "bg-neutral-800 hover:bg-neutral-700",
      icon: "𝕏",
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(roomUrl)}`,
    },
    {
      name: "LinkedIn",
      color: "bg-blue-600 hover:bg-blue-500",
      icon: "💼",
      url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(roomUrl)}`,
    },
    {
      name: "Email",
      color: "bg-amber-600 hover:bg-amber-500",
      icon: "✉️",
      url: `mailto:?subject=${encodeURIComponent(`Coding Room: ${roomName || roomId}`)}&body=${encodeURIComponent(`${shareText}\n\nLink: ${roomUrl}`)}`,
    },
  ]

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fadeIn p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-scaleUp">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🔗</span>
            <div>
              <h3 className="text-sm font-bold text-white">Share Room</h3>
              <p className="text-xs text-gray-400">Invite collaborators to code together in real-time</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg transition-colors p-1 rounded-lg hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {/* QR Code section */}
        <div className="flex flex-col items-center bg-gray-950 p-4 rounded-xl border border-gray-800 space-y-3">
          <div className="p-3 bg-white rounded-xl shadow-inner">
            <QRCodeSVG value={roomUrl} size={150} level="H" includeMargin={false} />
          </div>
          <p className="text-xs text-gray-400 text-center font-medium">Scan QR code to join on mobile or tablet</p>
        </div>

        {/* Direct Link input */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">Room Link</label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={roomUrl}
              className="flex-1 px-3 py-2 bg-gray-950 border border-gray-700 rounded-xl text-xs text-amber-400 font-mono truncate focus:outline-none"
            />
            <button
              onClick={copyUrl}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-md ${
                copied
                  ? "bg-emerald-500 text-gray-950 scale-95"
                  : "bg-amber-500 text-gray-950 hover:bg-amber-400 hover:scale-[1.02] active:scale-95"
              }`}
            >
              {copied ? "✓ Copied!" : "Copy Link"}
            </button>
          </div>
        </div>

        {/* Social Share Buttons */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">Share Via</label>
          <div className="grid grid-cols-2 gap-2">
            {socialShares.map((item) => (
              <a
                key={item.name}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all duration-200 shadow-sm ${item.color} hover:scale-[1.02] active:scale-95`}
              >
                <span>{item.icon}</span>
                <span>{item.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
