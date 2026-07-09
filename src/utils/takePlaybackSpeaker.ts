/**
 * Routes take playback through Web Audio so iOS uses the main speaker
 * instead of the quiet earpiece (PlayAndRecord + muted element output).
 */

import { Capacitor } from '@capacitor/core'
import {
  createAudioEnhancerChain,
  disposeAudioEnhancerChain,
  updateAudioEnhancerChain,
  type AudioEnhancerNodes,
  type AudioEnhancerSettings,
} from './audioEnhancer'
import {
  armPlaybackGraphKeepAlive,
  disarmPlaybackGraphKeepAlive,
} from './playbackGraphKeepAlive'
import {
  primePlaybackAudioContextSync,
  resumePlaybackAudioContext,
} from './playbackAudioContext'
import {
  effectiveHeadphoneGain,
  effectiveSpeakerBusGain,
  effectiveSpeakerGain,
  setActiveSpeakerLoudnessPreset,
} from './playbackVolume'
import { isHeadphoneOutputActive, subscribeHeadphoneOutput } from './headphoneOutput'
import {
  analyzeMediaLoudness,
  buildNormalizationSnapshot,
  computeTotalBusGain,
  getFixedSpeakerBusGain,
  getSpeakerDefaultBusGain,
  isFixedBusGainPreset,
  logSpeakerNormalization,
  maybeTrimPreLimiterBusGain,
  type LoudnessMeasurement,
} from './speakerLoudnessNormalization'
import { isTabletViewport } from './deviceFormFactor'
import {
  applySpeakerLoudnessPreset,
  applyMasteringMakeupTrim,
  createSpeakerLoudnessChain,
  disposeSpeakerLoudnessChain,
  readSpeakerLoudnessMeters,
  TARGET_COMPRESSOR_REDUCTION_DB,
  type SpeakerLoudnessNodes,
  type SpeakerLoudnessPreset,
} from './speakerLoudnessMastering'

export interface TakeSpeakerPassthrough {
  input: GainNode
  output: GainNode
}

export interface TakeSpeakerNodes {
  source: MediaElementAudioSourceNode
  gain: GainNode
  enhancer?: AudioEnhancerNodes
  passthrough?: TakeSpeakerPassthrough
  speakerMastering?: SpeakerLoudnessNodes
  keepAliveAnalyser?: AnalyserNode
  /** Last requested level — used to recompute gain when the output route changes. */
  lastVolume?: number
  lastMuted?: boolean
  /** Measured total bus gain (pre-mastering), clamped per preset max. */
  speakerBusGain?: number
  loudnessMeasurement?: LoudnessMeasurement
  /** Scales bus down when limiter overload is detected. */
  limiterTrim?: number
  /** Negative dB reduces mastering makeup when limiter is too hot. */
  makeupTrimDb?: number
}

export function isTakePlaybackEnhancerEnabled(): boolean {
  return enhancerEnabled
}

const speakerNodesByElement = new WeakMap<HTMLMediaElement, TakeSpeakerNodes>()
const routedSpeakerElements = new Set<HTMLMediaElement>()

let enhancerEnabled = false
let enhancerSettings: AudioEnhancerSettings | null = null
let speakerLoudnessPreset: SpeakerLoudnessPreset = 'phone'

export function setSpeakerLoudnessPreset(preset: SpeakerLoudnessPreset): void {
  speakerLoudnessPreset = preset
  setActiveSpeakerLoudnessPreset(preset)
  reapplyAllBusGains()
  rewireAllPlaybackOutputChains()
  for (const el of routedSpeakerElements) {
    logGainAudit(el, `preset:${preset}`)
    const nodes = speakerNodesByElement.get(el)
    if (nodes) {
      nodes.makeupTrimDb = 0
      nodes.limiterTrim = 1
      syncMasteringMakeup(nodes)
    }
    if (nodes && shouldUseSpeakerMastering(nodes)) {
      recomputeNormalizationFromMeasurement(el, nodes)
    }
  }
}

export function getSpeakerLoudnessPreset(): SpeakerLoudnessPreset {
  return speakerLoudnessPreset
}

function shouldUseSpeakerMastering(nodes?: TakeSpeakerNodes): boolean {
  void nodes
  return !isHeadphoneOutputActive() && speakerLoudnessPreset !== 'off'
}

