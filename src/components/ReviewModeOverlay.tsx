import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, AudioLines, X } from 'lucide-react'
import ReviewTimeline from './ReviewTimeline'
import TakeVideoPlayer from './TakeVideoPlayer'
import { resetVideoPlayback, pauseVideoElement } from '../utils/videoPlayback'
import { getPlayableDuration } from '../utils/videoDuration'
import type { ReviewContext, ReviewSlot, Take } from '../types'

const SWIPE_THRESHOLD = 60
const OVERLAY_HIDE_MS = 1000

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
  benchmarkMirror?: boolean
  challengerMirror?: boolean
  isOpen: boolean
  onClose: () => void
  onSlotChange: (slot: ReviewSlot) => void
  onOpenPitchAnalysis?: () => void
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
  benchmarkMirror = true,
  challengerMirror = true,
  isOpen,
  onClose,
  onSlotChange,
  onOpenPitchAnalysis,
}: ReviewModeOverlayProps) {
  const benchmarkVideoRef = useRef<HTMLMediaElement>(null)
  const challengerVideoRef = useRef<HTMLMediaElement>(null)
  const vaultVideoRef = useRef<HTMLMediaElement>(null)
  const timelineTrackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const progressLoopRef = useRef<number | null>(null)
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
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
    }
    rafRef.current = requestAnimationFrame(() => {
      setCurrentTime(time)
      rafRef.current = null
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
    void video.play().catch(() => {
      revealPlayOverlay(false)
    })
  }, [getActiveVideo, revealPlayOverlay])

  const handleCloseClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      reviewAutoplayEnabledRef.current = false
      pauseAllReviewVideos()
      onClose()
    },
    [onClose, pauseAllReviewVideos],
  )

  const togglePlayPause = useCallback(() => {
    const video = getActiveVideo()
    if (!video) return

    video.muted = false

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

    const onTimeUpdate = () => {
      if (!isScrubbingRef.current) {
        scheduleTimeUpdate(video.currentTime)
      }
    }
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

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    syncDurationFromVideo(video)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
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
      className={`review-overlay fixed inset-0 z-50 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-black transition-opacity duration-200 ease-in ${
        isOpen
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none invisible opacity-0'
      }`}
      aria-hidden={!isOpen}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/55 to-transparent px-5 pb-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="relative">
          <div className="flex items-start gap-2 pr-24">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                {activeLabel}
              </p>
              {activeName && (
                <p className="text-sm font-medium text-white">{activeName}</p>
              )}
            </div>
            {onOpenPitchAnalysis && !isVault && (
              <button
                type="button"
                onClick={onOpenPitchAnalysis}
                className="pointer-events-auto flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-white backdrop-blur-md transition hover:bg-white/25"
                aria-label="Open pitch analysis"
              >
                <AudioLines className="h-4 w-4" />
                <span className="text-xs font-medium">Pitch</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleCloseClick}
            className="pointer-events-auto absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25"
            aria-label="Done"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
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
          <div
            className="absolute inset-0 h-full w-full transition-all duration-200 ease-out"
            style={swipeLayerStyle}
          >
            <TakeVideoPlayer
              key={`vault-${vaultTake.id}`}
              filePath={vaultTake.filePath}
              videoUrl={vaultTake.videoUrl}
              mimeType={vaultTake.videoMimeType || 'video/mp4'}
              videoRef={vaultVideoRef}
              className="custom-video-player h-full w-full object-cover"
              mirror={vaultTake.mirrorPlayback !== false}
              style={{
                WebkitTouchCallout: 'default',
                userSelect: 'auto',
              }}
              controls={false}
              onPointerDown={handleVideoPointerDown}
              onPointerMove={handleVideoPointerMove}
              onPointerUp={handleVideoPointerUp}
              onPointerCancel={handleVideoPointerUp}
            />
          </div>
        ) : isOpen ? (
          <>
            {hasBenchmark && (
              <div
                className={`absolute inset-0 h-full w-full transition-all duration-200 ease-out ${
                  activeSlot === 'benchmark'
                    ? 'z-[1] opacity-100'
                    : 'pointer-events-none z-0 opacity-0'
                }`}
                style={activeSlot === 'benchmark' ? swipeLayerStyle : undefined}
              >
                <TakeVideoPlayer
                  key={`benchmark-${benchmarkFilePath}-${benchmarkSrc}`}
                  filePath={benchmarkFilePath}
                  videoUrl={benchmarkSrc ?? ''}
                  mimeType={benchmarkMimeType}
                  videoRef={benchmarkVideoRef}
                  className="custom-video-player h-full w-full object-cover"
                  mirror={benchmarkMirror}
                  style={{
                    WebkitTouchCallout: 'default',
                    userSelect: 'auto',
                  }}
                  controls={false}
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
                style={activeSlot === 'challenger' ? swipeLayerStyle : undefined}
              >
                <TakeVideoPlayer
                  key={`challenger-${challengerFilePath}-${challengerSrc}`}
                  filePath={challengerFilePath}
                  videoUrl={challengerSrc ?? ''}
                  mimeType={challengerMimeType}
                  videoRef={challengerVideoRef}
                  className="custom-video-player h-full w-full object-cover"
                  mirror={challengerMirror}
                  style={{
                    WebkitTouchCallout: 'default',
                    userSelect: 'auto',
                  }}
                  controls={false}
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

        {isOpen && (
          <div className="review-timeline-overlay pointer-events-none absolute inset-x-0 bottom-0 z-30">
            <ReviewTimeline
              trackRef={timelineTrackRef}
              currentTime={currentTime}
              duration={duration}
              isScrubbing={isScrubbing}
              onScrubStart={handleScrubStart}
              onScrub={scrubToClientX}
              onScrubEnd={handleScrubEnd}
            />
          </div>
        )}
      </div>
    </div>
  )
}
