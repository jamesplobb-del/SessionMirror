import { Pause, Play } from 'lucide-react'
import type { RefObject } from 'react'
import { formatTime } from '../hooks/useVideoPlayback'
import { useMediaWaveform } from '../hooks/useMediaWaveform'
import Pressable from './ui/Pressable'

interface ReviewTimelineProps {
  trackRef: RefObject<HTMLDivElement | null>
  currentTime: number
  duration: number
  isScrubbing: boolean
  onScrubStart: () => void
  onScrub: (clientX: number) => void
  onScrubEnd: () => void
  isPlaying: boolean
  onPlayPause: () => void
  mediaFilePath?: string
  mediaUrl?: string
}

export default function ReviewTimeline({
  trackRef,
  currentTime,
  duration,
  isScrubbing,
  onScrubStart,
  onScrub,
  onScrubEnd,
  isPlaying,
  onPlayPause,
  mediaFilePath = '',
  mediaUrl = '',
}: ReviewTimelineProps) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeCurrentTime =
    Number.isFinite(currentTime) && safeDuration > 0
      ? Math.max(0, Math.min(currentTime, safeDuration))
      : 0
  const percent = safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0
  const peaks = useMediaWaveform({
    filePath: mediaFilePath,
    mediaUrl,
    barCount: 88,
  })

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
      className="review-timeline pointer-events-auto w-full touch-none select-none"
      style={{
        touchAction: 'none',
      }}
    >
      <div className="review-playback-controls flex items-center gap-3">
        <Pressable
          type="button"
          intensity="icon"
          haptic="light"
          onClick={(event) => {
            event.stopPropagation()
            onPlayPause()
          }}
          className="review-playback-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#171a22]"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 fill-[#171a22]" />
          ) : (
            <Play className="ml-0.5 h-5 w-5 fill-[#171a22]" />
          )}
        </Pressable>

        <span className="w-11 text-right text-[11px] font-medium tabular-nums tracking-tight text-[#6c7077]">
          {formatTime(safeCurrentTime)}
        </span>

        <div
          ref={trackRef}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={safeDuration}
          aria-valuenow={safeCurrentTime}
          aria-label="Video timeline"
          className="review-timeline-track review-timeline-track--waveform relative h-12 min-w-0 flex-1 cursor-pointer touch-none"
          style={{ touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="review-timeline-waveform absolute inset-0 flex items-center gap-[2px]">
            {peaks.map((peak, index) => (
              <span
                key={index}
                className={
                  index / Math.max(1, peaks.length - 1) <= percent / 100
                    ? 'review-timeline-waveform__bar review-timeline-waveform__bar--played'
                    : 'review-timeline-waveform__bar'
                }
                style={{ height: `${Math.round(12 + peak * 78)}%` }}
              />
            ))}
          </div>
          <div
            className={`pointer-events-none absolute top-1/2 z-10 h-full w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#171a22] shadow-[0_1px_10px_rgba(23,26,34,0.2)] ${
              isScrubbing ? 'scale-125' : 'transition-[left] duration-100 ease-linear'
            }`}
            style={{ left: `${percent}%` }}
          >
            <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#171a22]" />
          </div>
        </div>

        <span className="w-11 text-left text-[11px] font-medium tabular-nums tracking-tight text-[#6c7077]/80">
          {formatTime(safeDuration)}
        </span>
      </div>
    </div>
  )
}
