import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useCameraSession } from './useCameraSession'
import {
  filterAvailableStarterTracks,
  listMp3VaultTracks,
  persistImportedMp3,
} from '../utils/playalong/mp3Vault'
import { applyPlayalongMix } from '../utils/playalong/mixControls'
import {
  pauseYoutubeProxy,
  playYoutubeProxy,
  seekYoutubeProxy,
} from '../utils/playalong/youtubeBridge'
import type {
  BackingTrackMode,
  Mp3VaultTrack,
  PlayalongPhase,
  PlayalongRecordedTake,
  PlayalongTopTab,
} from '../utils/playalong/types'
import { assignMediaPlaybackSrc, prepareInlineMediaElement } from '../utils/mediaPlayback'
import { iosBulletproofVideoProps } from '../utils/mobileVideo'
import type { RecordingCompletePayload } from '../utils/takeStorage'

export interface UsePlayalongStudioResult {
  phase: PlayalongPhase
  backingTrackMode: BackingTrackMode
  backingTrackSource: string
  backingTrackLabel: string
  mixRatio: number
  topTab: PlayalongTopTab
  mp3Tracks: Mp3VaultTrack[]
  recordedTake: PlayalongRecordedTake | null
  isReviewPlaying: boolean
  isRecording: boolean
  elapsed: number
  cameraReady: boolean
  cameraError: string | null
  exportMessage: string | null
  previewRef: RefObject<HTMLVideoElement | null>
  backingAudioRef: RefObject<HTMLAudioElement | null>
  recordedVideoRef: RefObject<HTMLVideoElement | null>
  youtubeIframeRef: RefObject<HTMLIFrameElement | null>
  setTopTab: (tab: PlayalongTopTab) => void
  setMixRatio: (ratio: number) => void
  selectMp3Track: (track: Mp3VaultTrack) => void
  selectYoutubeTrack: (embedUrl: string) => void
  clearBackingTrack: () => void
  importMp3File: (file: File) => Promise<void>
  handleRecordToggle: () => void
  handleReviewPlayPause: () => void
  handleReviewEnded: () => void
  handleRedo: () => void
  handleExport: () => Promise<void>
}

