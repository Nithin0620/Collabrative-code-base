import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
} from "livekit-client"

export default function useLiveKit(socket, roomId, user) {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState({})
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [handRaised, setHandRaised] = useState(false)
  const [participants, setParticipants] = useState([])
  const [connectionState, setConnectionState] = useState(ConnectionState.Disconnected)

  const roomRef = useRef(null)
  const audioEnabledRef = useRef(false)
  const videoEnabledRef = useRef(false)
  const localStreamRef = useRef(null)
  const mountedRef = useRef(true)
  const userRef = useRef(user)

  userRef.current = user

  audioEnabledRef.current = audioEnabled
  videoEnabledRef.current = videoEnabled

  const identityRef = useRef("lk-" + Math.random().toString(36).slice(2, 10))
  const userIdentity = useMemo(
    () => user?.username || user?._id?.toString() || user?.id?.toString() || identityRef.current,
    [user],
  )

  const updateRemoteStreams = useCallback(() => {
    if (!roomRef.current) return
    const streams = {}
    const remotes = Array.from(roomRef.current.remoteParticipants.values())

    for (const participant of remotes) {
      const tracks = []
      for (const pub of participant.trackPublications.values()) {
        if (pub.track && pub.track.mediaStreamTrack) {
          tracks.push(pub.track.mediaStreamTrack)
        }
      }
      if (tracks.length > 0) {
        const ms = new MediaStream(tracks)
        const key = participant.identity || participant.name || participant.sid
        if (key) streams[key] = ms
      }
    }
    setRemoteStreams(streams)
    setParticipants(remotes)
  }, [])

  const updateLocalStream = useCallback(() => {
    if (!roomRef.current) return
    const localPart = roomRef.current.localParticipant
    const tracks = []
    for (const pub of localPart.trackPublications.values()) {
      if (pub.track && pub.track.mediaStreamTrack) {
        tracks.push(pub.track.mediaStreamTrack)
      }
    }
    if (tracks.length > 0) {
      const stream = new MediaStream(tracks)
      localStreamRef.current = stream
      setLocalStream(stream)
    } else {
      localStreamRef.current = null
      setLocalStream(null)
    }
  }, [])

  const connectToRoom = useCallback(async (token, url) => {
    if (!mountedRef.current) return

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
      },
    })

    roomRef.current = room

    room.on(RoomEvent.Connected, () => {
      if (mountedRef.current) {
        setConnectionState(ConnectionState.Connected)
        updateLocalStream()
        updateRemoteStreams()
      }
    })

    room.on(RoomEvent.Disconnected, () => {
      if (mountedRef.current) {
        setConnectionState(ConnectionState.Disconnected)
        setRemoteStreams({})
        setLocalStream(null)
      }
    })

    room.on(RoomEvent.ParticipantConnected, () => {
      if (mountedRef.current) {
        updateRemoteStreams()
      }
    })

    room.on(RoomEvent.ParticipantDisconnected, () => {
      if (mountedRef.current) {
        updateRemoteStreams()
      }
    })

    room.on(RoomEvent.TrackSubscribed, () => {
      if (mountedRef.current) {
        updateRemoteStreams()
      }
    })

    room.on(RoomEvent.TrackUnsubscribed, () => {
      if (mountedRef.current) {
        updateRemoteStreams()
      }
    })

    room.on(RoomEvent.LocalTrackPublished, () => {
      if (mountedRef.current) {
        updateLocalStream()
      }
    })

    room.on(RoomEvent.LocalTrackUnpublished, () => {
      if (mountedRef.current) {
        updateLocalStream()
      }
    })

    try {
      await room.connect(url, token)
      if (mountedRef.current) {
        setConnectionState(ConnectionState.Connected)
      }
    } catch (err) {
      console.error("LiveKit connection failed:", err.message || err)
      if (mountedRef.current) {
        setConnectionState(ConnectionState.Disconnected)
      }
    }
  }, [updateLocalStream, updateRemoteStreams])

  useEffect(() => {
    const currentUser = userRef.current
    if (!roomId || !currentUser) return
    mountedRef.current = true

    const identity = userIdentity
    const name = currentUser.username || currentUser.displayName || "User"

    fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        roomName: roomId,
        identity,
        name,
      }),
    })
      .then((res) => res.json())
      .then(({ token, url }) => {
        if (mountedRef.current && token && url) {
          connectToRoom(token, url)
        }
      })
      .catch((err) => {
        console.warn("Failed to get LiveKit token:", err)
      })

    return () => {
      mountedRef.current = false
      if (roomRef.current) {
        roomRef.current.disconnect()
        roomRef.current = null
      }
      setRemoteStreams({})
      setParticipants([])
      setLocalStream(null)
      setAudioEnabled(false)
      setVideoEnabled(false)
      setHandRaised(false)
      setConnectionState(ConnectionState.Disconnected)
    }
  }, [roomId, userIdentity, connectToRoom])

  const toggleAudio = useCallback(async () => {
    try {
      if (roomRef.current && roomRef.current.state === ConnectionState.Connected) {
        const room = roomRef.current
        const nextState = !audioEnabledRef.current
        await room.localParticipant.setMicrophoneEnabled(nextState)
        setAudioEnabled(nextState)
        audioEnabledRef.current = nextState
        updateLocalStream()
      } else {
        if (audioEnabledRef.current) {
          if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((t) => t.stop())
          }
          setAudioEnabled(false)
          audioEnabledRef.current = false
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          const audioTrack = stream.getAudioTracks()[0]
          if (localStreamRef.current) {
            localStreamRef.current.addTrack(audioTrack)
          } else {
            localStreamRef.current = new MediaStream([audioTrack])
          }
          setLocalStream(localStreamRef.current)
          setAudioEnabled(true)
          audioEnabledRef.current = true
        }
      }
    } catch (err) {
      console.error("LiveKit toggleAudio error:", err)
    }
  }, [updateLocalStream])

  const toggleVideo = useCallback(async () => {
    try {
      if (roomRef.current && roomRef.current.state === ConnectionState.Connected) {
        const room = roomRef.current
        const nextState = !videoEnabledRef.current
        await room.localParticipant.setCameraEnabled(nextState)
        setVideoEnabled(nextState)
        videoEnabledRef.current = nextState
        updateLocalStream()
      } else {
        if (videoEnabledRef.current) {
          if (localStreamRef.current) {
            localStreamRef.current.getVideoTracks().forEach((t) => t.stop())
          }
          setVideoEnabled(false)
          videoEnabledRef.current = false
        } else {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
          const videoTrack = stream.getVideoTracks()[0]
          if (localStreamRef.current) {
            localStreamRef.current.addTrack(videoTrack)
          } else {
            localStreamRef.current = new MediaStream([videoTrack])
          }
          setLocalStream(localStreamRef.current)
          setVideoEnabled(true)
          videoEnabledRef.current = true
        }
      }
    } catch (err) {
      console.error("LiveKit toggleVideo error:", err)
    }
  }, [updateLocalStream])

  const [screenShareEnabled, setScreenShareEnabled] = useState(false)
  const screenShareEnabledRef = useRef(false)
  screenShareEnabledRef.current = screenShareEnabled

  const toggleScreenShare = useCallback(async () => {
    try {
      if (roomRef.current && roomRef.current.state === ConnectionState.Connected) {
        const room = roomRef.current
        const nextState = !screenShareEnabledRef.current
        await room.localParticipant.setScreenShareEnabled(nextState)
        setScreenShareEnabled(nextState)
        screenShareEnabledRef.current = nextState
        updateLocalStream()
      } else {
        if (screenShareEnabledRef.current) {
          setScreenShareEnabled(false)
          screenShareEnabledRef.current = false
        } else {
          const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
          const screenTrack = stream.getVideoTracks()[0]
          screenTrack.onended = () => {
            setScreenShareEnabled(false)
            screenShareEnabledRef.current = false
            updateLocalStream()
          }
          if (localStreamRef.current) {
            localStreamRef.current.addTrack(screenTrack)
          } else {
            localStreamRef.current = new MediaStream([screenTrack])
          }
          setLocalStream(localStreamRef.current)
          setScreenShareEnabled(true)
          screenShareEnabledRef.current = true
        }
      }
    } catch (err) {
      console.error("LiveKit toggleScreenShare error:", err)
    }
  }, [updateLocalStream])

  const toggleHand = useCallback(() => {
    setHandRaised((prev) => !prev)
  }, [])

  const callPeer = useCallback(() => {}, [])
  const cleanupPeer = useCallback(() => {}, [])

  const cleanup = useCallback(() => {
    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }
    setRemoteStreams({})
    setParticipants([])
    setLocalStream(null)
    setAudioEnabled(false)
    setVideoEnabled(false)
    setHandRaised(false)
    audioEnabledRef.current = false
    videoEnabledRef.current = false
    setConnectionState(ConnectionState.Disconnected)
  }, [])

  const getLocalStream = useCallback(() => {
    return localStreamRef.current
  }, [])

  return {
    localStream,
    remoteStreams,
    audioEnabled,
    videoEnabled,
    screenShareEnabled,
    handRaised,
    setHandRaised,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    toggleHand,
    callPeer,
    cleanupPeer,
    cleanup,
    getLocalStream,
    participants,
    room: roomRef.current,
    connectionState,
  }
}
