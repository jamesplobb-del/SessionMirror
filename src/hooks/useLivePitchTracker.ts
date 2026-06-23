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
  stabilizePitchReadout,
  TUNING_GREEN_CENTS,
  type PitchReadout,
} from '../utils/pitchUtils'
import {
  getMusicRecordingAudioConstraints,
  tuneMusicRecordingStream,
} from '../utils/audioCapture'
import {
  getPlaybackAudioContext,
  isSharedPlaybackContext,
  resumePlaybackAudioContext,
} from '../utils/playbackAudioContext'
import {
  getTakePlaybackSpeakerNodes,
  registerTakePlaybackSpeakerRoute,
  routeTakePlaybackToSpeaker,
  updateTakePlaybackSpeakerGain,
} from '../utils/takePlaybackSpeaker'
const HISTORY_LENGTH = 140

/** Brief hold before glow begins (~220ms). */
const IN_TUNE_GLOW_HOLD_MS = 220
/** Initial ramp to visible glow (~450ms). */
const IN_TUNE_GLOW_RAMP_MS = 450
/** Extra brightness while holding in tune (up to ~5s). */
const IN_TUNE_GLOW_SUSTAIN_MS = 5000
/** Hysteresis: leave glow zone above this |cents|. */
const IN_TUNE_GLOW_EXIT_CENTS = 8

