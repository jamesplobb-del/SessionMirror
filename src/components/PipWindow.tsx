import { memo, useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type PointerEvent } from 'react'
import { Pause, Play, Upload, X } from 'lucide-react'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import { stopEventBubble, touchBubbleBlockProps } from '../utils/eventBubbling'

import type { Take } from '../types'

interface PipWindowProps {
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
}

const FLOAT_BADGE =
  'pointer-events-auto absolute z-30 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:bg-black/90'

function PipWindow({
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
  className = '',
  dropHighlight = false,
  dragSourceActive = false,
  dragSourceArming = false,
  dragSourceProps,
  onPlaybackChange,
}: PipWindowProps) {
  const videoSourceKey = src || filePath || 'empty'
  const internalVideoRef = useRef<HTMLMediaElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)

  const showUploadBadge = variant === 'benchmark' && Boolean(onUpload) && Boolean(src)
  const pillLeft = showUploadBadge ? 32 : 8

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
    (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      stopEventBubble(event)
      if (suspendPlayback) return
      const video = videoRef.current
      if (!video) return

      if (video.paused) {
        video.muted = false
        video.volume = 1
        void video.play()
        setIsPlaying(true)
      } else {
        video.pause()
        video.muted = true
        setIsPlaying(false)
      }
    },
    [suspendPlayback, videoRef],
  )

  const handleVolume = useCallback(
    (value: number) => {
      const video = videoRef.current
      if (!video) return
      video.volume = value
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

  return (
    <div
      className={`pip-video-container group relative aspect-video w-[9rem] min-h-[5.0625rem] min-w-[9rem] sm:w-[10rem] sm:min-h-[5.625rem] sm:min-w-[10rem] ${className}`}
    >
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

      <div className="ui-orient-spin relative h-full w-full">
      <div
        className={`relative z-0 h-full w-full overflow-hidden rounded-xl border bg-stone-900/95 shadow-lg shadow-black/50 ring-1 transition-[opacity,box-shadow,transform,border-color] duration-200 ease-in ${accentRing} ${
          src ? 'opacity-100' : 'opacity-90'
        } ${dropHighlight ? 'pip-drop-target--active border-amber-400/80' : 'border-white/15'} ${
          dragSourceActive ? 'pip-drag-source--active' : ''
        } ${dragSourceArming ? 'pip-drag-source--arming' : ''}`}
      >
        <span
          className={`pointer-events-none absolute z-10 max-w-[calc(100%-3rem)] truncate rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider whitespace-nowrap ${badgeClass}`}
          style={{ top: 4, left: pillLeft }}
        >
          {label}
        </span>

        {src ? (
          <>
            <TakeVideoPlayer
              filePath={filePath}
              videoUrl={src}
              mimeType={mimeType}
              videoRef={videoRef}
              videoSourceKey={videoSourceKey}
              className="absolute inset-0 h-full w-full object-cover pointer-events-none"
              loadingClassName="absolute inset-0 h-full w-full bg-stone-900"
              mirror={mirror}
              recordingOrientation={recordingOrientation}
              controls={false}
              manualPlayOnly
              eagerLoad
              preload="auto"
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

      {src && (
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
          style={{ bottom: -12, left: -12 }}
          aria-label={`Unload ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      </div>
    </div>
  )
}

export default memo(PipWindow)
