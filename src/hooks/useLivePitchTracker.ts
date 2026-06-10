import { useEffect, useRef, useState, type RefObject } from 'react'
import { PitchDetector } from 'pitchy'
import {
  PITCH_ATTACK_FRAMES,
  PITCH_CLARITY_MIN,
  PITCH_CLARITY_MIN_MIC,
  PITCH_FRAME_SIZE,
  PITCH_FRAME_SIZE_MIC,
  PITCH_HOLD_MS,
  PITCH_HOLD_MS_MIC,
  PITCH_MIN_VOLUME_DB,
  PITCH_NEEDLE_SMOOTH_ALPHA,
  PITCH_GRAPH_SMOOTH_WINDOW,
  PITCH_OUTLIER_CENTS,
  PITCH_READOUT_INTERVAL_MS,
  PITCH_RMS_GATE_DB_MEDIA,
  PITCH_RMS_GATE_DB_MIC,
  CENTS_DISPLAY_STEP,
  type PitchCanvasTheme,
} from '../utils/pitchConfig'
import {
  frequencyToPitchReadout,
  getIntonationColor,
  getIntonationZone,
  glowColorForCents,
  isFrequencyInInstrumentRange,
  isSignalAboveRmsGate,
  movingAverage,
  normalizeInstrumentFrequency,
  quantizeDisplayCents,
  smoothFrequency,
  stabilizePitchReadout,
  type PitchReadout,
} from '../utils/pitchUtils'

const HISTORY_LENGTH = 140

/** Dispatched when an element-routed pitch graph is torn down (requires media remount). */
export const PITCH_GRAPH_RELEASED_EVENT = 'pitchgraph-released'

type PitchGraphMode = 'stream' | 'element'

interface PitchGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode
  analyser: AnalyserNode
  detector: PitchDetector<Float32Array>
  buffer: Float32Array
  smoothed: number | null
  media: HTMLMediaElement
  mode: PitchGraphMode
}

const elementGraphs = new WeakMap<HTMLMediaElement, PitchGraph>()

interface MicPitchGraph {
  context: AudioContext
  source: MediaStreamAudioSourceNode
  analyser: AnalyserNode
  detector: PitchDetector<Float32Array>
  buffer: Float32Array
  smoothed: number | null
  stream: MediaStream
  ownsStream: boolean
}

type ActivePitchGraph = PitchGraph | MicPitchGraph

function isMediaPitchGraph(graph: ActivePitchGraph): graph is PitchGraph {
  return 'media' in graph
}

export type PitchTrackerSource = 'media' | 'microphone'

export interface PitchTrackerOptions {
  source?: PitchTrackerSource
  micStreamRef?: RefObject<MediaStream | null>
  /** Keep readout/history and redraw the canvas while paused (video widget). */
  persistWhenPaused?: boolean
}

function micStreamIsLive(stream: MediaStream | null | undefined): boolean {
  return Boolean(
    stream &&
      stream.active &&
      stream.getAudioTracks().some((track) => track.readyState === 'live'),
  )
}

async function createMicPitchGraph(
  existingStream?: MediaStream | null,
): Promise<MicPitchGraph> {
  let stream = micStreamIsLive(existingStream) ? existingStream! : null
  let ownsStream = false

  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
      video: false,
    })
    ownsStream = true
  }

  const context = new AudioContext()
  await context.resume()

  const analyser = context.createAnalyser()
  analyser.fftSize = PITCH_FRAME_SIZE_MIC

  const source = context.createMediaStreamSource(stream)
  source.connect(analyser)

  const detector = PitchDetector.forFloat32Array(PITCH_FRAME_SIZE_MIC)
  detector.clarityThreshold = PITCH_CLARITY_MIN_MIC
  detector.minVolumeDecibels = PITCH_RMS_GATE_DB_MIC

  return {
    context,
    source,
    analyser,
    detector,
    buffer: new Float32Array(PITCH_FRAME_SIZE_MIC),
    smoothed: null,
    stream,
    ownsStream,
  }
}

