/**
 * useMultiTrackStudio
 *
 * Complete recording engine for the Studio Sandbox:
 *   - Hardware init (getUserMedia)
 *   - Web Audio count-in (oscillator clicks at 120 BPM)
 *   - Synchronized MediaRecorder launch at downbeat
 *   - Anti-drift requestAnimationFrame playback loop
 *   - Per-track volume / mute wired directly to <video> elements
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StudioTrack {
  id: string
  label: string
  color: string
  stream: MediaStream | null      // live camera feed (armed cell)
  recordedBlobUrl: string | null  // completed take
  isRecording: boolean
  isMuted: boolean
  volume: number                  // 0..1
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BPM = 120
const BEAT_MS = (60 / BPM) * 1000  // 500 ms

const TRACK_DEFS = [
  { id: 'track-1', label: 'Track 1', color: '#38bdf8' },
  { id: 'track-2', label: 'Track 2', color: '#c084fc' },
  { id: 'track-3', label: 'Track 3', color: '#34d399' },
  { id: 'track-4', label: 'Track 4', color: '#fb923c' },
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInitialTracks(): StudioTrack[] {
  return TRACK_DEFS.map((def) => ({
    ...def,
    stream: null,
    recordedBlobUrl: null,
    isRecording: false,
    isMuted: false,
    volume: 0.8,
  }))
}

/** Synthesize a short click through the given AudioContext. */
function playClick(ctx: AudioContext, hz: number): void {
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.55, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.06)
  } catch {
    // Silently ignore if context is already closed
  }
}