export function usePlayalongStudio(): UsePlayalongStudioResult {
  const backingAudioRef = useRef<HTMLAudioElement>(null)
  const recordedVideoRef = useRef<HTMLVideoElement>(null)
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null)

  const [phase, setPhase] = useState<PlayalongPhase>('record')
  const [backingTrackMode, setBackingTrackMode] = useState<BackingTrackMode>('none')
  const [backingTrackSource, setBackingTrackSource] = useState('')
  const [backingTrackLabel, setBackingTrackLabel] = useState('')
  const [mixRatio, setMixRatioState] = useState(50)
  const [topTab, setTopTab] = useState<PlayalongTopTab>('mp3')
  const [mp3Tracks, setMp3Tracks] = useState<Mp3VaultTrack[]>([])
  const [recordedTake, setRecordedTake] = useState<PlayalongRecordedTake | null>(null)
  const [isReviewPlaying, setIsReviewPlaying] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)

  const backingTrackModeRef = useRef(backingTrackMode)
  backingTrackModeRef.current = backingTrackMode
  const mixRatioRef = useRef(mixRatio)
  mixRatioRef.current = mixRatio

  const pauseBackingSync = useCallback(() => {
    const audio = backingAudioRef.current
    if (audio) {
      audio.pause()
    }
    pauseYoutubeProxy(youtubeIframeRef.current)
  }, [])

  const startBackingSync = useCallback(() => {
    if (backingTrackModeRef.current === 'mp3') {
      const audio = backingAudioRef.current
      if (!audio) return
      audio.currentTime = 0
      audio.volume = 1
      audio.play().catch((err: unknown) => console.warn('Playback intercepted:', err))
      return
    }

    if (backingTrackModeRef.current === 'youtube') {
      playYoutubeProxy(youtubeIframeRef.current)
    }
  }, [])

  const handleRecordingComplete = useCallback(
    (payload: RecordingCompletePayload) => {
      pauseBackingSync()
      setRecordedTake({
        takeId: payload.takeId,
        videoUrl: payload.videoUrl,
        filePath: payload.filePath,
        durationSeconds: payload.durationSeconds,
      })
      setPhase('review')
      setIsReviewPlaying(false)
    },
    [pauseBackingSync],
  )

  const {
    previewRef,
    error: cameraError,
    ready: cameraReady,
    isRecording,
    elapsed,
    changeRecordingMode,
    startRecording,
    stopRecording,
  } = useCameraSession({ onRecordingComplete: handleRecordingComplete })

  useEffect(() => {
    changeRecordingMode('video')
  }, [changeRecordingMode])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const all = listMp3VaultTracks()
      const available = await filterAvailableStarterTracks(all)
      if (!cancelled) {
        setMp3Tracks(available)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (backingTrackMode !== 'mp3' || !backingTrackSource) return
    const audio = backingAudioRef.current
    if (!audio) return
    prepareInlineMediaElement(audio)
    assignMediaPlaybackSrc(audio, backingTrackSource)
    audio.load()
  }, [backingTrackMode, backingTrackSource])

  useEffect(() => {
    if (phase !== 'review' || !recordedTake) return
    const video = recordedVideoRef.current
    if (!video) return
    prepareInlineMediaElement(video)
    assignMediaPlaybackSrc(video, recordedTake.videoUrl)
    video.load()
  }, [phase, recordedTake])

  useEffect(() => {
    if (phase !== 'review' || !isReviewPlaying || backingTrackMode !== 'mp3') return
    const video = recordedVideoRef.current
    const audio = backingAudioRef.current
    if (!video || !audio) return

    const syncAudio = () => {
      if (Math.abs(audio.currentTime - video.currentTime) > 0.3) {
        audio.currentTime = video.currentTime
      }
    }

    video.addEventListener('timeupdate', syncAudio)
    return () => video.removeEventListener('timeupdate', syncAudio)
  }, [backingTrackMode, isReviewPlaying, phase])

  const selectMp3Track = useCallback((track: Mp3VaultTrack) => {
    setTopTab('mp3')
    setBackingTrackMode('mp3')
    setBackingTrackSource(track.playbackUrl)
    setBackingTrackLabel(track.title)
  }, [])

  const selectYoutubeTrack = useCallback((embedUrl: string) => {
    setTopTab('youtube')
    setBackingTrackMode('youtube')
    setBackingTrackSource(embedUrl)
    setBackingTrackLabel('YouTube Backing')
  }, [])

  const clearBackingTrack = useCallback(() => {
    pauseBackingSync()
    setBackingTrackMode('none')
    setBackingTrackSource('')
    setBackingTrackLabel('')
  }, [pauseBackingSync])

  const importMp3File = useCallback(
    async (file: File) => {
      const track = await persistImportedMp3(file)
      setMp3Tracks((prev) => {
        if (prev.some((entry) => entry.id === track.id)) return prev
        return [...prev, track]
      })
      selectMp3Track(track)
    },
    [selectMp3Track],
  )

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
      stopRecording()
      pauseBackingSync()
      return
    }

    startBackingSync()
    startRecording()
  }, [isRecording, pauseBackingSync, startBackingSync, startRecording, stopRecording])

  const handleReviewPlayPause = useCallback(() => {
    const video = recordedVideoRef.current
    if (!video) return

    if (!video.paused) {
      video.pause()
      pauseBackingSync()
      setIsReviewPlaying(false)
      return
    }

    applyPlayalongMix(
      mixRatioRef.current,
      video,
      backingAudioRef.current,
      youtubeIframeRef.current,
      backingTrackModeRef.current,
    )

    if (backingTrackModeRef.current === 'mp3') {
      const audio = backingAudioRef.current
      if (audio) {
        audio.currentTime = video.currentTime
        audio.play().catch((err: unknown) => console.warn('Playback intercepted:', err))
      }
    } else if (backingTrackModeRef.current === 'youtube') {
      seekYoutubeProxy(youtubeIframeRef.current, video.currentTime)
      playYoutubeProxy(youtubeIframeRef.current)
    }

    video.play().catch((err: unknown) => {
      console.warn('Playback intercepted:', err)
      setIsReviewPlaying(false)
    })
    setIsReviewPlaying(true)
  }, [pauseBackingSync])

  const setMixRatio = useCallback(
    (ratio: number) => {
      const clamped = Math.min(100, Math.max(0, ratio))
      setMixRatioState(clamped)
      applyPlayalongMix(
        clamped,
        recordedVideoRef.current,
        backingAudioRef.current,
        youtubeIframeRef.current,
        backingTrackModeRef.current,
      )
    },
    [],
  )

  const handleReviewEnded = useCallback(() => {
    pauseBackingSync()
    setIsReviewPlaying(false)
  }, [pauseBackingSync])

  const handleRedo = useCallback(() => {
    recordedVideoRef.current?.pause()
    pauseBackingSync()
    setRecordedTake(null)
    setPhase('record')
    setIsReviewPlaying(false)
    setExportMessage(null)
  }, [pauseBackingSync])

  const handleExport = useCallback(async () => {
    if (backingTrackMode === 'youtube') return
    if (!recordedTake) return

    setExportMessage(null)
    const { shareTakeVideo, describeSaveTakeResult } = await import('../utils/shareTakeVideo')
    const result = await shareTakeVideo({
      id: recordedTake.takeId,
      name: 'Playalong Take',
      videoUrl: recordedTake.videoUrl,
      filePath: recordedTake.filePath,
      videoMimeType: 'video/mp4',
      thumbnailUrl: '',
      timestamp: Date.now(),
      rating: 0,
      notes: '',
      mediaType: 'video',
    })
    setExportMessage(describeSaveTakeResult(result))
  }, [backingTrackMode, recordedTake])

  return {
    phase,
    backingTrackMode,
    backingTrackSource,
    backingTrackLabel,
    mixRatio,
    topTab,
    mp3Tracks,
    recordedTake,
    isReviewPlaying,
    isRecording,
    elapsed,
    cameraReady,
    cameraError,
    exportMessage,
    previewRef,
    backingAudioRef,
    recordedVideoRef,
    youtubeIframeRef,
    setTopTab,
    setMixRatio,
    selectMp3Track,
    selectYoutubeTrack,
    clearBackingTrack,
    importMp3File,
    handleRecordToggle,
    handleReviewPlayPause,
    handleReviewEnded,
    handleRedo,
    handleExport,
  }
}

/** Shared video attrs for playalong camera / review elements. */
export const playalongVideoProps = iosBulletproofVideoProps