function safeDisposeMicGraph(graph: MicPitchGraph | null): void {
  if (!graph) return

  try {
    graph.source.disconnect()
    graph.analyser.disconnect()
  } catch {
    /* graph may already be disconnected */
  }

  if (graph.ownsStream) {
    for (const track of graph.stream.getTracks()) {
      track.stop()
    }
  }

  void graph.context.close().catch(() => {})
}

function safeDisposeActiveGraph(graph: ActivePitchGraph | null): void {
  if (!graph) return
  if (isMediaPitchGraph(graph)) {
    safeDisposePitchGraph(graph)
  } else {
    safeDisposeMicGraph(graph)
  }
}

type MediaWithCaptureStream = HTMLMediaElement & {
  captureStream?: () => MediaStream
  mozCaptureStream?: () => MediaStream
}

function getMediaCaptureStream(media: HTMLMediaElement): MediaStream | null {
  const captureMedia = media as MediaWithCaptureStream

  if (typeof captureMedia.captureStream === 'function') {
    try {
      return captureMedia.captureStream()
    } catch {
      /* try legacy / fallback below */
    }
  }

  if (typeof captureMedia.mozCaptureStream === 'function') {
    try {
      return captureMedia.mozCaptureStream()
    } catch {
      /* fall through */
    }
  }

  return null
}

function streamHasAudio(stream: MediaStream): boolean {
  return stream.getAudioTracks().some((track) => track.readyState !== 'ended')
}

async function waitForMediaAudio(media: HTMLMediaElement, timeoutMs = 1500): Promise<void> {
  if (media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return

  await new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      media.removeEventListener('loadeddata', finish)
      media.removeEventListener('canplay', finish)
      resolve()
    }

    media.addEventListener('loadeddata', finish, { once: true })
    media.addEventListener('canplay', finish, { once: true })
    window.setTimeout(finish, timeoutMs)
  })
}

function notifyPitchGraphReleased(media: HTMLMediaElement, mode: PitchGraphMode): void {
  if (mode !== 'element') return
  media.dispatchEvent(new CustomEvent(PITCH_GRAPH_RELEASED_EVENT, { bubbles: true }))
}

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

  const analyser = context.createAnalyser()
  analyser.fftSize = PITCH_FRAME_SIZE

  let source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null
  let mode: PitchGraphMode = 'stream'

  const attachStreamSource = (): boolean => {
    const stream = getMediaCaptureStream(media)
    if (!stream || !streamHasAudio(stream)) return false

    try {
      const streamSource = context.createMediaStreamSource(stream)
      streamSource.connect(analyser)
      source = streamSource
      mode = 'stream'
      return true
    } catch {
      return false
    }
  }

  if (!attachStreamSource()) {
    await waitForMediaAudio(media)
    if (!attachStreamSource()) {
      try {
        const elementSource = context.createMediaElementSource(media)
        elementSource.connect(analyser)
        analyser.connect(context.destination)
        source = elementSource
        mode = 'element'
      } catch {
        await context.close()
        throw new Error('Unable to attach pitch tracker to this playback source')
      }
    }
  }

  if (!source) {
    await context.close()
    throw new Error('Unable to attach pitch tracker to this playback source')
  }

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
    mode,
  }

  elementGraphs.set(media, graph)
  return graph
}

function safeDisposePitchGraph(graph: PitchGraph | null): void {
  if (!graph) return

  const { media, mode } = graph
  elementGraphs.delete(media)

  try {
    graph.source.disconnect()
    graph.analyser.disconnect()
  } catch {
    /* graph may already be disconnected */
  }

  const { context } = graph
  void context.close().catch(() => {})
  notifyPitchGraphReleased(media, mode)
}

