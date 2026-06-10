import { useEffect, useRef, useState, startTransition, type RefObject } from 'react'
import { PitchDetector } from 'pitchy'
import {
  PITCH_CLARITY_MIN,
  PITCH_FRAME_SIZE,
  PITCH_HOLD_MS,
  PITCH_MIN_VOLUME_DB,
  PITCH_NEEDLE_SMOOTH_ALPHA,
  PITCH_GRAPH_SMOOTH_ALPHA,
  PITCH_GRAPH_SMOOTH_WINDOW,
  PITCH_READOUT_INTERVAL_MS,
  CENTS_DISPLAY_STEP,
} from '../utils/pitchConfig'
import {
  frequencyToPitchReadout,
  getIntonationColor,
  isFrequencyInInstrumentRange,
  movingAverage,
  normalizeInstrumentFrequency,
  quantizeDisplayCents,
  smoothFrequency,
  stabilizePitchReadout,
  type PitchReadout,
} from '../utils/pitchUtils'

const HISTORY_LENGTH = 140

interface PitchGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode
  analyser: AnalyserNode
  detector: PitchDetector<Float32Array>
  buffer: Float32Array
  smoothed: number | null
  media: HTMLMediaElement
}

const elementGraphs = new WeakMap<HTMLMediaElement, PitchGraph>()

async function createPitchGraph(media: HTMLMediaElement): Promise<PitchGraph> {
  const existing = elementGraphs.get(media)
  if (existing && existing.context.state !== 'closed') {
    return existing
  }

  if (existing) {
    elementGraphs.delete(media)
  }

  const context = new AudioContext()
  await context.resume()

  let source: MediaElementAudioSourceNode
  try {
    source = context.createMediaElementSource(media)
  } catch {
    await context.close()
    throw new Error('Unable to attach pitch tracker to this playback source')
  }

  const analyser = context.createAnalyser()
  analyser.fftSize = PITCH_FRAME_SIZE

  source.connect(analyser)
  analyser.connect(context.destination)

  const detector = PitchDetector.forFloat32Array(PITCH_FRAME_SIZE)
  detector.clarityThreshold = PITCH_CLARITY_MIN
  detector.minVolumeDecibels = PITCH_MIN_VOLUME_DB

  const graph: PitchGraph = {
    context,
    source,
    analyser,
    detector,
    buffer: new Float32Array(PITCH_FRAME_SIZE),
    smoothed: null,
    media,
  }

  elementGraphs.set(media, graph)
  return graph
}

function safeDisposePitchGraph(graph: PitchGraph | null): void {
  if (!graph) return

  elementGraphs.delete(graph.media)

  try {
    graph.source.disconnect()
    graph.analyser.disconnect()
  } catch {
    /* graph may already be disconnected */
  }

  const { context } = graph
  void context.close().catch(() => {})
}

