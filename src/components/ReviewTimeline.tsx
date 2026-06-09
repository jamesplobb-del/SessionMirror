import type { RefObject } from 'react'
import { formatTime } from '../hooks/useVideoPlayback'

interface ReviewTimelineProps {
  trackRef: RefObject<HTMLDivElement | null>
  currentTime: number
  duration: number
  isScrubbing: boolean
  onScrubStart: () => void
  onScrub: (clientX: number) => void
  onScrubEnd: () => void
}

export default function ReviewTimeline({
  trackRef,
  currentTime,
  duration,
  isScrubbing,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: ReviewTimelineProps) {
  const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    onScrubStart()
    onScrub(e.clientX)
    trackRef.current?.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current?.hasPointerCapture(e.pointerId)) return
    e.preventDefault()
    e.stopPropagation()
    onScrub(e.clientX)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (trackRef.current?.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId)
    }
    e.stopPropagation()
    onScrubEnd()
  }

  return (
    <div
      className="pointer-events-auto w-full touch-none select-none bg-gradient-to-t from-black/35 via-transparent to-transparent px-5 pb-1 pt-14"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-label="Video timeline"
        className="relative h-8 cursor-pointer touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/30" />
        <div
          className={`absolute inset-y-0 left-0 top-1/2 h-px -translate-y-1/2 bg-white/85 ${
            isScrubbing ? '' : 'transition-[width] duration-100 ease-linear'
          }`}
          style={{ width: `${percent}%` }}
        />
        <div
          className={`pointer-events-none absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/95 shadow-[0_0_8px_rgba(255,255,255,0.35)] ${
            isScrubbing ? 'scale-125' : 'transition-[left] duration-100 ease-linear'
          }`}
          style={{ left: `${percent}%` }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between tabular-nums">
        <span className="text-[11px] font-medium tracking-tight text-white/70">
          {formatTime(currentTime)}
        </span>
        <span className="text-[11px] font-medium tracking-tight text-white/45">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
