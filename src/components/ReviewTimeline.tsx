import type { RefObject } from 'react'
import { formatTime } from '../hooks/useVideoPlayback'

const TICK_COUNT = 48

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
      className="touch-none border-t border-white/10 bg-black/60 px-4 py-3 backdrop-blur-md"
      style={{ touchAction: 'none' }}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] tabular-nums text-white/60">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-label="Video timeline"
        className="relative h-11 cursor-pointer touch-none select-none overflow-hidden rounded-lg bg-black/40 px-1"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-x-1 inset-y-0 flex items-center justify-between">
          {Array.from({ length: TICK_COUNT }, (_, i) => (
            <div
              key={i}
              className={`w-px shrink-0 bg-white/50 ${
                i % 10 === 0 ? 'h-7' : i % 5 === 0 ? 'h-5' : 'h-3'
              }`}
            />
          ))}
        </div>

        <div
          className="pointer-events-none absolute bottom-0 top-0 z-10 w-[2px] bg-[#FFD60A] shadow-[0_0_10px_rgba(255,214,10,0.8)]"
          style={{ left: `${percent}%`, transform: 'translateX(-50%)' }}
        />

        <div
          className="pointer-events-none absolute inset-y-0 left-0 bg-white/[0.06]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
