import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, X } from 'lucide-react'
import ReviewTimeline from './ReviewTimeline'
import TakeVideoPlayer from './TakeVideoPlayer'
import { resetVideoPlayback } from '../utils/videoPlayback'
import type { ReviewSlot, Take } from '../types'

const SWIPE_THRESHOLD = 60
const OVERLAY_HIDE_MS = 1000

interface ReviewModeOverlayProps {
  activeSlot: ReviewSlot
  soloTake?: Take | null
  benchmarkSrc: string | null
  challengerSrc: string | null
  benchmarkFilePath?: string
  challengerFilePath?: string
  benchmarkName?: string
  challengerName?: string
  benchmarkMimeType?: string
  challengerMimeType?: string
  isOpen: boolean
  onClose: () => void
  onSlotChange: (slot: ReviewSlot) => void
}

export default function ReviewModeOverlay({
  activeSlot,
  soloTake = null,
  benchmarkSrc,
  challengerSrc,
  benchmarkFilePath = '',
  challengerFilePath = '',
  benchmarkName,
  challengerName,
  benchmarkMimeType = 'video/mp4',
  challengerMimeType = 'video/mp4',
  isOpen,
  onClose,
  onSlotChange,
}: ReviewModeOverlayProps) {
  const benchmarkVideoRef = useRef<HTMLVideoElement>(null)
  const challengerVideoRef = useRef<HTMLVideoElement>(null)
  const soloVideoRef = useRef<HTMLVideoElement>(null)
  const timelineTrackRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const hideOverlayTimerRef = useRef<number | null>(null)
  const isScrubbingRef = useRef(false)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showPlayOverlay, setShowPlayOverlay] = useState(true)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)

  const pointerStart = useRef({ x: 0, y: 0 })
  const isTrackingPointer = useRef(false)
  const swipeCommitted = useRef(false)

  const isSolo = soloTake !== null

  const activeName = isSolo
    ? soloTake.name
    : activeSlot === 'benchmark'
      ? benchmarkName
      : challengerName
  const activeLabel = isSolo
    ? 'Take'
    : activeSlot === 'benchmark'
      ? 'Benchmark'
      : 'Challenger'

  const canSwipeLeft = !isSolo && activeSlot === 'benchmark' && challengerSrc !== null
  const canSwipeRight = !isSolo && activeSlot === 'challenger' && benchmarkSrc !== null

  const pauseAllReviewVideos = useCallback(() => {
    resetVideoPlayback(benchmarkVideoRef.current)
    resetVideoPlayback(challengerVideoRef.current)
    resetVideoPlayback(soloVideoRef.current)
  }, [])

  const getActiveVideo = useCallback((): HTMLVideoElement | null => {
    if (isSolo) return soloVideoRef.current
    return activeSlot === 'benchmark'
      ? benchmarkVideoRef.current
      : challengerVideoRef.current
  }, [activeSlot, isSolo])

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

  const scrubToClientX = useCallback(
    (clientX: number) => {
      const video = getActiveVideo()
      const track = timelineTrackRef.current
      if (!video || !track || !duration) return

      const rect = track.getBoundingClientRect()
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const time = percent * duration
      video.currentTime = time
      scheduleTimeUpdate(time)
    },
    [duration, getActiveVideo, scheduleTimeUpdate],
  )

  const startReviewPlayback = useCallback(() => {
    if (isScrubbingRef.current) return
    const video = getActiveVideo()
    if (!video) return
    video.muted = false
    void video.play().catch(() => {
      revealPlayOverlay(false)
    })
  }, [getActiveVideo, revealPlayOverlay])

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
  const hasMedia = isSolo ? Boolean(soloTake) : hasBenchmark || hasChallenger

  useEffect(() => {
    if (!isOpen) {
      pauseAllReviewVideos()
    }

    return () => {
      pauseAllReviewVideos()
    }
  }, [isOpen, pauseAllReviewVideos])

  useEffect(() => {
    if (!isOpen) return

    if (!isSolo) {
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
  }, [activeSlot, getActiveVideo, isOpen, isSolo, soloTake?.id, startReviewPlayback])

  useEffect(() => {
    const video = getActiveVideo()
    if (!video) return

    const onTimeUpdate = () => {
      if (!isScrubbingRef.current) {
        scheduleTimeUpdate(video.currentTime)
      }
    }
    const onDurationChange = () => setDuration(video.duration || 0)
    const onLoadedMetadata = () => setDuration(video.duration || 0)
    const onPlay = () => {
      setIsPlaying(true)
      revealPlayOverlay(true)
    }
    const onPause = () => {
      setIsPlaying(false)
      revealPlayOverlay(false)
    }
    const onEnded = () => {
      setIsPlaying(false)
      revealPlayOverlay(false)
    }

    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('durationchange', onDurationChange)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onEnded)

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('durationchange', onDurationChange)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
    }
  }, [activeSlot, getActiveVideo, isSolo, revealPlayOverlay, scheduleTimeUpdate, soloTake?.id])

  const handleScrubStart = useCallback(() => {
    const video = getActiveVideo()
    if (video) {
      video.pause()
    }
    isScrubbingRef.current = true
    revealPlayOverlay(false)
  }, [getActiveVideo, revealPlayOverlay])

  const handleScrubEnd = useCallback(() => {
    isScrubbingRef.current = false
    revealPlayOverlay(false)
  }, [revealPlayOverlay])

  const completeSwipe = useCallback(
    (direction: 'left' | 'right') => {
      resetVideoPlayback(getActiveVideo())
      const nextSlot: ReviewSlot =
        direction === 'left' ? 'challenger' : 'benchmark'
      setSlideDirection(direction)
      setSwipeOffset(0)
      isTrackingPointer.current = false
      swipeCommitted.current = false

      window.setTimeout(() => {
        onSlotChange(nextSlot)
        setSlideDirection(null)
        setCurrentTime(0)
      }, 220)
    },
    [getActiveVideo, onSlotChange],
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

  const handleVideoPointerDown = (e: React.PointerEvent<HTMLVideoElement>) => {
    if ((e.target as HTMLElement).closest('[data-play-overlay]')) return

    revealPlayOverlay(isPlaying)
    pointerStart.current = { x: e.clientX, y: e.clientY }
    isTrackingPointer.current = true
    swipeCommitted.current = false
  }

  const handleVideoPointerMove = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (!isTrackingPointer.current || isSolo) return

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

  const handleVideoPointerUp = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (!isTrackingPointer.current) return
    isTrackingPointer.current = false

    if (!swipeCommitted.current || isSolo) return

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
          <div className="pr-14">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
              {activeLabel}
            </p>
            {activeName && (
              <p className="text-sm font-medium text-white">{activeName}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="pointer-events-auto absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white backdrop-blur-md transition hover:bg-white/25"
            aria-label="Done"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {(canSwipeLeft || canSwipeRight) && (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-10 flex justify-center">
            <p className="rounded-full bg-black/40 px-3 py-1 text-[10px] text-white/50 backdrop-blur-sm">
              {canSwipeLeft && canSwipeRight
                ? 'Swipe to compare takes'
                : canSwipeLeft
                  ? 'Swipe left for challenger'
                  : 'Swipe right for benchmark'}
            </p>
          </div>
        )}

        {isSolo && soloTake ? (
          <div className="absolute inset-0 h-full w-full">
            <TakeVideoPlayer
              key={`solo-${soloTake.id}`}
              filePath={soloTake.filePath}
              videoUrl={soloTake.videoUrl}
              mimeType={soloTake.videoMimeType || 'video/mp4'}
              videoRef={soloVideoRef}
              className="custom-video-player h-full w-full object-cover"
              mirror
              style={{
                WebkitTouchCallout: 'default',
                userSelect: 'auto',
              }}
              controls={false}
              onLoadedData={startReviewPlayback}
            />
          </div>
        ) : (
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
                  mirror
                  style={{
                    WebkitTouchCallout: 'default',
                    userSelect: 'auto',
                  }}
                  controls={false}
                  onLoadedData={
                    activeSlot === 'benchmark' ? startReviewPlayback : undefined
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
                style={activeSlot === 'challenger' ? swipeLayerStyle : undefined}
              >
                <TakeVideoPlayer
                  key={`challenger-${challengerFilePath}-${challengerSrc}`}
                  filePath={challengerFilePath}
                  videoUrl={challengerSrc ?? ''}
                  mimeType={challengerMimeType}
                  videoRef={challengerVideoRef}
                  className="custom-video-player h-full w-full object-cover"
                  mirror
                  style={{
                    WebkitTouchCallout: 'default',
                    userSelect: 'auto',
                  }}
                  controls={false}
                  onLoadedData={
                    activeSlot === 'challenger' ? startReviewPlayback : undefined
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
        )}

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
      </div>

      <div
        className="shrink-0 border-t border-white/10"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <ReviewTimeline
          trackRef={timelineTrackRef}
          currentTime={currentTime}
          duration={duration}
          onScrubStart={handleScrubStart}
          onScrub={scrubToClientX}
          onScrubEnd={handleScrubEnd}
        />
      </div>
    </div>
  )
}