function shouldAnalyzePlaybackLoudness(el: HTMLMediaElement): boolean {
  if (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'ios' &&
    !isTabletViewport() &&
    el instanceof HTMLVideoElement
  ) {
    return false
  }
  return true
}

function shouldUseEnhancer(_nodes: TakeSpeakerNodes): boolean {
  return enhancerEnabled && Boolean(enhancerSettings)
}

function disconnectSpeakerMastering(nodes: TakeSpeakerNodes): void {
  if (!nodes.speakerMastering) return
  disposeSpeakerLoudnessChain(nodes.speakerMastering)
  nodes.speakerMastering = undefined
}

function ensureSpeakerMastering(nodes: TakeSpeakerNodes): SpeakerLoudnessNodes {
  const ctx = nodes.source.context as AudioContext
  const preset = speakerLoudnessPreset as Exclude<SpeakerLoudnessPreset, 'off'>

  if (!nodes.speakerMastering) {
    const chain = createSpeakerLoudnessChain(ctx, preset)
    chain.output.connect(ctx.destination)
    nodes.speakerMastering = chain
    return chain
  }

  if (nodes.speakerMastering.preset !== preset) {
    applySpeakerLoudnessPreset(nodes.speakerMastering, preset)
  }
  return nodes.speakerMastering
}

function connectPlaybackTail(tail: AudioNode, nodes: TakeSpeakerNodes): void {
  const ctx = nodes.source.context as AudioContext

  try {
    tail.disconnect()
  } catch {
    /* ignore */
  }

  if (shouldUseSpeakerMastering(nodes)) {
    const mastering = ensureSpeakerMastering(nodes)
    tail.connect(mastering.input)
    return
  }

  disconnectSpeakerMastering(nodes)
  tail.connect(ctx.destination)
}

function rewireAllPlaybackOutputChains(): void {
  for (const el of routedSpeakerElements) {
    const nodes = speakerNodesByElement.get(el)
    if (!nodes) continue

    const tail = nodes.enhancer?.output ?? nodes.passthrough?.output
    if (tail) {
      connectPlaybackTail(tail, nodes)
    }

    if (nodes.lastVolume !== undefined) {
      nodes.gain.gain.value = busGain(
        nodes.lastVolume,
        nodes.lastMuted ?? false,
        el,
        nodes,
      )
    }
  }
}

function resumePlaybackBus(): void {
  void resumePlaybackAudioContext()
}

/**
 * Bus gain for the current output route.
 * Speaker + mastering: clamped total bus gain × limiterTrim (pre-EQ/limiter chain).
 * Speaker + preset Off: legacy high gain.
 * Headphones: clean near-unity gain.
 */
function busGain(
  volume: number,
  muted: boolean,
  el?: HTMLMediaElement,
  nodes?: TakeSpeakerNodes,
): number {
  if (muted) return 0
  if (isHeadphoneOutputActive()) {
    return effectiveHeadphoneGain(volume, muted)
  }
  if (speakerLoudnessPreset === 'off') {
    return effectiveSpeakerGain(volume, muted, true)
  }

  const preset = speakerLoudnessPreset as Exclude<SpeakerLoudnessPreset, 'off'>

  if (isFixedBusGainPreset(preset)) {
    const fixed = getFixedSpeakerBusGain(preset)!
    return effectiveSpeakerBusGain(volume, muted, fixed, 1)
  }

  let totalBus = nodes?.speakerBusGain
  if (totalBus === undefined && el) {
    totalBus = speakerNodesByElement.get(el)?.speakerBusGain
  }
  if (totalBus === undefined) {
    totalBus = getSpeakerDefaultBusGain(preset)
  }

  const trim = nodes?.limiterTrim ?? 1
  return effectiveSpeakerBusGain(volume, muted, totalBus, trim)
}

function applyBusGainToNodes(
  nodes: TakeSpeakerNodes,
  el: HTMLMediaElement,
  volume: number,
  muted: boolean,
): void {
  nodes.gain.gain.value = busGain(volume, muted, el, nodes)
}