function drawColoredTraceSegments(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number; cents: number }>,
  lineWidth: number,
  alpha: number,
  glow = false,
): void {
  if (points.length < 2) return

  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.globalAlpha = alpha

  let runStart = 0
  for (let index = 1; index < points.length; index += 1) {
    const zoneChanged =
      getIntonationZone(points[index].cents) !== getIntonationZone(points[index - 1].cents)
    const isLast = index === points.length - 1

    if (!zoneChanged && !isLast) continue

    const runEnd = isLast && !zoneChanged ? index : index - 1
    const strokeColor = getIntonationColor(points[runEnd].cents)

    if (glow) {
      ctx.save()
      ctx.shadowColor = glowColorForCents(points[runEnd].cents)
      ctx.shadowBlur = 8
      ctx.strokeStyle = strokeColor
      ctx.beginPath()
      ctx.moveTo(points[runStart].x, points[runStart].y)
      for (let step = runStart + 1; step <= runEnd; step += 1) {
        ctx.lineTo(points[step].x, points[step].y)
      }
      ctx.stroke()
      ctx.restore()
    }

    ctx.strokeStyle = strokeColor
    ctx.beginPath()
    ctx.moveTo(points[runStart].x, points[runStart].y)
    for (let step = runStart + 1; step <= runEnd; step += 1) {
      ctx.lineTo(points[step].x, points[step].y)
    }
    ctx.stroke()

    runStart = zoneChanged ? index - 1 : index
  }

  ctx.globalAlpha = 1
}

