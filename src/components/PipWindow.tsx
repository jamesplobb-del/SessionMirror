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

export default function PipWindow({
  src,
  filePath = '',
  mimeType = 'video/mp4',
  label,
  takeName,
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

  const pipHeaderIconWrap =
    'flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white/80'
  const pipHeaderTouchBtn =
    'pointer-events-auto absolute top-0 z-20 flex min-h-11 min-w-11 items-center justify-center p-3'

  const accentRing =
    variant === 'benchmark' ? 'ring-amber-400/50' : 'ring-sky-400/50'
  const badgeClass =
    variant === 'benchmark'
      ? 'bg-amber-400/90 text-white'
      : 'bg-sky-500/90 text-white'

  return (
    <div
      className={`group w-32 overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow-lg shadow-black/50 ring-1 backdrop-blur-md transition-opacity duration-200 ease-in sm:w-36 ${accentRing} ${src ? 'opacity-100' : 'opacity-90'} ${className}`}
    >
      <div className="relative flex min-h-11 items-center justify-center px-11 py-0.5">
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
            className={`${pipHeaderTouchBtn} left-0`}
            aria-label="Upload best take video"
          >
            <span className={pipHeaderIconWrap}>
              <Upload className="h-3 w-3" />
            </span>
          </label>
        )}
        <span
          className={`rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${badgeClass}`}
        >
          {label}
        </span>
        {src && (
          <button
            type="button"
            onClick={(e) => {
              blockTouchBubble(e)
              onUnpin()
            }}
            {...touchBubbleBlockProps()}
            className={`${pipHeaderTouchBtn} right-0`}
            aria-label={`Unload ${label}`}
          >
            <span className={pipHeaderIconWrap}>
              <X className="h-3 w-3" />
            </span>
          </button>
        )}
      </div>

      <div className="relative aspect-video bg-black/30">
        {src ? (
          <>
            <TakeVideoPlayer
              filePath={filePath}
              videoUrl={src}
              mimeType={mimeType}
              videoRef={videoRef}
              videoSourceKey={videoSourceKey}
              className="h-full w-full object-cover pointer-events-none"
              loadingClassName="h-full w-full bg-black/30"
              mirror={mirror}
              controls={false}
              manualPlayOnly
            />

            <div className="absolute inset-0 z-20 pointer-events-none">
              {onExpand && (
                <button
                  type="button"
                  onPointerDown={blockTouchBubble}
                  onTouchStart={blockTouchBubble}
                  onClick={handleExpand}
                  onTouchEnd={handleExpand}
                  className="pointer-events-auto absolute bottom-0 right-0 z-30 flex min-h-11 min-w-11 items-center justify-center p-3"
                  aria-label={`Expand ${label} to full screen`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70">
                    <Maximize2 className="h-3 w-3" />
                  </span>
                </button>
              )}

              <button
                type="button"
                onPointerDown={stopEventBubble}
                onTouchStart={stopEventBubble}
                onTouchEnd={stopEventBubble}
                onClick={handlePlayPauseClick}
                className="pointer-events-auto absolute left-1/2 top-1/2 z-30 flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center p-3"
                aria-label={isPlaying ? 'Pause inline preview' : 'Play inline preview'}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70">
                  {isPlaying ? (
                    <Pause className="h-3 w-3 fill-white" />
                  ) : (
                    <Play className="h-3 w-3 fill-white" />
                  )}
                </span>
              </button>
            </div>

            {takeName && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5] bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4">
                <p className="truncate text-[9px] font-medium text-white">{takeName}</p>
              </div>
            )}

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
          <div className="flex h-full flex-col items-center justify-center gap-2 px-2">
            <p className="text-center text-[8px] leading-snug text-white/50">
              {emptyMessage}
            </p>
            {variant === 'benchmark' && onUpload && (
              <label
                htmlFor="benchmark-upload"
                className="pointer-events-auto flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-[9px] font-medium text-amber-100 transition hover:bg-amber-400/25"
              >
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
