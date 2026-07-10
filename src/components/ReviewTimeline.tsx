import { Pause, Play } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
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
  trimAvailable?: boolean
  trimActive?: boolean
  trimStart?: number
  trimEnd?: number
  trimApplying?: boolean
  onRequestTrim?: () => void
  onTrimStart?: () => void
  onTrimChange?: (startTime: number, endTime: number, handle: 'start' | 'end') => void
  onTrimEnd?: () => void
  onCancelTrim?: () => void
  onApplyTrim?: () => void
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
  trimAvailable = false,
  trimActive = false,
  trimStart = 0,
  trimEnd = duration,
  trimApplying = false,
  onRequestTrim,
  onTrimStart,
  onTrimChange,
  onTrimEnd,
  onCancelTrim,
  onApplyTrim,
}: ReviewTimelineProps) {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const safeCurrentTime =
    Number.isFinite(currentTime) && safeDuration > 0
      ? Math.max(0, Math.min(currentTime, safeDuration))
      : 0
  const percent = safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0
  const safeTrimStart = Math.max(0, Math.min(trimStart, safeDuration))
  const safeTrimEnd = Math.max(safeTrimStart, Math.min(trimEnd, safeDuration))
  const trimStartPercent = safeDuration > 0 ? (safeTrimStart / safeDuration) * 100 : 0
  const trimEndPercent = safeDuration > 0 ? (safeTrimEnd / safeDuration) * 100 : 100
  const trimSelectionPercent = Math.max(0, trimEndPercent - trimStartPercent)
  const pointerModeRef = useRef<'scrub' | 'start' | 'end' | null>(null)
  const [trimHandle, setTrimHandle] = useState<'start' | 'end' | null>(null)
  const peaks = useMediaWaveform({
    filePath: mediaFilePath,
    mediaUrl,
    barCount: 88,
  })

  const progressForClientX = (clientX: number): number => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  const releasePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (trackRef.current?.hasPointerCapture(e.pointerId)) {
      trackRef.current.releasePointerCapture(e.pointerId)
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (!trimActive && trimAvailable) {
      onRequestTrim?.()
      return
    }

    if (trimActive && safeDuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      const startX = rect.left + (trimStartPercent / 100) * rect.width
      const endX = rect.left + (trimEndPercent / 100) * rect.width
      const handleRadius = Math.max(22, rect.width * 0.055)
      const startDistance = Math.abs(e.clientX - startX)
      const endDistance = Math.abs(e.clientX - endX)

      if (startDistance <= handleRadius || endDistance <= handleRadius) {
        const handle = startDistance <= endDistance ? 'start' : 'end'
        pointerModeRef.current = handle
        setTrimHandle(handle)
        onTrimStart?.()
        e.currentTarget.setPointerCapture(e.pointerId)
        return
      }
    }

    pointerModeRef.current = 'scrub'
    onScrubStart()
    onScrub(e.clientX)
    trackRef.current?.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current?.hasPointerCapture(e.pointerId)) return
    e.preventDefault()
    e.stopPropagation()

    const mode = pointerModeRef.current
    if ((mode === 'start' || mode === 'end') && safeDuration > 0) {
      const minimumDuration = Math.min(0.25, Math.max(0.1, safeDuration * 0.005))
      const nextTime = progressForClientX(e.clientX) * safeDuration
      if (mode === 'start') {
        onTrimChange?.(Math.min(nextTime, safeTrimEnd - minimumDuration), safeTrimEnd, mode)
      } else {
        onTrimChange?.(safeTrimStart, Math.max(nextTime, safeTrimStart + minimumDuration), mode)
      }
      return
    }

    onScrub(e.clientX)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const mode = pointerModeRef.current
    releasePointer(e)
    pointerModeRef.current = null
    setTrimHandle(null)
    e.stopPropagation()
    if (mode === 'start' || mode === 'end') {
      onTrimEnd?.()
      return
    }
    if (mode === 'scrub') onScrubEnd()
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
            {trimActive && (
              <>
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 bg-[#171a22]/35"
                  style={{ width: `${trimStartPercent}%` }}
                />
                <span
                  className="pointer-events-none absolute inset-y-0 right-0 bg-[#171a22]/35"
                  style={{ width: `${100 - trimEndPercent}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-[2px] border-y border-[#171a22]"
                  style={{ left: `${trimStartPercent}%`, width: `${trimSelectionPercent}%` }}
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-[4px] -translate-x-1/2 rounded-full bg-[#171a22] shadow-[0_0_0_2px_rgba(255,255,255,0.8)] ${
                      trimHandle === 'start' ? 'scale-x-125' : ''
                    }`}
                  />
                  <span
                    className={`absolute inset-y-0 right-0 w-[4px] translate-x-1/2 rounded-full bg-[#171a22] shadow-[0_0_0_2px_rgba(255,255,255,0.8)] ${
                      trimHandle === 'end' ? 'scale-x-125' : ''
                    }`}
                  />
                </div>
              </>
            )}
            <div
              className={`review-timeline-waveform__playhead pointer-events-none absolute top-1/2 z-10 h-full w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#171a22] shadow-[0_1px_10px_rgba(23,26,34,0.2)] ${
                isScrubbing ? 'scale-125' : 'transition-[left] duration-100 ease-linear'
              }`}
              style={{ left: `${percent}%` }}
            >
              <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[#171a22]" />
            </div>
          </div>
        </div>

        <span className="w-11 text-left text-[11px] font-medium tabular-nums tracking-tight text-[#6c7077]/80">
          {formatTime(safeDuration)}
        </span>
      </div>
      {trimActive && (
        <div className="review-trim-actions flex items-center justify-between gap-3 px-3 pb-2 pt-1">
          <Pressable
            type="button"
            intensity="soft"
            haptic="light"
            onClick={onCancelTrim}
            disabled={trimApplying}
            className="review-trim-action review-trim-action--cancel min-h-9 px-3 text-[13px] font-semibold"
          >
            Cancel
          </Pressable>
          <span className="min-w-0 flex-1 text-center text-[11px] font-semibold tabular-nums text-[#6c7077]">
            {formatTime(Math.max(0, safeTrimEnd - safeTrimStart))}
          </span>
          <Pressable
            type="button"
            intensity="soft"
            haptic="medium"
            onClick={onApplyTrim}
            disabled={trimApplying || trimSelectionPercent <= 0}
            className="review-trim-action review-trim-action--done min-h-9 px-3 text-[13px] font-semibold"
          >
            {trimApplying ? 'Trimming...' : 'Done'}
          </Pressable>
        </div>
      )}
    </div>
  )
}