function logNormalizationState(
  nodes: TakeSpeakerNodes,
  reason: string,
): void {
  if (speakerLoudnessPreset === 'off') return
  const preset = speakerLoudnessPreset
  const volume = nodes.lastVolume ?? 1
  const muted = nodes.lastMuted ?? false
  const snapshot = buildNormalizationSnapshot(
    preset,
    nodes.loudnessMeasurement ?? null,
    nodes.speakerBusGain ?? getSpeakerDefaultBusGain(preset as Exclude<SpeakerLoudnessPreset, 'off'>),
    volume,
    muted,
    nodes.limiterTrim ?? 1,
    nodes.speakerMastering,
  )
  logSpeakerNormalization(reason, snapshot)
}

function syncMasteringMakeup(nodes: TakeSpeakerNodes): void {
  if (!nodes.speakerMastering) return
  applyMasteringMakeupTrim(nodes.speakerMastering, nodes.makeupTrimDb ?? 0)
}

function balanceSpeakerChainDynamics(
  el: HTMLMediaElement,
  nodes: TakeSpeakerNodes,
): void {
  if (!nodes.speakerMastering || speakerLoudnessPreset === 'off') return
  if (isFixedBusGainPreset(speakerLoudnessPreset)) return
  if (el.paused || el.ended) return

  const meters = readSpeakerLoudnessMeters(nodes.speakerMastering)
  if (meters.postDSPRMS < 1e-5 && meters.preDSPRMS < 1e-5) return

  const compressorTooHot = meters.compressorReduction > TARGET_COMPRESSOR_REDUCTION_DB.max
  if (!meters.limiterTooHot && !compressorTooHot) return

  const currentBus = nodes.gain.gain.value
  const currentTrim = nodes.limiterTrim ?? 1
  const busResult = maybeTrimPreLimiterBusGain(
    nodes.speakerMastering,
    currentBus,
    currentTrim,
  )
  if (busResult.trimmed) {
    nodes.limiterTrim = busResult.trim
    nodes.gain.gain.value = busResult.busGain
    logNormalizationState(nodes, 'limiter-trim')
    return
  }

  const makeupTrim = nodes.makeupTrimDb ?? 0
  if (makeupTrim > -5) {
    nodes.makeupTrimDb = makeupTrim - 1.5
    syncMasteringMakeup(nodes)
    logNormalizationState(nodes, 'makeup-trim')
  }
}

function maybeTrimLimiterForElement(nodes: TakeSpeakerNodes, el: HTMLMediaElement): void {
  balanceSpeakerChainDynamics(el, nodes)
}

function applyFixedBusGainNormalization(
  el: HTMLMediaElement,
  nodes: TakeSpeakerNodes,
  reason: string,
): void {
  const preset = speakerLoudnessPreset as 'extreme' | 'insane'
  const fixed = getFixedSpeakerBusGain(preset)!
  nodes.limiterTrim = 1
  nodes.makeupTrimDb = 0
  nodes.speakerBusGain = fixed
  nodes.loudnessMeasurement = undefined

  const volume = nodes.lastVolume ?? 1
  const muted = nodes.lastMuted ?? false
  applyBusGainToNodes(nodes, el, volume, muted)
  syncMasteringMakeup(nodes)
  logNormalizationState(nodes, reason)
  logGainAudit(el, reason)
  void import('./playbackGainAudit').then((m) => {
    m.scheduleSpeakerLoudnessPlaybackAudit(el)
  })
}

function recomputeNormalizationFromMeasurement(
  el: HTMLMediaElement,
  nodes: TakeSpeakerNodes,
): void {
  if (!shouldUseSpeakerMastering(nodes)) return
  const preset = speakerLoudnessPreset as Exclude<SpeakerLoudnessPreset, 'off'>

  if (isFixedBusGainPreset(preset)) {
    applyFixedBusGainNormalization(el, nodes, 'fixed-bus')
    return
  }

  nodes.limiterTrim = 1
  nodes.makeupTrimDb = 0
  if (nodes.loudnessMeasurement) {
    nodes.speakerBusGain = computeTotalBusGain(nodes.loudnessMeasurement, preset)
  } else {
    nodes.speakerBusGain = getSpeakerDefaultBusGain(preset)
  }

  const volume = nodes.lastVolume ?? 1
  const muted = nodes.lastMuted ?? false
  applyBusGainToNodes(nodes, el, volume, muted)
  syncMasteringMakeup(nodes)
  logNormalizationState(nodes, 'recompute')
}

let normalizationGeneration = 0

