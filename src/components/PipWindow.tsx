import { useCallback, useEffect, type ChangeEvent } from 'react'
import { Maximize2, Pause, Play, Upload, X } from 'lucide-react'
import { useVideoPlayback } from '../hooks/useVideoPlayback'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import { blockTouchBubble, touchBubbleBlockProps } from '../utils/eventBubbling'
import { resetVideoPlayback, purgeVideoElement } from '../utils/videoPlayback'

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
  suspendPlayback = false,
  videoRef: externalVideoRef,
  onUnpin,
  onExpand,
  onUpload,
  className = '',
}: PipWindowProps) {
  const playbackKey = `${filePath}|${src ?? ''}`
  const internalPlayback = useVideoPlayback(playbackKey, externalVideoRef)
  const videoRef = internalPlayback.videoRef
  const { isPlaying, volume, handleVolume } = internalPlayback

  useEffect(() => {
    resetVideoPlayback(videoRef.current)
  }, [playbackKey, videoRef])

  useEffect(() => {
    if (suspendPlayback || !src) {
      resetVideoPlayback(videoRef.current)
    }
  }, [suspendPlayback, src, playbackKey, videoRef])

  useEffect(() => {
    return () => {
      purgeVideoElement(videoRef.current)
    }
  }, [playbackKey, videoRef])

  const runInlinePlayToggle = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      video.muted = false
      void video.play()
    } else {
      video.pause()
    }
  }, [videoRef])

  const toggleInlinePlay = useCallback(
    (event: React.MouseEvent | React.TouchEvent) => {
      blockTouchBubble(event)
      runInlinePlayToggle()
    },
    [runInlinePlayToggle],
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

  const uploadLabelClass =
    variant === 'benchmark' && !src
      ? 'pointer-events-auto flex cursor-pointer items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-[8px] font-medium text-amber-100 transition hover:bg-amber-400/25'
      : 'relative z-10 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white'

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
      <div className="flex items-center justify-between px-2 py-1">
        <span
          className={`rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${badgeClass}`}
        >
          {label}
        </span>
        <div className="flex items-center gap-1">
          {variant === 'benchmark' && onUpload && (
            <>
              <input
                type="file"
                accept="video/*"
                id="benchmark-upload"
                onChange={handleFileChange}
                className="sr-only"
                aria-hidden
                tabIndex={-1}
              />
              {src && (
                <label
                  htmlFor="benchmark-upload"
                  {...touchBubbleBlockProps()}
                  className={uploadLabelClass}
                  aria-label="Upload benchmark video"
                >
                  <Upload className="h-2.5 w-2.5" />
                </label>
              )}
            </>
          )}
          {src && (
            <button
              type="button"
              onClick={(e) => {
                blockTouchBubble(e)
                onUnpin()
              }}
              {...touchBubbleBlockProps()}
              className="relative z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
              aria-label={`Unload ${label}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>

      <div className="relative aspect-video bg-black/30">
        {src ? (
          <>
            <TakeVideoPlayer
              key={playbackKey}
              filePath={filePath}
              videoUrl={src}
              mimeType={mimeType}
              videoRef={videoRef}
              className="h-full w-full object-cover pointer-events-none"
              loadingClassName="h-full w-full bg-black/30"
              mirror={mirror}
              controls={false}
            />

            <div className="absolute inset-0 z-10 pointer-events-none">
              {onExpand && (
                <button
                  type="button"
                  onPointerDown={blockTouchBubble}
                  onTouchStart={blockTouchBubble}
                  onClick={handleExpand}
                  onTouchEnd={handleExpand}
                  className="pointer-events-auto absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70"
                  aria-label={`Expand ${label} to full screen`}
                >
                  <Maximize2 className="h-3 w-3" />
                </button>
              )}

              <button
                type="button"
                onPointerDown={blockTouchBubble}
                onTouchStart={blockTouchBubble}
                onClick={toggleInlinePlay}
                onTouchEnd={toggleInlinePlay}
                className="pointer-events-auto absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white/90 backdrop-blur-sm transition hover:bg-black/70"
                aria-label={isPlaying ? 'Pause inline preview' : 'Play inline preview'}
              >
                {isPlaying ? (
                  <Pause className="h-3 w-3 fill-white" />
                ) : (
                  <Play className="h-3 w-3 fill-white" />
                )}
              </button>
            </div>

            {takeName && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-[5] bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4">
                <p className="truncate text-[9px] font-medium text-white pl-7">{takeName}</p>
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
                onTogglePlay={runInlinePlayToggle}
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
              <label htmlFor="benchmark-upload" className={uploadLabelClass}>
                <Upload className="h-3 w-3" />
                Upload Benchmark
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
