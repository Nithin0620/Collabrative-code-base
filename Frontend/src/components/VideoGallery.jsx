import { useRef, useEffect } from "react"

function GalleryTile({ stream, label, color, isLocal, isPinned, onPin }) {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className={`relative rounded-lg overflow-hidden border-2 transition-colors ${isPinned ? "border-amber-500" : "border-gray-700"} bg-gray-800`}>
      <div className="aspect-video bg-gray-900 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color || "#22c55e" }} />
          <span className="text-[11px] text-white font-medium">
            {label}{isLocal ? " (you)" : ""}
          </span>
        </div>
        <button
          onClick={onPin}
          className={`absolute bottom-2 right-2 px-2 py-1 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
            isPinned
              ? "bg-amber-500 text-gray-950"
              : "bg-black/60 text-white hover:bg-amber-500 hover:text-gray-950 backdrop-blur-sm"
          }`}
        >
          {isPinned ? "Unpin" : "Pin"}
        </button>
      </div>
    </div>
  )
}

export default function VideoGallery({ remoteStreams, localStream, users, user, pinnedUser, onPin, onClose }) {
  const allPeers = Object.entries(remoteStreams)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Video Gallery</h3>
            <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
              {allPeers.length + (localStream ? 1 : 0)} stream{(allPeers.length + (localStream ? 1 : 0)) !== 1 ? "s" : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {allPeers.length === 0 && !localStream ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
              No video streams active
            </div>
          ) : (
            <div className={`grid gap-3 ${
              allPeers.length <= 1
                ? "grid-cols-1 max-w-md mx-auto"
                : allPeers.length <= 4
                  ? "grid-cols-2"
                  : "grid-cols-3"
            }`}>
              {localStream && (
                <GalleryTile
                  stream={localStream}
                  label={user?.username || "You"}
                  color={user?.color || "#22c55e"}
                  isLocal={true}
                  isPinned={false}
                  onPin={() => {}}
                />
              )}
              {allPeers.map(([peerId, stream]) => {
                const peerUser = users.find((u) => u.username !== user?.username && remoteStreams[peerId]) || {}
                const peerName = peerUser.username || peerId.slice(0, 8)
                return (
                  <GalleryTile
                    key={peerId}
                    stream={stream}
                    label={peerName}
                    color={peerUser.color || "#60a5fa"}
                    isLocal={false}
                    isPinned={pinnedUser === peerId}
                    onPin={() => onPin(pinnedUser === peerId ? null : peerId)}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
