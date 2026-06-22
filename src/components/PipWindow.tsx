import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from 'react'
import { Pause, Play, Pin, Upload, X } from 'lucide-react'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import { stopEventBubble, touchBubbleBlockProps } from '../utils/eventBubbling'
import { waitForMediaReadyWithRetry } from '../utils/mediaPlayback'
import {
  playTakeMediaMuted,
  releaseTakePlaybackAudio,
} from '../utils/takePlaybackAudio'
import { toggleInlineTakePlayback } from '../utils/takeInlinePlayback'
import { updateTakePlaybackSpeakerGain } from '../utils/takePlaybackSpeaker'
import type { Take } from '../types'

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
  recordingOrientation?: Take['recordingOrientation']
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
}

const FLOAT_BADGE =
  'pointer-events-auto absolute z-30 flex h-7 w-7 items-center justify-center rounded-full border-[0.5px] border-white/10 bg-black/40 text-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] backdrop-blur-2xl transition hover:bg-black/60'

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
    if ('muted' in media) media.muted = true
    setIsPlaying(false)
  }, [suspendPlayback, videoRef, videoSourceKey])

  const handlePlayPauseClick = useCallback(
    (event: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      if (suspendPlayback) return
      const video = videoRef.current
      if (!video) return

      if (video.paused) {
        video.setAttribute('data-debug-playback-tag', `pip-${variant}`)
        setIsPlaying(true)
        toggleInlineTakePlayback(video, {
          onPlaying: () => setIsPlaying(true),
          onFailure: () => {
            setIsPlaying(false)
            void releaseTakePlaybackAudio()
          },
        })
      } else {
        toggleInlineTakePlayback(video, {
          onPaused: () => {
            setIsPlaying(false)
            void releaseTakePlaybackAudio()
          },
        })
      }
    },
    [suspendPlayback, variant, videoRef],
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

      const started = await playTakeMediaMuted(media, {
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
    'pointer-events-auto flex cursor-pointer items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-[8px] font-medium text-amber-100 transition hover:bg-amber-400/25'

  const pipTouchTargetClass =
    'pointer-events-auto z-[5] flex min-h-11 min-w-11 items-center justify-center p-3'
  const pipTouchIconClass =
    'flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70'

  const accentRing =
    variant === 'benchmark' ? 'ring-amber-400/50' : 'ring-sky-400/50'
  const badgeClass =
    variant === 'benchmark'
      ? 'bg-amber-400/90 text-white'
      : 'bg-sky-500/90 text-white'

  const chromeInset = isFill ? 8 : 4

  const shellClass = isFill
    ? `pip-window--fill relative flex h-full w-full min-h-0 flex-col overflow-hidden ${className}`.trim()
    : `pip-video-container group relative aspect-video ${className}`.trim()

  const innerShellClass = isFill
    ? `relative flex min-h-0 flex-1 w-full flex-col overflow-hidden bg-black/95 ring-1 ${accentRing} transition-[opacity,box-shadow,transform,border-color] duration-200 ease-in ${
        hasMedia ? 'opacity-100' : 'opacity-90'
      } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : ''} ${
        dragSourceActive ? 'pip-drag-source--active' : ''
      } ${dragSourceArming ? 'pip-drag-source--arming' : ''}`
    : `relative z-0 h-full w-full overflow-hidden rounded-xl border-[0.5px] bg-black/95 shadow-lg shadow-black/50 ring-1 transition-[opacity,box-shadow,transform,border-color] duration-200 ease-in ${accentRing} ${
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
              fit="cover"
              manualPlayOnly
              audible={playbackAudible}
            />

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
                <button
                  type="button"
                  className="absolute inset-0 z-[1] cursor-pointer border-0 bg-transparent p-0"
                  onClick={handleVideoAreaClick}
                  aria-label={`Open ${label} in full screen`}
                />
              )
            )}

            <div className="absolute inset-0 z-[5] pointer-events-none">
              {!suspendPlayback && (
              <button
                type="button"
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
              </button>
              )}
            </div>

            {!suspendPlayback && (
            <div
              className="absolute inset-x-0 bottom-0 z-20 translate-y-full bg-black/60 px-2 py-1 backdrop-blur-md transition-transform duration-200 group-hover:translate-y-0"
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
          <div className="absolute inset-0 flex flex-col bg-stone-800/90 px-2 pb-2 pt-6">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
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
          <button
            type="button"
            onPointerDown={stopEventBubble}
            onTouchStart={stopEventBubble}
            onTouchEnd={stopEventBubble}
            onClick={(e) => {
              e.stopPropagation()
              onPinAsBest()
            }}
            className={`${FLOAT_BADGE} border-amber-300/40 bg-amber-500/90 hover:bg-amber-500`}
            style={{ top: chromeInset, left: chromeInset }}
            aria-label="Pin current take as Best Take"
            title="Pin as Best Take"
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
        )}

        {hasMedia && !isFill && (
          <button
            type="button"
            onPointerDown={stopEventBubble}
            onTouchStart={stopEventBubble}
            onTouchEnd={stopEventBubble}
            onClick={(e) => {
              e.stopPropagation()
              onUnpin()
            }}
            className={FLOAT_BADGE}
            style={{ top: chromeInset, right: chromeInset }}
            aria-label={`Unload ${label}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {isFill && showPinAsBest && onPinAsBest && (
        <button
          type="button"
          onPointerDown={stopEventBubble}
          onTouchStart={stopEventBubble}
          onTouchEnd={stopEventBubble}
          onClick={(e) => {
            e.stopPropagation()
            onPinAsBest()
          }}
          className={`${FLOAT_BADGE} border-amber-300/40 bg-amber-500/90 hover:bg-amber-500`}
          style={{ top: -10, left: -10 }}
          aria-label="Pin current take as Best Take"
          title="Pin as Best Take"
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
      )}

      {isFill && hasMedia && (
        <button
          type="button"
          onPointerDown={stopEventBubble}
          onTouchStart={stopEventBubble}
          onTouchEnd={stopEventBubble}
          onClick={(e) => {
            e.stopPropagation()
            onUnpin()
          }}
          className={FLOAT_BADGE}
          style={{ top: -10, right: -10 }}
          aria-label={`Unload ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {showUploadBadge && (
        <label
          htmlFor="benchmark-upload"
          onPointerDown={stopEventBubble}
          onTouchStart={stopEventBubble}
          onTouchEnd={stopEventBubble}
          onClick={stopEventBubble}
          className={FLOAT_BADGE}
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