async function applyNormalizationToElement(
  el: HTMLMediaElement,
  nodes: TakeSpeakerNodes,
): Promise<void> {
  if (!shouldUseSpeakerMastering(nodes)) return

  const generation = ++normalizationGeneration
  const preset = speakerLoudnessPreset as Exclude<SpeakerLoudnessPreset, 'off'>

  if (isFixedBusGainPreset(preset)) {
    applyFixedBusGainNormalization(el, nodes, 'fixed-bus-analyze-skip')
    return
  }

  const ctx = nodes.source.context as AudioContext

  nodes.limiterTrim = 1
  nodes.makeupTrimDb = 0
  nodes.speakerBusGain = getSpeakerDefaultBusGain(preset)
  const volume = nodes.lastVolume ?? 1
  const muted = nodes.lastMuted ?? false
  applyBusGainToNodes(nodes, el, volume, muted)
  syncMasteringMakeup(nodes)

  if (!shouldAnalyzePlaybackLoudness(el)) {
    logNormalizationState(nodes, 'video-analysis-skip')
    logGainAudit(el, 'video-analysis-skip')
    return
  }

  const measurement = await analyzeMediaLoudness(el, ctx)
  if (generation !== normalizationGeneration) return

  nodes.loudnessMeasurement = measurement ?? undefined
  nodes.speakerBusGain = measurement
    ? computeTotalBusGain(measurement, preset)
    : getSpeakerDefaultBusGain(preset)

  applyBusGainToNodes(nodes, el, volume, muted)
  syncMasteringMakeup(nodes)
  logNormalizationState(nodes, 'analyze')
  logGainAudit(el, 'normalization')
  void import('./playbackGainAudit').then((m) => {
    m.scheduleSpeakerLoudnessPlaybackAudit(el)
  })
}

let limiterTrimIntervalId: number | null = null

function ensureLimiterTrimPolling(): void {
  if (limiterTrimIntervalId !== null) return
  limiterTrimIntervalId = window.setInterval(() => {
    if (routedSpeakerElements.size === 0) {
      if (limiterTrimIntervalId !== null) {
        window.clearInterval(limiterTrimIntervalId)
        limiterTrimIntervalId = null
      }
      return
    }
    for (const el of routedSpeakerElements) {
      if (el.paused) continue
      const nodes = speakerNodesByElement.get(el)
      if (!nodes) continue
      maybeTrimLimiterForElement(nodes, el)
    }
  }, 2500)
}

/** Recompute every routed element's gain when the output route flips. */
function reapplyAllBusGains(): void {
  for (const el of routedSpeakerElements) {
    const nodes = speakerNodesByElement.get(el)
    if (!nodes) {
      routedSpeakerElements.delete(el)
      continue
    }
    nodes.gain.gain.value = busGain(nodes.lastVolume ?? 1, nodes.lastMuted ?? false, el, nodes)
    if (shouldUseSpeakerMastering(nodes)) {
      recomputeNormalizationFromMeasurement(el, nodes)
    }
  }
}

function logGainAudit(el: HTMLMediaElement, reason: string): void {
  void import('./playbackGainAudit').then((m) => {
    m.maybeLogTakePlaybackGain(el, reason)
    if (!el.paused) {
      m.trackTakePlaybackGainPolling(el, true)
    }
  })
}

subscribeHeadphoneOutput(() => {
  reapplyAllBusGains()
  rewireAllPlaybackOutputChains()
  for (const el of routedSpeakerElements) {
    logGainAudit(el, 'headphone-route-change')
  }
})

/**
 * Output flows through the Web Audio graph, so the element must stay UNMUTED.
 * iOS WKWebView throttles/stops decoding muted media elements after ~1s, which
 * starves the MediaElementSource and cuts audio out. createMediaElementSource
 * reroutes the element's output into the graph, so an unmuted element does not
 * double-play — the GainNode (and optional enhancer) control what we hear.
 */
function applyGraphOutputElementState(el: HTMLMediaElement): void {
  el.muted = false
  if (el.volume <= 0) {
    el.volume = 1
  }
}

