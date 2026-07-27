import { useRef, useEffect } from "react"

function MicWave() {
  return (
    <div className="absolute bottom-2 left-2 flex items-end gap-0.5 px-1.5 py-1 rounded bg-black/60 backdrop-blur-sm">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="w-0.5 bg-green-400 rounded-full"
          style={{
            height: "6px",
            animation: `micWave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
          }}
        />
      ))}
      <style>{`
        @keyframes micWave {
          0% { height: 2px; }
          100% { height: 12px; }
        }
      `}</style>
    </div>
  )
}

function GalleryTile({ stream, user: u, isLocal, isPinned, onPin }) {
  const videoRef = useRef(null)
  const hasVideo = !!stream

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className={`relative rounded-lg overflow-hidden border-2 transition-colors ${isPinned ? "border-amber-500" : "border-gray-700"} bg-gray-800`}>
      <div className="aspect-video bg-gray-900 relative flex items-center justify-center">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2">
            {u?.avatar ? (
              <img src={u.avatar} alt={u.username} className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: u?.color || "#60a5fa" }} />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white"
                style={{ backgroundColor: u?.color || "#60a5fa" }}
              >
                {(u?.username || "?").charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        )}

        <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: u?.color || "#22c55e" }} />
          <span className="text-[11px] text-white font-medium">
            {u?.username || "Unknown"}{isLocal ? " (you)" : ""}
          </span>
        </div>

        {u?.audioEnabled && <MicWave />}

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
  const allRemoteUsers = users.filter((u) => u.username !== user?.username)
  const totalUsers = allRemoteUsers.length + 1

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Gallery</h3>
            <span className="text-[10px] text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">
              {totalUsers} user{totalUsers !== 1 ? "s" : ""}
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
          <div className={`grid gap-3 ${
            totalUsers <= 1
              ? "grid-cols-1 max-w-md mx-auto"
              : totalUsers <= 4
                ? "grid-cols-2"
                : "grid-cols-3"
          }`}>
            <GalleryTile
              stream={localStream}
              user={user}
              isLocal={true}
              isPinned={false}
              onPin={() => {}}
            />
            {allRemoteUsers.map((u) => {
              const streamEntry = Object.entries(remoteStreams).find(([peerId]) => {
                return true
              })
              const peerStream = streamEntry ? streamEntry[1] : null
              return (
                <GalleryTile
                  key={u.username}
                  stream={peerStream}
                  user={u}
                  isLocal={false}
                  isPinned={pinnedUser === u.username}
                  onPin={() => onPin(pinnedUser === u.username ? null : u.username)}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
