import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  ChevronLeft,
  Download,
  Ellipsis,
  Eye,
  EyeOff,
  Heart,
  Info,
  Pencil,
  Repeat2,
  Share2,
  Star,
  Trash2,
} from 'lucide-react'
import ReviewTimeline from './ReviewTimeline'
import ReviewSectionMarkers from './ReviewSectionMarkers'
import TakeVideoPlayer from './TakeVideoPlayer'
import DraggablePitchWidget from './DraggablePitchWidget'
import PitchComparisonGraph from './PitchComparisonGraph'
import Pressable from './ui/Pressable'
import { iosEaseOut, iosFade, iosScreenEnter, iosScreenExit, iosSpringSheet, motionGpuLayer } from '../utils/motionPresets'
import { useSheetDragDismiss, readSheetSlideDistance } from '../hooks/useSheetDragDismiss'
import { resetVideoPlayback, pauseVideoElement } from '../utils/videoPlayback'
import { getPlayableDuration } from '../utils/videoDuration'
import { isAudioMedia } from '../utils/mediaType'
import type { MediaType, ReviewContext, ReviewSlot, Take, TakeUpdate } from '../types'
import type { TunerInstrument } from '../utils/pitchConfig'
import type { TunerTranspositionId } from '../utils/tunerTransposition'
import { pausePitchGraphsForMedia, PITCH_GRAPH_RELEASED_EVENT } from '../hooks/useLivePitchTracker'
import { finalizeInlineTakeBoxPlaybackCleanup } from '../utils/takePlaybackAudio'
import { toggleInlineTakePlayback } from '../utils/takeInlinePlayback'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'
import { loadTakeMarkers } from '../practiceTimeline/recording/timelineMarkers'
import { describeSaveTakeResult, shareTakeToSystem, shareTakeVideo } from '../utils/shareTakeVideo'
import { triggerBestTakeHaptic, triggerLightHaptic, triggerWarningHaptic } from '../utils/haptics'
import { trimTakeMediaInPlace } from '../utils/trimTakeMedia'
import { useActionSheet } from '../context/ActionSheetContext'
import {
  useAudioModePlayback,
  type AudioModePlaybackItem,
} from '../context/AudioModePlaybackContext'

const SWIPE_THRESHOLD = 60
const OVERLAY_HIDE_MS = 2800

