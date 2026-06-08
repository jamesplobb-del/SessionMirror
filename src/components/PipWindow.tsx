import { useEffect, useRef } from 'react'
import { Play, Upload, X } from 'lucide-react'
import { useVideoPlayback } from '../hooks/useVideoPlayback'
import TakeVideoPlayer from './TakeVideoPlayer'
import MiniPipControls from './MiniPipControls'
import { resetVideoPlayback } from '../utils/videoPlayback'

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
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const playbackKey = `${filePath}|${src ?? ''}`
  const internalPlayback = useVideoPlayback(playbackKey, externalVideoRef)
  const videoRef = internalPlayback.videoRef
  const { isPlaying, volume, togglePlay, handleVolume } = internalPlayback

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
      resetVideoPlayback(videoRef.current)
    }
  }, [playbackKey, videoRef])

  const accentRing =
    variant === 'benchmark' ? 'ring-amber-400/50' : 'ring-sky-400/50'
  const badgeClass =
    variant === 'benchmark'
      ? 'bg-amber-400/90 text-white'
      : 'bg-sky-500/90 text-white'

  const handleUploadChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && onUpload) {
      onUpload(file)
    }
  }

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
                ref={uploadInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleUploadChange}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  uploadInputRef.current?.click()
                }}
                className="relative z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
                aria-label="Upload benchmark video"
              >
                <Upload className="h-2.5 w-2.5" />
              </button>
            </>
          )}
          {src && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onUnpin()
              }}
              className="relative z-10 flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
              aria-label={`Unload ${label}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      </div>

      <div
        className={`relative aspect-video bg-black/30 ${src && onExpand ? 'cursor-pointer' : ''}`}
        onClick={src && onExpand ? onExpand : undefined}
        onKeyDown={
          src && onExpand
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onExpand()
                }
              }
            : undefined
        }
        role={src && onExpand ? 'button' : undefined}
        tabIndex={src && onExpand ? 0 : undefined}
        aria-label={src && onExpand ? `Expand ${label} to full screen` : undefined}
      >
        {src ? (
          <>
            <TakeVideoPlayer
              key={playbackKey}
              filePath={filePath}
              videoUrl={src}
              mimeType={mimeType}
              videoRef={videoRef}
              className="h-full w-full object-cover"
              loadingClassName="h-full w-full bg-black/30"
              mirror={mirror}
              controls={false}
            />
            {onExpand && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70 transition-opacity group-hover:opacity-0">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
                  <Play className="h-3 w-3 fill-white text-white" />
                </div>
              </div>
            )}
            {takeName && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1 pt-4">
                <p className="truncate text-[9px] font-medium text-white">{takeName}</p>
              </div>
            )}
            <div
              className="absolute inset-x-0 bottom-0 translate-y-full bg-black/60 px-2 py-1 backdrop-blur-md transition-transform duration-200 group-hover:translate-y-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MiniPipControls
                isPlaying={isPlaying}
                volume={volume}
                onTogglePlay={togglePlay}
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
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  uploadInputRef.current?.click()
                }}
                className="pointer-events-auto flex items-center gap-1 rounded-md border border-amber-400/40 bg-amber-400/15 px-2 py-1 text-[8px] font-medium text-amber-100 transition hover:bg-amber-400/25"
              >
                <Upload className="h-3 w-3" />
                Upload Benchmark
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
