import { useEffect, useRef, type RefObject } from 'react'
import { readAnalyserMetrics } from '../utils/audioLevel'
import { getPlaybackAudioContext } from '../utils/playbackAudioContext'

const BAR_COUNT = 40
const HISTORY_LENGTH = 96

function drawLiveBars(
  ctx: CanvasRenderingContext2D,
  history: Float32Array,
  width: number,
  height: number,
  accent: 'record' | 'idle',
) {
  ctx.clearRect(0, 0, width, height)

  const gap = 2
  const barWidth = Math.max(1.5, (width - gap * (BAR_COUNT - 1)) / BAR_COUNT)
  const centerY = height / 2
  const start = Math.max(0, history.length - BAR_COUNT)
  const playedColor =
    accent === 'record' ? 'rgba(248, 113, 113, 0.92)' : 'rgba(56, 189, 248, 0.55)'
  const idleColor = 'rgba(148, 163, 184, 0.22)'

  for (let i = 0; i < BAR_COUNT; i++) {
    const sample = history[start + i] ?? 0
    const amp = Math.min(1, sample * 2.8)
    const barHeight = Math.max(3, amp * (height - 6))
    const x = i * (barWidth + gap)
    const y = centerY - barHeight / 2

    ctx.fillStyle = amp > 0.04 ? playedColor : idleColor
    ctx.beginPath()
    ctx.roundRect(x, y, barWidth, barHeight, 1.2)
    ctx.fill()
  }
}

export function useLiveMicWaveform(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  streamRef: RefObject<MediaStream | null>,
  enabled: boolean,
  accent: 'record' | 'idle' = 'idle',
) {
  const historyRef = useRef(new Float32Array(HISTORY_LENGTH))
  const writeIndexRef = useRef(0)

  useEffect(() => {
    if (!enabled) {
      historyRef.current.fill(0)
      writeIndexRef.current = 0
    }
  }, [enabled])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return

    let cancelled = false
    let rafId = 0
    let source: MediaStreamAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null
    let buffer: Float32Array | null = null
    let observer: ResizeObserver | null = null

    const paint = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      drawLiveBars(ctx, historyRef.current, canvas.clientWidth, canvas.clientHeight, accent)
    }

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
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint()
    }

    const tick = () => {
      if (cancelled) return
      if (analyser && buffer) {
        const metrics = readAnalyserMetrics(analyser, buffer)
        const level = Math.max(metrics.rms, metrics.peak * 0.45)
        historyRef.current[writeIndexRef.current % HISTORY_LENGTH] = level
        writeIndexRef.current += 1
        paint()
      }
      rafId = window.requestAnimationFrame(tick)
    }

    void (async () => {
      const stream = streamRef.current
      if (!stream || stream.getAudioTracks().every((track) => track.readyState !== 'live')) {
        resize()
        return
      }

      const audioContext = await getPlaybackAudioContext()
      if (cancelled) return
      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => {})
      }

      analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.65
      source = audioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      buffer = new Float32Array(analyser.fftSize)

      resize()
      observer = new ResizeObserver(resize)
      observer.observe(canvas.parentElement ?? canvas)
      rafId = window.requestAnimationFrame(tick)
    })()

    return () => {
      cancelled = true
      window.cancelAnimationFrame(rafId)
      observer?.disconnect()
      source?.disconnect()
      analyser?.disconnect()
    }
  }, [accent, canvasRef, enabled, streamRef])
}