function formatReviewDate(timestamp?: number): string {
  if (!timestamp) return 'BestTake'
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
            preload="auto"
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
        preload="auto"
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
  tunerTransposition?: TunerTranspositionId
  micStreamRef?: RefObject<MediaStream | null>
  isOpen: boolean
  onClose: () => void
  onSlotChange: (slot: ReviewSlot) => void
  onUpdateTake?: (id: string, updates: TakeUpdate) => void
  onDeleteTake?: (id: string) => void
  onFavoriteTake?: (id: string) => void
  onPlaybackActiveChange?: (playing: boolean) => void
  focusedPractice?: boolean
  initialLoopStartSeconds?: number | null
  initialLoopEndSeconds?: number | null
  onLoopRangeChange?: (start: number | null, end: number | null) => void
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
  benchmarkMirror = false,
  challengerMirror = false,
  benchmarkRecordingOrientation,
  challengerRecordingOrientation,
  liveMicTunerEnabled = true,
  tunerInstrument = 'voice',
  tunerTransposition,
  micStreamRef,
  isOpen,
  onClose,
  onSlotChange,
  onUpdateTake,
  onDeleteTake,
  onFavoriteTake,
  onPlaybackActiveChange,
  focusedPractice = false,
  initialLoopStartSeconds = null,
  initialLoopEndSeconds = null,
  onLoopRangeChange,
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
  const trimRangeRef = useRef({ start: 0, end: 0 })
  const pendingComparisonTimeRef = useRef<number | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isScrubbing, setIsScrubbing] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPlayOverlay, setShowPlayOverlay] = useState(true)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const [showPitch, setShowPitch] = useState(false)
  // Focused practice's Compare is a listening moment, not an analysis screen —
  // the pitch graph only ever shows up in the general (non-focused) A/B view.
  const [showPitchComparison, setShowPitchComparison] = useState(false)
  const [blindMode, setBlindMode] = useState(false)
  const [blindSwapped, setBlindSwapped] = useState(false)
  const [loopStartSeconds, setLoopStartSeconds] = useState<number | null>(
    initialLoopStartSeconds,
  )
  const [loopEndSeconds, setLoopEndSeconds] = useState<number | null>(
    initialLoopEndSeconds,
  )
  const [actionMenuOpen, setActionMenuOpen] = useState(false)
  const [trimMode, setTrimMode] = useState(false)
  const [trimRange, setTrimRange] = useState({ start: 0, end: 0 })
  const [trimApplying, setTrimApplying] = useState(false)
  const [mediaRevision, setMediaRevision] = useState(0)

  const pointerStart = useRef({ x: 0, y: 0 })
  const isTrackingPointer = useRef(false)
  const swipeCommitted = useRef(false)
  const reviewAutoplayEnabledRef = useRef(false)

  const isVault = context === 'vault'
  const vaultTake = isVault ? vaultTakes[vaultIndex] ?? null : null

  const activeName = blindMode && !isVault
    ? undefined
    : isVault
    ? vaultTake?.name
    : activeSlot === 'benchmark'
      ? benchmarkName
      : challengerName
  const activeTake = isVault
    ? vaultTake
    : activeSlot === 'benchmark'
      ? benchmarkTake
      : challengerTake
  const benchmarkBlindLabel = blindSwapped ? 'B' : 'A'
  const challengerBlindLabel = blindSwapped ? 'A' : 'B'
  const activeBlindLabel =
    activeSlot === 'benchmark' ? benchmarkBlindLabel : challengerBlindLabel
  const activeTimestamp = blindMode && !isVault ? undefined : activeTake?.timestamp
  const activeDate = formatReviewDate(activeTimestamp)
  const activeTime = formatReviewTime(activeTimestamp)
  const activeLabel = blindMode && !isVault
    ? `Take ${activeBlindLabel}`
    : isVault
    ? 'Take Vault'
    : activeSlot === 'benchmark'
      ? 'Best Take'
      : challengerName ?? 'Current Take'

  const dynamicTakeLabel = blindMode ? `Take ${challengerBlindLabel}` : challengerName ?? 'Current Take'

  const activeOffsetSeconds = Math.max(0, (activeTake?.timelineOffsetMs ?? 0) / 1_000)

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
    ? `vault-${vaultTake?.id ?? vaultIndex}-r${mediaRevision}`
    : activeSlot === 'benchmark'
      ? `benchmark-${benchmarkFilePath}-${benchmarkSrc}-r${mediaRevision}`
      : `challenger-${challengerFilePath}-${challengerSrc}-r${mediaRevision}`

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
    activeTake?.playbackGainMetadata,
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
  const alignedCurrentTime = Math.max(0, displayCurrentTime - activeOffsetSeconds)
  const trimAvailable = Boolean(activeTake?.filePath) && displayDuration >= 0.1
  const safeTrimStart = Math.max(0, Math.min(trimRange.start, displayDuration || trimRange.start))
  const safeTrimEnd = Math.max(safeTrimStart, Math.min(trimRange.end, displayDuration || trimRange.end))

  useEffect(() => {
    trimRangeRef.current = { start: safeTrimStart, end: safeTrimEnd }
  }, [safeTrimEnd, safeTrimStart])

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

  const switchComparisonSlot = useCallback(
    (nextSlot: ReviewSlot) => {
      if (isVault || nextSlot === activeSlot) return
      const media = getActiveVideo()
      const rawTime = media?.currentTime ?? displayCurrentTime
      pendingComparisonTimeRef.current = Math.max(0, rawTime - activeOffsetSeconds)
      if (activeAudioPlaybackItem) {
        audioPlayback.pause()
      } else {
        pauseVideoElement(media)
      }
      onSlotChange(nextSlot)
    }, [
      activeAudioPlaybackItem,
      activeOffsetSeconds,
      activeSlot,
      audioPlayback,
      displayCurrentTime,
      getActiveVideo,
      isVault,
      onSlotChange,
    ],
  )

  const toggleBlindMode = useCallback(() => {
    if (isVault) return
    if (blindMode) {
      setBlindMode(false)
      return
    }
    const swapped = Math.random() < 0.5
    setBlindSwapped(swapped)
    setBlindMode(true)
    pendingComparisonTimeRef.current = 0
    onSlotChange(swapped ? 'challenger' : 'benchmark')
  }, [blindMode, isVault, onSlotChange])

  const cycleLoopRange = useCallback(() => {
    if (loopStartSeconds === null) {
      const start = alignedCurrentTime
      setLoopStartSeconds(start)
      setLoopEndSeconds(null)
      onLoopRangeChange?.(start, null)
      return
    }
    if (loopEndSeconds === null) {
      const minimumEnd = loopStartSeconds + 0.25
      const end = Math.max(minimumEnd, alignedCurrentTime)
      setLoopEndSeconds(end)
      onLoopRangeChange?.(loopStartSeconds, end)
      return
    }
    setLoopStartSeconds(null)
    setLoopEndSeconds(null)
    onLoopRangeChange?.(null, null)
  }, [alignedCurrentTime, loopEndSeconds, loopStartSeconds, onLoopRangeChange])

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

  const stopAtTrimEnd = useCallback(
    (media: HTMLMediaElement): boolean => {
      if (!trimMode) return false
      const { end } = trimRangeRef.current
      if (end <= 0 || media.currentTime < end - 0.015) return false

      if (activeAudioPlaybackItem) {
        audioPlayback.pause()
      } else {
        media.pause()
      }
      scheduleTimeUpdate(end)
      return true
    },
    [activeAudioPlaybackItem, audioPlayback, scheduleTimeUpdate, trimMode],
  )

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

      if (stopAtTrimEnd(video)) {
        progressLoopRef.current = null
        return
      }

      if (
        !isVault &&
        loopStartSeconds !== null &&
        loopEndSeconds !== null &&
        video.currentTime - activeOffsetSeconds >= loopEndSeconds - 0.015
      ) {
        video.currentTime = loopStartSeconds + activeOffsetSeconds
      }

      scheduleTimeUpdate(video.currentTime)
      syncDurationFromVideo(video)
      progressLoopRef.current = requestAnimationFrame(tick)
    }

    progressLoopRef.current = requestAnimationFrame(tick)
  }, [
    activeOffsetSeconds,
    getActiveVideo,
    isVault,
    loopEndSeconds,
    loopStartSeconds,
    scheduleTimeUpdate,
    stopAtTrimEnd,
    stopProgressLoop,
    syncDurationFromVideo,
  ])

  useEffect(() => {
    if (
      !activeAudioPlaybackItem ||
      !audioPlayback.state.isPlaying ||
      loopStartSeconds === null ||
      loopEndSeconds === null
    ) return
    if (audioPlayback.state.currentTime - activeOffsetSeconds < loopEndSeconds - 0.015) return
    audioPlayback.seek(loopStartSeconds + activeOffsetSeconds)
  }, [
    activeAudioPlaybackItem,
    activeOffsetSeconds,
    audioPlayback,
    audioPlayback.state.currentTime,
    audioPlayback.state.isPlaying,
    loopEndSeconds,
    loopStartSeconds,
  ])

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
    (event?: React.MouseEvent<HTMLButtonElement>) => {
      event?.stopPropagation()
      event?.preventDefault()
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
    const { start: trimStart, end: trimEnd } = trimRangeRef.current
    const hasTrimWindow = trimMode && trimEnd > trimStart

    if (activeAudioPlaybackItem) {
      if (displayIsPlaying) {
        audioPlayback.pause()
      } else {
        const nextStartTime =
          hasTrimWindow &&
          (displayCurrentTime < trimStart || displayCurrentTime >= trimEnd - 0.015)
            ? trimStart
            : displayCurrentTime
        audioPlayback.play(activeAudioPlaybackItem, { startTime: nextStartTime })
      }
      revealPlayOverlay(true)
      return
    }

    const video = getActiveVideo()
    if (!video) return

    if (video.paused || video.ended) {
      if (hasTrimWindow && (video.currentTime < trimStart || video.currentTime >= trimEnd - 0.015)) {
        video.currentTime = trimStart
        scheduleTimeUpdate(trimStart)
      }
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
  }, [
    activeAudioPlaybackItem,
    audioPlayback,
    displayCurrentTime,
    displayIsPlaying,
    getActiveVideo,
    revealPlayOverlay,
    scheduleTimeUpdate,
    trimMode,
  ])

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
      setShowPitchComparison(false)
      setBlindMode(false)
      setActionMenuOpen(false)
    }
  }, [isOpen])

  useEffect(() => {
    setLoopStartSeconds(initialLoopStartSeconds)
    setLoopEndSeconds(initialLoopEndSeconds)
  }, [initialLoopEndSeconds, initialLoopStartSeconds, isOpen])

  useEffect(() => {
    setActionMenuOpen(false)
  }, [activeSlot, vaultTake?.id, vaultIndex])

  useEffect(() => {
    setTrimMode(false)
    setTrimApplying(false)
    setTrimRange({ start: 0, end: 0 })
  }, [activeTake?.id, isOpen])

  useEffect(() => {
    if (!Number.isFinite(displayDuration) || displayDuration <= 0) return
    setTrimRange((current) => {
      if (!trimMode) return { start: 0, end: displayDuration }
      const start = Math.max(0, Math.min(current.start, displayDuration))
      const end = Math.max(start, Math.min(current.end || displayDuration, displayDuration))
      return { start, end }
    })
  }, [displayDuration, trimMode])

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
      const alignedTime = pendingComparisonTimeRef.current ?? 0
      pendingComparisonTimeRef.current = null
      const rawTime = alignedTime + activeOffsetSeconds
      window.requestAnimationFrame(() => audioPlayback.seek(rawTime))
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

    const alignedTime = pendingComparisonTimeRef.current ?? 0
    pendingComparisonTimeRef.current = null
    const rawTime = alignedTime + activeOffsetSeconds
    setCurrentTime(rawTime)
    setDuration(0)
    setIsPlaying(false)
    setShowPlayOverlay(true)
    video.pause()
    video.currentTime = rawTime
  }, [
    activeSlot,
    getActiveVideo,
    isOpen,
    isVault,
    vaultTake?.id,
    vaultIndex,
    activeAudioPlaybackItem,
    activeOffsetSeconds,
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

  const handleRequestTrim = useCallback(() => {
    if (!trimAvailable || trimApplying) return
    const trimDuration = displayDuration
    if (!Number.isFinite(trimDuration) || trimDuration < 0.1) return

    if (activeAudioPlaybackItem) {
      audioPlayback.pause()
    } else {
      const video = getActiveVideo()
      video?.pause()
      stopProgressLoop()
    }
    wasPlayingBeforeScrubRef.current = false
    setTrimRange({ start: 0, end: trimDuration })
    setTrimMode(true)
    revealPlayOverlay(false)
    triggerLightHaptic()
  }, [
    activeAudioPlaybackItem,
    audioPlayback,
    displayDuration,
    getActiveVideo,
    revealPlayOverlay,
    stopProgressLoop,
    trimApplying,
    trimAvailable,
  ])

  const handleTrimStart = useCallback(() => {
    if (activeAudioPlaybackItem) {
      audioPlayback.pause()
    } else {
      const video = getActiveVideo()
      video?.pause()
      stopProgressLoop()
    }
    isScrubbingRef.current = true
    setIsScrubbing(true)
    revealPlayOverlay(false)
  }, [activeAudioPlaybackItem, audioPlayback, getActiveVideo, revealPlayOverlay, stopProgressLoop])

  const handleTrimRangeChange = useCallback(
    (start: number, end: number, handle: 'start' | 'end') => {
      const durationForTrim = displayDuration
      if (!Number.isFinite(durationForTrim) || durationForTrim <= 0) return
      const nextStart = Math.max(0, Math.min(start, durationForTrim))
      const nextEnd = Math.max(nextStart, Math.min(end, durationForTrim))
      setTrimRange({ start: nextStart, end: nextEnd })

      const previewTime = handle === 'start' ? nextStart : nextEnd
      if (activeAudioPlaybackItem) {
        audioPlayback.seek(previewTime)
        return
      }
      const video = getActiveVideo()
      if (!video) return
      video.currentTime = previewTime
      scheduleTimeUpdate(previewTime)
    },
    [activeAudioPlaybackItem, audioPlayback, displayDuration, getActiveVideo, scheduleTimeUpdate],
  )

  const handleTrimEnd = useCallback(() => {
    isScrubbingRef.current = false
    setIsScrubbing(false)
    wasPlayingBeforeScrubRef.current = false
    revealPlayOverlay(false)
  }, [revealPlayOverlay])

  const handleCancelTrim = useCallback(() => {
    setTrimMode(false)
    setTrimRange({ start: 0, end: displayDuration })
    revealPlayOverlay(false)
    triggerLightHaptic()
  }, [displayDuration, revealPlayOverlay])

  const handleApplyTrim = useCallback(() => {
    if (!activeTake || trimApplying) return
    const { start, end } = trimRangeRef.current
    const originalDuration = displayDuration
    if (!Number.isFinite(originalDuration) || originalDuration <= 0) return

    if (start <= 0.01 && end >= originalDuration - 0.01) {
      handleCancelTrim()
      return
    }

    void (async () => {
      setTrimApplying(true)
      if (activeAudioPlaybackItem) {
        audioPlayback.pause()
      } else {
        pauseAllReviewVideosSafe()
        stopProgressLoop()
      }

      try {
        const result = await trimTakeMediaInPlace(activeTake, start, end)
        setMediaRevision((revision) => revision + 1)
        setCurrentTime(0)
        setDuration(result.duration)
        setTrimRange({ start: 0, end: result.duration })
        setTrimMode(false)

        if (activeAudioPlaybackItem) {
          const player = audioPlayback.playerRef.current
          player?.pause()
          player?.removeAttribute('src')
          player?.load()
          audioPlayback.select(activeAudioPlaybackItem)
        }

        triggerLightHaptic()
      } catch (error) {
        void showAlert({
          title: 'Unable to Trim',
          message: error instanceof Error ? error.message : 'The take could not be trimmed.',
          tone: 'error',
        })
      } finally {
        setTrimApplying(false)
        revealPlayOverlay(false)
      }
    })()
  }, [
    activeAudioPlaybackItem,
    activeTake,
    audioPlayback,
    displayDuration,
    handleCancelTrim,
    pauseAllReviewVideosSafe,
    revealPlayOverlay,
    showAlert,
    stopProgressLoop,
    trimApplying,
  ])

  const completeSwipe = useCallback(
    (direction: 'left' | 'right') => {
      if (!isVault) {
        const media = getActiveVideo()
        pendingComparisonTimeRef.current = Math.max(
          0,
          (media?.currentTime ?? displayCurrentTime) - activeOffsetSeconds,
        )
      }
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
        if (isVault) setCurrentTime(0)
      }, 220)
    },
    [
      activeOffsetSeconds,
      displayCurrentTime,
      getActiveVideo,
      isVault,
      onSlotChange,
      onVaultIndexChange,
      vaultIndex,
      vaultTakes.length,
    ],
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

  // The focused-practice "just recorded, check it" moment stays a sheet over
  // the recorder — Vault's full-screen browsing is untouched.
  const sheetMode = !isVault && focusedPractice
  const [sheetSlideDistance] = useState(readSheetSlideDistance)
  const { sheetDragProps, dragHandleProps, backdropOpacity: sheetBackdropOpacity } =
    useSheetDragDismiss({
      enabled: sheetMode && isOpen,
      slideDistance: sheetSlideDistance,
      onDismiss: handleCloseClick,
    })

  if (!hasMedia) {
    return null
  }

  return (
    <>
      {sheetMode && (
        <motion.button
          type="button"
          className="review-sheet-backdrop fixed inset-0 z-[59]"
          style={{ opacity: sheetBackdropOpacity, pointerEvents: isOpen ? 'auto' : 'none' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={iosFade}
          onClick={handleCloseClick}
          aria-label="Close comparison"
        />
      )}
      <motion.div
        className={`review-overlay fixed z-[60] flex w-full flex-col overflow-hidden transform-gpu ${
          sheetMode
            ? 'review-overlay--sheet inset-x-0 bottom-0 h-[80dvh] rounded-t-[1.75rem]'
            : `review-overlay--immersive inset-0 h-full ${activeIsAudio ? 'review-overlay--audio' : 'review-overlay--camera'}`
        }`}
        variants={
          sheetMode
            ? {
                initial: { y: '100%' },
                animate: { y: 0, transition: iosSpringSheet },
                exit: { y: '100%', transition: iosSpringSheet },
              }
            : {
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
              }
        }
        initial="initial"
        animate="animate"
        exit="exit"
        style={{
          ...motionGpuLayer,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        aria-hidden={!isOpen}
        {...(sheetMode ? sheetDragProps : {})}
      >
        {sheetMode && (
          <div {...dragHandleProps}>
            <div className="review-sheet-handle-bar" />
          </div>
        )}
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
                  {blindMode && !isVault
                    ? 'Identity hidden until Blind Compare is turned off'
                    : activeTime
                      ? `${activeDate} · ${activeTime}`
                      : activeDate}
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
                  disabled={blindMode && !isVault}
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
            takeKey={`vault-${vaultTake.id}-r${mediaRevision}`}
            filePath={vaultTake.filePath}
            videoUrl={vaultTake.videoUrl}
            mimeType={
              vaultTake.videoMimeType ??
              (vaultTake.mediaType === 'audio' ? NATIVE_AUDIO_MIME : NATIVE_VIDEO_MIME)
            }
            mediaType={vaultTake.mediaType}
            mirror={vaultTake.mirrorPlayback === true}
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
                  takeKey={`benchmark-${benchmarkFilePath}-${benchmarkSrc}-r${mediaRevision}`}
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
                  takeKey={`challenger-${challengerFilePath}-${challengerSrc}-r${mediaRevision}`}
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
                tunerTransposition={tunerTransposition}
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
                  {!isVault && hasBenchmark && hasChallenger && (
                    <>
                    <div className="focused-review-strip">
                      <div className="focused-review-switch" aria-label="Switch comparison take">
                        <button
                          type="button"
                          aria-pressed={
                            activeSlot === (blindMode && blindSwapped ? 'challenger' : 'benchmark')
                          }
                          onClick={() =>
                            switchComparisonSlot(
                              blindMode && blindSwapped ? 'challenger' : 'benchmark',
                            )
                          }
                        >
                          {blindMode ? 'Take A' : 'Best'}
                        </button>
                        <button
                          type="button"
                          aria-pressed={
                            activeSlot === (blindMode && blindSwapped ? 'benchmark' : 'challenger')
                          }
                          onClick={() =>
                            switchComparisonSlot(
                              blindMode && blindSwapped ? 'benchmark' : 'challenger',
                            )
                          }
                        >
                          {blindMode ? 'Take B' : 'Current'}
                        </button>
                      </div>
                      {focusedPractice && (
                        <button
                          type="button"
                          className={`focused-review-loop ${loopStartSeconds !== null ? 'focused-review-loop--active' : ''}`}
                          onClick={cycleLoopRange}
                          title="Tap once for loop start, again for loop end, and again to clear"
                        >
                          <Repeat2 aria-hidden />
                          <span>
                            {loopStartSeconds === null
                              ? 'Loop'
                              : loopEndSeconds === null
                                ? 'Set end'
                                : 'Looping'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`focused-review-blind ${blindMode ? 'focused-review-blind--active' : ''}`}
                        onClick={toggleBlindMode}
                        aria-pressed={blindMode}
                      >
                        {blindMode ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                        <span>{blindMode ? 'Reveal' : 'Blind'}</span>
                      </button>
                      {showPitchPanel && (
                        <button
                          type="button"
                          className={`focused-review-pitch ${showPitch ? 'focused-review-pitch--active' : ''}`}
                          onClick={() => setShowPitch((prev) => !prev)}
                          aria-pressed={showPitch}
                          aria-label="Pitch analysis"
                        >
                          <Activity aria-hidden />
                        </button>
                      )}
                    </div>
                    {focusedPractice && !blindMode && challengerTake && onFavoriteTake && (
                      <div className="focused-review-best-row">
                        <span>Compare to Personal Best</span>
                        <Pressable
                          type="button"
                          intensity="soft"
                          haptic="success"
                          onClick={() => onFavoriteTake(challengerTake.id)}
                        >
                          <Star aria-hidden />
                          Make Current Personal Best
                        </Pressable>
                      </div>
                    )}
                    </>
                  )}

                  {!isVault && focusedPractice && hasChallenger && !hasBenchmark && challengerTake && onFavoriteTake && (
                    <div className="focused-review-best-row focused-review-best-row--first">
                      <span>No Personal Best yet</span>
                      <Pressable
                        type="button"
                        intensity="soft"
                        haptic="success"
                        onClick={() => onFavoriteTake(challengerTake.id)}
                      >
                        <Star aria-hidden />
                        Make This Personal Best
                      </Pressable>
                    </div>
                  )}

                  {!isVault && !focusedPractice && showPitchComparison && (
                    <PitchComparisonGraph
                      benchmarkTake={benchmarkTake}
                      challengerTake={challengerTake}
                      currentTime={alignedCurrentTime}
                      blind={blindMode}
                      benchmarkLabel={
                        blindMode ? `Take ${benchmarkBlindLabel}` : benchmarkName ?? 'Best'
                      }
                      challengerLabel={
                        blindMode ? `Take ${challengerBlindLabel}` : challengerName ?? 'Current'
                      }
                    />
                  )}

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
                    trimAvailable={trimAvailable}
                    trimActive={trimMode}
                    trimStart={safeTrimStart}
                    trimEnd={safeTrimEnd}
                    trimApplying={trimApplying}
                    onRequestTrim={handleRequestTrim}
                    onTrimStart={handleTrimStart}
                    onTrimChange={handleTrimRangeChange}
                    onTrimEnd={handleTrimEnd}
                    onCancelTrim={handleCancelTrim}
                    onApplyTrim={handleApplyTrim}
                  />

                  <ReviewSectionMarkers
                    markers={practiceMarkers}
                    duration={displayDuration}
                    currentTime={displayCurrentTime}
                    onSeek={seekToPracticeMarker}
                  />

                  {/* Focused practice's Compare is just: listen, switch, blind-test,
                      decide. Share/info/delete/pitch-analysis are Vault-editing jobs,
                      not part of that moment. */}
                  {(isVault || !focusedPractice) && (
                    <div className="review-native-toolbar">
                      <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button" onClick={handleShareActiveTake} disabled={!activeTake || (blindMode && !isVault)} aria-label="Share">
                        <Share2 className="h-5 w-5" />
                      </Pressable>
                      <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button" onClick={handleFavoriteActiveTake} disabled={!activeTake || !onFavoriteTake || (blindMode && !isVault)} aria-label="Mark as Personal Best">
                        <Heart className="h-5 w-5" />
                      </Pressable>
                      <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button" onClick={handleInfoActiveTake} disabled={!activeTake || (blindMode && !isVault)} aria-label="Info">
                        <Info className="h-5 w-5" />
                      </Pressable>
                      <Pressable
                        type="button"
                        intensity="icon"
                        haptic="light"
                        className={`review-toolbar-button ${
                          (isVault ? showPitch : showPitchComparison)
                            ? 'review-toolbar-button--active'
                            : ''
                        }`}
                        onClick={() => {
                          if (isVault) {
                            setShowPitch((prev) => !prev)
                          } else {
                            setShowPitchComparison((prev) => !prev)
                          }
                        }}
                        disabled={!showPitchPanel}
                        aria-label="Pitch Analysis"
                        aria-pressed={isVault ? showPitch : showPitchComparison}
                      >
                        <Activity className="h-5 w-5" />
                      </Pressable>
                      <Pressable type="button" intensity="icon" haptic="light" className="review-toolbar-button review-toolbar-button--destructive" onClick={handleDeleteActiveTake} disabled={!activeTake || !onDeleteTake || (blindMode && !isVault)} aria-label="Delete">
                        <Trash2 className="h-5 w-5" />
                      </Pressable>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </motion.div>
    </>
  )
}
