import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveMediaPlaybackSrc, waitForMediaReady } from '../../utils/mediaPlayback'
import { applyBulletproofVideoElement } from '../../utils/mobileVideo'
import {
  playTakeMedia,
  playTakeMediaBatch,
  releaseTakePlaybackAudio,
} from '../../utils/takePlaybackAudio'
import {
  beatIntervalMs,
  closeStudioMetronomeAudio,
  playMetronomeClick,
  primeStudioMetronomeAudioSync,
} from './studioMetronome'
import { isLiveMediaStream } from './studioLivePreview'
import {
  closeMixContext,
  connectVideoToMix,
  keepMixContextAlive,
  resumeMixContext,
  suspendMixContext,
  updateMixGain,
} from './studioPlaybackMix'
import { resumePlaybackAudioContext } from '../../utils/playbackAudioContext'

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
/** Wider threshold + less frequent sync avoids decode stutter from constant seeking. */
const DRIFT_THRESHOLD_SEC = 0.2
const DRIFT_SYNC_INTERVAL_MS = 500

export type StudioCountInBeats = 8 | 16
export type StudioBeatsPerBar = 2 | 3 | 4

export interface StudioCountInPrefs {
  bpm: number
  countInBeats: StudioCountInBeats
  beatsPerBar: StudioBeatsPerBar
  metronomeDuringRep: boolean
}

const DEFAULT_STUDIO_PREFS: StudioCountInPrefs = {
  bpm: 120,
  countInBeats: 8,
  beatsPerBar: 4,
  metronomeDuringRep: false,
}

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
  applyBulletproofVideoElement(el)
  const safeSrc = resolveMediaPlaybackSrc(url)
  if (el.src !== safeSrc) {
    el.src = safeSrc
    el.load()
  }
}

function seekVideoTo(el: HTMLVideoElement, time: number): void {
  if (typeof el.fastSeek === 'function') {
    try {
      el.fastSeek(time)
      return
    } catch {
      /* fall through */
    }
  }
  try {
    el.currentTime = time
  } catch {
    /* ignore */
  }
}

