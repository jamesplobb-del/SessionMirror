import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react'
import { Maximize2, Pause, Play, Upload, X } from 'lucide-react'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import { blockTouchBubble, stopEventBubble, touchBubbleBlockProps } from '../utils/eventBubbling'

interface PipWindowProps {
  src: string | null
  filePath?: string
  mimeType?: string
  label: string
  takeName?: string
  variant: 'benchmark' | 'challenger'
  emptyMessage: string
  mirror?: boolean
  suspendPlayback?: boolean
  videoRef?: React.RefObject<HTMLVideoElement | null>
  onUnpin: () => void
  onExpand?: () => void
  onUpload?: (file: File) => void
  className?: string
}

const FLOAT_BADGE =
  'pointer-events-auto absolute z-10 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/75 text-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] backdrop-blur-md transition hover:bg-black/90'

export default function PipWindow({
  src,
  filePath = '',
  mimeType = 'video/mp4',
  label,
  takeName: _takeName,
  variant,
  emptyMessage,
  mirror = true,
  suspendPlayback: _suspendPlayback = false,
  videoRef: externalVideoRef,
  onUnpin,
  onExpand,
  onUpload,
  className = '',
}: PipWindowProps) {
  const videoSourceKey = src || filePath || 'empty'
  const internalVideoRef = useRef<HTMLVideoElement>(null)
  const videoRef = externalVideoRef ?? internalVideoRef
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    setIsPlaying(false)
  }, [videoSourceKey])

  const handlePlayPauseClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      stopEventBubble(event)
      const video = videoRef.current
      if (!video) return

      if (video.paused) {
        video.muted = false
        void video.play()
        setIsPlaying(true)
      } else {
        video.pause()
        video.muted = true
        setIsPlaying(false)
      }
    },
    [videoRef],
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

  const handleExpand = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      blockTouchBubble(event)
      onExpand?.()
    },
    [onExpand],
  )

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
      className={`pip-video-container group relative aspect-video w-32 sm:w-36 ${className}`}
    >
      {variant === 'benchmark' && onUpload && (
        <input
          type="file"
          accept="video/*"
          id="benchmark-upload"
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden
          tabIndex={-1}
        />
      )}

      {variant === 'benchmark' && onUpload && src && (
        <label
          htmlFor="benchmark-upload"
          {...touchBubbleBlockProps()}
          className={FLOAT_BADGE}
          style={{ top: -12, left: -12 }}
          aria-label="Upload best take video"
        >
          <Upload className="h-3 w-3" />
        </label>
      )}

      {src && (
        <button
          type="button"
          onClick={(e) => {
            blockTouchBubble(e)
            onUnpin()
          }}
          {...touchBubbleBlockProps()}
          className={FLOAT_BADGE}
          style={{ top: -12, right: -12 }}
          aria-label={`Unload ${label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}

      <div
        className={`relative h-full w-full overflow-hidden rounded-xl border border-white/15 bg-stone-900 shadow-lg shadow-black/50 ring-1 backdrop-blur-md transition-opacity duration-200 ease-in ${accentRing} ${src ? 'opacity-100' : 'opacity-90'}`}
      >
        <span
          className={`pointer-events-none absolute z-10 max-w-[calc(100%-3rem)] truncate rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider whitespace-nowrap ${badgeClass}`}
          style={{ top: 8, left: 8 }}
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
              controls={false}
              manualPlayOnly
            />

            {onExpand && (
              <button
                type="button"
                onPointerDown={blockTouchBubble}
                onTouchStart={blockTouchBubble}
                onClick={handleExpand}
                onTouchEnd={handleExpand}
                className="pointer-events-auto absolute z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-[0_2px_8px_rgba(0,0,0,0.45)] backdrop-blur-sm transition hover:bg-black/90"
                style={{ top: 8, right: 8 }}
                aria-label={`Expand ${label} to full screen`}
              >
                <Maximize2 className="h-3 w-3" />
              </button>
            )}

            <div className="absolute inset-0 z-[5] pointer-events-none">
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
            </div>

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
          </>
        ) : (
          <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 bg-stone-800/90 px-2">
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
        )}
      </div>
    </div>
  )
}
