import { Play, X } from 'lucide-react'
import { useVideoPlayback } from '../hooks/useVideoPlayback'
import { mobileVideoProps } from '../utils/mobileVideo'
import MiniPipControls from './MiniPipControls'

interface PipWindowProps {
  src: string | null
  label: string
  takeName?: string
  variant: 'benchmark' | 'challenger'
  emptyMessage: string
  autoPlay?: boolean
  onUnpin: () => void
  onExpand?: () => void
  className?: string
}

export default function PipWindow({
  src,
  label,
  takeName,
  variant,
  emptyMessage,
  autoPlay = false,
  onUnpin,
  onExpand,
  className = '',
}: PipWindowProps) {
  const { videoRef, isPlaying, volume, togglePlay, handleVolume } =
    useVideoPlayback(src)

  const accentRing =
    variant === 'benchmark' ? 'ring-amber-400/50' : 'ring-sky-400/50'
  const badgeClass =
    variant === 'benchmark'
      ? 'bg-amber-400/90 text-white'
      : 'bg-sky-500/90 text-white'

  return (
    <div
      className={`group w-32 overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow-lg shadow-black/50 ring-1 backdrop-blur-md sm:w-36 ${accentRing} ${className}`}
    >
      <div className="flex items-center justify-between px-2 py-1">
        <span
          className={`rounded px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${badgeClass}`}
        >
          {label}
        </span>
        {src && (
          <button
            type="button"
            onClick={(e) => {
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
            <video
              ref={videoRef}
              src={src}
              className="h-full w-full object-cover"
              {...mobileVideoProps}
              preload="metadata"
              muted={false}
              controls={false}
              onLoadedData={() => {
                if (!autoPlay) return
                const video = videoRef.current
                if (!video) return
                video.muted = false
                void video.play()
              }}
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
          <div className="flex h-full items-center justify-center px-2">
            <p className="text-center text-[8px] leading-snug text-white/50">
              {emptyMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
