import { useState, useEffect, useRef, useCallback } from "react"

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
}

export default function useWebRTC(socket, roomId) {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState({})
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [videoEnabled, setVideoEnabled] = useState(false)
  const [handRaised, setHandRaised] = useState(false)

  const localStreamRef = useRef(null)
  const peerConnectionsRef = useRef({})
  const queuedCandidatesRef = useRef({})
  const selfSocketIdRef = useRef(null)
  const makingOfferRef = useRef({})
  const politeRef = useRef({})

  const audioEnabledRef = useRef(false)
  const videoEnabledRef = useRef(false)
  const hasMediaRef = useRef(false)

  audioEnabledRef.current = audioEnabled
  videoEnabledRef.current = videoEnabled
  hasMediaRef.current = audioEnabled || videoEnabled

  const cleanupPeer = useCallback((peerId) => {
    const pc = peerConnectionsRef.current[peerId]
    if (pc) {
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      pc.onnegotiationneeded = null
      pc.close()
      delete peerConnectionsRef.current[peerId]
    }
    delete queuedCandidatesRef.current[peerId]
    delete makingOfferRef.current[peerId]
    delete politeRef.current[peerId]
    setRemoteStreams((prev) => {
      if (!(peerId in prev)) return prev
      const next = { ...prev }
      delete next[peerId]
      return next
    })
  }, [])

  const createPeerConnection = useCallback((peerId, polite = false) => {
    if (peerConnectionsRef.current[peerId]) {
      return peerConnectionsRef.current[peerId]
    }

    politeRef.current[peerId] = polite
    const pc = new RTCPeerConnection(ICE_SERVERS)
    peerConnectionsRef.current[peerId] = pc

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    pc.ontrack = (event) => {
      const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track])
      setRemoteStreams((prev) => {
        const existing = prev[peerId]
        if (existing) {
          if (!existing.getTracks().some((t) => t.id === event.track.id)) {
            existing.addTrack(event.track)
          }
          return { ...prev, [peerId]: new MediaStream(existing.getTracks()) }
        }
        return { ...prev, [peerId]: stream }
      })
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket && selfSocketIdRef.current) {
        socket.emit("webrtc-candidate", {
          candidate: event.candidate.toJSON(),
          to: peerId,
        })
      }
    }

    pc.onicecandidateerror = (event) => {
      console.warn("ICE candidate error for peer", peerId, event.errorCode, event.errorText)
    }

    pc.onnegotiationneeded = async () => {
      if (makingOfferRef.current[peerId]) return
      makingOfferRef.current[peerId] = true
      try {
        if (pc.signalingState !== "stable") return
        const offer = await pc.createOffer()
        if (pc.signalingState !== "stable") return
        await pc.setLocalDescription(offer)
        if (socket && selfSocketIdRef.current) {
          socket.emit("webrtc-offer", {
            offer: pc.localDescription.toJSON(),
            to: peerId,
          })
        }
      } catch (err) {
        console.error("negotiationneeded error:", err)
      } finally {
        makingOfferRef.current[peerId] = false
      }
    }

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState
      if (state === "failed" || state === "closed") {
        cleanupPeer(peerId)
      }
    }

    return pc
  }, [socket, cleanupPeer])

  const sendOffer = useCallback(async (peerId) => {
    if (!socket || !localStreamRef.current || !selfSocketIdRef.current) return
    if (peerId === selfSocketIdRef.current) return

    const pc = createPeerConnection(peerId, true)
    try {
      if (makingOfferRef.current[peerId]) return
      makingOfferRef.current[peerId] = true
      const offer = await pc.createOffer()
      if (pc.signalingState !== "stable") return
      await pc.setLocalDescription(offer)
      socket.emit("webrtc-offer", {
        offer: pc.localDescription.toJSON(),
        to: peerId,
      })
    } catch (err) {
      console.error("Failed to create offer:", err)
    } finally {
      makingOfferRef.current[peerId] = false
    }
  }, [socket, createPeerConnection])

  const callPeer = useCallback((peerId) => {
    if (!hasMediaRef.current || !localStreamRef.current) return
    if (peerId === selfSocketIdRef.current) return
    sendOffer(peerId)
  }, [sendOffer])

  useEffect(() => {
    if (!socket || !roomId) return

    const onConnect = () => {
      selfSocketIdRef.current = socket.id
    }
    if (socket.connected) {
      selfSocketIdRef.current = socket.id
    }
    socket.on("connect", onConnect)

    const onRoomMembers = (data) => {
      selfSocketIdRef.current = data.selfId
      if (hasMediaRef.current && localStreamRef.current) {
        data.members.forEach((peerId) => {
          if (peerId !== data.selfId && !peerConnectionsRef.current[peerId]) {
            sendOffer(peerId)
          }
        })
      }
    }

    const onPeerJoined = (data) => {
      if (hasMediaRef.current && localStreamRef.current && data.peerId !== selfSocketIdRef.current) {
        sendOffer(data.peerId)
      }
    }

    const onPeerLeft = (data) => {
      cleanupPeer(data.peerId)
    }

    const handleOffer = async (data) => {
      const peerId = data.from
      if (!peerId || peerId === selfSocketIdRef.current) return

      let pc = peerConnectionsRef.current[peerId]
      const offerCollision = pc && (pc.signalingState !== "stable" || makingOfferRef.current[peerId])
      const polite = politeRef.current[peerId] ?? true

      if (offerCollision) {
        if (!polite) return
        if (pc) {
          try { await pc.setLocalDescription({ type: "rollback" }) } catch {}
        }
      }

      if (!pc) {
        pc = createPeerConnection(peerId, false)
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit("webrtc-answer", {
          answer: pc.localDescription.toJSON(),
          to: peerId,
        })
        const candidates = queuedCandidatesRef.current[peerId]
        if (candidates) {
          for (const c of candidates) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(c))
            } catch (err) {
              console.warn("Failed to add queued candidate:", err)
            }
          }
          delete queuedCandidatesRef.current[peerId]
        }
      } catch (err) {
        console.error("Failed to handle offer:", err)
      }
    }

    const handleAnswer = async (data) => {
      const peerId = data.from
      if (!peerId) return
      const pc = peerConnectionsRef.current[peerId]
      if (!pc) return
      try {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
          const candidates = queuedCandidatesRef.current[peerId]
          if (candidates) {
            for (const c of candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(c))
              } catch (err) {
                console.warn("Failed to add queued candidate:", err)
              }
            }
            delete queuedCandidatesRef.current[peerId]
          }
        }
      } catch (err) {
        console.error("Failed to handle answer:", err)
      }
    }

    const handleCandidate = async (data) => {
      const peerId = data.from
      if (!peerId || peerId === selfSocketIdRef.current) return
      const pc = peerConnectionsRef.current[peerId]
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch (err) {
          console.warn("Failed to add ICE candidate:", err)
        }
      } else {
        if (!queuedCandidatesRef.current[peerId]) {
          queuedCandidatesRef.current[peerId] = []
        }
        queuedCandidatesRef.current[peerId].push(data.candidate)
      }
    }

    const handleEnd = (data) => {
      if (data.from) cleanupPeer(data.from)
    }

    socket.on("room-members", onRoomMembers)
    socket.on("peer-joined", onPeerJoined)
    socket.on("peer-left", onPeerLeft)
    socket.on("webrtc-offer", handleOffer)
    socket.on("webrtc-answer", handleAnswer)
    socket.on("webrtc-candidate", handleCandidate)
    socket.on("webrtc-end", handleEnd)

    return () => {
      socket.off("connect", onConnect)
      socket.off("room-members", onRoomMembers)
      socket.off("peer-joined", onPeerJoined)
      socket.off("peer-left", onPeerLeft)
      socket.off("webrtc-offer", handleOffer)
      socket.off("webrtc-answer", handleAnswer)
      socket.off("webrtc-candidate", handleCandidate)
      socket.off("webrtc-end", handleEnd)
    }
  }, [socket, roomId, createPeerConnection, sendOffer, cleanupPeer])

  useEffect(() => {
    if (!socket || !roomId) return
    if (!selfSocketIdRef.current) return

    if (hasMediaRef.current && localStreamRef.current) {
      socket.emit("get-room-members", roomId, (data) => {
        selfSocketIdRef.current = data.selfId
        data.members.forEach((peerId) => {
          if (peerId !== data.selfId && !peerConnectionsRef.current[peerId]) {
            sendOffer(peerId)
          }
        })
      })
    }
  }, [audioEnabled, videoEnabled, socket, roomId, sendOffer])

  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)

  const stopAudioAnalysis = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    analyserRef.current = null
    setIsSpeaking(false)
  }, [])

  const startAudioAnalysis = useCallback((stream) => {
    stopAudioAnalysis()
    try {
      const audioTrack = stream.getAudioTracks()[0]
      if (!audioTrack) return
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const ctx = new AudioCtx()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const checkVolume = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const average = sum / dataArray.length
        setIsSpeaking(average > 15)
        animFrameRef.current = requestAnimationFrame(checkVolume)
      }
      checkVolume()
    } catch (err) {
      console.warn("Audio analysis error:", err)
    }
  }, [stopAudioAnalysis])

  const toggleAudio = useCallback(async () => {
    if (audioEnabledRef.current) {
      stopAudioAnalysis()
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => {
          t.enabled = false
          t.stop()
        })
      }

      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio")
        if (sender) {
          sender.replaceTrack(null).catch(() => {})
        }
      })

      if (localStreamRef.current) {
        const remaining = localStreamRef.current.getTracks().filter((t) => t.kind !== "audio")
        if (remaining.length > 0) {
          localStreamRef.current = new MediaStream(remaining)
        } else {
          localStreamRef.current = null
        }
      }

      setAudioEnabled(false)
      audioEnabledRef.current = false
      setLocalStream(localStreamRef.current)
    } else {
      let newTrack
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        newTrack = stream.getAudioTracks()[0]
      } catch (err) {
        console.error("Failed to get audio:", err)
        return
      }
      if (!newTrack) return

      if (localStreamRef.current) {
        localStreamRef.current.addTrack(newTrack)
      } else {
        localStreamRef.current = new MediaStream([newTrack])
      }

      const stream = localStreamRef.current
      startAudioAnalysis(stream)

      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "audio")
        if (sender) {
          sender.replaceTrack(newTrack).catch(() => {})
        } else {
          try {
            pc.addTrack(newTrack, stream)
          } catch (err) {
            console.warn("Failed to add audio track:", err)
          }
        }
      })

      setAudioEnabled(true)
      audioEnabledRef.current = true
      setLocalStream(localStreamRef.current)
    }
  }, [startAudioAnalysis, stopAudioAnalysis])

  const toggleVideo = useCallback(async () => {
    if (videoEnabledRef.current) {
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach((t) => {
          t.enabled = false
          t.stop()
        })
      }

      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video")
        if (sender) {
          sender.replaceTrack(null).catch(() => {})
        }
      })

      if (localStreamRef.current) {
        const remaining = localStreamRef.current.getTracks().filter((t) => t.kind !== "video")
        if (remaining.length > 0) {
          localStreamRef.current = new MediaStream(remaining)
        } else {
          localStreamRef.current = null
        }
      }

      setVideoEnabled(false)
      videoEnabledRef.current = false
      setLocalStream(localStreamRef.current)
    } else {
      let newTrack
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
        newTrack = stream.getVideoTracks()[0]
      } catch (err) {
        console.error("Failed to get video:", err)
        return
      }
      if (!newTrack) return

      if (localStreamRef.current) {
        localStreamRef.current.addTrack(newTrack)
      } else {
        localStreamRef.current = new MediaStream([newTrack])
      }

      const stream = localStreamRef.current
      Object.values(peerConnectionsRef.current).forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video")
        if (sender) {
          sender.replaceTrack(newTrack).catch(() => {})
        } else {
          try {
            pc.addTrack(newTrack, stream)
          } catch (err) {
            console.warn("Failed to add video track:", err)
          }
        }
      })

      setVideoEnabled(true)
      videoEnabledRef.current = true
      setLocalStream(localStreamRef.current)
    }
  }, [])

  const toggleHand = useCallback(() => {
    setHandRaised((prev) => !prev)
  }, [])

  const cleanup = useCallback(() => {
    stopAudioAnalysis()
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }

    if (socket && socket.connected) {
      Object.keys(peerConnectionsRef.current).forEach((peerId) => {
        socket.emit("webrtc-end", { to: peerId })
      })
    }

    Object.keys(peerConnectionsRef.current).forEach((peerId) => {
      const pc = peerConnectionsRef.current[peerId]
      if (pc) {
        pc.ontrack = null
        pc.onicecandidate = null
        pc.onconnectionstatechange = null
        pc.onnegotiationneeded = null
        pc.close()
      }
    })

    peerConnectionsRef.current = {}
    queuedCandidatesRef.current = {}
    makingOfferRef.current = {}
    politeRef.current = {}
    setRemoteStreams({})
    setAudioEnabled(false)
    setVideoEnabled(false)
    setHandRaised(false)
    audioEnabledRef.current = false
    videoEnabledRef.current = false
    hasMediaRef.current = false
  }, [socket, stopAudioAnalysis])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    localStream,
    remoteStreams,
    audioEnabled,
    videoEnabled,
    isSpeaking,
    handRaised,
    setHandRaised,
    toggleAudio,
    toggleVideo,
    toggleHand,
    callPeer,
    cleanupPeer,
    cleanup,
    getLocalStream: () => localStreamRef.current,
  }
}
