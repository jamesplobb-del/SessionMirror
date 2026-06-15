/**
 * useMultiTrackStudio
 *
 * Recording engine for Studio Sandbox:
 *   - Hardware init (getUserMedia)
 *   - Web Audio count-in (oscillator clicks at 120 BPM)
 *   - Synchronized MediaRecorder launch at downbeat
 *   - Anti-drift requestAnimationFrame playback loop
 *   - Per-track volume / mute wired to playback <video> elements
 *   - Mirrored thumbnail generation after each take
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { generateThumbnailFromBlob } from '../../utils/generateThumbnail'
import { playMediaOnUserGesture } from '../../utils/mediaPlayback'
import {
  primeTakePlaybackAudio,
  releaseTakePlaybackAudio,
} from '../../utils/takePlaybackAudio'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface StudioTrack {
  id: string
  label: string
  color: string
  stream: MediaStream | null
  recordedBlobUrl: string | null
  thumbnailUrl: string | null
  isRecording: boolean
  isMuted: boolean
  volume: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BPM = 120
const BEAT_MS = (60 / BPM) * 1000

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
    thumbnailUrl: null,
    isRecording: false,
    isMuted: false,
    volume: 0.8,
  }))
}

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
    // Context may already be closed
  }
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

function applyTrackVolume(el: HTMLMediaElement, track: StudioTrack): void {
  el.volume = track.isMuted ? 0 : track.volume
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMultiTrackStudio() {
  const [tracks, setTracks] = useState<StudioTrack[]>(makeInitialTracks)
  const [isCountingIn, setIsCountingIn] = useState(false)
  const [currentCount, setCurrentCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tracksRef = useRef<StudioTrack[]>(tracks)
  tracksRef.current = tracks

  /** Playback refs — wired to TakeVideoPlayer instances in the UI. */
  const playbackVideoRefs = useRef<(HTMLMediaElement | null)[]>([
    null,
    null,
    null,
    null,
  ])

  const audioCtxRef = useRef<AudioContext | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingTrackIdRef = useRef<string | null>(null)
  const countIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const driftRafRef = useRef<number>(0)

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }

  // Keep playback element volume in sync with track state
  useEffect(() => {
    tracks.forEach((track, i) => {
      const el = playbackVideoRefs.current[i]
      if (!el || !track.recordedBlobUrl) return
      applyTrackVolume(el, track)
    })
  }, [tracks])

  const initHardware = useCallback(async (trackId: string) => {
    setError(null)
    try {
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: true,
      })
      liveStreamRef.current = stream

      setTracks((prev) =>
        prev.map((t) => {
          if (t.id === trackId) return { ...t, stream }
          if (t.stream && t.stream !== stream) return { ...t, stream: null }
          return t
        }),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Camera / mic access denied'
      setError(msg)
    }
  }, [])

  const startRecording = useCallback((trackId: string) => {
    if (!liveStreamRef.current) {
      setError('Tap the camera button first to arm this track')
      return
    }

    if (countIntervalRef.current) clearInterval(countIntervalRef.current)

    recordingTrackIdRef.current = trackId
    const ctx = getAudioCtx()

    setIsCountingIn(true)
    setCurrentCount(4)
    playClick(ctx, 1_000)

    let pending = 3

    countIntervalRef.current = setInterval(() => {
      if (pending > 0) {
        setCurrentCount(pending)
        playClick(ctx, pending === 1 ? 1_500 : 1_000)
        pending--
      } else {
        clearInterval(countIntervalRef.current!)
        countIntervalRef.current = null
        setIsCountingIn(false)
        setCurrentCount(0)
        _doLaunchRecording()
      }
    }, BEAT_MS)
  }, [])

  function _doLaunchRecording(): void {
    const trackId = recordingTrackIdRef.current
    const liveStream = liveStreamRef.current
    if (!trackId || !liveStream) return

    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, isRecording: true } : t)),
    )

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
      void (async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const url = URL.createObjectURL(blob)
        let thumbnailUrl: string | null = null
        try {
          thumbnailUrl = await generateThumbnailFromBlob(blob, true)
        } catch {
          // Thumbnail is optional — playback still works
        }

        setTracks((prev) =>
          prev.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  isRecording: false,
                  recordedBlobUrl: url,
                  thumbnailUrl,
                  stream: null,
                }
              : t,
          ),
        )
      })()
    }

    recorder.start()
    recorderRef.current = recorder

    const current = tracksRef.current
    playbackVideoRefs.current.forEach((el, i) => {
      if (!el) return
      const t = current[i]
      if (!t || t.id === trackId || !t.recordedBlobUrl) return
      el.currentTime = 0
      void playMediaOnUserGesture(el, () => primeTakePlaybackAudio(el))
    })
  }

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
    playbackVideoRefs.current.forEach((el) => el?.pause())
    void releaseTakePlaybackAudio()
  }, [])

  const playAll = useCallback(() => {
    const current = tracksRef.current
    setIsPlaying(true)

    playbackVideoRefs.current.forEach((el, i) => {
      if (!el || !current[i]?.recordedBlobUrl) return
      el.currentTime = 0
      void playMediaOnUserGesture(el, () => primeTakePlaybackAudio(el))
    })

    _startDriftLoop()
  }, [])

  const stopAll = useCallback(() => {
    setIsPlaying(false)
    cancelAnimationFrame(driftRafRef.current)
    playbackVideoRefs.current.forEach((el) => el?.pause())
    void releaseTakePlaybackAudio()
  }, [])

  function _startDriftLoop(): void {
    cancelAnimationFrame(driftRafRef.current)

    const tick = () => {
      const current = tracksRef.current

      let masterEl: HTMLMediaElement | null = null
      let masterDuration = 0
      const refs = playbackVideoRefs.current
      for (let i = 0; i < refs.length; i++) {
        const el = refs[i]
        if (!el || !current[i]?.recordedBlobUrl) continue
        const d = el.duration || 0
        if (d > masterDuration) {
          masterDuration = d
          masterEl = el
        }
      }

      if (masterEl !== null) {
        const masterTime = masterEl.currentTime
        for (let i = 0; i < refs.length; i++) {
          const el = refs[i]
          if (!el || el === masterEl || !current[i]?.recordedBlobUrl) continue
          if (Math.abs(el.currentTime - masterTime) > 0.08) {
            el.currentTime = masterTime
          }
        }
      }

      driftRafRef.current = requestAnimationFrame(tick)
    }

    driftRafRef.current = requestAnimationFrame(tick)
  }

  const setTrackVolume = useCallback((trackId: string, volume: number) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, volume } : t)))
    const idx = tracksRef.current.findIndex((t) => t.id === trackId)
    const el = playbackVideoRefs.current[idx]
    const track = tracksRef.current[idx]
    if (el && track?.recordedBlobUrl) {
      el.volume = track.isMuted ? 0 : volume
    }
  }, [])

  const setTrackMuted = useCallback((trackId: string, muted: boolean) => {
    setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, isMuted: muted } : t)))
    const idx = tracksRef.current.findIndex((t) => t.id === trackId)
    const el = playbackVideoRefs.current[idx]
    const track = tracksRef.current[idx]
    if (el && track?.recordedBlobUrl) {
      el.volume = muted ? 0 : track.volume
    }
  }, [])

  const clearTrack = useCallback((trackId: string) => {
    const idx = tracksRef.current.findIndex((t) => t.id === trackId)
    const el = playbackVideoRefs.current[idx]
    if (el) {
      el.pause()
    }

    const old = tracksRef.current[idx]
    if (old?.recordedBlobUrl) URL.revokeObjectURL(old.recordedBlobUrl)

    setTracks((prev) =>
      prev.map((t) =>
        t.id === trackId
          ? {
              ...t,
              recordedBlobUrl: null,
              thumbnailUrl: null,
              isRecording: false,
              stream: liveStreamRef.current ?? null,
            }
          : t,
      ),
    )
  }, [])

  useEffect(() => {
    return () => {
      if (countIntervalRef.current) clearInterval(countIntervalRef.current)
      cancelAnimationFrame(driftRafRef.current)
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())
      audioCtxRef.current?.close().catch(() => {})
      tracksRef.current.forEach((t) => {
        if (t.recordedBlobUrl) URL.revokeObjectURL(t.recordedBlobUrl)
      })
      void releaseTakePlaybackAudio()
    }
  }, [])

  return {
    tracks,
    isCountingIn,
    currentCount,
    isPlaying,
    error,
    playbackVideoRefs,
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
