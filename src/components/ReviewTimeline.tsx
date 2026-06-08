import type { RefObject } from 'react'
import { formatTime } from '../hooks/useVideoPlayback'

interface ReviewTimelineProps {
  trackRef: RefObject<HTMLDivElement | null>
  currentTime: number
  duration: number
  onScrubStart: () => void
  onScrub: (clientX: number) => void
  onScrubEnd: () => void
}

export default function ReviewTimeline({
  trackRef,
  currentTime,
  duration,
  onScrubStart,
  onScrub,
  onScrubEnd,
}: ReviewTimelineProps) {
  const percent = duration > 0 ? (currentTime / duration) * 100 : 0

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
    onScrub(e.clientX)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (trackRef.current?.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId)
    }
    onScrubEnd()
  }

  return (
    <div
      className="touch-none bg-gradient-to-t from-black via-black/95 to-black/80 px-5 pb-2 pt-4"
      style={{ touchAction: 'none' }}
    >
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-label="Video timeline"
        className="group relative h-9 cursor-pointer touch-none select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/15">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-white/90 transition-[width] duration-75 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div
          className="pointer-events-none absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 bg-white shadow-[0_0_12px_rgba(255,255,255,0.45)] transition-[left] duration-75 ease-out group-active:scale-110"
          style={{ left: `${percent}%` }}
        />

        <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-0.5">
          {Array.from({ length: 24 }, (_, i) => (
            <div
              key={i}
              className={`w-px rounded-full bg-white/25 ${
                i % 6 === 0 ? 'h-3' : 'h-1.5'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between tabular-nums">
        <span className="text-sm font-medium tracking-tight text-white">
          {formatTime(currentTime)}
        </span>
        <span className="text-xs text-white/45">/</span>
        <span className="text-sm font-medium tracking-tight text-white/55">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