export function useMultiTrackStudio() {
  const [tracks, setTracks] = useState<StudioTrack[]>(makeInitialTracks)
  const tracksRef = useRef(tracks)
  tracksRef.current = tracks

  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null])

  const [isGlobalPlaying, setIsGlobalPlaying] = useState(false)
  const [selectedTrackId, setSelectedTrackId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [countInPrefs, setCountInPrefs] = useState<StudioCountInPrefs>(DEFAULT_STUDIO_PREFS)
  const [countdownTrackId, setCountdownTrackId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [armingTrackId, setArmingTrackId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [postRecordReviewId, setPostRecordReviewId] = useState<1 | 2 | 3 | 4 | null>(null)
  const [recordingElapsed, setRecordingElapsed] = useState(0)
  const [isArmingCamera, setIsArmingCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const studioPrefsRef = useRef(countInPrefs)
  studioPrefsRef.current = countInPrefs
  const selectedTrackIdRef = useRef(selectedTrackId)
  selectedTrackIdRef.current = selectedTrackId

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordingIdRef = useRef<1 | 2 | 3 | 4 | null>(null)
  const liveStreamRef = useRef<MediaStream | null>(null)
  const countTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repMetronomeRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordStartedAtRef = useRef(0)
  const driftIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isGlobalPlayingRef = useRef(false)
  const armLockRef = useRef<Promise<boolean> | null>(null)

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

      if (fromStart) seekVideoTo(el, 0)
      return playTakeMedia(el)
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

      const elements: HTMLVideoElement[] = []
      for (const track of backing) {
        const el = getVideoForTrack(track.id)
        if (!el || !track.recordedUrl) continue
        primeRecordedVideo(el, track.recordedUrl)
        wireMixForTrack(track)
        seekVideoTo(el, 0)
        elements.push(el)
      }

      if (elements.length === 0) return
      await playTakeMediaBatch(elements)
    },
    [getVideoForTrack, wireMixForTrack],
  )

  const pauseOverdubPlayback = useCallback((_recordingId: 1 | 2 | 3 | 4) => {
    for (let slot = 0; slot < TRACK_IDS.length; slot++) {
      videoRefs.current[slot]?.pause()
    }
  }, [])

  const stopDriftLoopInternal = useCallback(() => {
    if (driftIntervalRef.current) {
      clearInterval(driftIntervalRef.current)
      driftIntervalRef.current = null
    }
  }, [])

  const startDriftLoop = useCallback(() => {
    stopDriftLoopInternal()

    driftIntervalRef.current = setInterval(() => {
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

      if (!masterEl) return

      if (isGlobalPlayingRef.current && masterEl.ended) {
        stopDriftLoopInternal()
        for (let slot = 0; slot < TRACK_IDS.length; slot++) {
          videoRefs.current[slot]?.pause()
        }
        void releaseTakePlaybackAudio()
        isGlobalPlayingRef.current = false
        setIsGlobalPlaying(false)
        setTracks((prev) =>
          prev.map((t) => (t.status === 'PLAYING' ? { ...t, status: 'IDLE' as TrackStatus } : t)),
        )
        return
      }

      keepMixContextAlive()

      const masterTime = masterEl.currentTime
      for (let slot = 0; slot < TRACK_IDS.length; slot++) {
        const el = videoRefs.current[slot]
        if (!el || el === masterEl || el.paused) continue
        if (Math.abs(el.currentTime - masterTime) > DRIFT_THRESHOLD_SEC) {
          seekVideoTo(el, masterTime)
        }
      }
    }, DRIFT_SYNC_INTERVAL_MS)
  }, [stopDriftLoopInternal])

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

  const stopMetronome = useCallback(() => {
    if (countTimeoutRef.current) {
      clearTimeout(countTimeoutRef.current)
      countTimeoutRef.current = null
    }
    if (repMetronomeRef.current) {
      clearInterval(repMetronomeRef.current)
      repMetronomeRef.current = null
    }
    setCountdownTrackId(null)
  }, [])

  const cancelCountdown = useCallback(() => {
    stopMetronome()
    setArmingTrackId(null)
  }, [stopMetronome])

  const cancelRecordingSession = useCallback(
    async (id: 1 | 2 | 3 | 4) => {
      cancelCountdown()
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
    void releaseTakePlaybackAudio()
    isGlobalPlayingRef.current = false
    setIsGlobalPlaying(false)
    setTracks((prev) =>
      prev.map((t) => (t.status === 'PLAYING' ? { ...t, status: 'IDLE' as TrackStatus } : t)),
    )
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
    resumeMixContext()

    const elements: HTMLVideoElement[] = []
    for (const track of toPlay) {
      const el = getVideoForTrack(track.id)
      if (!el || !track.recordedUrl) continue
      primeRecordedVideo(el, track.recordedUrl)
      wireMixForTrack(track)
      seekVideoTo(el, 0)
      elements.push(el)
    }

    if (elements.length === 0) return

    await Promise.all(elements.map((el) => waitForMediaReady(el, 2000)))

    const results = await playTakeMediaBatch(elements)
    if (!results.some(Boolean)) return

    const playingIds = new Set(toPlay.map((t) => t.id))
    setTracks((prev) =>
      prev.map((t) =>
        playingIds.has(t.id)
          ? { ...t, status: 'PLAYING' as TrackStatus }
          : t.status === 'PLAYING'
            ? { ...t, status: 'IDLE' as TrackStatus }
            : t,
      ),
    )

    startDriftLoop()
    isGlobalPlayingRef.current = true
    setIsGlobalPlaying(true)
  }, [getVideoForTrack, pauseAllExcept, startDriftLoop, stopDriftLoopInternal, wireMixForTrack])

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
      if (!stream || !isLiveMediaStream(stream) || recordingIdRef.current !== null) {
        setCameraError('Camera lost — tap the part to re-open preview, then Record again.')
        return
      }

      suspendMixContext()
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

        stopMetronome()

        stream.getTracks().forEach((t) => t.stop())
        liveStreamRef.current = null
        pauseOverdubPlayback(trackId)
        stopRecordTimer()

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
    [pauseOverdubPlayback, startOverdubPlayback, startRecordTimer, stopMetronome, stopRecordTimer],
  )

  const startRepMetronome = useCallback((bpm: number, beatsPerBar: StudioBeatsPerBar) => {
    if (repMetronomeRef.current) {
      clearInterval(repMetronomeRef.current)
      repMetronomeRef.current = null
    }
    const beatMs = beatIntervalMs(bpm)
    let repBeat = 0
    repMetronomeRef.current = setInterval(() => {
      void playMetronomeClick(repBeat % beatsPerBar === 0)
      repBeat++
    }, beatMs)
  }, [])

  const startMetronomeCountIn = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      const prefs = studioPrefsRef.current
      const beatMs = beatIntervalMs(prefs.bpm)
      const beatsPerBar = prefs.beatsPerBar
      let beatsPlayed = 0

      primeStudioMetronomeAudioSync()
      setCountdownTrackId(id)

      const playNextBeat = () => {
        if (beatsPlayed >= prefs.countInBeats) {
          countTimeoutRef.current = null
          setCountdownTrackId(null)
          beginRecording(id)
          if (prefs.metronomeDuringRep) {
            startRepMetronome(prefs.bpm, beatsPerBar)
          }
          return
        }

        void playMetronomeClick(beatsPlayed % beatsPerBar === 0)
        beatsPlayed++
        countTimeoutRef.current = setTimeout(playNextBeat, beatMs)
      }

      playNextBeat()
    },
    [beginRecording, startRepMetronome],
  )

  const armTrackPreview = useCallback(
    async (id: 1 | 2 | 3 | 4): Promise<boolean> => {
      if (armLockRef.current) {
        const prior = await armLockRef.current
        if (prior && isLiveMediaStream(liveStreamRef.current)) {
          return liveStreamRef.current !== null
        }
      }

      const armWork = (async (): Promise<boolean> => {
        setIsArmingCamera(true)
        setCameraError(null)
        setArmingTrackId(id)

        await releaseLiveStream()
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: true,
          })

          if (!isLiveMediaStream(stream)) {
            stream.getTracks().forEach((t) => t.stop())
            throw new Error('Camera stream ended before preview started')
          }

          liveStreamRef.current = stream

          setTracks((prev) =>
            prev.map((t) =>
              t.id === id ? { ...t, stream, status: 'IDLE' as TrackStatus } : { ...t, stream: null },
            ),
          )

          setArmingTrackId(null)
          return true
        } catch (err) {
          console.error('armTrackPreview failed', err)
          setCameraError('Could not start camera. Try again in a moment.')
          setArmingTrackId(null)
          await releaseLiveStream()
          clearTrackPreviewStream(id)
          return false
        } finally {
          setIsArmingCamera(false)
        }
      })()

      armLockRef.current = armWork
      try {
        return await armWork
      } finally {
        if (armLockRef.current === armWork) {
          armLockRef.current = null
        }
      }
    },
    [clearTrackPreviewStream, releaseLiveStream],
  )

  const ensureLiveCamera = useCallback(
    async (id: 1 | 2 | 3 | 4): Promise<boolean> => {
      if (isLiveMediaStream(liveStreamRef.current)) return true
      liveStreamRef.current = null
      return armTrackPreview(id)
    },
    [armTrackPreview],
  )

  const selectTrack = useCallback(
    async (id: 1 | 2 | 3 | 4) => {
      if (
        recordingIdRef.current !== null ||
        countdownTrackId !== null ||
        tracksRef.current.some((t) => t.status === 'RECORDING')
      ) {
        return
      }

      setPostRecordReviewId(null)
      setSelectedTrackId(id)

      const currentPreviewId = tracksRef.current.find((t) => t.stream)?.id ?? null
      if (currentPreviewId !== null && currentPreviewId !== id) {
        await releaseLiveStream()
        setTracks((prev) => prev.map((t) => ({ ...t, stream: null })))
      }

      const track = tracksRef.current.find((t) => t.id === id)
      if (!track?.recordedUrl && !isLiveMediaStream(liveStreamRef.current) && armingTrackId === null) {
        await armTrackPreview(id)
      }
    },
    [armingTrackId, armTrackPreview, countdownTrackId, releaseLiveStream],
  )

  const beginRecordingSession = useCallback(async () => {
    const id = selectedTrackIdRef.current
    if (!id) return

    if (
      isArmingCamera ||
      armLockRef.current !== null ||
      countdownTrackId !== null ||
      armingTrackId !== null ||
      recordingIdRef.current !== null ||
      tracksRef.current.some((t) => t.status === 'RECORDING')
    ) {
      return
    }

    primeStudioMetronomeAudioSync()
    resumeMixContext()

    setPostRecordReviewId(null)
    stopAll()
    pauseAllExcept(null)
    cancelCountdown()

    const cameraReady = await ensureLiveCamera(id)
    if (!cameraReady || !isLiveMediaStream(liveStreamRef.current)) {
      setCameraError('Camera is not ready. Tap the part again, then Record.')
      return
    }

    startMetronomeCountIn(id)
  }, [
    armingTrackId,
    cancelCountdown,
    countdownTrackId,
    ensureLiveCamera,
    isArmingCamera,
    pauseAllExcept,
    startMetronomeCountIn,
    stopAll,
  ])

  const stopRecording = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      if (recordingIdRef.current !== id) return

      stopMetronome()
      pauseOverdubPlayback(id)

      const el = getVideoForTrack(id)
      if (el) {
        el.pause()
        el.srcObject = null
      }

      setTracks((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, stream: null, status: 'IDLE' as TrackStatus } : t,
        ),
      )

      const recorder = recorderRef.current
      if (recorder?.state === 'recording') recorder.stop()
    },
    [getVideoForTrack, pauseOverdubPlayback, stopMetronome],
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
      setSelectedTrackId(id)
      void selectTrack(id)
    },
    [clearTrackInternal, selectTrack],
  )

  const clearTrack = useCallback(
    (id: 1 | 2 | 3 | 4) => {
      setPostRecordReviewId((current) => (current === id ? null : current))
      clearTrackInternal(id)
    },
    [clearTrackInternal],
  )

  const deselectTrack = useCallback(async () => {
    if (
      recordingIdRef.current !== null ||
      tracksRef.current.some((t) => t.status === 'RECORDING')
    ) {
      return
    }

    if (countdownTrackId !== null) {
      cancelCountdown()
    }
    await releaseLiveStream()
    setTracks((prev) => prev.map((t) => ({ ...t, stream: null })))
    setSelectedTrackId(null)
  }, [cancelCountdown, countdownTrackId, releaseLiveStream])

  useEffect(() => {
    return () => {
      if (countTimeoutRef.current) clearTimeout(countTimeoutRef.current)
      if (repMetronomeRef.current) clearInterval(repMetronomeRef.current)
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      stopDriftLoopInternal()
      liveStreamRef.current?.getTracks().forEach((t) => t.stop())
      recorderRef.current?.stop()
      tracksRef.current.forEach((t) => {
        if (t.recordedUrl) URL.revokeObjectURL(t.recordedUrl)
      })
      closeStudioMetronomeAudio()
      closeMixContext()
      resumeMixContext()
      void resumePlaybackAudioContext()
    }
  }, [stopDriftLoopInternal])

  const hasAnyRecording = tracks.some((t) => !!t.recordedUrl)
  const isAnyRecording = tracks.some((t) => t.status === 'RECORDING')
  const isCountingDown = countdownTrackId !== null

  const immersiveTrackId: 1 | 2 | 3 | 4 | null =
    postRecordReviewId !== null
      ? null
      : selectedTrackId !== null &&
          (countdownTrackId !== null ||
            tracks.some(
              (t) =>
                t.id === selectedTrackId &&
                (t.status === 'RECORDING' || Boolean(t.stream)),
            ))
        ? selectedTrackId
        : null

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
    selectedTrackId,
    countInPrefs,
    postRecordReviewId,
    recordingElapsed,
    isArmingCamera,
    cameraError,
    selectTrack,
    beginRecordingSession,
    setCountInPrefs,
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
    deselectTrack,
  }
}
