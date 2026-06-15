import { useCallback, useEffect, useRef, useState } from 'react'

export type TrackStatus = 'IDLE' | 'RECORDING' | 'PLAYING'

export interface StudioTrack {
  id: 1 | 2 | 3 | 4
  stream: MediaStream | null
  recordedUrl: string | null
  status: TrackStatus
  isMuted: boolean
}

const TRACK_IDS = [1, 2, 3, 4] as const
const COUNTDOWN_SECONDS = 3

function makeInitialTracks(): StudioTrack[] {
  return TRACK_IDS.map((id) => ({
    id,
    stream: null,
    recordedUrl: null,
    status: 'IDLE' as TrackStatus,
    isMuted: false,
  }))
}

function trackIndex(id: 1 | 2 | 3 | 4): number {
  return id - 1
}

function getBestMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

/** Ensure a video element is wired to a recorded blob before playback. */
function primeRecordedVideo(el: HTMLVideoElement, url: string): void {
  if (el.srcObject) el.srcObject = null
  if (el.src !== url) {
    el.src = url
    el.load()
  }
}

export function useMultiTrackStudio() {
  const [tracks, setTracks] = useState<StudioTrack[]>(makeInitialTracks)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  /** videoRefs[0] = track 1, videoRefs[3] = track 4 — never resized or reordered */
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null])

  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false)
  const [countdownTrackId, setCountdownTrackId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [countdownValue, setCountdownValue] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingIdRef = useRef<1 | 2 | 3 | 4 | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const countIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const applyVideoMuted = useCallback((id: 1 | 2 | 3 | 4, track: StudioTrack) => {
    const el = videoRefs.current[trackIndex(id)]
    if (!el) return
    el.muted = track.status === 'RECORDING' || track.isMuted
  }, [])

  /** Play every other track that has a take — used for overdub and kept in sync at t=0. */
  const startOverdubPlayback = useCallback((recordingId: 1 | 2 | 3 | 4) => {
    for (let slot = 0; slot < TRACK_IDS.length; slot++) {
      const trackId = TRACK_IDS[slot]!
      if (trackId === recordingId) continue

      const track = tracksRef.current.find((t) => t.id === trackId)
      const el = videoRefs.current[slot]
      if (!el || !track?.recordedUrl) continue

      primeRecordedVideo(el, track.recordedUrl)
      el.muted = track.isMuted
      el.currentTime = 0
      void el.play().catch(() => {})
    }
  }, [])

  const pauseOverdubPlayback = useCallback((recordingId: 1 | 2 | 3 | 4) => {
    for (let slot = 0; slot < TRACK_IDS.length; slot++) {
      const trackId = TRACK_IDS[slot]!
      if (trackId === recordingId) continue
      videoRefs.current[slot]?.pause()
    }
  }, [])

  const pauseTrack = useCallback((id: 1 | 2 | 3 | 4) => {
    videoRefs.current[trackIndex(id)]?.pause()
    setTracks((prev) =>
      prev.map((t) => (t.id === id && t.status === 'PLAYING' ? { ...t, status: 'IDLE' } : t)),
    )
  }, [])

  const pauseAllExcept = useCallback((keepId: 1 | 2 | 3 | 4 | null) => {
    TRACK_IDS.forEach((id) => {
      if (id !== keepId) pauseTrack(id)
    })
  }, [pauseTrack])

  const cancelCountdown = useCallback(() => {
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current)
      countIntervalRef.current = null
    }
    setCountdownTrackId(null)
    setCountdownValue(0)
  }, [])

  /** Native pause on every recorded track — does NOT touch per-track status. */
  const stopAll = useCallback(() => {
    for (let slot = 0; slot < TRACK_IDS.length; slot++) {
      videoRefs.current[slot]?.pause()
    }
    setIsGlobalPlaying(false)
  }, [])

  /** Native play on every recorded track — does NOT touch per-track status. */
  const playAll = useCallback(() => {
    for (let slot = 0; slot < TRACK_IDS.length; slot++) {
      const trackId = TRACK_IDS[slot]!
      const track = tracksRef.current.find((t) => t.id === trackId)
      const el = videoRefs.current[slot]

      if (!el || !track?.recordedUrl || track.status === 'RECORDING') continue

      primeRecordedVideo(el, track.recordedUrl)
      el.muted = track.isMuted
      el.currentTime = 0
      void el.play().catch(() => {})
    }

    setIsGlobalPlaying(true)
  }, [])

  const launchRecording = useCallback(
    async (id: 1 | 2 | 3 | 4) => {
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())
      liveStreamRef.current = null

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        })

        liveStreamRef.current = stream
        chunksRef.current = []
        recordingIdRef.current = id

        const mimeType = getBestMimeType()
        const recorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream)

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        recorder.onstop = () => {
          const trackId = recordingIdRef.current
          if (!trackId) return

          stream.getTracks().forEach((t) => t.stop())
          liveStreamRef.current = null

          pauseOverdubPlayback(trackId)

          const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
          const url = URL.createObjectURL(blob)
          chunksRef.current = []
          recordingIdRef.current = null
          recorderRef.current = null

          setTracks((prev) => {
            const old = prev.find((t) => t.id === trackId)?.recordedUrl
            if (old) URL.revokeObjectURL(old)
            return prev.map((t) =>
              t.id === trackId
                ? { ...t, stream: null, recordedUrl: url, status: 'IDLE' as TrackStatus }
                : t,
            )
          })
        }

        recorder.start()
        recorderRef.current = recorder

        setTracks((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, stream, status: 'RECORDING' as TrackStatus }
              : {
                  ...t,
                  stream: null,
                  status: t.status === 'PLAYING' ? ('IDLE' as TrackStatus) : t.status,
                },
          ),
        )

        // Synchronized overdub — start existing takes at the same instant as the recorder
        startOverdubPlayback(id)
      } catch (err) {
        console.error('launchRecording failed', err)
        setTracks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, stream: null, status: 'IDLE' as TrackStatus } : t)),
        )
      }
    },
    [pauseOverdubPlayback, startOverdubPlayback],
  )

  /** Arm a 3-second localized count-in, then launch recording + overdub at zero. */
  const startRecording = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      if (countdownTrackId !== null) return

      stopAll()
      pauseAllExcept(null)
      cancelCountdown()

      setCountdownTrackId(id)
      setCountdownValue(COUNTDOWN_SECONDS)

      countIntervalRef.current = setInterval(() => {
        setCountdownValue((prev) => {
          if (prev <= 1) {
            if (countIntervalRef.current) {
              clearInterval(countIntervalRef.current)
              countIntervalRef.current = null
            }
            setCountdownTrackId(null)
            void launchRecording(id)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    },
    [cancelCountdown, countdownTrackId, launchRecording, pauseAllExcept, stopAll],
  )

  const stopRecording = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      if (recordingIdRef.current !== id) return
      const recorder = recorderRef.current
      if (recorder?.state === 'recording') recorder.stop()
      pauseOverdubPlayback(id)
    },
    [pauseOverdubPlayback],
  )

  const playTrack = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      const track = tracksRef.current.find((t) => t.id === id)
      if (!track?.recordedUrl) return

      setIsGlobalPlaying(false)
      pauseAllExcept(id)

      setTracks((prev) =>
        prev.map((t) => {
          if (t.id === id) return { ...t, status: 'PLAYING' as TrackStatus }
          if (t.status === 'PLAYING') return { ...t, status: 'IDLE' as TrackStatus }
          return t
        }),
      )
    },
    [pauseAllExcept],
  )

  const toggleTrackMute = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = { ...t, isMuted: !t.isMuted }
          applyVideoMuted(id, next)
          return next
        }),
      )
    },
    [applyVideoMuted],
  )

  const clearTrack = useCallback((id: 1 | 2 | 3 | 4) => {
    const idx = trackIndex(id)
    const el = videoRefs.current[idx]

    el?.pause()
    if (el) {
      el.srcObject = null
      el.removeAttribute('src')
      el.load()
    }

    setTracks((prev) => {
      const target = prev.find((t) => t.id === id)
      if (target?.recordedUrl) URL.revokeObjectURL(target.recordedUrl)
      return prev.map((t) =>
        t.id === id
          ? {
              ...t,
              recordedUrl: null,
              stream: null,
              status: 'IDLE' as TrackStatus,
              isMuted: false,
            }
          : t,
      )
    })
  }, [])

  // Keep native .muted in sync whenever track mute/recording state changes
  useEffect(() => {
    tracks.forEach((track) => applyVideoMuted(track.id, track))
  }, [tracks, applyVideoMuted])

  useEffect(() => {
    return () => {
      if (countIntervalRef.current) clearInterval(countIntervalRef.current)
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())
      recorderRef.current?.stop()
      tracksRef.current.forEach((t) => {
        if (t.recordedUrl) URL.revokeObjectURL(t.recordedUrl)
      })
    }
  }, [])

  const hasAnyRecording = tracks.some((t) => !!t.recordedUrl)
  const isAnyRecording = tracks.some((t) => t.status === 'RECORDING')
  const isCountingDown = countdownTrackId !== null

  return {
    tracks,
    videoRefs,
    isGlobalPlaying,
    hasAnyRecording,
    isAnyRecording,
    isCountingDown,
    countdownTrackId,
    countdownValue,
    startRecording,
    stopRecording,
    playTrack,
    pauseTrack,
    playAll,
    stopAll,
    clearTrack,
    toggleTrackMute,
  }
}
