import { useEffect, useRef, useState, type RefObject } from 'react'
import { PitchDetector } from 'pitchy'
import {
  getTunerProfile,
  PITCH_SILENCE_FLOOR_CENTS,
  type PitchCanvasTheme,
  type PitchTunerProfile,
  type TunerInstrument,
} from '../utils/pitchConfig'
import {
  frequencyToPitchReadout,
  getIntonationColor,
  getTraceColor,
  getTraceZone,
  glowColorForCents,
  isSilenceFloorSample,
  isFrequencyInInstrumentRange,
  isSignalAboveRmsGate,
  movingAverage,
  normalizeInstrumentFrequency,
  quantizeDisplayCents,
  smoothFrequency,
  TUNING_GREEN_CENTS,
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
  /** Live mic: keep trace scrolling on the chart floor during silence. */
  continuousScroll?: boolean
  /** Voice, strings, or brass detection profile. */
  tunerInstrument?: TunerInstrument
}

function micStreamIsLive(stream: MediaStream | null | undefined): boolean {
  return Boolean(
    stream &&
      stream.active &&
      stream.getAudioTracks().some((track) => track.readyState === 'live'),
  )
}

async function createMicPitchGraph(
  profile: PitchTunerProfile,
  existingStream?: MediaStream | null,
  requireExistingStream = false,
): Promise<MicPitchGraph> {
  let stream = micStreamIsLive(existingStream) ? existingStream! : null
  let ownsStream = false

  if (!stream) {
    if (requireExistingStream) {
      throw new Error('Shared mic stream not ready')
    }

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
  analyser.fftSize = profile.frameSizeMic

  const source = context.createMediaStreamSource(stream)
  source.connect(analyser)

  const detector = PitchDetector.forFloat32Array(profile.frameSizeMic)
  detector.clarityThreshold = profile.clarityMinMic
  detector.minVolumeDecibels = profile.rmsGateDbMic

  return {
    context,
    source,
    analyser,
    detector,
    buffer: new Float32Array(profile.frameSizeMic),
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

function attachStreamSourceToGraph(
  graph: PitchGraph,
  context: AudioContext,
  analyser: AnalyserNode,
  media: HTMLMediaElement,
): boolean {
  const stream = getMediaCaptureStream(media)
  if (!stream || !streamHasAudio(stream)) return false

  try {
    const streamSource = context.createMediaStreamSource(stream)
    streamSource.connect(analyser)
    graph.source = streamSource
    graph.mode = 'stream'
    return true
  } catch {
    return false
  }
}

function tryAttachStreamSource(
  context: AudioContext,
  analyser: AnalyserNode,
  media: HTMLMediaElement,
): MediaStreamAudioSourceNode | null {
  const stream = getMediaCaptureStream(media)
  if (!stream || !streamHasAudio(stream)) return null

  try {
    const streamSource = context.createMediaStreamSource(stream)
    streamSource.connect(analyser)
    return streamSource
  } catch {
    return null
  }
}

function refreshMediaPitchStreamSource(graph: PitchGraph): boolean {
  if (graph.context.state === 'closed') return false

  try {
    graph.source.disconnect()
  } catch {
    /* already disconnected */
  }

  return attachStreamSourceToGraph(graph, graph.context, graph.analyser, graph.media)
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

async function createPitchGraph(
  media: HTMLMediaElement,
  profile: PitchTunerProfile,
): Promise<PitchGraph> {
  const existing = elementGraphs.get(media)
  if (existing && existing.context.state !== 'closed') {
    if (existing.analyser.fftSize === profile.frameSize) {
      existing.detector.clarityThreshold = profile.clarityMin
      existing.detector.minVolumeDecibels = profile.rmsGateDbMedia
      return existing
    }
    safeDisposePitchGraph(existing)
  }

  if (existing) {
    elementGraphs.delete(media)
  }

  const context = new AudioContext()
  await context.resume()

  const analyser = context.createAnalyser()
  analyser.fftSize = profile.frameSize

  let source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null
  let mode: PitchGraphMode = 'stream'

  const streamSource = tryAttachStreamSource(context, analyser, media)
  if (streamSource) {
    source = streamSource
    mode = 'stream'
  } else {
    await waitForMediaAudio(media)
    const retryStreamSource = tryAttachStreamSource(context, analyser, media)
    if (retryStreamSource) {
      source = retryStreamSource
      mode = 'stream'
    } else {
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

  const detector = PitchDetector.forFloat32Array(profile.frameSize)
  detector.clarityThreshold = profile.clarityMin
  detector.minVolumeDecibels = profile.rmsGateDbMedia

  const graph: PitchGraph = {
    context,
    source,
    analyser,
    detector,
    buffer: new Float32Array(profile.frameSize),
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
      getTraceZone(points[index].cents) !== getTraceZone(points[index - 1].cents)
    const isLast = index === points.length - 1

    if (!zoneChanged && !isLast) continue

    const runEnd = isLast && !zoneChanged ? index : index - 1
    const strokeColor = getTraceColor(points[runEnd].cents)

    if (glow && !isSilenceFloorSample(points[runEnd].cents)) {
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

interface TraceDisplayPoint {
  x: number
  y: number
  cents: number
}

function buildTraceDisplayPoints(
  centsHistory: number[],
  historyLength: number,
  width: number,
  centsToY: (cents: number) => number,
  graphSmoothWindow: number,
  traceEndBlend: number,
): TraceDisplayPoint[] {
  if (centsHistory.length < 2) return []

  const pass1 = movingAverage(centsHistory, graphSmoothWindow)
  const smoothed =
    graphSmoothWindow >= 4
      ? movingAverage(pass1, Math.max(2, Math.floor(graphSmoothWindow / 2)))
      : pass1

  const rawLast = centsHistory[centsHistory.length - 1]
  if (!isSilenceFloorSample(rawLast)) {
    const lastIdx = smoothed.length - 1
    smoothed[lastIdx] = smoothed[lastIdx] * (1 - traceEndBlend) + rawLast * traceEndBlend
  }

  const historyStep = width / Math.max(historyLength - 1, 1)
  const start = historyLength - smoothed.length

  return smoothed.map((cents, index) => ({
    x: (start + index) * historyStep,
    y: centsToY(cents),
    cents,
  }))
}

function drawSmoothPitchTrace(
  ctx: CanvasRenderingContext2D,
  points: TraceDisplayPoint[],
  theme: PitchCanvasTheme,
): void {
  if (points.length < 2) return

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

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.22)'
  ctx.lineWidth = 8
  ctx.globalAlpha = 0.85
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y)
  }
  ctx.stroke()

  ctx.strokeStyle = gradient
  ctx.lineWidth = 4.25
  ctx.globalAlpha = 0.96
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    ctx.lineTo(points[index].x, points[index].y)
  }
  ctx.stroke()
  ctx.globalAlpha = 1
}

function drawTraceEndpointDot(
  ctx: CanvasRenderingContext2D,
  point: TraceDisplayPoint,
  theme: PitchCanvasTheme,
): void {
  if (isSilenceFloorSample(point.cents)) return

  const dotColor = getIntonationColor(point.cents)
  const dotGlow = glowColorForCents(point.cents)
  const radius = theme === 'glass' ? 5 : 4.5
  const glowRadius = theme === 'glass' ? 7 : 6

  ctx.beginPath()
  ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2)
  ctx.fillStyle = dotGlow.replace('0.55', '0.3')
  ctx.fill()
  ctx.beginPath()
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = dotColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.75
  ctx.stroke()
}

function drawPitchCanvas(
  canvas: HTMLCanvasElement,
  timeDomain: Float32Array,
  centsHistory: number[],
  active: boolean,
  theme: PitchCanvasTheme,
  graphSmoothWindow: number,
  traceEndBlend: number,
  liveCents = 0,
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
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])

    const gridXStep = Math.max(16, Math.floor(width / 14))
    for (let x = gridXStep; x < width; x += gridXStep) {
      ctx.beginPath()
      ctx.moveTo(x + 0.5, pitchTop)
      ctx.lineTo(x + 0.5, pitchBottom)
      ctx.stroke()
    }

    const gridYStep = pitchHeight / 8
    for (let i = 1; i < 8; i += 1) {
      const y = pitchTop + i * gridYStep
      ctx.beginPath()
      ctx.moveTo(0, y + 0.5)
      ctx.lineTo(width, y + 0.5)
      ctx.stroke()
    }

    ctx.setLineDash([])

    ctx.font = '500 10px ui-sans-serif, system-ui, -apple-system, "SF Pro Text", sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText('Sharp', 2, centsToY(50) - 10)
    ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.fillText('+50', 2, centsToY(50))
    ctx.fillText('0', 2, centsToY(0))
    ctx.fillText('-50', 2, centsToY(-50))
    ctx.font = '500 10px ui-sans-serif, system-ui, -apple-system, "SF Pro Text", sans-serif'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.24)'
    ctx.fillText('Flat', 2, centsToY(-50) + 10)
  }

  if (isGlass) {
    const inTuneBand = active && Math.abs(liveCents) <= TUNING_GREEN_CENTS
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 420)
    const bandAlpha = inTuneBand ? 0.42 + pulse * 0.38 : 0.22
    ctx.strokeStyle = inTuneBand
      ? `rgba(34, 197, 94, ${bandAlpha})`
      : 'rgba(34, 197, 94, 0.22)'
    ctx.lineWidth = inTuneBand ? 1.25 : 1
    ctx.setLineDash([])
    for (const cents of [TUNING_GREEN_CENTS, -TUNING_GREEN_CENTS]) {
      const y = centsToY(cents)
      if (inTuneBand) {
        ctx.shadowColor = 'rgba(34, 197, 94, 0.55)'
        ctx.shadowBlur = 6 + pulse * 4
      } else {
        ctx.shadowBlur = 0
      }
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.shadowBlur = 0
  }

  ctx.strokeStyle = isGlass ? 'rgba(255, 255, 255, 0.14)' : 'rgba(52, 211, 153, 0.35)'
  ctx.setLineDash(isGlass ? [4, 7] : [4, 6])
  ctx.lineWidth = isGlass ? 1 : 1
  ctx.beginPath()
  ctx.moveTo(0, centsToY(0))
  ctx.lineTo(width, centsToY(0))
  ctx.stroke()
  ctx.setLineDash([])

  const tracePoints = buildTraceDisplayPoints(
    centsHistory,
    HISTORY_LENGTH,
    width,
    centsToY,
    graphSmoothWindow,
    traceEndBlend,
  )

  if (tracePoints.length > 1) {
    drawSmoothPitchTrace(ctx, tracePoints, theme)
  }

  if (active && tracePoints.length > 0) {
    drawTraceEndpointDot(ctx, tracePoints[tracePoints.length - 1], theme)
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
  const continuousScroll =
    options.continuousScroll ?? source === 'microphone'
  const tunerInstrument = options.tunerInstrument ?? 'voice'
  const profile = getTunerProfile(tunerInstrument)
  const profileRef = useRef(profile)
  profileRef.current = profile

  const emptyReadout = frequencyToPitchReadout(0, profile.minHz, profile.maxHz)
  const [readout, setReadout] = useState<PitchReadout>(emptyReadout)
  const graphRef = useRef<ActivePitchGraph | null>(null)
  const tickRef = useRef<number | null>(null)
  const readoutRef = useRef<PitchReadout>(emptyReadout)
  const lastPitchAtRef = useRef(0)
  const historyRef = useRef<number[]>([])
  const mountedRef = useRef(true)
  const needleCentsRef = useRef<number | null>(null)
  const lastNoteRef = useRef('—')
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
  }, [mediaKey, source, tunerInstrument])

  useEffect(() => {
    readoutRef.current = readout
  }, [readout])

  useEffect(() => {
    return () => {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        tickRef.current = null
      }
      const graph = graphRef.current
      if (graph && !isMediaPitchGraph(graph)) {
        safeDisposeMicGraph(graph)
      }
      graphRef.current = null
    }
  }, [mediaKey, source, tunerInstrument])

  useEffect(() => {
    if (source !== 'media' || !enabled) return

    const media = mediaRef.current
    if (!media) return

    const onSeeked = () => {
      historyRef.current = []
      needleCentsRef.current = null
      goodFrameCountRef.current = 0
      lastStableCentsRef.current = null
      lastNoteRef.current = '—'
      lastPitchAtRef.current = 0
      const seekEmpty = frequencyToPitchReadout(0, profileRef.current.minHz, profileRef.current.maxHz)
      readoutRef.current = seekEmpty
      if (mountedRef.current) setReadout(seekEmpty)

      const graph = graphRef.current
      if (graph && isMediaPitchGraph(graph)) {
        graph.smoothed = null
        if (graph.mode === 'stream' && !refreshMediaPitchStreamSource(graph)) {
          elementGraphs.delete(graph.media)
          graphRef.current = null
          void tryAttachRef.current?.()
        }
      }
    }

    media.addEventListener('seeked', onSeeked)
    return () => {
      media.removeEventListener('seeked', onSeeked)
    }
  }, [enabled, mediaKey, mediaRef, source])

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
      const disabledEmpty = frequencyToPitchReadout(
        0,
        profileRef.current.minHz,
        profileRef.current.maxHz,
      )
      const graph = graphRef.current
      if (graph && !isMediaPitchGraph(graph)) {
        safeDisposeMicGraph(graph)
      }
      graphRef.current = null
      if (mountedRef.current) {
        readoutRef.current = disabledEmpty
        setReadout(disabledEmpty)
      }
      return
    }

    let cancelled = false
    let retryTimer: number | null = null
    let attachAttempt = 0
    const MAX_ATTACH_ATTEMPTS = source === 'microphone' ? 12 : 36

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
          const requireSharedMic = Boolean(micStreamRef)
          const sharedStream = micStreamRef?.current

          if (requireSharedMic && !micStreamIsLive(sharedStream)) {
            scheduleRetry(100)
            return
          }

          const graph = await createMicPitchGraph(
            profileRef.current,
            sharedStream,
            requireSharedMic,
          )
          if (cancelled) {
            safeDisposeMicGraph(graph)
            return
          }
          safeDisposeActiveGraph(
            graphRef.current && !isMediaPitchGraph(graphRef.current)
              ? graphRef.current
              : null,
          )
          graphRef.current = graph
          return
        }

        const media = mediaRef.current
        if (!media) {
          scheduleRetry(50)
          return
        }

        const existing = elementGraphs.get(media)
        if (existing && existing.context.state !== 'closed') {
          graphRef.current = existing
          return
        }

        const graph = await createPitchGraph(media, profileRef.current)
        if (cancelled) {
          return
        }
        safeDisposeActiveGraph(graphRef.current && !isMediaPitchGraph(graphRef.current) ? graphRef.current : null)
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
      const graph = graphRef.current
      if (graph && !isMediaPitchGraph(graph)) {
        safeDisposeMicGraph(graph)
      }
      graphRef.current = null
    }
  }, [enabled, mediaKey, mediaRef, micStreamRef, source, tunerInstrument])

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
        if (mountedRef.current) {
          readoutRef.current = emptyReadout
          setReadout(emptyReadout)
        }
        lastPitchAtRef.current = 0
      }
      return
    }

    const tick = () => {
      const activeProfile = profileRef.current
      framesSinceAttachAttemptRef.current += 1
      let graph = graphRef.current

      if (graph && isMediaPitchGraph(graph) && elementGraphs.get(graph.media) !== graph) {
        graphRef.current = null
        graph = null
      }

      if (!graph) {
        if (
          enabled &&
          (isPlaying || persistWhenPaused) &&
          framesSinceAttachAttemptRef.current % 12 === 0
        ) {
          void tryAttachRef.current?.()
        }

        if (continuousScroll && persistWhenPaused && enabled) {
          const history = historyRef.current
          history.push(PITCH_SILENCE_FLOOR_CENTS)
          if (history.length > HISTORY_LENGTH) {
            history.splice(0, history.length - HISTORY_LENGTH)
          }
        }

        const canvas = canvasRef?.current
        if (canvas) {
          drawPitchCanvas(
            canvas,
            new Float32Array(activeProfile.frameSize),
            historyRef.current,
            readoutRef.current.noteName !== '—',
            canvasTheme,
            activeProfile.graphSmoothWindow,
            activeProfile.traceEndBlend,
            readoutRef.current.cents,
          )
        }
        tickRef.current = requestAnimationFrame(tick)
        return
      }

      if (graph.context.state === 'closed') {
        if (isMediaPitchGraph(graph)) {
          elementGraphs.delete(graph.media)
        }
        graphRef.current = null
        if (framesSinceAttachAttemptRef.current % 12 === 0) {
          void tryAttachRef.current?.()
        }
        tickRef.current = requestAnimationFrame(tick)
        return
      }

      if (graph.context.state === 'suspended') {
        void graph.context.resume()
      }

      graph.analyser.getFloatTimeDomainData(graph.buffer)

      const now = performance.now()
      let active = false
      let pushedHistoryThisFrame = false

      const pushHistorySample = (cents: number) => {
        const history = historyRef.current
        history.push(cents)
        if (history.length > HISTORY_LENGTH) {
          history.splice(0, history.length - HISTORY_LENGTH)
        }
        pushedHistoryThisFrame = true
      }

      const pushTraceSample = (targetCents: number, noteChanged: boolean) => {
        const history = historyRef.current
        const last = history[history.length - 1]
        let sample = targetCents

        if (
          last != null &&
          !isSilenceFloorSample(last) &&
          !isSilenceFloorSample(targetCents)
        ) {
          const cap = noteChanged
            ? activeProfile.traceNoteJumpCapCents
            : activeProfile.traceSpikeCapCents
          const jump = Math.abs(targetCents - last)
          if (jump > cap) {
            sample = last + Math.sign(targetCents - last) * cap
          }
        }

        pushHistorySample(sample)
      }

      const clearReadoutAfterSilence = () => {
        readoutRef.current = emptyReadout
        if (mountedRef.current) setReadout(emptyReadout)
        graph.smoothed = null
        needleCentsRef.current = null
        lastStableCentsRef.current = null
        lastNoteRef.current = '—'
        active = false
      }

      if (isPlaying) {
        const clarityMin =
          source === 'microphone' ? activeProfile.clarityMinMic : activeProfile.clarityMin
        const rmsGate =
          source === 'microphone' ? activeProfile.rmsGateDbMic : activeProfile.rmsGateDbMedia
        const holdMs = source === 'microphone' ? activeProfile.holdMsMic : activeProfile.holdMs
        const signalStrong = isSignalAboveRmsGate(graph.buffer, rmsGate)

        if (!signalStrong) {
          goodFrameCountRef.current = 0
          if (
            lastPitchAtRef.current > 0 &&
            now - lastPitchAtRef.current > holdMs
          ) {
            clearReadoutAfterSilence()
          } else if (readoutRef.current.noteName !== '—') {
            active = true
          }
        } else {
          const [rawPitch, clarity] = graph.detector.findPitch(
            graph.buffer,
            graph.context.sampleRate,
          )

          const pitch = normalizeInstrumentFrequency(
            rawPitch,
            activeProfile.minHz,
            activeProfile.maxHz,
          )

          if (
            clarity >= clarityMin &&
            isFrequencyInInstrumentRange(pitch, activeProfile.minHz, activeProfile.maxHz)
          ) {
            graph.smoothed = smoothFrequency(
              graph.smoothed,
              pitch,
              activeProfile.smoothAlpha,
            )
            const readoutHz =
              clarity >= clarityMin ? pitch : graph.smoothed ?? pitch
            const preferMidi =
              readoutRef.current.noteName !== '—' ? readoutRef.current.midi : null
            const next = frequencyToPitchReadout(
              readoutHz,
              activeProfile.minHz,
              activeProfile.maxHz,
              preferMidi,
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
                Math.abs(next.cents - lastStableCentsRef.current) > activeProfile.outlierCents &&
                clarity < clarityMin + 0.03
              ) {
                acceptFrame = false
              }

              if (acceptFrame) {
                goodFrameCountRef.current += 1
              } else {
                goodFrameCountRef.current = Math.max(0, goodFrameCountRef.current - 1)
              }

              const attackSatisfied =
                noteChanged || goodFrameCountRef.current >= activeProfile.attackFrames

              if (acceptFrame && attackSatisfied) {
                lastNoteRef.current = next.noteName

                const intonationCents = Math.max(-50, Math.min(50, next.cents))
                needleCentsRef.current = intonationCents
                const displayCents = quantizeDisplayCents(
                  intonationCents,
                  activeProfile.readoutCentsStep,
                )
                const displayReadout: PitchReadout = {
                  ...next,
                  cents: displayCents,
                }

                readoutRef.current = displayReadout
                if (mountedRef.current) {
                  setReadout(displayReadout)
                }

                lastPitchAtRef.current = now
                lastStableCentsRef.current = intonationCents
                active = true
                pushTraceSample(intonationCents, noteChanged)
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
              clearReadoutAfterSilence()
            } else if (readoutRef.current.noteName !== '—') {
              active = true
            }
          }
        }

        if (continuousScroll && !pushedHistoryThisFrame) {
          pushHistorySample(PITCH_SILENCE_FLOOR_CENTS)
        }
      } else if (continuousScroll && persistWhenPaused) {
        if (!pushedHistoryThisFrame) {
          pushHistorySample(PITCH_SILENCE_FLOOR_CENTS)
        }
        if (readoutRef.current.noteName !== '—') {
          active = true
        }
      } else if (readoutRef.current.noteName !== '—') {
        active = true
      }

      const canvas = canvasRef?.current
      if (canvas) {
        drawPitchCanvas(
          canvas,
          graph.buffer,
          historyRef.current,
          active,
          canvasTheme,
          activeProfile.graphSmoothWindow,
          activeProfile.traceEndBlend,
          readoutRef.current.cents,
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
  }, [
    canvasRef,
    canvasTheme,
    continuousScroll,
    emptyReadout,
    enabled,
    isPlaying,
    mediaKey,
    persistWhenPaused,
    source,
    tunerInstrument,
  ])

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
