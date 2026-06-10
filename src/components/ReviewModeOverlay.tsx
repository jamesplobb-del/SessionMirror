import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Pause, Play, X } from 'lucide-react'
import ReviewTimeline from './ReviewTimeline'
import TakeVideoPlayer from './TakeVideoPlayer'
import DraggablePitchWidget from './DraggablePitchWidget'
import { resetVideoPlayback, pauseVideoElement } from '../utils/videoPlayback'
import { getPlayableDuration } from '../utils/videoDuration'
import { isAudioMedia } from '../utils/mediaType'
import type { MediaType, ReviewContext, ReviewSlot, Take } from '../types'
import { pausePitchGraphsForMedia, PITCH_GRAPH_RELEASED_EVENT } from '../hooks/useLivePitchTracker'
import { NATIVE_AUDIO_MIME, NATIVE_VIDEO_MIME } from '../utils/takeStorage'

const SWIPE_THRESHOLD = 60
const OVERLAY_HIDE_MS = 1000

interface ReviewTakeLayerProps {
  takeKey: string
  filePath: string
  videoUrl: string
  mimeType: string
  mediaType?: MediaType
  mirror: boolean
  videoRef: RefObject<HTMLMediaElement | null>
  swipeLayerStyle?: React.CSSProperties
  onPointerDown?: React.PointerEventHandler<HTMLVideoElement>
  onPointerMove?: React.PointerEventHandler<HTMLVideoElement>
  onPointerUp?: React.PointerEventHandler<HTMLVideoElement>
  onPointerCancel?: React.PointerEventHandler<HTMLVideoElement>
}