/** Pick the first MIME type the current browser supports, or empty string. */
function getBestMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMultiTrackStudio() {
  // ── Renderable state ──────────────────────────────────────────────────────
  const [tracks, setTracks] = useState<StudioTrack[]>(makeInitialTracks)
  const [isCountingIn, setIsCountingIn] = useState(false)
  const [currentCount, setCurrentCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Refs (escape hatch for closures / DOM) ────────────────────────────────
  // Tracks mirror — always current, safe to read inside intervals/rAF
  const tracksRef = useRef<StudioTrack[]>(tracks)
  tracksRef.current = tracks // updated synchronously every render

  // One <video> per track — assigned by the UI via ref callbacks
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null])

  // Audio infra
  const audioCtxRef = useRef<AudioContext | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Which track is currently being recorded (used inside closures)
  const recordingTrackIdRef = useRef<string | null>(null)

  // Timers
  const countIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const driftRafRef = useRef<number>(0)

  // ── AudioContext lazy init ────────────────────────────────────────────────
  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }

  // ── Sync video element srcObject / src when track data changes ───────────
  useEffect(() => {
    tracks.forEach((track, i) => {
      const el = videoRefs.current[i]
      if (!el) return

      if (track.recordedBlobUrl) {
        // Completed take: switch to blob playback
        if (el.src !== track.recordedBlobUrl) {
          el.srcObject = null
          el.src = track.recordedBlobUrl
          el.muted = false
          el.volume = track.isMuted ? 0 : track.volume
          // Don't autoplay — user explicitly presses Play
        }
      } else if (track.stream) {
        // Live preview: mirror the camera (always muted to prevent feedback)
        if (el.srcObject !== track.stream) {
          el.src = ''
          el.srcObject = track.stream
          el.muted = true
          el.play().catch(() => {/* autoplay policy: user must interact first */})
        }
      } else {
        // Empty cell
        if (el.srcObject || el.src) {
          el.srcObject = null
          el.src = ''
        }
      }
    })
  }, [tracks])

  // ── Sync volume / mute to video elements ─────────────────────────────────
  useEffect(() => {
    tracks.forEach((track, i) => {
      const el = videoRefs.current[i]
      if (!el || !track.recordedBlobUrl) return
      el.volume = track.isMuted ? 0 : track.volume
    })
  }, [tracks])

  // ── Hardware init ─────────────────────────────────────────────────────────
  /**
   * Request camera + mic permission and assign the live stream to the given
   * track. Only one live stream is maintained at a time.
   */
  const initHardware = useCallback(async (trackId: string) => {
    setError(null)
    try {
      // Release any previous live stream
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      })
      liveStreamRef.current = stream

      // Assign stream to the armed track; remove it from any other track
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id === trackId) return { ...t, stream }
          // If this track still holds the old stream reference, clear it
          if (t.stream && t.stream !== stream) return { ...t, stream: null }
          return t
        }),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera / mic access denied'
      setError(msg)
    }
  }, [])

  // ── Count-in + synchronized launch ───────────────────────────────────────
  /**
   * Entry point for recording a track.
   * Plays a 4-beat oscillator count-in at 120 BPM, then at the exact
   * moment the count hits 0 it starts the MediaRecorder and simultaneously
   * plays back all already-recorded tracks.
   */
  const startRecording = useCallback(
    (trackId: string) => {
      if (!liveStreamRef.current) {
        setError('Tap the record button first to arm the camera')
        return
      }

      // Cancel any in-progress count-in
      if (countIntervalRef.current) clearInterval(countIntervalRef.current)

      recordingTrackIdRef.current = trackId
      const ctx = getAudioCtx()

      // Show "4" immediately and play first click
      setIsCountingIn(true)
      setCurrentCount(4)
      playClick(ctx, 1_000)

      let pending = 3 // next count to display (counts down: 3 → 2 → 1 → 0=launch)

      countIntervalRef.current = setInterval(() => {
        if (pending > 0) {
          setCurrentCount(pending)
          playClick(ctx, pending === 1 ? 1_500 : 1_000)
          pending--
        } else {
          // ── Downbeat — LAUNCH ─────────────────────────────────────────
          clearInterval(countIntervalRef.current!)
          countIntervalRef.current = null
          setIsCountingIn(false)
          setCurrentCount(0)
          _doLaunchRecording()
        }
      }, BEAT_MS)
    },
    [], // intentionally empty — reads only refs inside
  )

  /**
   * Called precisely at downbeat zero. Uses only refs to avoid stale closures.
   */
  function _doLaunchRecording(): void {
    const trackId = recordingTrackIdRef.current
    const liveStream = liveStreamRef.current
    if (!trackId || !liveStream) return

    // Mark track as recording
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, isRecording: true } : t)),
    )

    // Start MediaRecorder
    chunksRef.current = []
    let recorder: MediaRecorder
    try {
      const mimeType = getBestMimeType()
      recorder = mimeType
        ? new MediaRecorder(liveStream, { mimeType })
        : new MediaRecorder(liveStream)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MediaRecorder unavailable')
      return
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
      const url = URL.createObjectURL(blob)
      setTracks((prev) =>
        prev.map((t) =>
          t.id === trackId ? { ...t, isRecording: false, recordedBlobUrl: url } : t,
        ),
      )
    }

    recorder.start()
    recorderRef.current = recorder

    // Simultaneously start playback of all previously recorded tracks
    const current = tracksRef.current
    videoRefs.current.forEach((el, i) => {
      if (!el) return
      const t = current[i]
      if (!t || t.id === trackId || !t.recordedBlobUrl) return
      el.currentTime = 0
      el.play().catch(() => {})
    })
  }

  // ── Stop recording ────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current)
      countIntervalRef.current = null
    }
    setIsCountingIn(false)
    setCurrentCount(0)
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
    // Pause all playback videos that were playing along
    videoRefs.current.forEach((el) => el?.pause())
  }, [])

  // ── Global playback with anti-drift loop ──────────────────────────────────
  const playAll = useCallback(() => {
    const current = tracksRef.current
    setIsPlaying(true)

    videoRefs.current.forEach((el, i) => {
      if (!el || !current[i]?.recordedBlobUrl) return
      el.currentTime = 0
      el.play().catch(() => {})
    })

    _startDriftLoop()
  }, [])

  const stopAll = useCallback(() => {
    setIsPlaying(false)
    cancelAnimationFrame(driftRafRef.current)
    videoRefs.current.forEach((el) => el?.pause())
  }, [])

  /**
   * rAF loop: find the track with the longest duration (Master Timeline),
   * then forcefully resync any track that has drifted > 80 ms.
   */
  function _startDriftLoop(): void {
    cancelAnimationFrame(driftRafRef.current)

    const tick = () => {
      const current = tracksRef.current

      // Find master element (longest recorded duration)
      let masterEl: HTMLVideoElement | null = null
      let masterDuration = 0
      videoRefs.current.forEach((el, i) => {
        if (!el || !current[i]?.recordedBlobUrl) return
        const d = el.duration || 0
        if (d > masterDuration) {
          masterDuration = d
          masterEl = el
        }
      })

      if (masterEl) {
        const masterTime = (masterEl as HTMLVideoElement).currentTime
        videoRefs.current.forEach((el, i) => {
          if (!el || el === masterEl || !current[i]?.recordedBlobUrl) return
          if (Math.abs(el.currentTime - masterTime) > 0.08) {
            el.currentTime = masterTime
          }
        })
      }

      driftRafRef.current = requestAnimationFrame(tick)
    }

    driftRafRef.current = requestAnimationFrame(tick)
  }

  // ── Track controls ────────────────────────────────────────────────────────
  /** Set volume 0..1. Updates both React state and the live <video> element. */
  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, volume } : t)))
    const idx = tracksRef.current.findIndex((t) => t.id === trackId)
    const el = videoRefs.current[idx]
    if (el && tracksRef.current[idx]?.recordedBlobUrl) {
      el.volume = tracksRef.current[idx]?.isMuted ? 0 : volume
    }
  }, [])

  /** Toggle mute. Also directly silences / restores the <video> element. */
  const setTrackMuted = useCallback((trackId: string, muted: boolean) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, isMuted: muted } : t)))
    const idx = tracksRef.current.findIndex((t) => t.id === trackId)
    const el = videoRefs.current[idx]
    if (el && tracksRef.current[idx]?.recordedBlobUrl) {
      el.volume = muted ? 0 : (tracksRef.current[idx]?.volume ?? 0.8)
    }
  }, [])

  /** Erase a track's recording and release its blob URL. */
  const clearTrack = useCallback((trackId: string) => {
    const idx = tracksRef.current.findIndex((t) => t.id === trackId)
    const el = videoRefs.current[idx]
    if (el) {
      el.pause()
      el.src = ''
      el.srcObject = null
    }
    const old = tracksRef.current[idx]?.recordedBlobUrl
    if (old) URL.revokeObjectURL(old)

    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? {
              ...t,
              recordedBlobUrl: null,
              isRecording: false,
              stream: liveStreamRef.current ?? null,
            }
          : t,
      ),
    )
  }, [])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (countIntervalRef.current) clearInterval(countIntervalRef.current)
      cancelAnimationFrame(driftRafRef.current)
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioCtxRef.current?.close().catch(() => {})
      tracksRef.current.forEach((t) => {
        if (t.recordedBlobUrl) URL.revokeObjectURL(t.recordedBlobUrl)
      })
    }
  }, [])

  return {
    tracks,
    isCountingIn,
    currentCount,
    isPlaying,
    error,
    videoRefs,
    initHardware,
    startRecording,
    stopRecording,
    playAll,
    stopAll,
    setTrackVolume,
    setTrackMuted,
    clearTrack,
    setError,
  }
}
