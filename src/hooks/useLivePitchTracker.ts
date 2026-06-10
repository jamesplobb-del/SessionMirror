import { useEffect, useRef, useState, type RefObject } from 'react'
import { PitchDetector } from 'pitchy'
import {
  PITCH_CLARITY_MIN,
  PITCH_FRAME_SIZE,
  PITCH_HOLD_MS,
  PITCH_MIN_VOLUME_DB,
  PITCH_CENTS_SMOOTH_ALPHA,
  PITCH_HISTORY_INTERVAL_MS,
  PITCH_READOUT_INTERVAL_MS,
  CENTS_DISPLAY_STEP,
} from '../utils/pitchConfig'
import {
  frequencyToPitchReadout,
  getIntonationColor,
  isFrequencyInInstrumentRange,
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
    const historyStep = width / Math.max(HISTORY_LENGTH - 1, 1)
    const start = HISTORY_LENGTH - centsHistory.length

    for (let index = 1; index < centsHistory.length; index += 1) {
      const prevCents = centsHistory[index - 1]
      const cents = centsHistory[index]
      const x0 = (start + index - 1) * historyStep
      const x1 = (start + index) * historyStep
      const y0 = centsToY(prevCents)
      const y1 = centsToY(cents)

      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.strokeStyle = getIntonationColor(cents)
      ctx.globalAlpha = 0.55 + (index / centsHistory.length) * 0.4
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    ctx.globalAlpha = 1
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
  const displayCentsRef = useRef<number | null>(null)
  const lastNoteRef = useRef('—')
  const lastReadoutEmitRef = useRef(0)
  const lastHistoryPushRef = useRef(0)

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
      displayCentsRef.current = null
      lastNoteRef.current = '—'
      lastReadoutEmitRef.current = 0
      lastHistoryPushRef.current = 0
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
        displayCentsRef.current = null
        lastNoteRef.current = '—'
        lastReadoutEmitRef.current = 0
        lastHistoryPushRef.current = 0
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
            displayCentsRef.current = next.cents
            lastNoteRef.current = next.noteName
          }

          displayCentsRef.current = smoothFrequency(
            displayCentsRef.current,
            next.cents,
            PITCH_CENTS_SMOOTH_ALPHA,
          )
          const displayCents = quantizeDisplayCents(
            Math.max(-50, Math.min(50, displayCentsRef.current ?? next.cents)),
            CENTS_DISPLAY_STEP,
          )
          const displayReadout: PitchReadout = { ...next, cents: displayCents }

          if (now - lastReadoutEmitRef.current >= PITCH_READOUT_INTERVAL_MS) {
            readoutRef.current = displayReadout
            if (mountedRef.current) setReadout(displayReadout)
            lastReadoutEmitRef.current = now
          }

          lastPitchAtRef.current = now
          currentCents = displayCents
          active = true

          if (now - lastHistoryPushRef.current >= PITCH_HISTORY_INTERVAL_MS) {
            historyRef.current = [...historyRef.current, displayCents].slice(-HISTORY_LENGTH)
            lastHistoryPushRef.current = now
          }
        }
      } else if (
        lastPitchAtRef.current > 0 &&
        now - lastPitchAtRef.current > PITCH_HOLD_MS
      ) {
        readoutRef.current = emptyReadout
        if (mountedRef.current) setReadout(emptyReadout)
        graph.smoothed = null
        displayCentsRef.current = null
        lastNoteRef.current = '—'
        active = false
      } else if (readoutRef.current.noteName !== '—') {
        currentCents = displayCentsRef.current ?? readoutRef.current.cents
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
