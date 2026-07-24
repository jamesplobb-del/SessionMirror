import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from 'react'
import { Pause, Play, Pin, Upload, X } from 'lucide-react'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import Pressable from './ui/Pressable'
import { stopEventBubble, touchBubbleBlockProps } from '../utils/eventBubbling'
import { waitForMediaReadyWithRetry } from '../utils/mediaPlayback'
import {
  finalizeInlineTakeBoxPlaybackCleanup,
  playTakeMediaAudible,
} from '../utils/takePlaybackAudio'
import { toggleInlineTakePlayback } from '../utils/takeInlinePlayback'
import {
  isNativeInlineTakeBoxPlaybackAvailable,
  measureInlineTakeBoxWindowRect,
  setNativeInlineTakeBoxEndedHandler,
  setNativeInlineTakeBoxVolume,
  startNativeInlineTakeBoxPlayback,
  stopNativeInlineTakeBoxPlayback,
  teardownNativeInlineTakeBoxListener,
  updateNativeInlineTakeBoxLayout,
} from '../utils/nativeInlineTakeBoxPlayback'
import {
  prepareInlineTakeBoxPlaybackRoute,
  releaseInlineTakeBoxPlaybackRoute,
} from '../utils/playbackRouteCoordinator'
import { updateTakePlaybackSpeakerGain } from '../utils/takePlaybackSpeaker'
import type { RecordingOrientation } from '../utils/physicalOrientation'
import { HUD_GLASS_FLOAT_BADGE, HUD_GLASS_PIP_PLAY_ICON } from '../utils/interactiveUx'
import { isAudioMimeType } from '../utils/mobileVideo'

interface PipWindowProps {
  layout?: 'pip' | 'fill'
  compact?: boolean
  src: string | null
  filePath?: string
  mimeType?: string
  label: string
  takeName?: string
  variant: 'benchmark' | 'challenger'
  emptyMessage: string
  mirror?: boolean
  recordingOrientation?: RecordingOrientation
  suspendPlayback?: boolean
  videoRef?: React.RefObject<HTMLMediaElement | null>
  onUnpin: () => void
  onExpand?: () => void
  onUpload?: (file: File) => void
  /** Amber pin — promote current take to Best Take in the vault. */
  showPinAsBest?: boolean
  onPinAsBest?: () => void
  className?: string
  dropHighlight?: boolean
  dragSourceActive?: boolean
  dragSourceArming?: boolean
  dragSourceProps?: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: (event: PointerEvent<HTMLElement>) => void
  }
  onPlaybackChange?: (playing: boolean) => void
  /** When this matches takeId, auto-start inline preview (hands-free auto-playback). */
  autoPlayRequestId?: string | null
  takeId?: string | null
  onAutoPlayComplete?: () => void
  posterUrl?: string | null
  splitViewActive?: boolean
}

function PipMediaPoster({
  posterUrl,
  isAudio = false,
}: {
  posterUrl?: string | null
  isAudio?: boolean
}) {
  return (
    <div
      className={`absolute inset-0 h-full w-full ${isAudio ? 'take-audio-surface' : 'bg-black'}`}
      aria-hidden
    >
      {posterUrl ? (
        <img
          src={posterUrl}
          alt=""
          className="pointer-events-none h-full w-full object-cover"
          draggable={false}
          decoding="async"
        />
      ) : null}
    </div>
  )
}

