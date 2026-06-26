import { useEffect, useRef } from 'react'
import { decodeAudioPeaks } from '../../utils/audioWaveformPeaks'

interface MiniTakeWaveformProps {
  takeId: string
  playbackUrl: string
  progress?: number
  accent?: 'gold' | 'red' | 'neutral'
  className?: string
}

function drawBars(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array,
  width: number,
  height: number,
  progress: number,
  accent: MiniTakeWaveformProps['accent'],
) {
  ctx.clearRect(0, 0, width, height)

  const barCount = peaks.length
  const gap = 2
  const barWidth = Math.max(1.5, (width - gap * (barCount - 1)) / barCount)
  const centerY = height / 2
  const playedColor =
    accent === 'gold'
      ? 'rgba(251, 191, 36, 0.92)'
      : accent === 'red'
        ? 'rgba(248, 113, 113, 0.92)'
        : 'rgba(56, 189, 248, 0.88)'
  const idleColor = 'rgba(148, 163, 184, 0.28)'
  const playedCutoff = Math.floor(progress * barCount)

  for (let i = 0; i < barCount; i++) {
    const amp = peaks[i] ?? 0
    const barHeight = Math.max(3, amp * (height - 6))
    const x = i * (barWidth + gap)
    const y = centerY - barHeight / 2

    ctx.fillStyle = i <= playedCutoff ? playedColor : idleColor
    ctx.beginPath()
    ctx.roundRect(x, y, barWidth, barHeight, 1.2)
    ctx.fill()
  }
}

export default function MiniTakeWaveform({
  takeId,
  playbackUrl,
  progress = 0,
  accent = 'neutral',
  className = '',
}: MiniTakeWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const peaksRef = useRef<Float32Array | null>(null)

  useEffect(() => {
    let cancelled = false
    peaksRef.current = null

    void decodeAudioPeaks(takeId, playbackUrl).then((peaks) => {
      if (cancelled || !peaks) return
      peaksRef.current = peaks
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawBars(ctx, peaks, canvas.width, canvas.height, progress, accent)
    })

    return () => {
      cancelled = true
    }
  }, [takeId, playbackUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    const peaks = peaksRef.current
    if (!canvas || !peaks) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawBars(ctx, peaks, canvas.width, canvas.height, progress, accent)
  }, [progress, accent])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      const width = parent.clientWidth
      const height = parent.clientHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx || !peaksRef.current) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawBars(ctx, peaksRef.current, width, height, progress, accent)
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas.parentElement ?? canvas)
    return () => observer.disconnect()
  }, [progress, accent])

  return (
    <canvas
      ref={canvasRef}
      className={`audio-practice-take-card__waveform ${className}`.trim()}
      aria-hidden
    />
  )
}