function drawSmoothPitchTrace(
  ctx: CanvasRenderingContext2D,
  centsHistory: number[],
  historyLength: number,
  width: number,
  centsToY: (cents: number) => number,
  theme: PitchCanvasTheme,
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

    const cp1x = current.x + (next.x - previous.x) / 4
    const cp1y = current.y + (next.y - previous.y) / 4
    const cp2x = next.x - (following.x - current.x) / 4
    const cp2y = next.y - (following.y - current.y) / 4

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, next.x, next.y)
  }

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  if (theme === 'glass') {
    drawColoredTraceSegments(ctx, points, 4.5, 0.34, true)
    drawColoredTraceSegments(ctx, points, 3.1, 0.96)
    return
  }

  const latest = points[points.length - 1]
  const gradient = ctx.createLinearGradient(points[0].x, 0, latest.x, 0)
  gradient.addColorStop(0, 'rgba(148, 163, 184, 0.12)')
  gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.38)')
  gradient.addColorStop(1, getIntonationColor(latest.cents))

  ctx.strokeStyle = 'rgba(34, 197, 94, 0.22)'
  ctx.lineWidth = 8
  ctx.globalAlpha = 0.85
  ctx.stroke()

  ctx.strokeStyle = gradient
  ctx.lineWidth = 4.25
  ctx.globalAlpha = 0.96
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawPitchCanvas(
  canvas: HTMLCanvasElement,
  timeDomain: Float32Array,
  centsHistory: number[],
  currentCents: number | null,
  active: boolean,
  theme: PitchCanvasTheme,
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

  const isGlass = theme === 'glass'
  const pitchTop = isGlass ? height * 0.12 : height * 0.04
  const pitchBottom = isGlass ? height * 0.92 : height * 0.86
  const pitchHeight = pitchBottom - pitchTop
  const waveTop = height * 0.88
  const waveHeight = height * 0.1
  const midPitchY = pitchTop + pitchHeight * 0.5

  ctx.clearRect(0, 0, width, height)

  if (!isGlass) {
    const bg = ctx.createLinearGradient(0, 0, 0, height)
    bg.addColorStop(0, '#0c1018')
    bg.addColorStop(0.55, '#080b12')
    bg.addColorStop(1, '#050608')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  }

  const centsToY = (cents: number) =>
    midPitchY - (Math.max(-50, Math.min(50, cents)) / 50) * (pitchHeight * 0.46)

  if (!isGlass) {
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
  } else {
    ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.32)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('+50', 2, centsToY(50))
    ctx.fillText('0', 2, centsToY(0))
    ctx.fillText('-50', 2, centsToY(-50))
  }

  ctx.strokeStyle = isGlass ? 'rgba(255, 255, 255, 0.28)' : 'rgba(52, 211, 153, 0.35)'
  ctx.setLineDash(isGlass ? [5, 5] : [4, 6])
  ctx.lineWidth = isGlass ? 1 : 1
  ctx.beginPath()
  ctx.moveTo(0, centsToY(0))
  ctx.lineTo(width, centsToY(0))
  ctx.stroke()
  ctx.setLineDash([])

  if (centsHistory.length > 1) {
    drawSmoothPitchTrace(ctx, centsHistory, HISTORY_LENGTH, width, centsToY, theme)
  }

  if (currentCents != null && active) {
    const dotX = width - (isGlass ? 18 : 16)
    const dotY = centsToY(currentCents)
    const dotColor = getIntonationColor(currentCents)
    const dotGlow = glowColorForCents(currentCents)

    ctx.beginPath()
    ctx.arc(dotX, dotY, isGlass ? 7 : 6, 0, Math.PI * 2)
    ctx.fillStyle = dotGlow.replace('0.55', '0.3')
    ctx.fill()
    ctx.beginPath()
    ctx.arc(dotX, dotY, isGlass ? 5 : 4.5, 0, Math.PI * 2)
    ctx.fillStyle = dotColor
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.lineWidth = 1.75
    ctx.stroke()
  }

  if (isGlass) return

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
  canvasTheme: PitchCanvasTheme = 'solid',
  options: PitchTrackerOptions = {},
): PitchReadout {
  const source = options.source ?? 'media'
  const micStreamRef = options.micStreamRef
  const persistWhenPaused = options.persistWhenPaused ?? false
  const emptyReadout = frequencyToPitchReadout(0)
  const [readout, setReadout] = useState<PitchReadout>(emptyReadout)
  const graphRef = useRef<ActivePitchGraph | null>(null)
  const tickRef = useRef<number | null>(null)
  const readoutRef = useRef<PitchReadout>(emptyReadout)
  const lastPitchAtRef = useRef(0)
  const historyRef = useRef<number[]>([])
  const mountedRef = useRef(true)
  const needleCentsRef = useRef<number | null>(null)
  const lastNoteRef = useRef('—')
  const lastReadoutEmitRef = useRef(0)
  const goodFrameCountRef = useRef(0)
  const lastStableCentsRef = useRef<number | null>(null)
  const attachInFlightRef = useRef(false)
  const framesSinceAttachAttemptRef = useRef(0)
  const tryAttachRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    historyRef.current = []
    needleCentsRef.current = null
    goodFrameCountRef.current = 0
    lastStableCentsRef.current = null
    lastNoteRef.current = '—'
    framesSinceAttachAttemptRef.current = 0
    lastPitchAtRef.current = 0
  }, [mediaKey, source])

  useEffect(() => {
    readoutRef.current = readout
  }, [readout])

  useEffect(() => {
    return () => {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
      safeDisposeActiveGraph(graphRef.current)
      graphRef.current = null
    }
  }, [mediaKey, source])

  useEffect(() => {
    if (!enabled) {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
      historyRef.current = []
      needleCentsRef.current = null
      goodFrameCountRef.current = 0
      lastStableCentsRef.current = null
      lastNoteRef.current = '—'
      lastReadoutEmitRef.current = 0
      safeDisposeActiveGraph(graphRef.current)
      graphRef.current = null
      if (mountedRef.current) {
        readoutRef.current = emptyReadout
        setReadout(emptyReadout)
      }
      return
    }

    let cancelled = false
    let retryTimer: number | null = null
    let attachAttempt = 0
    const MAX_ATTACH_ATTEMPTS = source === 'microphone' ? 12 : 80

    const scheduleRetry = (delayMs: number) => {
      if (cancelled || attachAttempt >= MAX_ATTACH_ATTEMPTS) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void tryAttach()
      }, delayMs)
    }

    const tryAttach = async () => {
      if (cancelled || attachInFlightRef.current) return
      attachInFlightRef.current = true
      attachAttempt += 1

      try {
        if (source === 'microphone') {
          const graph = await createMicPitchGraph(micStreamRef?.current)
          if (cancelled) {
            safeDisposeMicGraph(graph)
            return
          }
          safeDisposeActiveGraph(graphRef.current)
          graphRef.current = graph
          return
        }

        const media = mediaRef.current
        if (!media) {
          scheduleRetry(50)
          return
        }

        const graph = await createPitchGraph(media)
        if (cancelled) {
          safeDisposePitchGraph(graph)
          return
        }
        safeDisposeActiveGraph(graphRef.current)
        graphRef.current = graph
      } catch {
        scheduleRetry(source === 'microphone' ? 120 : 80)
      } finally {
        attachInFlightRef.current = false
      }
    }

    void tryAttach()
    tryAttachRef.current = tryAttach

    return () => {
      cancelled = true
      tryAttachRef.current = null
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      safeDisposeActiveGraph(graphRef.current)
      graphRef.current = null
    }
  }, [enabled, mediaKey, mediaRef, micStreamRef, source])

  useEffect(() => {
    const shouldTick = enabled && (isPlaying || persistWhenPaused)

    if (!shouldTick) {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
      if (!isPlaying && !persistWhenPaused) {
        if (graphRef.current && isMediaPitchGraph(graphRef.current)) {
          graphRef.current.smoothed = null
        } else if (graphRef.current && !isMediaPitchGraph(graphRef.current)) {
          graphRef.current.smoothed = null
        }
        historyRef.current = []
        needleCentsRef.current = null
        goodFrameCountRef.current = 0
        lastStableCentsRef.current = null
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
      framesSinceAttachAttemptRef.current += 1
      let graph = graphRef.current

      if (graph && isMediaPitchGraph(graph) && elementGraphs.get(graph.media) !== graph) {
        graphRef.current = null
        graph = null
      }

      if (!graph) {
        if (
          enabled &&
          isPlaying &&
          framesSinceAttachAttemptRef.current % 18 === 0
        ) {
          void tryAttachRef.current?.()
        }

        const canvas = canvasRef?.current
        if (canvas) {
          drawPitchCanvas(
            canvas,
            new Float32Array(PITCH_FRAME_SIZE),
            historyRef.current,
            needleCentsRef.current ?? readoutRef.current.cents,
            readoutRef.current.noteName !== '—',
            canvasTheme,
          )
        }
        tickRef.current = requestAnimationFrame(tick)
        return
      }

      if (graph.context.state === 'closed') {
        graphRef.current = null
        tickRef.current = requestAnimationFrame(tick)
        return
      }

      if (graph.context.state === 'suspended') {
        void graph.context.resume()
      }

      graph.analyser.getFloatTimeDomainData(graph.buffer)

      const now = performance.now()
      let currentCents: number | null = null
      let active = false

      if (isPlaying) {
        const clarityMin = source === 'microphone' ? PITCH_CLARITY_MIN_MIC : PITCH_CLARITY_MIN
        const rmsGate = source === 'microphone' ? PITCH_RMS_GATE_DB_MIC : PITCH_RMS_GATE_DB_MEDIA
        const holdMs = source === 'microphone' ? PITCH_HOLD_MS_MIC : PITCH_HOLD_MS
        const signalStrong = isSignalAboveRmsGate(graph.buffer, rmsGate)

        if (!signalStrong) {
          goodFrameCountRef.current = 0
          if (
            lastPitchAtRef.current > 0 &&
            now - lastPitchAtRef.current > holdMs
          ) {
            readoutRef.current = emptyReadout
            if (mountedRef.current) setReadout(emptyReadout)
            graph.smoothed = null
            needleCentsRef.current = null
            lastStableCentsRef.current = null
            lastNoteRef.current = '—'
            active = false
          } else if (readoutRef.current.noteName !== '—') {
            currentCents = needleCentsRef.current ?? readoutRef.current.cents
            active = true
          }
        } else {
          const [rawPitch, clarity] = graph.detector.findPitch(
            graph.buffer,
            graph.context.sampleRate,
          )

          const pitch = normalizeInstrumentFrequency(rawPitch)

          if (clarity >= clarityMin && isFrequencyInInstrumentRange(pitch)) {
            graph.smoothed = smoothFrequency(graph.smoothed, pitch)
            const next = stabilizePitchReadout(
              readoutRef.current.noteName === '—' ? null : readoutRef.current,
              frequencyToPitchReadout(graph.smoothed),
            )

            if (next.noteName !== '—') {
              const noteChanged =
                lastNoteRef.current !== '—' && lastNoteRef.current !== next.noteName
              const wasIdle = readoutRef.current.noteName === '—'

              let acceptFrame = true
              if (
                !noteChanged &&
                !wasIdle &&
                lastStableCentsRef.current != null &&
                Math.abs(next.cents - lastStableCentsRef.current) > PITCH_OUTLIER_CENTS &&
                clarity < clarityMin + 0.06
              ) {
                acceptFrame = false
              }

              if (acceptFrame) {
                goodFrameCountRef.current += 1
              } else {
                goodFrameCountRef.current = Math.max(0, goodFrameCountRef.current - 1)
              }

              const attackSatisfied =
                noteChanged || goodFrameCountRef.current >= PITCH_ATTACK_FRAMES

              if (acceptFrame && attackSatisfied) {
                lastNoteRef.current = next.noteName

                if (noteChanged || needleCentsRef.current == null) {
                  needleCentsRef.current = next.cents
                } else {
                  needleCentsRef.current = smoothFrequency(
                    needleCentsRef.current,
                    next.cents,
                    PITCH_NEEDLE_SMOOTH_ALPHA,
                  )
                }

                const intonationCents = Math.max(
                  -50,
                  Math.min(50, needleCentsRef.current ?? next.cents),
                )
                const displayCents = quantizeDisplayCents(intonationCents, CENTS_DISPLAY_STEP)
                const displayReadout: PitchReadout = {
                  ...next,
                  cents: displayCents,
                }

                if (now - lastReadoutEmitRef.current >= PITCH_READOUT_INTERVAL_MS) {
                  readoutRef.current = displayReadout
                  if (mountedRef.current) {
                    setReadout(displayReadout)
                  }
                  lastReadoutEmitRef.current = now
                }

                lastPitchAtRef.current = now
                lastStableCentsRef.current = intonationCents
                currentCents = intonationCents
                active = true

                const history = historyRef.current
                history.push(intonationCents)
                if (history.length > HISTORY_LENGTH) {
                  history.splice(0, history.length - HISTORY_LENGTH)
                }
              }
            } else {
              goodFrameCountRef.current = 0
            }
          } else {
            goodFrameCountRef.current = Math.max(0, goodFrameCountRef.current - 1)
            if (
              lastPitchAtRef.current > 0 &&
              now - lastPitchAtRef.current > holdMs
            ) {
              readoutRef.current = emptyReadout
              if (mountedRef.current) setReadout(emptyReadout)
              graph.smoothed = null
              needleCentsRef.current = null
              lastStableCentsRef.current = null
              lastNoteRef.current = '—'
              active = false
            } else if (readoutRef.current.noteName !== '—') {
              currentCents = needleCentsRef.current ?? readoutRef.current.cents
              active = true
            }
          }
        }
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
          canvasTheme,
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
  }, [canvasRef, canvasTheme, enabled, isPlaying, mediaKey, persistWhenPaused, source])

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