export function setTakePlaybackEnhancerState(
  enabled: boolean,
  settings?: AudioEnhancerSettings,
): void {
  enhancerEnabled = enabled
  enhancerSettings = settings ?? null

  for (const el of routedSpeakerElements) {
    const nodes = speakerNodesByElement.get(el)
    if (!nodes) {
      routedSpeakerElements.delete(el)
      continue
    }

    applyGraphOutputElementState(el)

    if (!shouldUseEnhancer(nodes) || !enhancerSettings) {
      disconnectEnhancer(nodes)
      ensurePassthroughChain(nodes)
      nodes.gain.gain.value = busGain(1, false, el, nodes)
      armPlaybackGraphKeepAlive(el, nodes)
      continue
    }
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
    nodes.gain.gain.value = busGain(1, false, el, nodes)
    armPlaybackGraphKeepAlive(el, nodes)
  }

  resumePlaybackBus()
  for (const el of routedSpeakerElements) {
    logGainAudit(el, `enhancer:${enabled ? 'on' : 'off'}`)
  }
}

function disconnectPassthrough(nodes: TakeSpeakerNodes): void {
  if (!nodes.passthrough) return

  const passthrough = nodes.passthrough
  nodes.passthrough = undefined

  try {
    nodes.gain.disconnect()
  } catch {
    /* already disconnected */
  }

  try {
    passthrough.input.disconnect()
    passthrough.output.disconnect()
  } catch {
    /* already disconnected */
  }
}

function ensurePassthroughChain(nodes: TakeSpeakerNodes): void {
  const ctx = nodes.source.context as AudioContext

  if (nodes.passthrough) {
    try {
      nodes.gain.disconnect()
    } catch {
      /* already disconnected */
    }
    try {
      nodes.gain.connect(nodes.passthrough.input)
    } catch {
      /* already connected */
    }
    try {
      nodes.passthrough.output.disconnect()
    } catch {
      /* already disconnected */
    }
    connectPlaybackTail(nodes.passthrough.output, nodes)
    return
  }

  const bridge = ctx.createGain()
  const output = ctx.createGain()
  bridge.gain.value = 1
  output.gain.value = 1
  bridge.connect(output)

  try {
    nodes.gain.disconnect()
  } catch {
    /* ignore */
  }

  nodes.gain.connect(bridge)
  nodes.passthrough = { input: bridge, output }
  connectPlaybackTail(output, nodes)
}

function disconnectEnhancer(nodes: TakeSpeakerNodes): void {
  if (!nodes.enhancer) {
    return
  }

  const enhancer = nodes.enhancer
  nodes.enhancer = undefined

  try {
    nodes.gain.disconnect()
    disposeAudioEnhancerChain(enhancer)
  } catch {
    /* already rewired */
  }
}

function ensureEnhancerForElement(_el: HTMLMediaElement, nodes: TakeSpeakerNodes): void {
  if (!enhancerEnabled || !enhancerSettings || nodes.enhancer) return

  disconnectPassthrough(nodes)

  const ctx = nodes.source.context as AudioContext
  const chain = createAudioEnhancerChain(ctx, enhancerSettings)

  try {
    nodes.gain.disconnect()
  } catch {
    /* ignore */
  }

  nodes.gain.connect(chain.input)
  connectPlaybackTail(chain.output, nodes)
  nodes.enhancer = chain
}

function repairSpeakerBus(el: HTMLMediaElement, nodes: TakeSpeakerNodes): void {
  try {
    nodes.source.connect(nodes.gain)
  } catch {
    /* already connected */
  }

  if (shouldUseEnhancer(nodes) && enhancerSettings) {
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
    return
  }

  disconnectEnhancer(nodes)
  ensurePassthroughChain(nodes)
}

export function getTakePlaybackSpeakerNodes(
  el: HTMLMediaElement,
): TakeSpeakerNodes | undefined {
  return speakerNodesByElement.get(el)
}

export function registerTakePlaybackSpeakerRoute(
  el: HTMLMediaElement,
  source: MediaElementAudioSourceNode,
  gain: GainNode,
): void {
  const existing = speakerNodesByElement.get(el)
  if (existing) {
    if (existing.source === source && existing.gain === gain) {
      repairSpeakerBus(el, existing)
      applyGraphOutputElementState(el)
      existing.gain.gain.value = busGain(1, false, el, existing)
      armPlaybackGraphKeepAlive(el, existing)
      if (shouldUseSpeakerMastering(existing)) {
        void applyNormalizationToElement(el, existing)
        ensureLimiterTrimPolling()
      }
    }
    return
  }

  const nodes: TakeSpeakerNodes = { source, gain }
  speakerNodesByElement.set(el, nodes)
  routedSpeakerElements.add(el)
  applyGraphOutputElementState(el)
  repairSpeakerBus(el, nodes)
  gain.gain.value = busGain(1, false, el, nodes)
  armPlaybackGraphKeepAlive(el, nodes)
  if (shouldUseSpeakerMastering(nodes)) {
    void applyNormalizationToElement(el, nodes)
    ensureLimiterTrimPolling()
  }
}

