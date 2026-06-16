import { useCallback, useEffect, useRef, useState } from 'react'
import { safePlayMedia } from '../../utils/mediaPlayback'
import { primeTakePlaybackAudio, releaseTakePlaybackAudio } from '../../utils/takePlaybackAudio'
import { agentDebugLog } from '../../utils/agentDebugLog'
import {
  closeMixContext,
  connectVideoToMix,
  resumeMixContext,
  updateMixGain,
} from './studioPlaybackMix'

export type TrackStatus = 'IDLE' | 'RECORDING' | 'PLAYING'

export interface StudioTrack {
  id: 1 | 2 | 3 | 4
  stream: MediaStream | null
  recordedUrl: string | null
  status: TrackStatus
  isMuted: boolean
  volume: number
}

const TRACK_IDS = [1, 2, 3, 4] as const
const COUNTDOWN_SECONDS = 3
const DRIFT_THRESHOLD_SEC = 0.08

function makeInitialTracks(): StudioTrack[] {
  return TRACK_IDS.map((id) => ({
    id,
    stream: null,
    recordedUrl: null,
    status: 'IDLE' as TrackStatus,
    isMuted: false,
    volume: 1,
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

function primeRecordedVideo(el: HTMLVideoElement, url: string): void {
  if (el.srcObject) el.srcObject = null
  if (el.src !== url) {
    el.src = url
    el.load()
  }
}

function playClick(ctx: AudioContext, hz: number): void {
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.45, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.07)
  } catch {
    /* context may be closed */
  }
}

export function useMultiTrackStudio() {
  const [tracks, setTracks] = useState<StudioTrack[]>(makeInitialTracks)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  /** videoRefs[0] = track 1 … videoRefs[3] = track 4 */
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null])

  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false)
  const [countdownTrackId, setCountdownTrackId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [countdownValue, setCountdownValue] = useState(0)
  const [armingTrackId, setArmingTrackId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [postRecordReviewId, setPostRecordReviewId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [recordingElapsed, setRecordingElapsed] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingIdRef = useRef<1 | 2 | 3 | 4 | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const countIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordStartedAtRef = useRef(0)
  const driftRafRef = useRef(0)
  const isGlobalPlayingRef = useRef(false)
  const countAudioCtxRef = useRef<AudioContext | null>(null)
  const startingSessionRef = useRef(false)

  const releaseLiveStream = useCallback(async (): Promise<void> => {
    const stream = liveStreamRef.current
    if (!stream) return

    stream.getTracks().forEach((t) => t.stop())
    liveStreamRef.current = null

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  }, [])

  const clearTrackPreviewStream = useCallback((id: 1 | 2 | 3 | 4) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === id && t.stream && t.status !== 'RECORDING' ? { ...t, stream: null } : t)),
    )
  }, [])

  useEffect(() => {
    isGlobalPlayingRef.current = isGlobalPlaying
  }, [isGlobalPlaying])

  const getVideoForTrack = useCallback((id: 1 | 2 | 3 | 4): HTMLVideoElement | null => {
    return videoRefs.current[trackIndex(id)] ?? null
  }, [])

  const wireMixForTrack = useCallback(
    (track: StudioTrack) => {
      const el = getVideoForTrack(track.id)
      if (!el || !track.recordedUrl) return
      connectVideoToMix(el, track.volume, track.isMuted)
    },
    [getVideoForTrack],
  )

  const playRecordedTrack = useCallback(
    async (track: StudioTrack, fromStart = true): Promise<boolean> => {
      const el = getVideoForTrack(track.id)
      if (!el || !track.recordedUrl || track.status === 'RECORDING') return false

      primeRecordedVideo(el, track.recordedUrl)
      wireMixForTrack(track)
      resumeMixContext()

      if (fromStart) el.currentTime = 0
      return safePlayMedia(el)
    },
    [getVideoForTrack, wireMixForTrack],
  )

  const startOverdubPlayback = useCallback(
    async (recordingId: 1 | 2 | 3 | 4) => {
      resumeMixContext()
      const current = tracksRef.current
      const backing = TRACK_IDS.filter((id) => id !== recordingId)
        .map((trackId) => current.find((t) => t.id === trackId))
        .filter((t): t is StudioTrack => !!t?.recordedUrl)

      if (backing.length === 0) return

      await primeTakePlaybackAudio(
        ...backing.map((t) => getVideoForTrack(t.id)).filter(Boolean),
      )

      await Promise.all(backing.map((track) => playRecordedTrack(track, true)))
    },
    [getVideoForTrack, playRecordedTrack],
  )

  const pauseOverdubPlayback = useCallback((recordingId: 1 | 2 | 3 | 4) => {
    for (let slot = 0; slot < TRACK_IDS.length; slot++) {
      const trackId = TRACK_IDS[slot]!
      if (trackId === recordingId) continue
      videoRefs.current[slot]?.pause()
    }
  }, [])

  const startDriftLoop = useCallback(() => {
    cancelAnimationFrame(driftRafRef.current)

    const tick = () => {
      const current = tracksRef.current
      let masterEl: HTMLVideoElement | null = null
      let masterDuration = 0

      for (let slot = 0; slot < TRACK_IDS.length; slot++) {
        const trackId = TRACK_IDS[slot]!
        const track = current.find((t) => t.id === trackId)
        const el = videoRefs.current[slot]
        if (!el || !track?.recordedUrl || el.paused) continue
        const d = el.duration || 0
        if (d > masterDuration) {
          masterDuration = d
          masterEl = el
        }
      }

      if (masterEl) {
        const masterTime = masterEl.currentTime
        for (let slot = 0; slot < TRACK_IDS.length; slot++) {
          const el = videoRefs.current[slot]
          if (!el || el === masterEl || el.paused) continue
          if (Math.abs(el.currentTime - masterTime) > DRIFT_THRESHOLD_SEC) {
            el.currentTime = masterTime
          }
        }

        if (isGlobalPlayingRef.current && masterEl.ended) {
          cancelAnimationFrame(driftRafRef.current)
          for (let slot = 0; slot < TRACK_IDS.length; slot++) {
            videoRefs.current[slot]?.pause()
          }
          isGlobalPlayingRef.current = false
          setIsGlobalPlaying(false)
          void releaseTakePlaybackAudio()
          return
        }
      }

      driftRafRef.current = requestAnimationFrame(tick)
    }

    driftRafRef.current = requestAnimationFrame(tick)
  }, [])

  const stopDriftLoopInternal = useCallback(() => {
    cancelAnimationFrame(driftRafRef.current)
  }, [])

  const stopRecordTimer = useCallback(() => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current)
      recordTimerRef.current = null
    }
    setRecordingElapsed(0)
  }, [])

  const startRecordTimer = useCallback(() => {
    stopRecordTimer()
    recordStartedAtRef.current = Date.now()
    recordTimerRef.current = setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - recordStartedAtRef.current) / 1000))
    }, 250)
  }, [stopRecordTimer])

  const pauseTrack = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      getVideoForTrack(id)?.pause()
      setTracks((prev) =>
        prev.map((t) => (t.id === id && t.status === 'PLAYING' ? { ...t, status: 'IDLE' } : t)),
      )
    },
    [getVideoForTrack],
  )

  const pauseAllExcept = useCallback(
    (keepId: 1 | 2 | 3 | 4 | null) => {
      TRACK_IDS.forEach((id) => {
        if (id !== keepId) pauseTrack(id)
      })
    },
    [pauseTrack],
  )

  const cancelCountdown = useCallback(() => {
    if (countIntervalRef.current) {
      clearInterval(countIntervalRef.current)
      countIntervalRef.current = null
    }
    setCountdownTrackId(null)
    setCountdownValue(0)
    setArmingTrackId(null)
  }, [])

  const cancelRecordingSession = useCallback(
    async (id: 1 | 2 | 3 | 4) => {
      cancelCountdown()
      startingSessionRef.current = false
      if (recordingIdRef.current === id) {
        const recorder = recorderRef.current
        if (recorder?.state === 'recording') recorder.stop()
      } else {
        await releaseLiveStream()
        clearTrackPreviewStream(id)
      }
    },
    [cancelCountdown, clearTrackPreviewStream, releaseLiveStream],
  )

  const stopAll = useCallback(() => {
    stopDriftLoopInternal()
    for (let slot = 0; slot < TRACK_IDS.length; slot++) {
      videoRefs.current[slot]?.pause()
    }
    isGlobalPlayingRef.current = false
    setIsGlobalPlaying(false)
    void releaseTakePlaybackAudio()
  }, [stopDriftLoopInternal])

  const playAll = useCallback(async () => {
    stopDriftLoopInternal()
    setPostRecordReviewId(null)

    const current = tracksRef.current
    const toPlay: StudioTrack[] = []

    for (const trackId of TRACK_IDS) {
      const track = current.find((t) => t.id === trackId)
      if (track?.recordedUrl && track.status !== 'RECORDING') {
        toPlay.push(track)
      }
    }

    if (toPlay.length === 0) return

    pauseAllExcept(null)

    const elements = toPlay
      .map((t) => getVideoForTrack(t.id))
      .filter((el): el is HTMLVideoElement => el !== null)

    await primeTakePlaybackAudio(...elements)
    resumeMixContext()

    for (const track of toPlay) {
      wireMixForTrack(track)
    }

    await Promise.all(toPlay.map((track) => playRecordedTrack(track, true)))

    startDriftLoop()
    isGlobalPlayingRef.current = true
    setIsGlobalPlaying(true)
  }, [
    getVideoForTrack,
    pauseAllExcept,
    playRecordedTrack,
    startDriftLoop,
    stopDriftLoopInternal,
    wireMixForTrack,
  ])

  const clearTrackInternal = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      const el = getVideoForTrack(id)
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
                volume: 1,
              }
            : t,
        )
      })
    },
    [getVideoForTrack],
  )

  const beginRecording = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      const stream = liveStreamRef.current
      if (!stream || recordingIdRef.current !== null) return

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

        // #region agent log
        agentDebugLog(
          'useMultiTrackStudio.ts:onstop',
          'recorder stopped',
          { trackId, chunkCount: chunksRef.current.length },
          'D',
          'studio-ui',
        )
        // #endregion

        stream.getTracks().forEach((t) => t.stop())
        liveStreamRef.current = null
        pauseOverdubPlayback(trackId)
        stopRecordTimer()

        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        const url = URL.createObjectURL(blob)
        chunksRef.current = []
        recordingIdRef.current = null
        recorderRef.current = null
        startingSessionRef.current = false

        setTracks((prev) => {
          const old = prev.find((t) => t.id === trackId)?.recordedUrl
          if (old) URL.revokeObjectURL(old)
          return prev.map((t) =>
            t.id === trackId
              ? { ...t, stream: null, recordedUrl: url, status: 'IDLE' as TrackStatus }
              : t,
          )
        })

        setArmingTrackId(null)
        setPostRecordReviewId(trackId)

        for (let slot = 0; slot < TRACK_IDS.length; slot++) {
          const trackIdAtSlot = TRACK_IDS[slot]!
          if (trackIdAtSlot === trackId) continue
          const el = videoRefs.current[slot]
          if (!el) continue
          el.pause()
          try {
            el.currentTime = 0
          } catch {
            /* metadata may not be ready */
          }
        }
      }

      recorder.start()
      recorderRef.current = recorder
      startRecordTimer()

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

      void startOverdubPlayback(id)
    },
    [pauseOverdubPlayback, startOverdubPlayback, startRecordTimer, stopRecordTimer],
  )

  const startCountdownAfterPreview = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      if (!countAudioCtxRef.current || countAudioCtxRef.current.state === 'closed') {
        countAudioCtxRef.current = new AudioContext()
      }
      const countCtx = countAudioCtxRef.current
      void countCtx.resume()
      playClick(countCtx, 880)

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
            beginRecording(id)
            return 0
          }
          playClick(countCtx, prev - 1 === 1 ? 1320 : 880)
          return prev - 1
        })
      }, 1000)
    },
    [beginRecording],
  )

  const openCameraAndCountdown = useCallback(
    async (id: 1 | 2 | 3 | 4) => {
      setArmingTrackId(id)
      // #region agent log
      agentDebugLog(
        'useMultiTrackStudio.ts:openCamera',
        'camera session start',
        { id },
        'H4',
        'studio-camera',
      )
      // #endregion
      await releaseLiveStream()

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true,
        })

        liveStreamRef.current = stream

        // #region agent log
        agentDebugLog(
          'useMultiTrackStudio.ts:openCamera',
          'getUserMedia ok',
          {
            id,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
            videoReadyState: stream.getVideoTracks()[0]?.readyState ?? 'none',
          },
          'H4',
          'studio-camera',
        )
        // #endregion

        setTracks((prev) =>
          prev.map((t) =>
            t.id === id ? { ...t, stream, status: 'IDLE' as TrackStatus } : t,
          ),
        )

        setArmingTrackId(null)
        startingSessionRef.current = false
        startCountdownAfterPreview(id)
      } catch (err) {
        console.error('openCameraAndCountdown failed', err)
        // #region agent log
        agentDebugLog(
          'useMultiTrackStudio.ts:openCamera',
          'getUserMedia failed',
          { id, error: err instanceof Error ? err.name : String(err) },
          'H4',
          'studio-camera',
        )
        // #endregion
        startingSessionRef.current = false
        setArmingTrackId(null)
        await releaseLiveStream()
        clearTrackPreviewStream(id)
      }
    },
    [clearTrackPreviewStream, releaseLiveStream, startCountdownAfterPreview],
  )

  const startRecording = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      if (
        startingSessionRef.current ||
        countdownTrackId !== null ||
        armingTrackId !== null ||
        recordingIdRef.current !== null ||
        tracksRef.current.some((t) => t.status === 'RECORDING')
      ) {
        return
      }

      setPostRecordReviewId(null)
      stopAll()
      pauseAllExcept(null)
      cancelCountdown()

      startingSessionRef.current = true
      void openCameraAndCountdown(id)
    },
    [
      armingTrackId,
      cancelCountdown,
      countdownTrackId,
      openCameraAndCountdown,
      pauseAllExcept,
      stopAll,
    ],
  )

  const stopRecording = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      // #region agent log
      agentDebugLog(
        'useMultiTrackStudio.ts:stopRecording',
        'stop requested',
        {
          id,
          recordingIdRef: recordingIdRef.current,
          recorderState: recorderRef.current?.state ?? 'none',
        },
        'D',
        'studio-ui',
      )
      // #endregion
      if (recordingIdRef.current !== id) return

      pauseOverdubPlayback(id)

      const el = getVideoForTrack(id)
      if (el) {
        el.pause()
        el.srcObject = null
      }

      // Drop live preview + recording flag immediately so overlay/footer return while blob finalizes.
      setTracks((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, stream: null, status: 'IDLE' as TrackStatus }
            : t,
        ),
      )

      const recorder = recorderRef.current
      if (recorder?.state === 'recording') recorder.stop()
    },
    [getVideoForTrack, pauseOverdubPlayback],
  )

  const playTrack = useCallback(
    async (id: 1 | 2 | 3 | 4) => {
      const track = tracksRef.current.find((t) => t.id === id)
      if (!track?.recordedUrl) return

      setIsGlobalPlaying(false)
      isGlobalPlayingRef.current = false
      stopDriftLoopInternal()
      pauseAllExcept(id)

      setTracks((prev) =>
        prev.map((t) => {
          if (t.id === id) return { ...t, status: 'PLAYING' as TrackStatus }
          if (t.status === 'PLAYING') return { ...t, status: 'IDLE' as TrackStatus }
          return t
        }),
      )

      await playRecordedTrack(track, true)
    },
    [pauseAllExcept, playRecordedTrack, stopDriftLoopInternal],
  )

  const toggleTrackMute = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = { ...t, isMuted: !t.isMuted }
          const el = getVideoForTrack(id)
          if (el) updateMixGain(el, next.volume, next.isMuted)
          return next
        }),
      )
    },
    [getVideoForTrack],
  )

  const setTrackVolume = useCallback(
    (id: 1 | 2 | 3 | 4, volume: number) => {
      setTracks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t
          const next = { ...t, volume }
          const el = getVideoForTrack(id)
          if (el) updateMixGain(el, volume, next.isMuted)
          return next
        }),
      )
    },
    [getVideoForTrack],
  )

  const keepRecordedTake = useCallback((id: 1 | 2 | 3 | 4) => {
    setPostRecordReviewId((current) => (current === id ? null : current))
  }, [])

  const redoRecordedTake = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      setPostRecordReviewId(null)
      clearTrackInternal(id)
      startRecording(id)
    },
    [clearTrackInternal, startRecording],
  )

  const clearTrack = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      setPostRecordReviewId((current) => (current === id ? null : current))
      clearTrackInternal(id)
    },
    [clearTrackInternal],
  )

  useEffect(() => {
    return () => {
      if (countIntervalRef.current) clearInterval(countIntervalRef.current)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      stopDriftLoopInternal()
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())
      recorderRef.current?.stop()
      tracksRef.current.forEach((t) => {
        if (t.recordedUrl) URL.revokeObjectURL(t.recordedUrl)
      })
      countAudioCtxRef.current?.close().catch(() => {})
      closeMixContext()
    }
  }, [stopDriftLoopInternal])

  const hasAnyRecording = tracks.some((t) => !!t.recordedUrl)
  const isAnyRecording = tracks.some((t) => t.status === 'RECORDING')
  const isCountingDown = countdownTrackId !== null

  /** Track that owns immersive fullscreen (camera preview, count-in, or active record). */
  const immersiveTrackId: 1 | 2 | 3 | 4 | null =
    postRecordReviewId !== null
      ? null
      : countdownTrackId ??
        armingTrackId ??
        tracks.find((t) => t.status === 'RECORDING' && t.stream)?.id ??
        tracks.find((t) => t.stream && t.status === 'IDLE')?.id ??
        null

  const isImmersive = immersiveTrackId !== null

  return {
    tracks,
    videoRefs,
    isGlobalPlaying,
    hasAnyRecording,
    isAnyRecording,
    isCountingDown,
    isImmersive,
    immersiveTrackId,
    armingTrackId,
    countdownTrackId,
    countdownValue,
    postRecordReviewId,
    recordingElapsed,
    startRecording,
    stopRecording,
    cancelRecordingSession,
    playTrack,
    pauseTrack,
    playAll,
    stopAll,
    clearTrack,
    toggleTrackMute,
    setTrackVolume,
    keepRecordedTake,
    redoRecordedTake,
  }
}