function ReviewTakeLayer({
  takeKey,
  filePath,
  videoUrl,
  mimeType,
  mediaType,
  mirror,
  videoRef,
  swipeLayerStyle,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
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
        className="absolute inset-0 bg-stone-950 transition-all duration-200 ease-out"
        style={swipeLayerStyle}
      >
        <TakeVideoPlayer
          key={playerKey}
          filePath={filePath}
          videoUrl={videoUrl}
          mimeType={mimeType}
          videoRef={videoRef}
          className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          mirror={false}
          audible
          manualPlayOnly
          eagerLoad
          preload="auto"
          controls={false}
        />
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
        audible
        manualPlayOnly
        eagerLoad
        preload="auto"
        style={{
          WebkitTouchCallout: 'default',
          userSelect: 'auto',
        }}
        controls={false}
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
  pitchTrackerEnabled?: boolean
  liveMicTunerEnabled?: boolean
  micStreamRef?: RefObject<MediaStream | null>
  isOpen: boolean
  onClose: () => void
  onSlotChange: (slot: ReviewSlot) => void
}

export default function ReviewModeOverlay({
  context,
  activeSlot,
  vaultTakes,
  vaultIndex,
  onVaultIndexChange,
  benchmarkSrc,
  challengerSrc,
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
  pitchTrackerEnabled = false,
  liveMicTunerEnabled = true,
  micStreamRef,
  isOpen,
  onClose,
  onSlotChange,
}: ReviewModeOverlayProps) {
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
  const [showPitch, setShowPitch] = useState(true)

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
    if (isVault) return vaultVideoRef.current
    return activeSlot === 'benchmark'
      ? benchmarkVideoRef.current
      : challengerVideoRef.current
  }, [activeSlot, isVault])

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
    [duration, getActiveVideo, scheduleTimeUpdate],
  )

  const startReviewPlayback = useCallback(() => {
    if (!reviewAutoplayEnabledRef.current || isScrubbingRef.current) return
    const video = getActiveVideo()
    if (!video) return
    video.muted = false
    video.volume = 1
    void video.play().catch(() => {
      revealPlayOverlay(false)
    })
  }, [getActiveVideo, revealPlayOverlay])

  const handleCloseClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      reviewAutoplayEnabledRef.current = false
      stopProgressLoop()
      pausePitchGraphsForMedia(
        benchmarkVideoRef.current,
        challengerVideoRef.current,
        vaultVideoRef.current,
      )
      pauseAllReviewVideosSafe()
      window.requestAnimationFrame(() => {
        onClose()
      })
    },
    [onClose, pauseAllReviewVideosSafe, stopProgressLoop],
  )

  const togglePlayPause = useCallback(() => {
    const video = getActiveVideo()
    if (!video) return

    video.muted = false
    video.volume = 1

    if (video.paused) {
      void video.play().catch(() => revealPlayOverlay(false))
    } else {
      video.pause()
      revealPlayOverlay(false)
    }
  }, [getActiveVideo, revealPlayOverlay])

  const hasBenchmark = Boolean(benchmarkSrc || benchmarkFilePath)
  const hasChallenger = Boolean(challengerSrc || challengerFilePath)
  const hasMedia = isVault ? vaultTakes.length > 0 : hasBenchmark || hasChallenger

  const showPitchPanel =
    pitchTrackerEnabled &&
    isOpen &&
    (isVault
      ? Boolean(vaultTake)
      : activeSlot === 'benchmark'
        ? hasBenchmark
        : hasChallenger)

  useEffect(() => {
    if (isOpen) {
      setShowPitch(true)
    }
  }, [activePitchMediaKey, isOpen, pitchTrackerEnabled])

  useEffect(() => {
    reviewAutoplayEnabledRef.current = isOpen

    if (!isOpen) {
      pauseAllReviewVideos()
      return
    }

    return () => {
      reviewAutoplayEnabledRef.current = false
      pauseAllReviewVideosSafe()
    }
  }, [isOpen, pauseAllReviewVideos, pauseAllReviewVideosSafe])

  useEffect(() => {
    if (!isOpen || !reviewAutoplayEnabledRef.current) return

    if (!isVault) {
      if (activeSlot === 'benchmark') {
        resetVideoPlayback(challengerVideoRef.current)
      } else {
        resetVideoPlayback(benchmarkVideoRef.current)
      }
    }

    const video = getActiveVideo()
    if (!video) return

    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
    setShowPlayOverlay(true)

    const playWhenReady = () => {
      if (!reviewAutoplayEnabledRef.current) return
      startReviewPlayback()
    }

    video.addEventListener('loadeddata', playWhenReady, { once: true })
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      playWhenReady()
    } else {
      video.load()
    }

    return () => {
      video.removeEventListener('loadeddata', playWhenReady)
    }
  }, [
    activeSlot,
    getActiveVideo,
    isOpen,
    isVault,
    startReviewPlayback,
    vaultTake?.id,
    vaultIndex,
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
    const onPause = () => {
      setIsPlaying(false)
      revealPlayOverlay(false)
      stopProgressLoop()
    }
    const onEnded = () => {
      setIsPlaying(false)
      revealPlayOverlay(false)
      stopProgressLoop()
    }

    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    syncDurationFromVideo(video)

    return () => {
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('play', onPlay)
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
  ])

  const handleScrubStart = useCallback(() => {
    const video = getActiveVideo()
    if (video) {
      wasPlayingBeforeScrubRef.current = !video.paused
      video.pause()
      stopProgressLoop()
    }
    isScrubbingRef.current = true
    setIsScrubbing(true)
    revealPlayOverlay(false)
  }, [getActiveVideo, revealPlayOverlay, stopProgressLoop])

  const handleScrubEnd = useCallback(() => {
    isScrubbingRef.current = false
    setIsScrubbing(false)

    const video = getActiveVideo()
    if (video) {
      scheduleTimeUpdate(video.currentTime)
      syncDurationFromVideo(video)

      if (wasPlayingBeforeScrubRef.current) {
        video.muted = false
        void video.play().catch(() => revealPlayOverlay(false))
      }
    }

    wasPlayingBeforeScrubRef.current = false
    revealPlayOverlay(false)
  }, [
    getActiveVideo,
    revealPlayOverlay,
    scheduleTimeUpdate,
    syncDurationFromVideo,
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

    revealPlayOverlay(isPlaying)
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

    if (!swipeCommitted.current) return

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

  if (!hasMedia) {
    return null
  }

  return (
    <div
      className={`review-overlay review-overlay--immersive fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden transition-opacity duration-200 ease-in ${
        isOpen
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none invisible opacity-0'
      }`}
      aria-hidden={!isOpen}
    >
      <div ref={reviewBoundsRef} className="relative h-full w-full">
      <div className="review-overlay-header pointer-events-none absolute inset-x-0 top-0 z-10 px-5 pb-3">
        <div className="relative flex items-start justify-between gap-3 bg-gradient-to-b from-black/50 to-transparent pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
              {activeLabel}
            </p>
            {activeName && (
              <p className="text-sm font-medium text-white">{activeName}</p>
            )}
          </div>
          <div className="pointer-events-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleCloseClick}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25"
              aria-label="Done"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="review-video-stage relative min-h-0 flex-1 overflow-hidden">
        {isOpen && !isVault && (canSwipeLeft || canSwipeRight) && (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center">
            <p className="rounded-full bg-black/40 px-3 py-1 text-[10px] text-white/50 backdrop-blur-sm">
              {canSwipeLeft && canSwipeRight
                ? 'Swipe to compare takes'
                : canSwipeLeft
                  ? `Swipe left for ${dynamicTakeLabel}`
                  : 'Swipe right for Best Take'}
            </p>
          </div>
        )}

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
            videoRef={vaultVideoRef}
            swipeLayerStyle={swipeLayerStyle}
            onPointerDown={handleVideoPointerDown}
            onPointerMove={handleVideoPointerMove}
            onPointerUp={handleVideoPointerUp}
            onPointerCancel={handleVideoPointerUp}
          />
        ) : isOpen ? (
          <>
            {hasBenchmark && (
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
                  videoRef={benchmarkVideoRef}
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
                    activeSlot === 'benchmark' ? handleVideoPointerUp : undefined
                  }
                />
              </div>
            )}

            {hasChallenger && (
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
                  videoRef={challengerVideoRef}
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
                    activeSlot === 'challenger' ? handleVideoPointerUp : undefined
                  }
                />
              </div>
            )}
          </>
        ) : null}
      </div>

        {isOpen && (
        <button
          type="button"
          data-play-overlay
          onClick={(e) => {
            e.stopPropagation()
            togglePlayPause()
          }}
          className={`pointer-events-auto absolute left-1/2 top-1/2 z-20 flex h-[4.5rem] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 active:scale-95 ${
            showPlayOverlay
              ? 'scale-100 opacity-100'
              : 'pointer-events-none scale-90 opacity-0'
          }`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-8 w-8 fill-white text-white" />
          ) : (
            <Play className="h-8 w-8 fill-white text-white" />
          )}
        </button>
        )}

        {showPitchPanel && (
          <AnimatePresence mode="wait">
            {showPitch && (
              <DraggablePitchWidget
                boundaryRef={reviewBoundsRef}
                defaultBottomOffset={120}
                layoutKey={`${isOpen}-${activePitchMediaKey}`}
                mediaRef={activePitchMediaRef}
                enabled={pitchTrackerEnabled}
                isPlaying={isPlaying}
                mediaKey={activePitchMediaKey}
                takeName={activeName}
                label="Pitch Analysis"
                isAudioMode={activeIsAudio}
                liveMicEnabled={liveMicTunerEnabled}
                micStreamRef={micStreamRef}
                layoutRegion="review"
                onClose={() => setShowPitch(false)}
              />
            )}
          </AnimatePresence>
        )}

        {isOpen && (
          <div className="review-bottom-ui pointer-events-none absolute inset-x-0 bottom-0 z-10">
            <ReviewTimeline
              trackRef={timelineTrackRef}
              currentTime={currentTime}
              duration={duration}
              isScrubbing={isScrubbing}
              onScrubStart={handleScrubStart}
              onScrub={scrubToClientX}
              onScrubEnd={handleScrubEnd}
              pitchToggleVisible={showPitchPanel}
              pitchToggleActive={showPitch}
              onPitchToggle={() => setShowPitch((prev) => !prev)}
            />
          </div>
        )}
      </div>
    </div>
  )
}
