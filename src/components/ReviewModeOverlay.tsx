import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  ChevronLeft,
  Download,
  Ellipsis,
  Heart,
  Info,
  Pencil,
  Share2,
  Trash2,
} from 'lucide-react'
import ReviewTimeline from './ReviewTimeline'
import ReviewSectionMarkers from './ReviewSectionMarkers'
import TakeVideoPlayer from './TakeVideoPlayer'
import DraggablePitchWidget from './DraggablePitchWidget'
import Pressable from './ui/Pressable'
import { iosEaseOut, iosScreenEnter, iosScreenExit, motionGpuLayer } from '../utils/motionPresets'
import { resetVideoPlayback, pauseVideoElement } from '../utils/videoPlayback'
import { getPlayableDuration } from '../utils/videoDuration'
import { isAudioMedia } from '../utils/mediaType'
import type { MediaType, ReviewContext, ReviewSlot, Take, TakeUpdate } from '../types'
import type { TunerInstrument } from '../utils/pitchConfig'
import { pausePitchGraphsForMedia, PITCH_GRAPH_RELEASED_EVENT } from '../hooks/useLivePitchTracker'
import { finalizeInlineTakeBoxPlaybackCleanup } from '../utils/takePlaybackAudio'
import { toggleInlineTakePlayback } from '../utils/takeInlinePlayback'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { loadTakeMarkers } from '../practiceTimeline/recording/timelineMarkers'
import { describeSaveTakeResult, shareTakeToSystem, shareTakeVideo } from '../utils/shareTakeVideo'
import { triggerBestTakeHaptic, triggerLightHaptic, triggerWarningHaptic } from '../utils/haptics'
import { useActionSheet } from '../context/ActionSheetContext'
import {
  useAudioModePlayback,
  type AudioModePlaybackItem,
} from '../context/AudioModePlaybackContext'

const SWIPE_THRESHOLD = 60
const OVERLAY_HIDE_MS = 2800

function formatReviewDate(timestamp?: number): string {
  if (!timestamp) return 'SessionMirror'
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp))
}

