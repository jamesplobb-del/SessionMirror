import { AudioLines } from 'lucide-react'
import type { RefObject } from 'react'
import { formatTime } from '../hooks/useVideoPlayback'
import Pressable from './ui/Pressable'

interface ReviewTimelineProps {
  trackRef: RefObject<HTMLDivElement | null>
  currentTime: number
  duration: number
  isScrubbing: boolean
  onScrubStart: () => void
  onScrub: (clientX: number) => void
  onScrubEnd: () => void
  pitchToggleVisible?: boolean
  pitchToggleActive?: boolean
  onPitchToggle?: () => void
}

export default function ReviewTimeline({
  trackRef,
  currentTime,
  duration,
  isScrubbing,
  onScrubStart,
  onScrub,
  onScrubEnd,
  pitchToggleVisible = false,
  pitchToggleActive = false,
  onPitchToggle,
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
      className="review-timeline pointer-events-auto w-full touch-none select-none border-t border-white/[0.08] bg-[rgba(12,12,14,0.82)] px-5 pt-5 backdrop-blur-xl"
      style={{
        touchAction: 'none',
        paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom, 0px))',
      }}
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
          className={`absolute left-0 top-1/2 h-px -translate-y-1/2 bg-white/85 ${
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

        {pitchToggleVisible && onPitchToggle && (
          <Pressable
            type="button"
            intensity="soft"
            onClick={(event) => {
              event.stopPropagation()
              onPitchToggle()
            }}
            className={`flex h-7 items-center gap-1 rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-wide ${
              pitchToggleActive
                ? 'border-sky-400/40 bg-sky-500/25 text-sky-100'
                : 'border-white/15 bg-white/10 text-white/65 hover:bg-white/15 hover:text-white/85'
            }`}
            aria-label={pitchToggleActive ? 'Hide pitch tuner' : 'Show pitch tuner'}
            aria-pressed={pitchToggleActive}
          >
            <AudioLines className="h-3.5 w-3.5" strokeWidth={2.25} />
            Pitch
          </Pressable>
        )}

        <span className="text-[11px] font-medium tracking-tight text-white/45">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