export function hasTakePlaybackSpeakerRoute(el: HTMLMediaElement): boolean {
  return speakerNodesByElement.has(el)
}

export function releaseTakePlaybackSpeakerRoute(el: HTMLMediaElement): void {
  const nodes = speakerNodesByElement.get(el)
  routedSpeakerElements.delete(el)
  speakerNodesByElement.delete(el)
  disarmPlaybackGraphKeepAlive(el)

  if (!nodes) return

  disconnectSpeakerMastering(nodes)
  disconnectEnhancer(nodes)
  disconnectPassthrough(nodes)

  try {
    nodes.keepAliveAnalyser?.disconnect()
  } catch {
    /* already disconnected */
  }

  try {
    nodes.gain.disconnect()
  } catch {
    /* already disconnected */
  }

  try {
    nodes.source.disconnect()
  } catch {
    /* already disconnected */
  }
}

export interface RouteTakePlaybackOptions {
  /** @deprecated Retained for call-site compatibility — all playback now uses the Web Audio bus. */
  allowNativeDirect?: boolean
}

/**
 * Wire a media element into the shared Web Audio speaker bus. A single output
 * path (bus + optional enhancer) is used for every take so that volume and
 * routing stay consistent whether the enhancer is on or off. The element is
 * never muted (see applyGraphOutputElementState).
 */
export function routeTakePlaybackToSpeaker(
  el: HTMLMediaElement,
  volume = 1,
  muted = false,
  _options: RouteTakePlaybackOptions = {},
): void {
  const existingNodes = speakerNodesByElement.get(el)
  const ctx = primePlaybackAudioContextSync()

  let nodes = existingNodes
  if (!nodes) {
    try {
      const source = ctx.createMediaElementSource(el)
      const gain = ctx.createGain()
      source.connect(gain)
      nodes = { source, gain }
      speakerNodesByElement.set(el, nodes)
      routedSpeakerElements.add(el)
    } catch {
      nodes = speakerNodesByElement.get(el)
      if (!nodes) {
        // Element could not be captured by Web Audio — play it natively, unmuted,
        // and rely on AVAudioSession (.speaker) for loud, uninterrupted output.
        resumePlaybackBus()
        disarmPlaybackGraphKeepAlive(el)
        el.muted = muted
        el.volume = muted ? 0 : 1
        void import('./playbackGainAudit').then((m) =>
          m.logPlaybackGainAuditOnStart(el),
        )
        return
      }
      repairSpeakerBus(el, nodes)
    }
  } else {
    repairSpeakerBus(el, nodes)
  }

  applyGraphOutputElementState(el)
  nodes.lastVolume = volume
  nodes.lastMuted = muted
  nodes.gain.gain.value = busGain(volume, muted, el, nodes)

  if (shouldUseEnhancer(nodes) && enhancerSettings) {
    ensureEnhancerForElement(el, nodes)
    if (nodes.enhancer) {
      updateAudioEnhancerChain(nodes.enhancer, enhancerSettings)
    }
  } else {
    disconnectEnhancer(nodes)
    ensurePassthroughChain(nodes)
  }

  armPlaybackGraphKeepAlive(el, nodes)
  resumePlaybackBus()
  if (shouldUseSpeakerMastering(nodes)) {
    void applyNormalizationToElement(el, nodes)
    ensureLimiterTrimPolling()
  }
  logGainAudit(el, 'route')
}

export function updateTakePlaybackSpeakerGain(
  el: HTMLMediaElement,
  volume: number,
  muted: boolean,
): void {
  const nodes = speakerNodesByElement.get(el)
  if (nodes) {
    nodes.lastVolume = volume
    nodes.lastMuted = muted
    nodes.gain.gain.value = busGain(volume, muted, el, nodes)
    logGainAudit(el, 'gain-update')
  }
}