function lerpValue(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function computeInTuneGlowTarget(heldMs: number): number {
  if (heldMs < IN_TUNE_GLOW_HOLD_MS) return 0
  const elapsed = heldMs - IN_TUNE_GLOW_HOLD_MS
  const ramp = Math.min(0.78, elapsed / IN_TUNE_GLOW_RAMP_MS)
  const sustain =
    elapsed > IN_TUNE_GLOW_RAMP_MS
      ? Math.min(0.82, (elapsed - IN_TUNE_GLOW_RAMP_MS) / IN_TUNE_GLOW_SUSTAIN_MS)
      : 0
  return ramp + sustain
}

function updateInTuneBandGlow(
  glow: { current: number },
  inTuneSince: { current: number },
  now: number,
  dtMs: number,
  inTune: boolean,
): void {
  if (inTune) {
    if (inTuneSince.current === 0) inTuneSince.current = now
    const target = computeInTuneGlowTarget(now - inTuneSince.current)
    const ease = Math.min(1, dtMs * 0.0055)
    glow.current += (target - glow.current) * ease
  } else {
    inTuneSince.current = 0
    const ease = Math.min(1, dtMs * 0.003)
    glow.current += (0 - glow.current) * ease
  }
}

function isInTuneForGlow(
  readout: PitchReadout,
  eligible: { current: boolean },
): boolean {
  if (readout.noteName === '—') {
    eligible.current = false
    return false
  }
  const abs = Math.abs(readout.cents)
  if (abs <= TUNING_GREEN_CENTS) eligible.current = true
  else if (abs >= IN_TUNE_GLOW_EXIT_CENTS) eligible.current = false
  return eligible.current
}

function sampleInTuneBandGlow(
  glow: { current: number },
  inTuneSince: { current: number },
  lastFrameAt: { current: number },
  glowEligible: { current: boolean },
  readout: PitchReadout,
): number {
  const now = performance.now()
  const dtMs =
    lastFrameAt.current > 0 ? Math.min(48, now - lastFrameAt.current) : 16
  lastFrameAt.current = now
  const inTune = isInTuneForGlow(readout, glowEligible)
  updateInTuneBandGlow(glow, inTuneSince, now, dtMs, inTune)
  return glow.current
}

function drawInTuneBandRegion(
  ctx: CanvasRenderingContext2D,
  width: number,
  centsToY: (cents: number) => number,
  inTuneHighlight: number,
  lite = false,
): void {
  const yTop = centsToY(TUNING_GREEN_CENTS)
  const yBottom = centsToY(-TUNING_GREEN_CENTS)
  const bandTop = Math.min(yTop, yBottom)
  const bandHeight = Math.abs(yBottom - yTop)
  const t = Math.min(1, inTuneHighlight)
  const boost = Math.max(0, inTuneHighlight)

  if (lite) {
    if (boost > 0.01) {
      ctx.fillStyle = `rgba(34, 197, 94, ${0.05 + t * 0.14})`
      ctx.fillRect(0, bandTop, width, bandHeight)
    }

    const centerY = centsToY(0)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.lineWidth = 1
    ctx.setLineDash([])
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()
    return
  }

  ctx.fillStyle = 'rgba(255, 255, 255, 0.09)'
  ctx.fillRect(0, bandTop, width, bandHeight)

  if (boost > 0.01) {
    ctx.fillStyle = `rgba(34, 197, 94, ${0.07 + t * 0.26})`
    ctx.fillRect(0, bandTop, width, bandHeight)
  }

  const lineAlpha = lerpValue(0.38, 0.82, t)
  const red = Math.round(lerpValue(255, 34, t))
  const green = Math.round(lerpValue(255, 197, t))
  const blue = Math.round(lerpValue(255, 94, t))

  ctx.lineWidth = lerpValue(1.1, 1.65, t)
  ctx.setLineDash([])

  for (const cents of [TUNING_GREEN_CENTS, -TUNING_GREEN_CENTS]) {
    const y = centsToY(cents)
    if (!lite && boost > 0.12) {
      ctx.shadowColor = `rgba(34, 197, 94, ${0.35 + t * 0.55})`
      ctx.shadowBlur = 2 + boost * 14
    } else {
      ctx.shadowBlur = 0
    }
    ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, ${lineAlpha})`
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
  ctx.shadowBlur = 0
}

/** Dispatched when an element-routed pitch graph is torn down (requires media remount). */
export const PITCH_GRAPH_RELEASED_EVENT = 'pitchgraph-released'

type PitchGraphMode = 'stream' | 'element'

/** Speaker passthrough when Web Audio routes playback (element is already full scale). */
const MEDIA_PLAYBACK_GAIN = 1

/**
 * When the pitch graph taps the shared speaker bus, the speaker module owns the
 * (boosted) output gain — leave it alone. Only standalone stream passthroughs
 * use the unity analysis gain.
 */
function applyPitchOutputGain(
  media: HTMLMediaElement,
  passthrough: GainNode | null,
): void {
  if (!passthrough) return
  const speakerNodes = getTakePlaybackSpeakerNodes(media)
  if (speakerNodes && speakerNodes.gain === passthrough) {
    updateTakePlaybackSpeakerGain(media, 1, false)
  } else {
    passthrough.gain.value = MEDIA_PLAYBACK_GAIN
  }
}

interface PitchGraph {
  context: AudioContext
  source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode
  analyser: AnalyserNode
  passthrough: GainNode | null
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

const MIC_PITCH_ATTACH_DEFER_MS = 400
/** Economy mic tick (~14fps) for audio-mode HUD — keeps vault/settings responsive. */
const MIC_ECONOMY_TICK_MS = 72
/** Throttle React readout publishes in economy mode only. */
const READOUT_PUBLISH_ECONOMY_MS = 100
/** Low-latency mic FFT for the camera widget (smaller window = less phase lag). */
const REALTIME_MIC_FRAME_SIZE = 2048

export type PitchTrackerSource = 'media' | 'microphone'

export interface PitchTrackerOptions {
  source?: PitchTrackerSource
  micStreamRef?: RefObject<MediaStream | null>
  /** Keep readout/history and redraw the canvas while paused (video widget). */
  persistWhenPaused?: boolean
  /** Live mic: keep trace scrolling on the chart floor during silence. */
  continuousScroll?: boolean
  /** Voice, strings, or winds detection profile. */
  tunerInstrument?: TunerInstrument
  /** Full-rate mic analysis + canvas (camera widget). Economy mode for audio HUD. */
  realtimeMode?: boolean
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
  frameSizeOverride?: number,
): Promise<MicPitchGraph> {
  let stream = micStreamIsLive(existingStream) ? existingStream! : null
  let ownsStream = false

  if (!stream) {
    if (requireExistingStream) {
      throw new Error('Shared mic stream not ready')
    }

    try {
      const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
      if (!getUserMedia) {
        console.warn('navigator.mediaDevices.getUserMedia is unavailable for pitch tracking')
        throw new Error('Microphone unavailable')
      }

      stream = await getUserMedia({
        audio: getMusicRecordingAudioConstraints(),
        video: false,
      })
    } catch (err) {
      console.warn('Failed to acquire microphone for pitch tracking', err)
      throw err
    }
    await tuneMusicRecordingStream(stream)
    ownsStream = true
  } else {
    /* Shared session mic is already tuned in useCameraSession.acquireStream. */
  }

  const context = new AudioContext({ latencyHint: 'playback' })
  await context.resume()

  const micFrameSize = frameSizeOverride ?? profile.frameSizeMic

  const analyser = context.createAnalyser()
  analyser.fftSize = micFrameSize

  const source = context.createMediaStreamSource(stream)
  source.connect(analyser)

  const detector = PitchDetector.forFloat32Array(micFrameSize)
  detector.clarityThreshold = profile.clarityMinMic
  detector.minVolumeDecibels = profile.rmsGateDbMic

  return {
    context,
    source,
    analyser,
    detector,
    buffer: new Float32Array(micFrameSize),
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

function connectStreamSourceToAnalyserAndSpeakers(
  context: AudioContext,
  streamSource: MediaStreamAudioSourceNode,
  analyser: AnalyserNode,
): GainNode {
  streamSource.connect(analyser)
  const passthrough = context.createGain()
  passthrough.gain.value = MEDIA_PLAYBACK_GAIN
  streamSource.connect(passthrough)
  passthrough.connect(context.destination)
  return passthrough
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
    try {
      graph.passthrough?.disconnect()
    } catch {
      /* already disconnected */
    }

    const streamSource = context.createMediaStreamSource(stream)
    graph.passthrough = connectStreamSourceToAnalyserAndSpeakers(context, streamSource, analyser)
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
): { source: MediaStreamAudioSourceNode; passthrough: GainNode } | null {
  const stream = getMediaCaptureStream(media)
  if (!stream || !streamHasAudio(stream)) return null

  try {
    const streamSource = context.createMediaStreamSource(stream)
    const passthrough = connectStreamSourceToAnalyserAndSpeakers(context, streamSource, analyser)
    return { source: streamSource, passthrough }
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
      applyPitchOutputGain(media, existing.passthrough)
      resumePlaybackAudioContext()
      return existing
    }
    safeDisposePitchGraph(existing)
  }

  if (existing) {
    elementGraphs.delete(media)
  }

  const context = await getPlaybackAudioContext()

  const analyser = context.createAnalyser()
  analyser.fftSize = profile.frameSize

  await waitForMediaAudio(media)

  let source: MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null = null
  let passthrough: GainNode | null = null
  let mode: PitchGraphMode = 'element'

  // Prefer element routing — full signal to speakers on iOS.
  // captureStream taps analysis-only and skips native element output (very quiet).
  try {
    const elementSource = context.createMediaElementSource(media)
    passthrough = context.createGain()
    passthrough.gain.value = MEDIA_PLAYBACK_GAIN
    elementSource.connect(analyser)
    elementSource.connect(passthrough)
    passthrough.connect(context.destination)
    registerTakePlaybackSpeakerRoute(media, elementSource, passthrough)
    applyPitchOutputGain(media, passthrough)
    source = elementSource
    mode = 'element'
  } catch {
    const speakerNodes = getTakePlaybackSpeakerNodes(media)
    if (speakerNodes) {
      try {
        speakerNodes.source.connect(analyser)
      } catch {
        /* analyser may already be connected */
      }
      passthrough = speakerNodes.gain
      applyPitchOutputGain(media, passthrough)
      source = speakerNodes.source
      mode = 'element'
    } else {
      const streamAttach = tryAttachStreamSource(context, analyser, media)
      if (!streamAttach) {
        throw new Error('Unable to attach pitch tracker to this playback source')
      }
      source = streamAttach.source
      passthrough = streamAttach.passthrough
      mode = 'stream'
      media.muted = true
    }
  }

  const detector = PitchDetector.forFloat32Array(profile.frameSize)
  detector.clarityThreshold = profile.clarityMin
  detector.minVolumeDecibels = profile.rmsGateDbMedia

  const graph: PitchGraph = {
    context,
    source,
    analyser,
    passthrough,
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

  const speakerNodes = getTakePlaybackSpeakerNodes(media)
  const onSharedSpeakerBus = Boolean(speakerNodes && graph.source === speakerNodes.source)

  try {
    if (onSharedSpeakerBus) {
      // Pitch tapped the shared speaker bus — only remove the analyser tap.
      graph.analyser.disconnect()
    } else {
      graph.source.disconnect()
      graph.analyser.disconnect()
      graph.passthrough?.disconnect()
    }
  } catch {
    /* graph may already be disconnected */
  }

  const { context } = graph
  if (!isSharedPlaybackContext(context)) {
    void context.close().catch(() => {})
  }
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
  singlePassSmooth = false,
): TraceDisplayPoint[] {
  if (centsHistory.length < 2) return []

  const pass1 = movingAverage(centsHistory, graphSmoothWindow)
  const smoothed =
    singlePassSmooth || graphSmoothWindow < 4
      ? pass1
      : movingAverage(pass1, Math.max(2, Math.floor(graphSmoothWindow / 2)))

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
  responsiveTrace = false,
): void {
  if (points.length < 2) return

  if (theme === 'glass-legacy' && !responsiveTrace) {
    drawColoredTraceSegments(ctx, points, 4.5, 0.34, true)
    drawColoredTraceSegments(ctx, points, 3.1, 0.96)
    return
  }

  if (theme === 'glass-widget' || theme === 'glass-legacy') {
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
  inTuneGlow = 0,
): void {
  if (isSilenceFloorSample(point.cents)) return

  const dotColor = getIntonationColor(point.cents)
  const dotGlow = glowColorForCents(point.cents)
  const isGreen = Math.abs(point.cents) <= TUNING_GREEN_CENTS
  const glowBoost = isGreen ? Math.max(0, inTuneGlow) : 0
  const isWidgetGlass = theme === 'glass-widget'
  const isGlassStyle = theme === 'glass-widget' || theme === 'glass-legacy'
  const radius = isGlassStyle ? 5 + glowBoost * 1.2 : 4.5
  const glowRadius = isGlassStyle ? 7 + glowBoost * 5 : 6

  if (glowBoost > 0.08 && !isWidgetGlass) {
    ctx.shadowColor = `rgba(34, 197, 94, ${0.35 + Math.min(1, glowBoost) * 0.5})`
    ctx.shadowBlur = 4 + glowBoost * 12
  }

  ctx.beginPath()
  ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2)
  ctx.fillStyle = dotGlow.replace('0.55', String(0.28 + Math.min(1, glowBoost) * 0.25))
  ctx.fill()
  ctx.beginPath()
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
  ctx.fillStyle = dotColor
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.75
  ctx.stroke()
  ctx.shadowBlur = 0
}

function getGlassLayoutMetrics(height: number) {
  const pitchTop = height * 0.06
  const pitchBottom = height * 0.96
  const pitchHeight = pitchBottom - pitchTop
  const midPitchY = pitchTop + pitchHeight * 0.5
  const centsToY = (cents: number) =>
    midPitchY - (Math.max(-50, Math.min(50, cents)) / 50) * (pitchHeight * 0.46)
  return { pitchTop, pitchBottom, pitchHeight, centsToY }
}

function drawGlassLegacyGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  pitchTop: number,
  pitchBottom: number,
  pitchHeight: number,
  centsToY: (cents: number) => number,
): void {
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

/** Bumped when static grid art changes — invalidates cached offscreen layers. */
const GLASS_STATIC_GRID_VERSION = 5

type GlassStaticVariant = 'widget' | 'legacy'

interface GlassStaticLayerCache {
  width: number
  height: number
  dpr: number
  version: number
  variant: GlassStaticVariant
  canvas: HTMLCanvasElement
}

const glassStaticLayerCache = new WeakMap<HTMLCanvasElement, GlassStaticLayerCache>()

function drawGlassWidgetStaticContent(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height)

  const bg = ctx.createLinearGradient(0, 0, 0, height)
  bg.addColorStop(0, 'rgba(6, 8, 12, 0.72)')
  bg.addColorStop(1, 'rgba(2, 3, 5, 0.82)')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)
}

function blitGlassStaticLayer(
  targetCtx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number,
  variant: GlassStaticVariant,
): ReturnType<typeof getGlassLayoutMetrics> {
  let cache = glassStaticLayerCache.get(canvas)
  if (
    !cache ||
    cache.width !== width ||
    cache.height !== height ||
    cache.dpr !== dpr ||
    cache.version !== GLASS_STATIC_GRID_VERSION ||
    cache.variant !== variant
  ) {
    const off = cache?.canvas ?? document.createElement('canvas')
    off.width = Math.floor(width * dpr)
    off.height = Math.floor(height * dpr)
    const offCtx = off.getContext('2d')
    if (!offCtx) return getGlassLayoutMetrics(height)
    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (variant === 'widget') {
      drawGlassWidgetStaticContent(offCtx, width, height)
    } else {
      const { pitchTop, pitchBottom, pitchHeight, centsToY } = getGlassLayoutMetrics(height)
      offCtx.clearRect(0, 0, width, height)
      drawGlassLegacyGrid(offCtx, width, pitchTop, pitchBottom, pitchHeight, centsToY)
    }
    cache = { width, height, dpr, version: GLASS_STATIC_GRID_VERSION, variant, canvas: off }
    glassStaticLayerCache.set(canvas, cache)
  }

  targetCtx.drawImage(cache.canvas, 0, 0, width, height)
  return getGlassLayoutMetrics(height)
}

function drawPitchCanvas(
  canvas: HTMLCanvasElement,
  timeDomain: Float32Array,
  centsHistory: number[],
  active: boolean,
  theme: PitchCanvasTheme,
  graphSmoothWindow: number,
  traceEndBlend: number,
  inTuneHighlight = 0,
  responsiveTrace = false,
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

  const isGlass = theme === 'glass-widget' || theme === 'glass-legacy'
  const isWidgetGlass = theme === 'glass-widget'
  const isLegacyGlass = theme === 'glass-legacy'
  const pitchTop = isGlass ? height * 0.12 : height * 0.04
  const pitchBottom = isGlass ? height * 0.92 : height * 0.86
  const pitchHeight = pitchBottom - pitchTop
  const waveTop = height * 0.88
  const waveHeight = height * 0.1
  const midPitchY = pitchTop + pitchHeight * 0.5

  ctx.clearRect(0, 0, width, height)

  let centsToY: (cents: number) => number

  if (isWidgetGlass) {
    const metrics = blitGlassStaticLayer(ctx, canvas, width, height, dpr, 'widget')
    centsToY = metrics.centsToY
  } else if (isLegacyGlass) {
    const metrics = blitGlassStaticLayer(ctx, canvas, width, height, dpr, 'legacy')
    centsToY = metrics.centsToY
  } else {
    const bg = ctx.createLinearGradient(0, 0, 0, height)
    bg.addColorStop(0, '#0c1018')
    bg.addColorStop(0.55, '#080b12')
    bg.addColorStop(1, '#050608')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
    centsToY = (cents: number) =>
      midPitchY - (Math.max(-50, Math.min(50, cents)) / 50) * (pitchHeight * 0.46)
  }

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
  }

  if (isLegacyGlass) {
    drawInTuneBandRegion(ctx, width, centsToY, inTuneHighlight, false)
    const centerY = centsToY(0)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
    ctx.setLineDash([4, 7])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()
    ctx.setLineDash([])
  } else if (isWidgetGlass) {
    drawInTuneBandRegion(ctx, width, centsToY, inTuneHighlight, true)
  } else {
    const centerY = centsToY(0)
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)'
    ctx.setLineDash([4, 6])
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, centerY)
    ctx.lineTo(width, centerY)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const tracePoints = buildTraceDisplayPoints(
    centsHistory,
    HISTORY_LENGTH,
    width,
    centsToY,
    graphSmoothWindow,
    traceEndBlend,
    responsiveTrace,
  )

  if (tracePoints.length > 1) {
    drawSmoothPitchTrace(ctx, tracePoints, theme, responsiveTrace)
  }

  if (active && tracePoints.length > 0) {
    drawTraceEndpointDot(ctx, tracePoints[tracePoints.length - 1], theme, inTuneHighlight)
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

function drawPitchCanvasIfDue(
  canvas: HTMLCanvasElement,
  timeDomain: Float32Array,
  centsHistory: number[],
  active: boolean,
  theme: PitchCanvasTheme,
  graphSmoothWindow: number,
  traceEndBlend: number,
  inTuneHighlight: number,
  responsiveTrace: boolean,
): void {
  drawPitchCanvas(
    canvas,
    timeDomain,
    centsHistory,
    active,
    theme,
    graphSmoothWindow,
    traceEndBlend,
    inTuneHighlight,
    responsiveTrace,
  )
}

export interface LivePitchTrackerState {
  readout: PitchReadout
  /** 0 = no glow, rises with sustained in-tune time (can exceed 1). */
  inTuneGlow: number
}

export function useLivePitchTracker(
  mediaRef: RefObject<HTMLMediaElement | null>,
  enabled: boolean,
  isPlaying: boolean,
  mediaKey: string,
  canvasRef?: RefObject<HTMLCanvasElement | null>,
  canvasTheme: PitchCanvasTheme = 'solid',
  options: PitchTrackerOptions = {},
): LivePitchTrackerState {
  const source = options.source ?? 'media'
  const micStreamRef = options.micStreamRef
  const persistWhenPaused = options.persistWhenPaused ?? false
  const continuousScroll =
    options.continuousScroll ?? source === 'microphone'
  const realtimeMode = options.realtimeMode ?? false
  const tunerInstrument = options.tunerInstrument ?? 'voice'
  const profile = getTunerProfile(tunerInstrument)
  const profileRef = useRef(profile)
  profileRef.current = profile

  const emptyReadout = frequencyToPitchReadout(0, profile.minHz, profile.maxHz)
  const [readout, setReadout] = useState<PitchReadout>(emptyReadout)
  const [inTuneGlow, setInTuneGlow] = useState(0)
  const graphRef = useRef<ActivePitchGraph | null>(null)
  const tickRef = useRef<number | null>(null)
  const readoutRef = useRef<PitchReadout>(emptyReadout)
  const lastPitchAtRef = useRef(0)
  const historyRef = useRef<number[]>([])
  const mountedRef = useRef(true)
  const needleCentsRef = useRef<number | null>(null)
  const readoutSmoothedHzRef = useRef<number | null>(null)
  const lastNoteRef = useRef('—')
  const goodFrameCountRef = useRef(0)
  const lastStableCentsRef = useRef<number | null>(null)
  const isAttaching = useRef(false)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const realtimeModeRef = useRef(realtimeMode)
  realtimeModeRef.current = realtimeMode
  const micStreamRefStable = useRef(micStreamRef)
  micStreamRefStable.current = micStreamRef
  const mediaRefStable = useRef(mediaRef)
  mediaRefStable.current = mediaRef
  const framesSinceAttachAttemptRef = useRef(0)
  const tryAttachRef = useRef<(() => Promise<void>) | null>(null)
  const inTuneGlowRef = useRef(0)
  const inTuneSinceRef = useRef(0)
  const inTuneBandFrameRef = useRef(0)
  const inTuneGlowEligibleRef = useRef(false)
  const lastPublishedGlowRef = useRef(0)
  const lastMicTickAtRef = useRef(0)
  const lastReadoutPublishAtRef = useRef(0)

  const publishReadout = (next: PitchReadout, force = false) => {
    const noteChanged = next.noteName !== readoutRef.current.noteName
    const centsChanged =
      Math.abs(next.cents - readoutRef.current.cents) >=
      profileRef.current.readoutCentsStep * 0.5
    const now = performance.now()
    const economyInterval = realtimeModeRef.current ? 0 : READOUT_PUBLISH_ECONOMY_MS

    if (
      !force &&
      !noteChanged &&
      !centsChanged &&
      economyInterval > 0 &&
      now - lastReadoutPublishAtRef.current < economyInterval
    ) {
      return
    }

    readoutRef.current = next
    lastReadoutPublishAtRef.current = now
    if (mountedRef.current) setReadout(next)
  }

  const publishInTuneGlow = (value: number) => {
    if (Math.abs(value - lastPublishedGlowRef.current) < 0.01) return
    lastPublishedGlowRef.current = value
    if (mountedRef.current) setInTuneGlow(value)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    historyRef.current = []
    readoutSmoothedHzRef.current = null
    needleCentsRef.current = null
    goodFrameCountRef.current = 0
    lastStableCentsRef.current = null
    lastNoteRef.current = '—'
    framesSinceAttachAttemptRef.current = 0
    lastPitchAtRef.current = 0
    inTuneGlowRef.current = 0
    inTuneSinceRef.current = 0
    inTuneBandFrameRef.current = 0
    inTuneGlowEligibleRef.current = false
    lastPublishedGlowRef.current = 0
    setInTuneGlow(0)
  }, [mediaKey])

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
  }, [mediaKey])

  useEffect(() => {
    if (source !== 'media' || !enabled) return

    const media = mediaRef.current
    if (!media) return

    const onSeeked = () => {
      historyRef.current = []
      readoutSmoothedHzRef.current = null
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
      readoutSmoothedHzRef.current = null
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
    let initTimer: number | null = null
    let attachAttempt = 0
    const MAX_ATTACH_ATTEMPTS = sourceRef.current === 'microphone' ? 12 : 36

    const scheduleRetry = (delayMs: number) => {
      if (cancelled || attachAttempt >= MAX_ATTACH_ATTEMPTS) return
      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void tryAttach()
      }, delayMs)
    }

    const tryAttach = async () => {
      if (cancelled || isAttaching.current) return

      if (
        graphRef.current &&
        sourceRef.current === 'microphone' &&
        !isMediaPitchGraph(graphRef.current)
      ) {
        return
      }

      isAttaching.current = true
      attachAttempt += 1

      const source = sourceRef.current
      const micStreamRef = micStreamRefStable.current
      const mediaRef = mediaRefStable.current

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
            realtimeModeRef.current ? REALTIME_MIC_FRAME_SIZE : undefined,
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
        scheduleRetry(sourceRef.current === 'microphone' ? 120 : 80)
      } finally {
        isAttaching.current = false
      }
    }

    const beginAttach = () => {
      if (cancelled || isAttaching.current) return
      void tryAttach()
    }

    if (sourceRef.current === 'microphone') {
      initTimer = window.setTimeout(
        beginAttach,
        realtimeModeRef.current ? 0 : MIC_PITCH_ATTACH_DEFER_MS,
      )
    } else {
      beginAttach()
    }

    tryAttachRef.current = tryAttach

    return () => {
      cancelled = true
      tryAttachRef.current = null
      if (initTimer !== null) {
        window.clearTimeout(initTimer)
      }
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
      }
      const graph = graphRef.current
      if (graph && !isMediaPitchGraph(graph)) {
        safeDisposeMicGraph(graph)
      }
      graphRef.current = null
      isAttaching.current = false
    }
  }, [enabled, mediaKey])

  useEffect(() => {
    const shouldTick = enabled && (isPlaying || persistWhenPaused)

    if (!shouldTick) {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        window.clearTimeout(tickRef.current)
        tickRef.current = null
      }
      if (!isPlaying && !persistWhenPaused) {
        if (graphRef.current && isMediaPitchGraph(graphRef.current)) {
          graphRef.current.smoothed = null
        } else if (graphRef.current && !isMediaPitchGraph(graphRef.current)) {
          graphRef.current.smoothed = null
        }
        historyRef.current = []
        readoutSmoothedHzRef.current = null
    needleCentsRef.current = null
        goodFrameCountRef.current = 0
        lastStableCentsRef.current = null
        lastNoteRef.current = '—'
        if (mountedRef.current) {
          readoutRef.current = emptyReadout
          setReadout(emptyReadout)
        }
        lastPitchAtRef.current = 0
        inTuneGlowRef.current = 0
        inTuneSinceRef.current = 0
        inTuneBandFrameRef.current = 0
        inTuneGlowEligibleRef.current = false
        lastPublishedGlowRef.current = 0
        setInTuneGlow(0)
      }
      return
    }

    const tickStats = { frames: 0 }

    const tick = () => {
      const frameNow = performance.now()
      if (
        sourceRef.current === 'microphone' &&
        continuousScroll &&
        !realtimeModeRef.current
      ) {
        if (frameNow - lastMicTickAtRef.current < MIC_ECONOMY_TICK_MS) {
          tickRef.current = requestAnimationFrame(tick)
          return
        }
        lastMicTickAtRef.current = frameNow
      }

      const activeProfile = profileRef.current
      const snappyWidgetTrace =
        realtimeModeRef.current && !activeProfile.widgetSmoothTrace
      const responsiveTrace = snappyWidgetTrace
      const traceBlend = snappyWidgetTrace
        ? Math.max(activeProfile.traceEndBlend, 0.92)
        : activeProfile.traceEndBlend
      const traceWindow = snappyWidgetTrace
        ? Math.min(activeProfile.graphSmoothWindow, 3)
        : activeProfile.graphSmoothWindow
      const traceSpikeCap = snappyWidgetTrace
        ? activeProfile.traceSpikeCapCents * 1.75
        : activeProfile.traceSpikeCapCents
      const traceNoteJumpCap = snappyWidgetTrace
        ? activeProfile.traceNoteJumpCapCents * 1.5
        : activeProfile.traceNoteJumpCapCents
      const freqSmoothAlpha = snappyWidgetTrace
        ? Math.max(activeProfile.smoothAlpha, 0.62)
        : activeProfile.smoothAlpha
      framesSinceAttachAttemptRef.current += 1
      tickStats.frames += 1
      let graph = graphRef.current

      if (graph && isMediaPitchGraph(graph) && elementGraphs.get(graph.media) !== graph) {
        graphRef.current = null
        graph = null
      }

      if (!graph) {
        if (source === 'microphone') {
          if (
            enabled &&
            (isPlaying || persistWhenPaused) &&
            framesSinceAttachAttemptRef.current % 12 === 0
          ) {
            void tryAttachRef.current?.()
          }
          // Avoid heavy canvas work while waiting for mic graph attach.
          tickRef.current = realtimeModeRef.current
            ? requestAnimationFrame(tick)
            : (window.setTimeout(tick, 100) as unknown as number)
          return
        }

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
          const bandGlow = sampleInTuneBandGlow(
            inTuneGlowRef,
            inTuneSinceRef,
            inTuneBandFrameRef,
            inTuneGlowEligibleRef,
            readoutRef.current,
          )
          publishInTuneGlow(bandGlow)
          drawPitchCanvasIfDue(
            canvas,
            new Float32Array(activeProfile.frameSize),
            historyRef.current,
            readoutRef.current.noteName !== '—',
            canvasTheme,
            traceWindow,
            traceBlend,
            bandGlow,
            responsiveTrace,
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
          const cap = noteChanged ? traceNoteJumpCap : traceSpikeCap
          const jump = Math.abs(targetCents - last)
          if (jump > cap) {
            sample = last + Math.sign(targetCents - last) * cap
          }
        }

        pushHistorySample(sample)
      }

      const clearReadoutAfterSilence = () => {
        publishReadout(emptyReadout, true)
        graph.smoothed = null
        readoutSmoothedHzRef.current = null
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
              freqSmoothAlpha,
            )
            readoutSmoothedHzRef.current = smoothFrequency(
              readoutSmoothedHzRef.current,
              pitch,
              activeProfile.readoutFreqAlpha,
            )
            const readoutHz = readoutSmoothedHzRef.current ?? pitch
            const preferMidi =
              readoutRef.current.noteName !== '—' ? readoutRef.current.midi : null
            let next = frequencyToPitchReadout(
              readoutHz,
              activeProfile.minHz,
              activeProfile.maxHz,
              preferMidi,
            )
            next = stabilizePitchReadout(
              readoutRef.current.noteName !== '—' ? readoutRef.current : null,
              next,
              activeProfile.noteHysteresisCents,
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
                clarity < clarityMin + 0.05
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

                const rawCents = Math.max(-50, Math.min(50, next.cents))
                const needleAlpha = noteChanged
                  ? activeProfile.noteChangeSmoothAlpha
                  : activeProfile.needleSmoothAlpha
                const prevNeedle = needleCentsRef.current
                const smoothedNeedle =
                  prevNeedle == null
                    ? rawCents
                    : prevNeedle + (rawCents - prevNeedle) * needleAlpha

                needleCentsRef.current = smoothedNeedle
                const deadband = activeProfile.readoutDeadbandCents ?? 0
                const centeredCents =
                  deadband > 0 && Math.abs(smoothedNeedle) <= deadband ? 0 : smoothedNeedle
                const displayCents = quantizeDisplayCents(
                  centeredCents,
                  activeProfile.readoutCentsStep,
                )
                const displayReadout: PitchReadout = {
                  ...next,
                  cents: displayCents,
                }

                readoutRef.current = displayReadout
                publishReadout(displayReadout)

                lastPitchAtRef.current = now
                lastStableCentsRef.current = smoothedNeedle
                active = true
                pushTraceSample(smoothedNeedle, noteChanged)
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
        const bandGlow = sampleInTuneBandGlow(
          inTuneGlowRef,
          inTuneSinceRef,
          inTuneBandFrameRef,
          inTuneGlowEligibleRef,
          readoutRef.current,
        )
        publishInTuneGlow(bandGlow)
        drawPitchCanvasIfDue(
          canvas,
          graph.buffer,
          historyRef.current,
          active,
          canvasTheme,
          traceWindow,
          traceBlend,
          bandGlow,
          responsiveTrace,
        )
      }

      tickRef.current = requestAnimationFrame(tick)
    }

    tickRef.current = requestAnimationFrame(tick)

    return () => {
      if (tickRef.current !== null) {
        cancelAnimationFrame(tickRef.current)
        window.clearTimeout(tickRef.current)
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
    realtimeMode,
    source,
    tunerInstrument,
  ])

  return { readout, inTuneGlow }
}

/** Resume speaker routing for pitch graphs attached to playback media. */
export function resumePitchGraphsForMedia(
  ...media: Array<HTMLMediaElement | null | undefined>
): void {
  void resumePlaybackAudioContext()

  for (const element of media) {
    if (!element) continue
    const graph = elementGraphs.get(element)
    if (!graph) continue

    applyPitchOutputGain(element, graph.passthrough)

    if (graph.mode === 'element' && getTakePlaybackSpeakerNodes(element)) {
      routeTakePlaybackToSpeaker(element, element.volume || 1, false)
    } else if (graph.mode === 'stream' && graph.context.state !== 'closed') {
      refreshMediaPitchStreamSource(graph)
    }
  }
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