function drawSmoothPitchTrace(
  ctx: CanvasRenderingContext2D,
  centsHistory: number[],
  historyLength: number,
  width: number,
  centsToY: (cents: number) => number,
): void {
  const smoothed = movingAverage(centsHistory, PITCH_GRAPH_SMOOTH_WINDOW)
  if (smoothed.length < 2) return

  const historyStep = width / Math.max(historyLength - 1, 1)
  const start = historyLength - smoothed.length

  const points = smoothed.map((cents, index) => ({
    x: (start + index) * historyStep,
    y: centsToY(cents),
    cents,
  }))

  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[Math.max(0, index - 1)]
    const current = points[index]
    const next = points[index + 1]
    const following = points[Math.min(points.length - 1, index + 2)]

    const cp1x = current.x + (next.x - previous.x) / 6
    const cp1y = current.y + (next.y - previous.y) / 6
    const cp2x = next.x - (following.x - current.x) / 6
    const cp2y = next.y - (following.y - current.y) / 6

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y)
  }

  const latest = points[points.length - 1]
  const gradient = ctx.createLinearGradient(points[0].x, 0, latest.x, 0)
  gradient.addColorStop(0, 'rgba(148, 163, 184, 0.18)')
  gradient.addColorStop(0.55, 'rgba(34, 197, 94, 0.42)')
  gradient.addColorStop(1, getIntonationColor(latest.cents))

  ctx.strokeStyle = gradient
  ctx.lineWidth = 2.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.globalAlpha = 0.92
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawPitchCanvas(
  canvas: HTMLCanvasElement,
  timeDomain: Float32Array,
  centsHistory: number[],
  currentCents: number | null,
  active: boolean,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (width <= 0 || height <= 0) return

  if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const pitchTop = height * 0.08
  const pitchBottom = height * 0.72
  const pitchHeight = pitchBottom - pitchTop
  const waveTop = height * 0.76
  const waveHeight = height * 0.2
  const midPitchY = pitchTop + pitchHeight * 0.5

  ctx.clearRect(0, 0, width, height)

  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, '#0c1018')
  bg.addColorStop(0.55, '#080b12')
  bg.addColorStop(1, '#050608')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  const centsToY = (cents: number) =>
    midPitchY - (Math.max(-50, Math.min(50, cents)) / 50) * (pitchHeight * 0.46)

  ctx.fillStyle = 'rgba(16, 185, 129, 0.08)'
  ctx.fillRect(0, centsToY(10), width, centsToY(-10) - centsToY(10))

  ctx.fillStyle = 'rgba(245, 158, 11, 0.05)'
  ctx.fillRect(0, centsToY(25), width, centsToY(10) - centsToY(25))
  ctx.fillRect(0, centsToY(-10), width, centsToY(-25) - centsToY(-10))

  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (const cents of [-50, -25, -10, 0, 10, 25, 50]) {
    const y = centsToY(cents)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)'
  ctx.setLineDash([4, 6])
  ctx.beginPath()
  ctx.moveTo(0, centsToY(0))
  ctx.lineTo(width, centsToY(0))
  ctx.stroke()
  ctx.setLineDash([])

  if (centsHistory.length > 1) {
    drawSmoothPitchTrace(ctx, centsHistory, HISTORY_LENGTH, width, centsToY)
  }

  if (currentCents != null && active) {
    const dotX = width - 14
    const dotY = centsToY(currentCents)
    ctx.beginPath()
    ctx.arc(dotX, dotY, 4.5, 0, Math.PI * 2)
    ctx.fillStyle = getIntonationColor(currentCents)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.setLineDash([2, 4])
    ctx.beginPath()
    ctx.moveTo(dotX, dotY)
    ctx.lineTo(width, dotY)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const waveMidY = waveTop + waveHeight * 0.5
  const step = width / Math.max(timeDomain.length - 1, 1)

  ctx.beginPath()
  for (let index = 0; index < timeDomain.length; index += 3) {
    const sample = timeDomain[index]
    const x = index * step
    const y = waveMidY - sample * waveHeight * 0.9
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'
  ctx.lineWidth = 1.25
  ctx.stroke()

  ctx.beginPath()
  for (let index = 0; index < timeDomain.length; index += 3) {
    const sample = timeDomain[index]
    const x = index * step
    const y = waveMidY + sample * waveHeight * 0.55
    if (index === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.lineTo(width, height)
  ctx.lineTo(0, height)
  ctx.closePath()
  ctx.fillStyle = 'rgba(14, 165, 233, 0.12)'
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.beginPath()
  ctx.moveTo(0, waveTop - 4)
  ctx.lineTo(width, waveTop - 4)
  ctx.stroke()
}

export function useLivePitchTracker(
  mediaRef: RefObject<HTMLMediaElement | null>,
  enabled: boolean,
  isPlaying: boolean,
  mediaKey: string,
  canvasRef?: RefObject<HTMLCanvasElement | null>,
): PitchReadout {
  const emptyReadout = frequencyToPitchReadout(0)
  const [readout, setReadout] = useState<PitchReadout>(emptyReadout)
  const graphRef = useRef<PitchGraph | null>(null)
  const tickRef = useRef<number | null>(null)
  const readoutRef = useRef<PitchReadout>(emptyReadout)
  const lastPitchAtRef = useRef(0)
  const historyRef = useRef<number[]>([])
  const mountedRef = useRef(true)
  const needleCentsRef = useRef<number | null>(null)
  const graphCentsRef = useRef<number | null>(null)
  const lastNoteRef = useRef('—')
  const lastReadoutEmitRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    readoutRef.current = readout
  }, [readout])

  useEffect(() => {
    return () => {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
      safeDisposePitchGraph(graphRef.current)
      graphRef.current = null
    }
  }, [mediaKey])

  useEffect(() => {
    if (!enabled) {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
      historyRef.current = []
      needleCentsRef.current = null
      graphCentsRef.current = null
      lastNoteRef.current = '—'
      lastReadoutEmitRef.current = 0
      if (mountedRef.current) {
        readoutRef.current = emptyReadout
        setReadout(emptyReadout)
      }
      return
    }

    let cancelled = false
    let retryTimer: number | null = null
    let attachAttempt = 0
    const MAX_ATTACH_ATTEMPTS = 80

    const scheduleRetry = (delayMs: number) => {
      if (cancelled || attachAttempt >= MAX_ATTACH_ATTEMPTS) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void tryAttach()
      }, delayMs)
    }

    const tryAttach = async () => {
      if (cancelled) return
      attachAttempt += 1

      const media = mediaRef.current
      if (!media) {
        scheduleRetry(50)
        return
      }

      try {
        const graph = await createPitchGraph(media)
        if (cancelled) {
          safeDisposePitchGraph(graph)
          return
        }
        graphRef.current = graph
      } catch {
        scheduleRetry(100)
      }
    }

    void tryAttach()

    return () => {
      cancelled = true
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
    }
  }, [enabled, mediaKey, mediaRef])

  useEffect(() => {
    if (!enabled || !isPlaying) {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
      if (!isPlaying) {
        if (graphRef.current) graphRef.current.smoothed = null
        historyRef.current = []
        needleCentsRef.current = null
        graphCentsRef.current = null
        lastNoteRef.current = '—'
        lastReadoutEmitRef.current = 0
        if (mountedRef.current) {
          readoutRef.current = emptyReadout
          setReadout(emptyReadout)
        }
        lastPitchAtRef.current = 0
      }
      return
    }

    const tick = () => {
      const graph = graphRef.current
      if (!graph || elementGraphs.get(graph.media) !== graph) {
        graphRef.current = null
        tickRef.current = null
        return
      }

      if (graph.context.state === 'closed') {
        graphRef.current = null
        tickRef.current = null
        return
      }

      if (graph.context.state === 'suspended') {
        void graph.context.resume()
      }

      graph.analyser.getFloatTimeDomainData(graph.buffer)
      const [rawPitch, clarity] = graph.detector.findPitch(
        graph.buffer,
        graph.context.sampleRate,
      )

      const pitch = normalizeInstrumentFrequency(rawPitch)
      const now = performance.now()
      let currentCents: number | null = null
      let active = false

      if (clarity >= PITCH_CLARITY_MIN && isFrequencyInInstrumentRange(pitch)) {
        graph.smoothed = smoothFrequency(graph.smoothed, pitch)
        const next = stabilizePitchReadout(
          readoutRef.current.noteName === '—' ? null : readoutRef.current,
          frequencyToPitchReadout(graph.smoothed),
        )

        if (next.noteName !== '—') {
          if (lastNoteRef.current !== next.noteName) {
            needleCentsRef.current = next.cents
            graphCentsRef.current = next.cents
            lastNoteRef.current = next.noteName
          }

          needleCentsRef.current = smoothFrequency(
            needleCentsRef.current,
            next.cents,
            PITCH_NEEDLE_SMOOTH_ALPHA,
          )
          graphCentsRef.current = smoothFrequency(
            graphCentsRef.current,
            next.cents,
            PITCH_GRAPH_SMOOTH_ALPHA,
          )

          const needleCents = Math.max(
            -50,
            Math.min(50, needleCentsRef.current ?? next.cents),
          )
          const traceCents = Math.max(
            -50,
            Math.min(50, graphCentsRef.current ?? next.cents),
          )
          const displayCents = quantizeDisplayCents(needleCents, CENTS_DISPLAY_STEP)
          const displayReadout: PitchReadout = { ...next, cents: displayCents }

          if (now - lastReadoutEmitRef.current >= PITCH_READOUT_INTERVAL_MS) {
            readoutRef.current = displayReadout
            if (mountedRef.current) {
              startTransition(() => setReadout(displayReadout))
            }
            lastReadoutEmitRef.current = now
          }

          lastPitchAtRef.current = now
          currentCents = needleCents
          active = true
          const history = historyRef.current
          history.push(traceCents)
          if (history.length > HISTORY_LENGTH) {
            history.splice(0, history.length - HISTORY_LENGTH)
          }
        }
      } else if (
        lastPitchAtRef.current > 0 &&
        now - lastPitchAtRef.current > PITCH_HOLD_MS
      ) {
        readoutRef.current = emptyReadout
        if (mountedRef.current) setReadout(emptyReadout)
        graph.smoothed = null
        needleCentsRef.current = null
        graphCentsRef.current = null
        lastNoteRef.current = '—'
        active = false
      } else if (readoutRef.current.noteName !== '—') {
        currentCents = needleCentsRef.current ?? readoutRef.current.cents
        active = true
      }

      const canvas = canvasRef?.current
      if (canvas) {
        drawPitchCanvas(
          canvas,
          graph.buffer,
          historyRef.current,
          currentCents,
          active,
        )
      }

      tickRef.current = requestAnimationFrame(tick)
    }

    tickRef.current = requestAnimationFrame(tick)

    return () => {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
    }
  }, [canvasRef, enabled, isPlaying, mediaKey])

  return readout
}

/** Pause pitch graphs for review teardown without blocking the UI thread. */
export function pausePitchGraphsForMedia(...media: Array<HTMLMediaElement | null | undefined>): void {
  for (const element of media) {
    if (!element) continue
    try {
      element.pause()
    } catch {
      /* ignore */
    }
    const graph = elementGraphs.get(element)
    if (graph) {
      safeDisposePitchGraph(graph)
    }
  }
}
