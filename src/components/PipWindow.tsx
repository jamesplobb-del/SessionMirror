import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from 'react'
import { Pause, Play, Pin, Upload, X } from 'lucide-react'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import Pressable from './ui/Pressable'
import { stopEventBubble, touchBubbleBlockProps } from '../utils/eventBubbling'
import { waitForMediaReadyWithRetry } from '../utils/mediaPlayback'
import {
  finalizeTakePlaybackCleanup,
  playTakeMediaAudible,
} from '../utils/takePlaybackAudio'
import { toggleInlineTakePlayback } from '../utils/takeInlinePlayback'
import { updateTakePlaybackSpeakerGain } from '../utils/takePlaybackSpeaker'
import { usePipInlineDecoder } from '../hooks/usePipInlineDecoder'
import type { RecordingOrientation } from '../utils/physicalOrientation'
import { HUD_GLASS_FLOAT_BADGE, HUD_GLASS_PIP_PLAY_ICON } from '../utils/interactiveUx'

interface PipWindowProps {
  layout?: 'pip' | 'fill'
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
}

function PipMediaPoster({ posterUrl }: { posterUrl?: string | null }) {
  return (
    <div className="absolute inset-0 h-full w-full bg-black" aria-hidden>
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
}: PipWindowProps) {
  const videoSourceKey = src || filePath || 'empty'
  const internalVideoRef = useRef<HTMLMediaElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const autoPlaySessionRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)

  const hasMedia = Boolean(src || filePath)
  const showUploadBadge = variant === 'benchmark' && Boolean(onUpload) && hasMedia
  const isFill = layout === 'fill'
  const pillLeft = showUploadBadge || showPinAsBest ? 32 : 8
  const isAutoPlayArmed = Boolean(
    autoPlayRequestId && takeId && autoPlayRequestId === takeId,
  )
  const { decoderActive, pendingPlayRef, requestDecoderForPlay } = usePipInlineDecoder({
    suspendPlayback,
    isAutoPlayArmed,
    isPlaying,
    videoSourceKey,
  })
  const playbackAudible = (isAutoPlayArmed || isPlaying) && !suspendPlayback

  useEffect(() => {
    setIsPlaying(false)
  }, [videoSourceKey, suspendPlayback])

  useEffect(() => {
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
  }, [videoRef, videoSourceKey])

  useEffect(() => {
    onPlaybackChange?.(isPlaying)
  }, [isPlaying, onPlaybackChange])

  useEffect(() => {
    if (!suspendPlayback) return
    const media = videoRef.current
    if (!media) return
    media.pause()
    setIsPlaying(false)
  }, [suspendPlayback, videoRef, videoSourceKey])

  const handlePlayPauseClick = useCallback(
    (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      if (suspendPlayback) return

      if (!decoderActive) {
        requestDecoderForPlay()
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
            void finalizeTakePlaybackCleanup()
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
    [decoderActive, requestDecoderForPlay, suspendPlayback, variant, videoRef],
  )

  useEffect(() => {
    if (!decoderActive || !pendingPlayRef.current || suspendPlayback) return

    let cancelled = false
    void (async () => {
      const media = videoRef.current
      if (!media) return

      const ready = await waitForMediaReadyWithRetry(media)
      if (cancelled || !pendingPlayRef.current) return
      pendingPlayRef.current = false
      if (!ready) return

      media.setAttribute('data-debug-playback-tag', `pip-${variant}`)
      setIsPlaying(true)
      toggleInlineTakePlayback(media, {
        onPlaying: () => setIsPlaying(true),
        onFailure: () => {
          setIsPlaying(false)
          void finalizeTakePlaybackCleanup()
        },
      })
    })()

    return () => {
      cancelled = true
    }
  }, [decoderActive, pendingPlayRef, suspendPlayback, variant, videoRef, videoSourceKey])

  // Hands-free auto-playback — muted programmatic play (iOS allows muted autoplay).
  useEffect(() => {
    const wantsAutoPlay =
      Boolean(autoPlayRequestId) &&
      Boolean(takeId) &&
      autoPlayRequestId === takeId &&
      Boolean(src)

    if (!wantsAutoPlay || suspendPlayback || !decoderActive) {
      autoPlaySessionRef.current = false
      return
    }

    autoPlaySessionRef.current = true
    let cancelled = false

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
    onAutoPlayComplete,
    src,
    suspendPlayback,
    takeId,
    videoRef,
    videoSourceKey,
    decoderActive,
  ])

  const handleVolume = useCallback(
    (value: number) => {
      const video = videoRef.current
      if (!video) return
      video.volume = value
      updateTakePlaybackSpeakerGain(video, value, false)
      setVolume(value)
    },
    [videoRef],
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

  const pipTouchTargetClass =
    'pointer-events-auto z-[5] flex min-h-11 min-w-11 items-center justify-center p-3'
  const pipTouchIconClass = HUD_GLASS_PIP_PLAY_ICON

  const accentRing =
    variant === 'benchmark' ? 'ring-amber-400/50' : 'ring-sky-400/50'
  const badgeClass =
    variant === 'benchmark'
      ? 'bg-amber-400/90 text-white'
      : 'bg-sky-500/90 text-white'

  const chromeInset = isFill ? 8 : 4

  const shellClass = isFill
    ? `pip-window--fill relative flex h-full w-full min-h-0 flex-col overflow-visible ${className}`.trim()
    : `pip-video-container group relative aspect-video ${className}`.trim()

  const innerShellClass = isFill
    ? `relative flex min-h-0 flex-1 w-full flex-col overflow-hidden bg-black/95 ring-1 ${accentRing} transition-opacity duration-200 ease-in ${
        hasMedia ? 'opacity-100' : 'opacity-90'
      } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : ''} ${
        dragSourceActive ? 'pip-drag-source--active' : ''
      } ${dragSourceArming ? 'pip-drag-source--arming' : ''}`
    : `relative z-0 h-full w-full overflow-hidden rounded-xl border-[0.5px] bg-black/95 shadow-lg shadow-black/50 ring-1 transition-opacity duration-200 ease-in ${accentRing} ${
        hasMedia ? 'opacity-100' : 'opacity-90'
      } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : 'border-white/10'} ${
        dragSourceActive ? 'pip-drag-source--active' : ''
      } ${dragSourceArming ? 'pip-drag-source--arming' : ''}`

  const orientWrapperClass = isFill
    ? 'relative flex min-h-0 flex-1 w-full flex-col overflow-visible'
    : 'ui-orient-spin relative h-full w-full'

  const mediaStageClass = isFill
    ? 'relative min-h-0 flex-1 w-full'
    : 'relative h-full w-full'

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
        <span
          className={`pointer-events-none absolute z-10 max-w-[calc(100%-3rem)] truncate whitespace-nowrap rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${badgeClass} ${
            isFill ? 'px-2 py-0.5 text-[10px]' : ''
          }`}
          style={{ top: chromeInset, left: isFill ? pillLeft + (showPinAsBest ? 4 : 0) : pillLeft }}
        >
          {label}
        </span>

        <div className={mediaStageClass}>
        {hasMedia ? (
          <>
            {decoderActive ? (
              <TakeVideoPlayer
                filePath={filePath}
                videoUrl={src ?? ''}
                mimeType={mimeType}
                videoRef={videoRef}
                videoSourceKey={videoSourceKey}
                className="absolute inset-0 h-full w-full pointer-events-none"
                loadingClassName="absolute inset-0 h-full w-full bg-black"
                mirror={mirror}
                recordingOrientation={recordingOrientation}
                fit={playbackFit}
                manualPlayOnly
                audible={playbackAudible}
              />
            ) : (
              <PipMediaPoster posterUrl={posterUrl} />
            )}

            {onExpand && (
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
                className={`${pipTouchTargetClass} absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`}
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

            {!suspendPlayback && (
            <div
              className="absolute inset-x-0 bottom-0 z-20 translate-y-full bg-black/70 px-2 py-1 transition-transform duration-200 group-hover:translate-y-0"
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

        {showPinAsBest && onPinAsBest && !isFill && (
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
            className={`${HUD_GLASS_FLOAT_BADGE} hud-glass-badge--gold`}
            style={{ top: chromeInset, left: chromeInset }}
            aria-label="Pin current take as Best Take"
            title="Pin as Best Take"
          >
            <Pin className="h-3.5 w-3.5" />
          </Pressable>
        )}

        {hasMedia && !isFill && (
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
            className={HUD_GLASS_FLOAT_BADGE}
            style={{ top: chromeInset, right: chromeInset }}
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
          className={`${HUD_GLASS_FLOAT_BADGE} hud-glass-badge--gold`}
          style={{ top: -10, left: -10 }}
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
          className={HUD_GLASS_FLOAT_BADGE}
          style={{ top: -10, right: -10 }}
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
          style={{ top: -12, left: -12 }}
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