function formatReviewTime(timestamp?: number): string {
  if (!timestamp) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

interface ReviewTakeLayerProps {
  takeKey: string
  filePath: string
  videoUrl: string
  mimeType: string
  mediaType?: MediaType
  mirror: boolean
  recordingOrientation?: Take['recordingOrientation']
  videoRef: RefObject<HTMLMediaElement | null>
  playbackAudible: boolean
  swipeLayerStyle?: React.CSSProperties
  onPointerDown?: React.PointerEventHandler<HTMLVideoElement>
  onPointerMove?: React.PointerEventHandler<HTMLVideoElement>
  onPointerUp?: React.PointerEventHandler<HTMLVideoElement>
  onPointerCancel?: React.PointerEventHandler<HTMLVideoElement>
  useSharedAudioPlayer?: boolean
}

function ReviewTakeLayer({
  takeKey,
  filePath,
  videoUrl,
  mimeType,
  mediaType,
  mirror,
  recordingOrientation,
  videoRef,
  playbackAudible,
  swipeLayerStyle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  useSharedAudioPlayer = false,
}: ReviewTakeLayerProps) {
  const [mediaRepairKey, setMediaRepairKey] = useState(0)
  const playerKey = `${takeKey}-r${mediaRepairKey}`
  const isAudio = isAudioMedia(mimeType, mediaType)

  useEffect(() => {
    const media = videoRef.current
    if (!media) return

    const onReleased = () => {
      setMediaRepairKey((key) => key + 1)
    }

    media.addEventListener(PITCH_GRAPH_RELEASED_EVENT, onReleased)
    return () => {
      media.removeEventListener(PITCH_GRAPH_RELEASED_EVENT, onReleased)
    }
  }, [playerKey, videoRef])

  if (isAudio) {
    return (
      <div
        className="absolute inset-0 h-full w-full transition-all duration-200 ease-out review-video-bleed--audio"
        style={swipeLayerStyle}
        onPointerDown={onPointerDown as React.PointerEventHandler<HTMLDivElement> | undefined}
        onPointerMove={onPointerMove as React.PointerEventHandler<HTMLDivElement> | undefined}
        onPointerUp={onPointerUp as React.PointerEventHandler<HTMLDivElement> | undefined}
        onPointerCancel={onPointerCancel as React.PointerEventHandler<HTMLDivElement> | undefined}
      >
        {!useSharedAudioPlayer && (
          <TakeVideoPlayer
            key={playerKey}
            filePath={filePath}
            videoUrl={videoUrl}
            mimeType={mimeType}
            videoRef={videoRef}
            videoSourceKey={takeKey}
            className="absolute inset-0 h-full w-full"
            mirror={false}
            audible={playbackAudible}
            manualPlayOnly
          />
        )}
        {useSharedAudioPlayer && (
          <div className="review-video-bleed__shared-audio take-audio-surface absolute inset-0 h-full w-full" />
        )}
      </div>
    )
  }

  return (
    <div
      className="review-video-bleed absolute inset-0 h-full w-full transition-all duration-200 ease-out"
      style={swipeLayerStyle}
    >
      <TakeVideoPlayer
        key={playerKey}
        filePath={filePath}
        videoUrl={videoUrl}
        mimeType={mimeType}
        videoRef={videoRef}
        className="review-video-bleed__player"
        mirror={mirror}
        recordingOrientation={recordingOrientation}
        fit="contain"
        audible={playbackAudible}
        manualPlayOnly
        style={{
          WebkitTouchCallout: 'default',
          userSelect: 'auto',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  )
}

interface ReviewModeOverlayProps {
  context: ReviewContext
  activeSlot: ReviewSlot
  vaultTakes: Take[]
  vaultIndex: number
  onVaultIndexChange: (index: number) => void
  benchmarkSrc: string | null
  challengerSrc: string | null
  benchmarkTake?: Take | null
  challengerTake?: Take | null
  benchmarkFilePath?: string
  challengerFilePath?: string
  benchmarkName?: string
  challengerName?: string
  benchmarkMimeType?: string
  challengerMimeType?: string
  benchmarkMediaType?: MediaType
  challengerMediaType?: MediaType
  benchmarkMirror?: boolean
  challengerMirror?: boolean
  benchmarkRecordingOrientation?: Take['recordingOrientation']
  challengerRecordingOrientation?: Take['recordingOrientation']
  liveMicTunerEnabled?: boolean
  tunerInstrument?: TunerInstrument
  micStreamRef?: RefObject<MediaStream | null>
  isOpen: boolean
  onClose: () => void
  onSlotChange: (slot: ReviewSlot) => void
  onUpdateTake?: (id: string, updates: TakeUpdate) => void
  onDeleteTake?: (id: string) => void
  onFavoriteTake?: (id: string) => void
  onPlaybackActiveChange?: (playing: boolean) => void
}

export default function ReviewModeOverlay({
  context,
  activeSlot,
  vaultTakes,
  vaultIndex,
  onVaultIndexChange,
  benchmarkSrc,
  challengerSrc,
  benchmarkTake = null,
  challengerTake = null,
  benchmarkFilePath = '',
  challengerFilePath = '',
  benchmarkName,
  challengerName,
  benchmarkMimeType = 'video/mp4',
  challengerMimeType = 'video/mp4',
  benchmarkMediaType,
  challengerMediaType,
  benchmarkMirror = true,
  challengerMirror = true,
  benchmarkRecordingOrientation,
  challengerRecordingOrientation,
  liveMicTunerEnabled = true,
  tunerInstrument = 'voice',
  micStreamRef,
  isOpen,
  onClose,
  onSlotChange,
  onUpdateTake,
  onDeleteTake,
  onFavoriteTake,
  onPlaybackActiveChange,
}: ReviewModeOverlayProps) {
  const { showAlert, showConfirm } = useActionSheet()
  const audioPlayback = useAudioModePlayback()
  const benchmarkVideoRef = useRef<HTMLMediaElement>(null)
  const challengerVideoRef = useRef<HTMLMediaElement>(null)
  const vaultVideoRef = useRef<HTMLMediaElement>(null)
  const reviewBoundsRef = useRef<HTMLDivElement>(null)
  const timelineTrackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const progressLoopRef = useRef<number | null>(null)
  const pendingTimeRef = useRef(0)
  const lastTimeEmitRef = useRef(0)
  const hideOverlayTimerRef = useRef<number | null>(null)
  const isScrubbingRef = useRef(false)
  const wasPlayingBeforeScrubRef = useRef(false)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPlayOverlay, setShowPlayOverlay] = useState(true)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const [showPitch, setShowPitch] = useState(false)
  const [actionMenuOpen, setActionMenuOpen] = useState(false)

  const pointerStart = useRef({ x: 0, y: 0 })
  const isTrackingPointer = useRef(false)
  const swipeCommitted = useRef(false)
  const reviewAutoplayEnabledRef = useRef(false)

  const isVault = context === 'vault'
  const vaultTake = isVault ? vaultTakes[vaultIndex] ?? null : null

  const activeName = isVault
    ? vaultTake?.name
    : activeSlot === 'benchmark'
      ? benchmarkName
      : challengerName
  const activeTake = isVault
    ? vaultTake
    : activeSlot === 'benchmark'
      ? benchmarkTake
      : challengerTake
  const activeTimestamp = activeTake?.timestamp
  const activeDate = formatReviewDate(activeTimestamp)
  const activeTime = formatReviewTime(activeTimestamp)
  const activeLabel = isVault
    ? 'Take Vault'
    : activeSlot === 'benchmark'
      ? 'Best Take'
      : challengerName ?? 'Current Take'

  const dynamicTakeLabel = challengerName ?? 'Current Take'

  const canSwipeLeft = isVault
    ? vaultIndex < vaultTakes.length - 1
    : activeSlot === 'benchmark' && challengerSrc !== null
  const canSwipeRight = isVault
    ? vaultIndex > 0
    : activeSlot === 'challenger' && benchmarkSrc !== null

  const activePitchMediaRef = isVault
    ? vaultVideoRef
    : activeSlot === 'benchmark'
      ? benchmarkVideoRef
      : challengerVideoRef

  const activePitchMediaKey = isVault
    ? `vault-${vaultTake?.id ?? vaultIndex}`
    : activeSlot === 'benchmark'
      ? `benchmark-${benchmarkFilePath}-${benchmarkSrc}`
      : `challenger-${challengerFilePath}-${challengerSrc}`

  const activeIsAudio = isVault
    ? Boolean(
        vaultTake &&
          isAudioMedia(
            vaultTake.videoMimeType ??
              (vaultTake.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME),
            vaultTake.mediaType,
          ),
      )
    : activeSlot === 'benchmark'
      ? isAudioMedia(benchmarkMimeType, benchmarkMediaType)
      : isAudioMedia(challengerMimeType, challengerMediaType)

  const activeTimelineFilePath = isVault
    ? vaultTake?.filePath ?? ''
    : activeSlot === 'benchmark'
      ? benchmarkFilePath
      : challengerFilePath

  const activeTimelineUrl = isVault
    ? vaultTake?.videoUrl ?? ''
    : activeSlot === 'benchmark'
      ? benchmarkSrc ?? ''
      : challengerSrc ?? ''

  const activeAudioPlaybackItem = useMemo<AudioModePlaybackItem | null>(() => {
    if (!activeIsAudio || (!activeTimelineFilePath && !activeTimelineUrl)) return null
    const mimeType = isVault
      ? vaultTake?.videoMimeType ??
        (vaultTake?.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
      : activeSlot === 'benchmark'
        ? benchmarkMimeType
        : challengerMimeType

    return {
      id: activeTake?.id ? `take:${activeTake.id}` : `review:${activeTimelineFilePath}:${activeTimelineUrl}`,
      takeId: activeTake?.id,
      name: activeName ?? activeLabel,
      filePath: activeTimelineFilePath,
      mediaUrl: activeTimelineUrl,
      mimeType,
    }
  }, [
    activeIsAudio,
    activeLabel,
    activeName,
    activeSlot,
    activeTake?.id,
    activeTimelineFilePath,
    activeTimelineUrl,
    benchmarkMimeType,
    challengerMimeType,
    isVault,
    vaultTake?.mediaType,
    vaultTake?.videoMimeType,
  ])

  const audioControllerActive = activeAudioPlaybackItem
    ? audioPlayback.matchesCurrentSource(activeAudioPlaybackItem)
    : false
  const displayCurrentTime = activeAudioPlaybackItem && audioControllerActive
    ? audioPlayback.state.currentTime
    : currentTime
  const displayDuration = activeAudioPlaybackItem && audioControllerActive
    ? audioPlayback.state.duration
    : duration
  const displayIsPlaying = activeAudioPlaybackItem && audioControllerActive
    ? audioPlayback.state.isPlaying
    : isPlaying

  useEffect(() => {
    if (!isOpen) {
      onPlaybackActiveChange?.(false)
      return
    }
    onPlaybackActiveChange?.(displayIsPlaying)
  }, [displayIsPlaying, isOpen, onPlaybackActiveChange])

  useEffect(() => {
    return () => onPlaybackActiveChange?.(false)
  }, [onPlaybackActiveChange])

  const practiceMarkers = useMemo(
    () => (activeTake?.id ? loadTakeMarkers(activeTake.id) : []),
    [activeTake?.id],
  )

  const pauseAllReviewVideos = useCallback(() => {
    resetVideoPlayback(benchmarkVideoRef.current)
    resetVideoPlayback(challengerVideoRef.current)
    resetVideoPlayback(vaultVideoRef.current)
  }, [])

  const pauseAllReviewVideosSafe = useCallback(() => {
    pauseVideoElement(benchmarkVideoRef.current)
    pauseVideoElement(challengerVideoRef.current)
    pauseVideoElement(vaultVideoRef.current)
  }, [])

  const getActiveVideo = useCallback((): HTMLMediaElement | null => {
    if (activeAudioPlaybackItem) return audioPlayback.playerRef.current
    if (isVault) return vaultVideoRef.current
    return activeSlot === 'benchmark'
      ? benchmarkVideoRef.current
      : challengerVideoRef.current
  }, [activeAudioPlaybackItem, activeSlot, audioPlayback.playerRef, isVault])

  const scheduleHideOverlay = useCallback(() => {
    if (hideOverlayTimerRef.current !== null) {
      window.clearTimeout(hideOverlayTimerRef.current)
    }
    hideOverlayTimerRef.current = window.setTimeout(() => {
      setShowPlayOverlay(false)
      hideOverlayTimerRef.current = null
    }, OVERLAY_HIDE_MS)
  }, [])

  const revealPlayOverlay = useCallback(
    (autoHide: boolean) => {
      setShowPlayOverlay(true)
      if (autoHide) {
        scheduleHideOverlay()
      } else if (hideOverlayTimerRef.current !== null) {
        window.clearTimeout(hideOverlayTimerRef.current)
        hideOverlayTimerRef.current = null
      }
    },
    [scheduleHideOverlay],
  )

  const scheduleTimeUpdate = useCallback((time: number) => {
    pendingTimeRef.current = time
    if (rafRef.current !== null) return

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const now = performance.now()
      if (now - lastTimeEmitRef.current < 80) return
      lastTimeEmitRef.current = now
      setCurrentTime(pendingTimeRef.current)
    })
  }, [])

  const seekToPracticeMarker = useCallback(
    (timeSeconds: number) => {
      if (activeAudioPlaybackItem) {
        audioPlayback.seek(timeSeconds)
        return
      }
      const video = getActiveVideo()
      if (!video) return
      video.currentTime = timeSeconds
      scheduleTimeUpdate(timeSeconds)
    },
    [activeAudioPlaybackItem, audioPlayback, getActiveVideo, scheduleTimeUpdate],
  )

  const syncDurationFromVideo = useCallback((media: HTMLMediaElement) => {
    const playable = getPlayableDuration(media)
    if (playable > 0) {
      setDuration(playable)
    }
  }, [])

  const stopProgressLoop = useCallback(() => {
    if (progressLoopRef.current !== null) {
      cancelAnimationFrame(progressLoopRef.current)
      progressLoopRef.current = null
    }
  }, [])

  const startProgressLoop = useCallback(() => {
    stopProgressLoop()

    const tick = () => {
      const video = getActiveVideo()
      if (!video || video.paused || isScrubbingRef.current) {
        progressLoopRef.current = null
        return
      }

      scheduleTimeUpdate(video.currentTime)
      syncDurationFromVideo(video)
      progressLoopRef.current = requestAnimationFrame(tick)
    }

    progressLoopRef.current = requestAnimationFrame(tick)
  }, [getActiveVideo, scheduleTimeUpdate, stopProgressLoop, syncDurationFromVideo])

  const scrubToClientX = useCallback(
    (clientX: number) => {
      if (activeAudioPlaybackItem) {
        const track = timelineTrackRef.current
        if (!track) return
        const playableDuration = audioPlayback.state.duration
        if (playableDuration <= 0) return
        const rect = track.getBoundingClientRect()
        if (rect.width <= 0) return
        const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
        audioPlayback.seek(percent * playableDuration)
        return
      }

      const video = getActiveVideo()
      const track = timelineTrackRef.current
      if (!video || !track) return

      const playableDuration = getPlayableDuration(video) || duration
      if (playableDuration <= 0) return

      const rect = track.getBoundingClientRect()
      if (rect.width <= 0) return

      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const time = percent * playableDuration
      video.currentTime = time
      scheduleTimeUpdate(time)
    },
    [activeAudioPlaybackItem, audioPlayback, duration, getActiveVideo, scheduleTimeUpdate],
  )

  const handleCloseClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      event.preventDefault()
      reviewAutoplayEnabledRef.current = false
      stopProgressLoop()
      if (activeAudioPlaybackItem) {
        audioPlayback.pause()
        audioPlayback.closeFullscreen()
        onClose()
        return
      }
      pausePitchGraphsForMedia(
        benchmarkVideoRef.current,
        challengerVideoRef.current,
        vaultVideoRef.current,
      )
      void finalizeInlineTakeBoxPlaybackCleanup()
      pauseAllReviewVideosSafe()
      onClose()
    },
    [activeAudioPlaybackItem, audioPlayback, onClose, pauseAllReviewVideosSafe, stopProgressLoop],
  )

  const togglePlayPause = useCallback(() => {
    if (activeAudioPlaybackItem) {
      audioPlayback.toggle(activeAudioPlaybackItem)
      revealPlayOverlay(true)
      return
    }

    const video = getActiveVideo()
    if (!video) return

    if (video.paused || video.ended) {
      revealPlayOverlay(true)
      const started = toggleInlineTakePlayback(video, {
        onPlaying: () => {
          setIsPlaying(true)
          revealPlayOverlay(true)
        },
        onFailure: () => {
          setIsPlaying(false)
          revealPlayOverlay(true)
        },
      })
      if (!started) {
        setIsPlaying(false)
        revealPlayOverlay(true)
      }
    } else {
      toggleInlineTakePlayback(video, {
        onPaused: () => {
          setIsPlaying(false)
          revealPlayOverlay(false)
        },
      })
    }
  }, [activeAudioPlaybackItem, audioPlayback, getActiveVideo, revealPlayOverlay])

  const handleToggleChrome = useCallback(() => {
    setActionMenuOpen(false)
    if (hideOverlayTimerRef.current !== null) {
      window.clearTimeout(hideOverlayTimerRef.current)
      hideOverlayTimerRef.current = null
    }
    setShowPlayOverlay((visible) => {
      return !visible
    })
  }, [])

  const handleRenameActiveTake = useCallback(() => {
    if (!activeTake || !onUpdateTake) return
    setActionMenuOpen(false)
    triggerLightHaptic()
    const nextName = window.prompt('Rename recording', activeTake.name)
    const trimmed = nextName?.trim()
    if (!trimmed || trimmed === activeTake.name) return
    onUpdateTake(activeTake.id, { name: trimmed })
  }, [activeTake, onUpdateTake])

  const handleShareActiveTake = useCallback(() => {
    if (!activeTake) return
    setActionMenuOpen(false)
    triggerLightHaptic()
    void shareTakeToSystem(activeTake).then((result) => {
      if (result.ok) return
      void showAlert({
        title: 'Unable to Share',
        message:
          result.reason === 'missing_file'
            ? 'This take could not be found on your device.'
            : 'The system share sheet could not be opened.',
        tone: 'error',
      })
    })
  }, [activeTake, showAlert])

  const handleSaveActiveTake = useCallback(() => {
    if (!activeTake) return
    setActionMenuOpen(false)
    triggerLightHaptic()
    void shareTakeVideo(activeTake).then((result) => {
      const message = describeSaveTakeResult(result)
      if (!message) return
      void showAlert({
        message,
        tone: result.ok ? 'success' : 'error',
      })
    })
  }, [activeTake, showAlert])

  const handleFavoriteActiveTake = useCallback(() => {
    if (!activeTake || !onFavoriteTake) return
    setActionMenuOpen(false)
    triggerBestTakeHaptic()
    onFavoriteTake(activeTake.id)
  }, [activeTake, onFavoriteTake])

  const handleInfoActiveTake = useCallback(() => {
    if (!activeTake) return
    setActionMenuOpen(false)
    triggerLightHaptic()
    void showAlert({
      title: activeTake.name,
      message: [
        formatReviewDate(activeTake.timestamp),
        formatReviewTime(activeTake.timestamp),
        activeTake.mediaType === 'audio' ? 'Audio take' : 'Video take',
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }, [activeTake, showAlert])

  const handleDeleteActiveTake = useCallback(() => {
    if (!activeTake || !onDeleteTake) return
    setActionMenuOpen(false)
    void (async () => {
      const confirmed = await showConfirm({
        title: 'Delete Recording?',
        message: `"${activeTake.name}" will be removed from this project.`,
        destructive: true,
        confirmLabel: 'Delete',
      })
      if (!confirmed) return
      triggerWarningHaptic()
      onDeleteTake(activeTake.id)
      onClose()
    })()
  }, [activeTake, onClose, onDeleteTake, showConfirm])

  const handleDuplicateActiveTake = useCallback(() => {
    setActionMenuOpen(false)
    void showAlert({
      title: 'Duplicate',
      message: 'Duplicate will be added in a dedicated take-management pass.',
    })
  }, [showAlert])

  const hasBenchmark = Boolean(benchmarkSrc || benchmarkFilePath)
  const hasChallenger = Boolean(challengerSrc || challengerFilePath)
  const hasMedia = isVault ? vaultTakes.length > 0 : hasBenchmark || hasChallenger

  const showPitchPanel =
    isOpen &&
    (isVault
      ? Boolean(vaultTake)
      : activeSlot === 'benchmark'
        ? hasBenchmark
        : hasChallenger)

  useEffect(() => {
    if (!isOpen) {
      setShowPitch(false)
      setActionMenuOpen(false)
    }
  }, [isOpen])

  useEffect(() => {
    setActionMenuOpen(false)
  }, [activeSlot, vaultTake?.id, vaultIndex])

  useEffect(() => {
    reviewAutoplayEnabledRef.current = isOpen

    if (!isOpen) {
      if (activeAudioPlaybackItem) {
        audioPlayback.closeFullscreen()
        return
      }
      pauseAllReviewVideos()
      return
    }

    return () => {
      reviewAutoplayEnabledRef.current = false
      if (activeAudioPlaybackItem) {
        audioPlayback.closeFullscreen()
        return
      }
      pauseAllReviewVideosSafe()
    }
  }, [activeAudioPlaybackItem, audioPlayback, isOpen, pauseAllReviewVideos, pauseAllReviewVideosSafe])

  useEffect(() => {
    if (!isOpen || !reviewAutoplayEnabledRef.current) return

    if (activeAudioPlaybackItem) {
      audioPlayback.openFullscreen(activeAudioPlaybackItem)
      setShowPlayOverlay(true)
      return
    }

    if (!isVault) {
      if (activeSlot === 'benchmark') {
        pauseVideoElement(challengerVideoRef.current)
      } else {
        pauseVideoElement(benchmarkVideoRef.current)
      }
    }

    const video = getActiveVideo()
    if (!video) return

    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setShowPlayOverlay(true)
    video.pause()
    video.currentTime = 0
  }, [
    activeSlot,
    getActiveVideo,
    isOpen,
    isVault,
    vaultTake?.id,
    vaultIndex,
    activeAudioPlaybackItem,
    audioPlayback,
  ])

  useEffect(() => {
    const video = getActiveVideo()
    if (!video) return

    const onDurationChange = () => syncDurationFromVideo(video)
    const onLoadedMetadata = () => syncDurationFromVideo(video)
    const onSeeked = () => {
      if (isScrubbingRef.current) {
        scheduleTimeUpdate(video.currentTime)
      }
    }
    const onPlay = () => {
      setIsPlaying(true)
      revealPlayOverlay(true)
      startProgressLoop()
    }
    const onPlaying = () => {
      setIsPlaying(true)
    }
    const onPause = () => {
      setIsPlaying(false)
      revealPlayOverlay(false)
      stopProgressLoop()
      if (!activeAudioPlaybackItem) {
        void finalizeInlineTakeBoxPlaybackCleanup()
      }
    }
    const onEnded = () => {
      setIsPlaying(false)
      revealPlayOverlay(false)
      stopProgressLoop()
      if (!activeAudioPlaybackItem) {
        void finalizeInlineTakeBoxPlaybackCleanup()
      }
    }

    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('play', onPlay)
    video.addEventListener('playing', onPlaying)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    syncDurationFromVideo(video)

    return () => {
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      stopProgressLoop()
    }
  }, [
    activeSlot,
    getActiveVideo,
    isVault,
    revealPlayOverlay,
    scheduleTimeUpdate,
    startProgressLoop,
    stopProgressLoop,
    syncDurationFromVideo,
    vaultTake?.id,
    vaultIndex,
    activeAudioPlaybackItem,
  ])

  const handleScrubStart = useCallback(() => {
    if (activeAudioPlaybackItem) {
      wasPlayingBeforeScrubRef.current = audioPlayback.state.isPlaying
      audioPlayback.pause()
      isScrubbingRef.current = true
      setIsScrubbing(true)
      revealPlayOverlay(false)
      return
    }

    const video = getActiveVideo()
    if (video) {
      wasPlayingBeforeScrubRef.current = !video.paused
      video.pause()
      stopProgressLoop()
    }
    isScrubbingRef.current = true
    setIsScrubbing(true)
    revealPlayOverlay(false)
  }, [activeAudioPlaybackItem, audioPlayback, getActiveVideo, revealPlayOverlay, stopProgressLoop])

  const handleScrubEnd = useCallback(() => {
    isScrubbingRef.current = false
    setIsScrubbing(false)

    if (activeAudioPlaybackItem) {
      if (wasPlayingBeforeScrubRef.current) {
        audioPlayback.play(activeAudioPlaybackItem)
      }
      wasPlayingBeforeScrubRef.current = false
      revealPlayOverlay(false)
      return
    }

    const video = getActiveVideo()
    if (video) {
      scheduleTimeUpdate(video.currentTime)
      syncDurationFromVideo(video)

      if (wasPlayingBeforeScrubRef.current) {
        setIsPlaying(true)
        toggleInlineTakePlayback(video, {
          onPlaying: () => setIsPlaying(true),
          onFailure: () => {
            setIsPlaying(false)
            revealPlayOverlay(false)
          },
        })
      }
    }

    wasPlayingBeforeScrubRef.current = false
    revealPlayOverlay(false)
  }, [
    getActiveVideo,
    revealPlayOverlay,
    scheduleTimeUpdate,
    syncDurationFromVideo,
    activeAudioPlaybackItem,
    audioPlayback,
  ])

  const completeSwipe = useCallback(
    (direction: 'left' | 'right') => {
      resetVideoPlayback(getActiveVideo())
      setSlideDirection(direction)
      setSwipeOffset(0)
      isTrackingPointer.current = false
      swipeCommitted.current = false

      window.setTimeout(() => {
        if (isVault) {
          if (direction === 'left') {
            onVaultIndexChange(Math.min(vaultIndex + 1, vaultTakes.length - 1))
          } else {
            onVaultIndexChange(Math.max(vaultIndex - 1, 0))
          }
        } else {
          const nextSlot: ReviewSlot =
            direction === 'left' ? 'challenger' : 'benchmark'
          onSlotChange(nextSlot)
        }
        setSlideDirection(null)
        setCurrentTime(0)
      }, 220)
    },
    [getActiveVideo, isVault, onSlotChange, onVaultIndexChange, vaultIndex, vaultTakes.length],
  )

  const swipeLayerStyle = {
    transform:
      slideDirection === 'left'
        ? 'translateX(-100%)'
        : slideDirection === 'right'
          ? 'translateX(100%)'
          : `translateX(${swipeOffset}px)`,
    opacity: slideDirection ? 0 : 1,
  }

  const handleVideoPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('[data-play-overlay]')) return

    pointerStart.current = { x: e.clientX, y: e.clientY }
    isTrackingPointer.current = true
    swipeCommitted.current = false
  }

  const handleVideoPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!isTrackingPointer.current) return

    const deltaX = e.clientX - pointerStart.current.x
    const deltaY = e.clientY - pointerStart.current.y

    if (!swipeCommitted.current) {
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        isTrackingPointer.current = false
        return
      }
      swipeCommitted.current = true
    }

    e.preventDefault()

    let offset = deltaX
    if (deltaX < 0 && !canSwipeLeft) {
      offset = deltaX * 0.25
    }
    if (deltaX > 0 && !canSwipeRight) {
      offset = deltaX * 0.25
    }

    setSwipeOffset(offset)
  }

  const handleVideoPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!isTrackingPointer.current) return
    isTrackingPointer.current = false

    if (!swipeCommitted.current) {
      e.preventDefault()
      handleToggleChrome()
      return
    }

    swipeCommitted.current = false
    const deltaX = e.clientX - pointerStart.current.x

    if (deltaX < -SWIPE_THRESHOLD && canSwipeLeft) {
      completeSwipe('left')
      return
    }
    if (deltaX > SWIPE_THRESHOLD && canSwipeRight) {
      completeSwipe('right')
      return
    }

    setSwipeOffset(0)
  }

  const handleVideoPointerCancel = () => {
    isTrackingPointer.current = false
    swipeCommitted.current = false
    setSwipeOffset(0)
  }

  if (!hasMedia) {
    return null
  }

  return (
    <motion.div
      className={`review-overlay review-overlay--immersive ${activeIsAudio ? 'review-overlay--audio' : 'review-overlay--camera'} fixed inset-0 z-[60] flex h-full w-full flex-col overflow-hidden transform-gpu`}
      variants={{
        initial: { opacity: 0, scale: 0.96, y: 10 },
        animate: {
          opacity: 1,
          scale: 1,
          y: 0,
          transition: iosScreenEnter,
        },
        exit: {
          opacity: 0,
          scale: 0.98,
          y: 6,
          transition: iosScreenExit,
        },
      }}
      initial="initial"
      animate="animate"
      exit="exit"
      style={{
        ...motionGpuLayer,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      aria-hidden={!isOpen}
    >
      <div ref={reviewBoundsRef} className="relative h-full w-full">
      <AnimatePresence>
        {showPlayOverlay && (
          <motion.div
            className="review-overlay-header pointer-events-none absolute inset-x-0 top-0 z-30 px-3"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={iosEaseOut}
          >
            <div className="ui-orient-spin review-native-nav pointer-events-auto grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2">
              <Pressable
                type="button"
                intensity="icon"
                haptic="light"
                onClick={handleCloseClick}
                className="review-nav-button"
                aria-label="Back"
              >
                <ChevronLeft className="h-7 w-7" strokeWidth={2.4} />
              </Pressable>

              <div className="min-w-0 text-center">
                <p className="truncate text-[17px] font-semibold leading-tight text-[#171a22]">
                  {activeName || activeLabel}
                </p>
                <p className="mt-0.5 truncate text-[12px] font-medium leading-tight text-[#6c7077]">
                  {activeTime ? `${activeDate} · ${activeTime}` : activeDate}
                </p>
              </div>

              <div className="relative flex justify-end">
                <Pressable
                  type="button"
                  intensity="icon"
                  haptic="light"
                  onClick={(event) => {
                    event.stopPropagation()
                    setActionMenuOpen((open) => !open)
                  }}
                  className="review-nav-button"
                  aria-label="More actions"
                  aria-expanded={actionMenuOpen}
                >
                  <Ellipsis className="h-6 w-6" strokeWidth={2.4} />
                </Pressable>

                <AnimatePresence>
                  {actionMenuOpen && (
                    <motion.div
                      className="review-action-menu absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-[rgba(23,26,34,0.08)] bg-white py-1.5 text-[#171a22] shadow-[0_14px_36px_rgba(23,26,34,0.12)]"
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={iosEaseOut}
                    >
                      <button type="button" className="review-menu-item" onClick={handleRenameActiveTake} disabled={!activeTake || !onUpdateTake}>
                        <Pencil className="h-4 w-4" />
                        Rename
                      </button>
                      <button type="button" className="review-menu-item" onClick={handleSaveActiveTake} disabled={!activeTake || activeTake.mediaType === 'audio'}>
                        <Download className="h-4 w-4" />
                        Save to Photos
                      </button>
                      <button type="button" className="review-menu-item" onClick={handleShareActiveTake} disabled={!activeTake}>
                        <Share2 className="h-4 w-4" />
                        Share
                      </button>
                      <button type="button" className="review-menu-item" onClick={handleDuplicateActiveTake} disabled={!activeTake}>
                        <span className="flex h-4 w-4 items-center justify-center text-sm">+</span>
                        Duplicate
                      </button>
                      <button type="button" className="review-menu-item review-menu-item--destructive" onClick={handleDeleteActiveTake} disabled={!activeTake || !onDeleteTake}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            {isOpen && !isVault && (canSwipeLeft || canSwipeRight) && (
              <div className="review-swipe-hint pointer-events-none flex justify-center">
                <p className="rounded-full border border-[rgba(23,26,34,0.08)] bg-white/90 px-3 py-1 text-[10px] text-[#6c7077] shadow-sm backdrop-blur-sm">
                  {canSwipeLeft && canSwipeRight
                    ? 'Swipe to compare takes'
                    : canSwipeLeft
                      ? `Swipe left for ${dynamicTakeLabel}`
                      : 'Swipe right for Best Take'}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="review-video-stage relative min-h-0 flex-1 overflow-hidden">
        {isOpen && isVault && vaultTake ? (
          <ReviewTakeLayer
            takeKey={`vault-${vaultTake.id}`}
            filePath={vaultTake.filePath}
            videoUrl={vaultTake.videoUrl}
            mimeType={
              vaultTake.videoMimeType ??
              (vaultTake.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
            }
            mediaType={vaultTake.mediaType}
            mirror={vaultTake.mirrorPlayback !== false}
            recordingOrientation={vaultTake.recordingOrientation}
            videoRef={vaultVideoRef}
            playbackAudible={isPlaying}
            useSharedAudioPlayer={Boolean(activeAudioPlaybackItem)}
            swipeLayerStyle={swipeLayerStyle}
            onPointerDown={handleVideoPointerDown}
            onPointerMove={handleVideoPointerMove}
            onPointerUp={handleVideoPointerUp}
            onPointerCancel={handleVideoPointerCancel}
          />
        ) : isOpen ? (
          <>
            {hasBenchmark && activeSlot === 'benchmark' && (
              <div
                className={`absolute inset-0 h-full w-full transition-all duration-200 ease-out ${
                  activeSlot === 'benchmark'
                    ? 'z-[1] opacity-100'
                    : 'pointer-events-none z-0 opacity-0'
                }`}
              >
                <ReviewTakeLayer
                  takeKey={`benchmark-${benchmarkFilePath}-${benchmarkSrc}`}
                  filePath={benchmarkFilePath}
                  videoUrl={benchmarkSrc ?? ''}
                  mimeType={benchmarkMimeType}
                  mediaType={benchmarkMediaType}
                  mirror={benchmarkMirror}
                  recordingOrientation={benchmarkRecordingOrientation}
                  videoRef={benchmarkVideoRef}
                  playbackAudible={isPlaying && activeSlot === 'benchmark'}
                  useSharedAudioPlayer={Boolean(activeAudioPlaybackItem)}
                  swipeLayerStyle={
                    activeSlot === 'benchmark' ? swipeLayerStyle : undefined
                  }
                  onPointerDown={
                    activeSlot === 'benchmark' ? handleVideoPointerDown : undefined
                  }
                  onPointerMove={
                    activeSlot === 'benchmark' ? handleVideoPointerMove : undefined
                  }
                  onPointerUp={
                    activeSlot === 'benchmark' ? handleVideoPointerUp : undefined
                  }
                  onPointerCancel={
                    activeSlot === 'benchmark' ? handleVideoPointerCancel : undefined
                  }
                />
              </div>
            )}

            {hasChallenger && activeSlot === 'challenger' && (
              <div
                className={`absolute inset-0 h-full w-full transition-all duration-200 ease-out ${
                  activeSlot === 'challenger'
                    ? 'z-[1] opacity-100'
                    : 'pointer-events-none z-0 opacity-0'
                }`}
              >
                <ReviewTakeLayer
                  takeKey={`challenger-${challengerFilePath}-${challengerSrc}`}
                  filePath={challengerFilePath}
                  videoUrl={challengerSrc ?? ''}
                  mimeType={challengerMimeType}
                  mediaType={challengerMediaType}
                  mirror={challengerMirror}
                  recordingOrientation={challengerRecordingOrientation}
                  videoRef={challengerVideoRef}
                  playbackAudible={isPlaying && activeSlot === 'challenger'}
                  useSharedAudioPlayer={Boolean(activeAudioPlaybackItem)}
                  swipeLayerStyle={
                    activeSlot === 'challenger' ? swipeLayerStyle : undefined
                  }
                  onPointerDown={
                    activeSlot === 'challenger' ? handleVideoPointerDown : undefined
                  }
                  onPointerMove={
                    activeSlot === 'challenger' ? handleVideoPointerMove : undefined
                  }
                  onPointerUp={
                    activeSlot === 'challenger' ? handleVideoPointerUp : undefined
                  }
                  onPointerCancel={
                    activeSlot === 'challenger' ? handleVideoPointerCancel : undefined
                  }
                />
              </div>
            )}
          </>
        ) : null}
      </div>

        {showPitchPanel && (
          <AnimatePresence mode="wait">
            {showPitch && (
              <DraggablePitchWidget
                boundaryRef={reviewBoundsRef}
                positionId="review-pitch"
                mediaRef={activeAudioPlaybackItem ? audioPlayback.playerRef : activePitchMediaRef}
                enabled={showPitch}
                isPlaying={displayIsPlaying}
                mediaKey={activePitchMediaKey}
                takeName={activeName}
                label="Pitch Analysis"
                isAudioMode={activeIsAudio}
                liveMicEnabled={liveMicTunerEnabled}
                micStreamRef={micStreamRef}
                tunerInstrument={tunerInstrument}
                layoutRegion="review"
                onClose={() => setShowPitch(false)}
              />
            )}
          </AnimatePresence>
        )}

        <AnimatePresence>
          {isOpen && showPlayOverlay && (
            <motion.div
              className="review-bottom-ui pointer-events-none absolute inset-x-0 bottom-0 z-30"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 18 }}
              transition={iosEaseOut}
            >
              <div className="ui-orient-spin pointer-events-auto">
                <div className="review-controls-cluster">
                  <ReviewTimeline
                    trackRef={timelineTrackRef}
                    currentTime={displayCurrentTime}
                    duration={displayDuration}
                    isScrubbing={isScrubbing}
                    onScrubStart={handleScrubStart}
                    onScrub={scrubToClientX}
                    onScrubEnd={handleScrubEnd}
                    isPlaying={displayIsPlaying}
                    onPlayPause={togglePlayPause}
                    mediaFilePath={activeTimelineFilePath}
                    mediaUrl={activeTimelineUrl}
                  />

                  <ReviewSectionMarkers
                    markers={practiceMarkers}
                    duration={displayDuration}
                    currentTime={displayCurrentTime}
                    onSeek={seekToPracticeMarker}
                  />

                  <div className="review-native-toolbar">
                    <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button" onClick={handleShareActiveTake} disabled={!activeTake} aria-label="Share">
                      <Share2 className="h-5 w-5" />
                    </Pressable>
                    <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button" onClick={handleFavoriteActiveTake} disabled={!activeTake || !onFavoriteTake} aria-label="Favorite">
                      <Heart className="h-5 w-5" />
                    </Pressable>
                    <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button" onClick={handleInfoActiveTake} disabled={!activeTake} aria-label="Info">
                      <Info className="h-5 w-5" />
                    </Pressable>
                    <Pressable
                      type="button"
                      intensity="icon"
                      haptic="light"
                      className={`review-toolbar-button ${showPitch ? 'review-toolbar-button--active' : ''}`}
                      onClick={() => setShowPitch((prev) => !prev)}
                      disabled={!showPitchPanel}
                      aria-label="Pitch Analysis"
                      aria-pressed={showPitch}
                    >
                      <Activity className="h-5 w-5" />
                    </Pressable>
                    <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button review-toolbar-button--destructive" onClick={handleDeleteActiveTake} disabled={!activeTake || !onDeleteTake} aria-label="Delete">
                      <Trash2 className="h-5 w-5" />
                    </Pressable>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
