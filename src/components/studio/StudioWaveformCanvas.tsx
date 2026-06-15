import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  drawWaveformPeaks,
  extractWaveformPeaks,
  ratioToSeconds,
  secondsToRatio,
} from './studioWaveform'

const MIN_TRIM_SEC = 0.05
const HANDLE_WIDTH_PX = 14

interface StudioWaveformCanvasProps {
  audioBuffer: AudioBuffer | null
  trimStart: number
  trimEnd: number
  accentColor?: string
  onTrimChange: (trimStart: number, trimEnd: number) => void
}

export default function StudioWaveformCanvas({
  audioBuffer,
  trimStart,
  trimEnd,
  accentColor,
  onTrimChange,
}: StudioWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const peaksRef = useRef<Float32Array | null>(null)
  const dragRef = useRef<'start' | 'end' | null>(null)

  const duration = audioBuffer?.duration ?? 0

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !audioBuffer) return

    const width = Math.max(1, container.clientWidth)
    const height = Math.max(1, container.clientHeight)
    const dpr = window.devicePixelRatio || 1

    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    if (!peaksRef.current || peaksRef.current.length !== width) {
      peaksRef.current = extractWaveformPeaks(audioBuffer, width)
    }

    drawWaveformPeaks(ctx, peaksRef.current, width, height, accentColor)
  }, [accentColor, audioBuffer])

  useEffect(() => {
    peaksRef.current = null
    paint()
  }, [audioBuffer, paint])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      peaksRef.current = null
      paint()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [paint])

  const clampTrim = useCallback(
    (nextStart: number, nextEnd: number) => {
      if (duration <= 0) return { start: 0, end: 0 }

      let start = Math.max(0, Math.min(nextStart, duration))
      let end = Math.max(0, Math.min(nextEnd, duration))

      if (end - start < MIN_TRIM_SEC) {
        if (dragRef.current === 'start') {
          start = Math.max(0, end - MIN_TRIM_SEC)
        } else {
          end = Math.min(duration, start + MIN_TRIM_SEC)
        }
      }

      return { start, end }
    },
    [duration],
  )

  const handlePointerDown =
    (edge: 'start' | 'end') => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!audioBuffer || duration <= 0) return
      event.preventDefault()
      event.stopPropagation()
      dragRef.current = edge
      event.currentTarget.setPointerCapture(event.pointerId)
    }

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current || !containerRef.current || duration <= 0) return

      const rect = containerRef.current.getBoundingClientRect()
      const ratio = (event.clientX - rect.left) / Math.max(1, rect.width)
      const seconds = ratioToSeconds(ratio, duration)

      if (dragRef.current === 'start') {
        const { start, end } = clampTrim(seconds, trimEnd)
        onTrimChange(start, end)
      } else {
        const { start, end } = clampTrim(trimStart, seconds)
        onTrimChange(start, end)
      }
    },
    [clampTrim, duration, onTrimChange, trimEnd, trimStart],
  )

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }, [])

  const startRatio = secondsToRatio(trimStart, duration)
  const endRatio = secondsToRatio(trimEnd, duration)
  const selectionLeft = `${startRatio * 100}%`
  const selectionWidth = `${Math.max(0, endRatio - startRatio) * 100}%`

  return (
    <div
      ref={containerRef}
      className="studio-waveform relative h-full min-h-0 w-full overflow-hidden rounded-lg bg-black/40"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {audioBuffer && duration > 0 && (
        <>
          <div
            className="studio-waveform__shade studio-waveform__shade--left"
            style={{ width: selectionLeft }}
          />
          <div
            className="studio-waveform__selection"
            style={{ left: selectionLeft, width: selectionWidth }}
          />
          <div
            className="studio-waveform__shade studio-waveform__shade--right"
            style={{ left: `calc(${selectionLeft} + ${selectionWidth})`, right: 0 }}
          />

          <div
            role="slider"
            aria-label="Trim start"
            className="studio-waveform__handle studio-waveform__handle--start"
            style={{ left: selectionLeft, width: HANDLE_WIDTH_PX }}
            onPointerDown={handlePointerDown('start')}
          />
          <div
            role="slider"
            aria-label="Trim end"
            className="studio-waveform__handle studio-waveform__handle--end"
            style={{ left: `calc(${selectionLeft} + ${selectionWidth} - ${HANDLE_WIDTH_PX}px)` }}
            onPointerDown={handlePointerDown('end')}
          />
        </>
      )}
    </div>
  )
}