function PipWindow({
  layout = 'pip',
  compact = false,
  src,
  filePath = '',
  mimeType = 'video/mp4',
  label,
  takeName: _takeName,
  variant,
  emptyMessage,
  mirror = true,
  recordingOrientation,
  suspendPlayback = false,
  videoRef: externalVideoRef,
  onUnpin,
  onExpand,
  onUpload,
  showPinAsBest = false,
  onPinAsBest,
  className = '',
  dropHighlight = false,
  dragSourceActive = false,
  dragSourceArming = false,
  dragSourceProps,
  onPlaybackChange,
  autoPlayRequestId = null,
  takeId = null,
  onAutoPlayComplete,
  posterUrl = null,
  splitViewActive = false,
}: PipWindowProps) {
  const videoSourceKey = src || filePath || 'empty'
  const internalVideoRef = useRef<HTMLMediaElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const autoPlaySessionRef = useRef(false)
  const playbackStageRef = useRef<HTMLDivElement>(null)
  const nativePlayInFlightRef = useRef(false)
  const nativeRouteHeldRef = useRef(false)
  const autoPlayViaNativeRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)

  const hasMedia = Boolean(src || filePath)
  const nativeOwnerId = `pip-${variant}`
  const useNativePipPlayback =
    isNativeInlineTakeBoxPlaybackAvailable() &&
    Boolean(filePath) &&
    !isAudioMimeType(mimeType)
  const isAudioMedia = isAudioMimeType(mimeType)
  const mediaSurfaceClass = isAudioMedia ? 'take-audio-surface' : 'bg-black/95'
  const showUploadBadge =
    !compact && variant === 'benchmark' && Boolean(onUpload) && hasMedia
  const isFill = layout === 'fill'
  const pillLeft = !isFill && (showUploadBadge || showPinAsBest) ? 38 : 8
  const isAutoPlayArmed = Boolean(
    autoPlayRequestId && takeId && autoPlayRequestId === takeId,
  )
  const playbackAudible = (isAutoPlayArmed || isPlaying) && !suspendPlayback

  const stopNativePipPlayback = useCallback(() => {
    void stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: nativeOwnerId })
    if (nativeRouteHeldRef.current) {
      nativeRouteHeldRef.current = false
      void releaseInlineTakeBoxPlaybackRoute()
    }
    setIsPlaying(false)
  }, [nativeOwnerId])

  useEffect(() => {
    setIsPlaying(false)
  }, [videoSourceKey, suspendPlayback])

  useEffect(() => {
    if (!useNativePipPlayback) return
    // Source changed — drop any native overlay for the previous take.
    return () => {
      void stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: nativeOwnerId })
      if (nativeRouteHeldRef.current) {
        nativeRouteHeldRef.current = false
        void releaseInlineTakeBoxPlaybackRoute()
      }
    }
  }, [useNativePipPlayback, videoSourceKey])

  useEffect(() => {
    if (!useNativePipPlayback) return

    setNativeInlineTakeBoxEndedHandler(nativeOwnerId, () => {
      setIsPlaying(false)
      if (nativeRouteHeldRef.current) {
        nativeRouteHeldRef.current = false
        void releaseInlineTakeBoxPlaybackRoute()
      }
      if (autoPlayViaNativeRef.current) {
        autoPlayViaNativeRef.current = false
        autoPlaySessionRef.current = false
        onAutoPlayComplete?.()
      }
    })

    return () => {
      setNativeInlineTakeBoxEndedHandler(nativeOwnerId, null)
      void stopNativeInlineTakeBoxPlayback({ notify: false, ownerId: nativeOwnerId })
      if (nativeRouteHeldRef.current) {
        nativeRouteHeldRef.current = false
        void releaseInlineTakeBoxPlaybackRoute()
      }
      void teardownNativeInlineTakeBoxListener()
    }
  }, [nativeOwnerId, onAutoPlayComplete, useNativePipPlayback])

  useEffect(() => {
    if (!useNativePipPlayback || !isPlaying) return
    const stage = playbackStageRef.current
    if (!stage) return

    const syncLayout = () => {
      const rect = measureInlineTakeBoxWindowRect(stage)
      if (rect) {
        void updateNativeInlineTakeBoxLayout(rect)
      }
    }

    syncLayout()
    const observer = new ResizeObserver(syncLayout)
    observer.observe(stage)
    window.addEventListener('scroll', syncLayout, true)
    window.addEventListener('resize', syncLayout)

    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', syncLayout, true)
      window.removeEventListener('resize', syncLayout)
    }
  }, [isPlaying, useNativePipPlayback, layout, splitViewActive])

  useEffect(() => {
    if (useNativePipPlayback) return
    const media = videoRef.current
    if (!media) return

    const syncPlaying = () => {
      setIsPlaying(!media.paused && !media.ended)
    }

    media.addEventListener('play', syncPlaying)
    media.addEventListener('pause', syncPlaying)
    media.addEventListener('ended', syncPlaying)

    return () => {
      media.removeEventListener('play', syncPlaying)
      media.removeEventListener('pause', syncPlaying)
      media.removeEventListener('ended', syncPlaying)
    }
  }, [useNativePipPlayback, videoRef, videoSourceKey])

  useEffect(() => {
    onPlaybackChange?.(isPlaying)
  }, [isPlaying, onPlaybackChange])

  useEffect(() => {
    if (!suspendPlayback) return
    if (useNativePipPlayback) {
      stopNativePipPlayback()
      return
    }
    const media = videoRef.current
    if (!media) return
    media.pause()
    setIsPlaying(false)
  }, [stopNativePipPlayback, suspendPlayback, useNativePipPlayback, videoRef, videoSourceKey])

  const handlePlayPauseClick = useCallback(
    (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      if (suspendPlayback) return

      if (useNativePipPlayback) {
        if (isPlaying) {
          stopNativePipPlayback()
          return
        }
        if (nativePlayInFlightRef.current) return

        const rect = measureInlineTakeBoxWindowRect(playbackStageRef.current)
        if (!rect) return

        void (async () => {
          nativePlayInFlightRef.current = true
          try {
            await prepareInlineTakeBoxPlaybackRoute()
            nativeRouteHeldRef.current = true
            const started = await startNativeInlineTakeBoxPlayback({
              filePath,
              layout: rect,
              mirror,
              volume,
              ownerId: nativeOwnerId,
            })
            if (!started) {
              nativeRouteHeldRef.current = false
              await releaseInlineTakeBoxPlaybackRoute()
            }
            setIsPlaying(started)
          } finally {
            nativePlayInFlightRef.current = false
          }
        })()
        return
      }

      const video = videoRef.current
      if (!video) return

      if (video.paused) {
        video.setAttribute('data-debug-playback-tag', `pip-${variant}`)
        setIsPlaying(true)
        toggleInlineTakePlayback(video, {
          onPlaying: () => setIsPlaying(true),
          onFailure: () => {
            setIsPlaying(false)
            void finalizeInlineTakeBoxPlaybackCleanup()
          },
        })
      } else {
        toggleInlineTakePlayback(video, {
          onPaused: () => {
            setIsPlaying(false)
          },
        })
      }
    },
    [
      filePath,
      isPlaying,
      mirror,
      nativeOwnerId,
      stopNativePipPlayback,
      suspendPlayback,
      useNativePipPlayback,
      variant,
      videoRef,
      volume,
    ],
  )


  // Hands-free auto-playback — muted programmatic play (iOS allows muted autoplay).
  useEffect(() => {
    const wantsAutoPlay =
      Boolean(autoPlayRequestId) &&
      Boolean(takeId) &&
      autoPlayRequestId === takeId &&
      Boolean(src)

    if (!wantsAutoPlay || suspendPlayback) {
      autoPlaySessionRef.current = false
      return
    }

    autoPlaySessionRef.current = true
    let cancelled = false

    if (useNativePipPlayback) {
      void (async () => {
        if (nativePlayInFlightRef.current) return
        const rect = measureInlineTakeBoxWindowRect(playbackStageRef.current)
        if (!rect) {
          autoPlaySessionRef.current = false
          onAutoPlayComplete?.()
          return
        }
        nativePlayInFlightRef.current = true
        try {
          await prepareInlineTakeBoxPlaybackRoute()
          nativeRouteHeldRef.current = true
          const started = await startNativeInlineTakeBoxPlayback({
            filePath,
            layout: rect,
            mirror,
            volume,
            ownerId: nativeOwnerId,
          })
          if (cancelled || !autoPlaySessionRef.current) {
            stopNativePipPlayback()
            return
          }
          if (started) {
            autoPlayViaNativeRef.current = true
            setIsPlaying(true)
          } else {
            nativeRouteHeldRef.current = false
            await releaseInlineTakeBoxPlaybackRoute()
            autoPlaySessionRef.current = false
            onAutoPlayComplete?.()
          }
        } finally {
          nativePlayInFlightRef.current = false
        }
      })()

      return () => {
        cancelled = true
        autoPlaySessionRef.current = false
      }
    }

    void (async () => {
      const media = videoRef.current
      if (!media) {
        onAutoPlayComplete?.()
        return
      }

      const ready = await waitForMediaReadyWithRetry(media)
      if (cancelled || !autoPlaySessionRef.current) return

      if (!ready) {
        console.warn('Auto pip preview media not ready', { takeId, readyState: media.readyState })
        onAutoPlayComplete?.()
        return
      }

      const onEnded = () => {
        if (!autoPlaySessionRef.current) return
        autoPlaySessionRef.current = false
        setIsPlaying(false)
        onAutoPlayComplete?.()
      }

      media.addEventListener('ended', onEnded, { once: true })

      const started = await playTakeMediaAudible(media, {
        onFailure: () => setIsPlaying(false),
      })
      if (cancelled || !autoPlaySessionRef.current) {
        media.removeEventListener('ended', onEnded)
        return
      }

      if (started) {
        setIsPlaying(true)
      } else {
        media.removeEventListener('ended', onEnded)
        autoPlaySessionRef.current = false
        onAutoPlayComplete?.()
      }
    })()

    return () => {
      cancelled = true
      autoPlaySessionRef.current = false
    }
  }, [
    autoPlayRequestId,
    filePath,
    mirror,
    nativeOwnerId,
    onAutoPlayComplete,
    src,
    stopNativePipPlayback,
    suspendPlayback,
    takeId,
    useNativePipPlayback,
    videoRef,
    volume,
  ])

  const handleVolume = useCallback(
    (value: number) => {
      if (useNativePipPlayback) {
        void setNativeInlineTakeBoxVolume(value)
        setVolume(value)
        return
      }
      const video = videoRef.current
      if (!video) return
      video.volume = value
      updateTakePlaybackSpeakerGain(video, value, false)
      setVolume(value)
    },
    [useNativePipPlayback, videoRef],
  )

  const handleVideoAreaClick = useCallback(() => {
    onExpand?.()
  }, [onExpand])

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) {
        onUpload?.(file)
      }
    },
    [onUpload],
  )

  const emptyUploadClass =
    'pip-empty-action pip-empty-action--upload pip-empty-action--interactive pointer-events-auto flex cursor-pointer items-center justify-center gap-1.5'

  const playbackFit =
    layout === 'fill' && recordingOrientation === 'landscape' ? 'contain' : 'cover'

  const pipPlayButtonClass = compact
    ? 'compact-take-card__play-surface pointer-events-auto absolute inset-0 z-[5] flex items-center justify-center'
    : 'pointer-events-auto absolute left-1/2 top-1/2 z-[5] flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center p-3'
  const pipTouchIconClass = compact
    ? 'compact-take-card__play-icon'
    : HUD_GLASS_PIP_PLAY_ICON

  const accentRing =
    variant === 'benchmark' ? 'ring-amber-400/50' : 'ring-sky-400/50'
  const badgeClass =
    variant === 'benchmark'
      ? 'bg-amber-400/90 text-white'
      : 'bg-sky-500/90 text-white'

  const chromeInset = isFill ? 8 : 4
  const exteriorUploadInset = isFill ? 8 : chromeInset

  const shellClass = isFill
    ? `pip-window--fill relative flex h-full w-full min-h-0 flex-col overflow-visible ${className}`.trim()
    : `pip-video-container group relative aspect-video ${
        compact ? 'pip-video-container--compact' : ''
      } ${className}`.trim()

  const innerShellClass = isFill
    ? `relative flex min-h-0 flex-1 w-full flex-col overflow-hidden ${mediaSurfaceClass} ring-1 ${accentRing} transition-opacity duration-200 ease-in ${
        hasMedia ? 'opacity-100' : 'opacity-90'
      } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : ''} ${
        dragSourceActive ? 'pip-drag-source--active' : ''
      } ${dragSourceArming ? 'pip-drag-source--arming' : ''}`
    : `relative z-0 h-full w-full overflow-hidden rounded-xl border-[0.5px] ${mediaSurfaceClass} shadow-lg shadow-black/50 ring-1 transition-opacity duration-200 ease-in ${accentRing} ${
        hasMedia ? 'opacity-100' : 'opacity-90'
      } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : 'border-white/10'} ${
        dragSourceActive ? 'pip-drag-source--active' : ''
      } ${dragSourceArming ? 'pip-drag-source--arming' : ''}`

  const orientWrapperClass = isFill
    ? 'relative flex min-h-0 flex-1 w-full flex-col overflow-visible'
    : 'ui-orient-spin relative h-full w-full'

  const mediaStageClass = isFill
    ? 'relative min-h-0 flex-1 w-full overflow-hidden'
    : 'relative h-full w-full overflow-hidden rounded-xl'

  return (
    <div className={shellClass}>
      {variant === 'benchmark' && onUpload && (
        <input
          type="file"
          accept="video/*, audio/*, audio/mpeg, audio/mp4, .mp3, .m4a, .wav"
          id="benchmark-upload"
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      )}

      <div className={orientWrapperClass}>
      <div className={innerShellClass}>
        {!compact && (
          <span
            className={`pointer-events-none absolute z-10 max-w-[calc(100%-3rem)] truncate whitespace-nowrap rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${badgeClass} ${
              isFill ? 'px-2 py-0.5 text-[10px]' : ''
            }`}
            style={{ top: chromeInset, left: pillLeft }}
          >
            {label}
          </span>
        )}

        <div ref={playbackStageRef} className={mediaStageClass}>
        {hasMedia ? (
          <>
              {!useNativePipPlayback && (
                <TakeVideoPlayer
                  filePath={filePath}
                  videoUrl={src ?? ''}
                  mimeType={mimeType}
                  videoRef={videoRef}
                  videoSourceKey={videoSourceKey}
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  loadingClassName={`absolute inset-0 h-full w-full ${isAudioMedia ? 'take-audio-surface' : 'bg-black'}`}
                  mirror={mirror}
                  recordingOrientation={recordingOrientation}
                  fit={playbackFit}
                  manualPlayOnly
                  audible={playbackAudible}
                />
              )}
              {(useNativePipPlayback || !isPlaying) && (
                <PipMediaPoster posterUrl={posterUrl} isAudio={isAudioMedia} />
              )}

            {!compact && onExpand && (
              dragSourceProps ? (
                <div
                  role="button"
                  tabIndex={0}
                  className="pip-drag-layer absolute inset-0 z-[1] cursor-grab touch-none select-none border-0 bg-transparent p-0 active:cursor-grabbing"
                  aria-label={`Hold then drag ${label} to Best Take, or tap to open full screen`}
                  {...dragSourceProps}
                />
              ) : (
                <Pressable
                  type="button"
                  intensity="soft"
                  squish={false}
                  haptic="light"
                  className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0"
                  onClick={handleVideoAreaClick}
                  aria-label={`Open ${label} in full screen`}
                />
              )
            )}

            <div className="absolute inset-0 z-[5] pointer-events-none">
              {!suspendPlayback && (
              <Pressable
                type="button"
                intensity="icon"
                squish={false}
                haptic="light"
                onPointerDown={stopEventBubble}
                onTouchStart={stopEventBubble}
                onTouchEnd={stopEventBubble}
                onClick={handlePlayPauseClick}
                className={pipPlayButtonClass}
                aria-label={isPlaying ? 'Pause inline preview' : 'Play inline preview'}
              >
                <span className={pipTouchIconClass}>
                  {isPlaying ? (
                    <Pause className="h-3 w-3 fill-white" />
                  ) : (
                    <Play className="h-3 w-3 fill-white" />
                  )}
                </span>
              </Pressable>
              )}
            </div>

            {!compact && !suspendPlayback && (
            <div
              className={`absolute inset-x-0 bottom-0 z-20 translate-y-full px-2 py-1 transition-transform duration-200 group-hover:translate-y-0 ${
                isAudioMedia ? 'take-audio-controls-bar' : 'bg-black/70'
              }`}
              onClick={(e) => e.stopPropagation()}
              {...touchBubbleBlockProps()}
            >
              <MiniPipControls
                isPlaying={isPlaying}
                volume={volume}
                onPlayPauseClick={handlePlayPauseClick}
                onVolumeChange={handleVolume}
              />
            </div>
            )}
          </>
        ) : compact ? (
          <div className="compact-take-card__empty absolute inset-0 flex items-center justify-center">
            <span aria-hidden>—</span>
          </div>
        ) : (
          <div className="pip-empty-state absolute inset-0 flex flex-col px-2 pb-2 pt-6">
            <div className="pip-empty-state__body flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
              <p className="text-center text-[8px] leading-snug text-white/50">
                {emptyMessage}
              </p>
              {variant === 'benchmark' && onUpload && (
                <label htmlFor="benchmark-upload" className={emptyUploadClass}>
                  <Upload className="h-3 w-3" />
                  Upload Best Take
                </label>
              )}
            </div>
          </div>
        )}
        </div>

        {!compact && showPinAsBest && onPinAsBest && !isFill && (
          <Pressable
            type="button"
            intensity="icon"
            squish={false}
            onPointerDown={stopEventBubble}
            onTouchStart={stopEventBubble}
            onTouchEnd={stopEventBubble}
            onClick={(e) => {
              e.stopPropagation()
              onPinAsBest()
            }}
            className={`${HUD_GLASS_FLOAT_BADGE} hud-glass-badge--gold pip-chrome-btn pip-chrome-btn--corner pip-chrome-btn--top-left pip-chrome-btn--pin-best`}
            aria-label="Pin current take as Best Take"
            title="Pin as Best Take"
          >
            <Pin className="h-3.5 w-3.5" />
          </Pressable>
        )}

        {!compact && hasMedia && !isFill && (
          <Pressable
            type="button"
            intensity="icon"
            squish={false}
            haptic="light"
            onPointerDown={stopEventBubble}
            onTouchStart={stopEventBubble}
            onTouchEnd={stopEventBubble}
            onClick={(e) => {
              e.stopPropagation()
              onUnpin()
            }}
            className={`${HUD_GLASS_FLOAT_BADGE} pip-chrome-btn pip-chrome-btn--corner pip-chrome-btn--top-right pip-chrome-btn--clear`}
            aria-label={`Unload ${label}`}
          >
            <X className="h-3 w-3" />
          </Pressable>
        )}
      </div>

      {isFill && showPinAsBest && onPinAsBest && (
        <Pressable
          type="button"
          intensity="icon"
          squish={false}
          onPointerDown={stopEventBubble}
          onTouchStart={stopEventBubble}
          onTouchEnd={stopEventBubble}
          onClick={(e) => {
            e.stopPropagation()
            onPinAsBest()
          }}
          className={`${HUD_GLASS_FLOAT_BADGE} hud-glass-badge--gold pip-chrome-btn pip-chrome-btn--corner pip-chrome-btn--bottom-left pip-chrome-btn--pin-best`}
          aria-label="Pin current take as Best Take"
          title="Pin as Best Take"
        >
          <Pin className="h-3.5 w-3.5" />
        </Pressable>
      )}

      {isFill && hasMedia && (
        <Pressable
          type="button"
          intensity="icon"
          haptic="light"
          onPointerDown={stopEventBubble}
          onTouchStart={stopEventBubble}
          onTouchEnd={stopEventBubble}
          onClick={(e) => {
            e.stopPropagation()
            onUnpin()
          }}
          className={`${HUD_GLASS_FLOAT_BADGE} pip-chrome-btn pip-chrome-btn--corner pip-chrome-btn--top-right pip-chrome-btn--clear`}
          aria-label={`Unload ${label}`}
        >
          <X className="h-3 w-3" />
        </Pressable>
      )}

      {showUploadBadge && (
        <label
          htmlFor="benchmark-upload"
          onPointerDown={stopEventBubble}
          onTouchStart={stopEventBubble}
          onTouchEnd={stopEventBubble}
          onClick={stopEventBubble}
          className={HUD_GLASS_FLOAT_BADGE}
          style={{ top: exteriorUploadInset, left: exteriorUploadInset }}
          aria-label="Upload best take media"
        >
          <Upload className="h-3 w-3" />
        </label>
      )}
      </div>
    </div>
  )
}

export default memo(PipWindow)
