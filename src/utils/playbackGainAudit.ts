/**
 * Runtime playback gain audit — logs actual GainNode values and routing.
 *
 * Enable: localStorage.setItem('sessionmirror:playback-gain-audit', '1')
 * Disable: localStorage.removeItem('sessionmirror:playback-gain-audit')
 */

import { Capacitor } from '@capacitor/core'
import {
  effectiveHeadphoneGain,
  effectiveSpeakerBusGain,
  effectiveSpeakerGain,
  PLAYBACK_GAIN_HEADPHONES,
  PLAYBACK_GAIN_HEADPHONES_MAX,
  PLAYBACK_GAIN_MAX,
  PLAYBACK_GAIN_NATIVE,
  PLAYBACK_GAIN_WEB,
  YOUTUBE_VOLUME_BOOST,
  YOUTUBE_VOLUME_FLOOR,
  youtubeVolumeFromUiSlider,
} from './playbackVolume'
import { isHeadphoneOutputActive } from './headphoneOutput'
import {
  getFixedSpeakerBusGain,
  getSpeakerDefaultBusGain,
  getSpeakerMaxBusGain,
  isFixedBusGainPreset,
  NORMALIZATION_PRESET_LIMITS,
} from './speakerLoudnessNormalization'
import { SPEAKER_LOUDNESS_PRESETS, type SpeakerLoudnessPreset } from './speakerLoudnessMastering'
import {
  getTakePlaybackSpeakerNodes,
  getSpeakerLoudnessPreset,
  hasTakePlaybackSpeakerRoute,
  isTakePlaybackEnhancerEnabled,
  type TakeSpeakerNodes,
} from './takePlaybackSpeaker'
import { readSpeakerLoudnessMeters } from './speakerLoudnessMastering'
import { primePlaybackAudioContextSync } from './playbackAudioContext'

const DEBUG_STORAGE_KEY = 'sessionmirror:playback-gain-audit'

export interface GainNodeSnapshot {
  label: string
  value: number
}

export interface TakePlaybackGainAudit {
  kind: 'take'
  elementId: string
  routedViaWebAudio: boolean
  elementVolume: number
  elementMuted: boolean
  audioContextState: string | null
  outputRoute: 'speaker' | 'headphones'
  speakerLoudnessPreset: SpeakerLoudnessPreset
  audioEnhancerEnabled: boolean
  speakerMasteringActive: boolean
  /** Chain tail: enhancer | passthrough | direct */
  chainMode: 'enhancer' | 'passthrough' | 'native-fallback' | 'unknown'
  busGain: GainNodeSnapshot
  passthroughGains: GainNodeSnapshot[]
  enhancerGains: GainNodeSnapshot[]
  masteringGains: GainNodeSnapshot[]
  masteringDynamics: {
    compressorThreshold: number
    compressorRatio: number
    limiterThreshold: number
    limiterRatio: number
  } | null
  normalizationGain: number | null
  /** Total measured bus gain before limiter trim. */
  speakerBusGain: number | null
  maxGainCap: number | null
  targetRMS: number | null
  limiterTrim: number | null
  finalPreLimiterGain: number | null
  measuredPeak: number | null
  measuredRMS: number | null
  configuredLegacyNativeMultiplier: number
  theoreticalBusGain: number
  theoreticalHeadphoneBusGain: number
  estimatedLinearProduct: number | null
}

export interface YoutubePlaybackGainAudit {
  kind: 'youtube'
  uiVolume: number
  iframeApiVolume: number
  path: 'youtube-iframe-api'
  bypassesWebAudio: true
  bypassesSpeakerMastering: true
  bypassesAudioEnhancer: true
  volumeFloor: number
  volumeBoost: number
  note: string
}

export type PlaybackGainAuditEntry = TakePlaybackGainAudit | YoutubePlaybackGainAudit

function readDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setPlaybackGainAuditLogging(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      localStorage.setItem(DEBUG_STORAGE_KEY, '1')
    } else {
      localStorage.removeItem(DEBUG_STORAGE_KEY)
    }
  } catch {
    /* ignore */
  }
}

function readGain(node: GainNode | undefined, label: string): GainNodeSnapshot | null {
  if (!node) return null
  return { label, value: node.gain.value }
}

function elementLabel(el: HTMLMediaElement): string {
  const src = el.currentSrc || el.src || ''
  const tail = src ? src.slice(-48) : 'no-src'
  return `${el.tagName.toLowerCase()}#${tail}`
}

export function snapshotTakePlaybackGain(el: HTMLMediaElement): TakePlaybackGainAudit {
  const routed = hasTakePlaybackSpeakerRoute(el)
  const nodes = getTakePlaybackSpeakerNodes(el)
  const headphones = isHeadphoneOutputActive()
  const preset = getSpeakerLoudnessPreset()
  const enhancerOn = isTakePlaybackEnhancerEnabled()
  const masteringActive = routed && !headphones && preset !== 'off' && !!nodes?.speakerMastering
  const vol = nodes?.lastVolume ?? el.volume
  const muted = nodes?.lastMuted ?? el.muted

  const busSnapshot: GainNodeSnapshot = {
    label: 'bus',
    value: nodes?.gain.gain.value ?? (routed ? NaN : el.volume),
  }

  const passthroughGains: GainNodeSnapshot[] = []
  if (nodes?.passthrough) {
    const bridge = readGain(nodes.passthrough.input, 'passthrough.bridge')
    const output = readGain(nodes.passthrough.output, 'passthrough.output')
    if (bridge) passthroughGains.push(bridge)
    if (output) passthroughGains.push(output)
  }

  const enhancerGains: GainNodeSnapshot[] = []
  if (nodes?.enhancer) {
    for (const snap of [
      readGain(nodes.enhancer.input, 'enhancer.input'),
      readGain(nodes.enhancer.dryGain, 'enhancer.dry'),
      readGain(nodes.enhancer.wetGain, 'enhancer.wet'),
      readGain(nodes.enhancer.reverbSend, 'enhancer.reverbSend'),
      readGain(nodes.enhancer.output, 'enhancer.output'),
    ]) {
      if (snap) enhancerGains.push(snap)
    }
  }

  const masteringGains: GainNodeSnapshot[] = []
  let masteringDynamics: TakePlaybackGainAudit['masteringDynamics'] = null
  if (nodes?.speakerMastering) {
    for (const snap of [
      readGain(nodes.speakerMastering.input, 'mastering.input'),
      readGain(nodes.speakerMastering.makeup, 'mastering.makeup'),
      readGain(nodes.speakerMastering.output, 'mastering.output'),
    ]) {
      if (snap) masteringGains.push(snap)
    }
    masteringDynamics = {
      compressorThreshold: nodes.speakerMastering.compressor.threshold.value,
      compressorRatio: nodes.speakerMastering.compressor.ratio.value,
      limiterThreshold: nodes.speakerMastering.limiter.threshold.value,
      limiterRatio: nodes.speakerMastering.limiter.ratio.value,
    }
  }

  let chainMode: TakePlaybackGainAudit['chainMode'] = 'unknown'
  if (!routed) {
    chainMode = 'native-fallback'
  } else if (nodes?.enhancer) {
    chainMode = 'enhancer'
  } else if (nodes?.passthrough) {
    chainMode = 'passthrough'
  }

  const presetLimits =
    preset !== 'off' ? NORMALIZATION_PRESET_LIMITS[preset] : null
  const speakerBusGain = nodes?.speakerBusGain ?? null
  const maxGainCap = preset !== 'off' ? getSpeakerMaxBusGain(preset) : null
  const trim = nodes?.limiterTrim ?? 1
  const measurement = nodes?.loudnessMeasurement

  const theoreticalBusGain =
    preset !== 'off' && speakerBusGain !== null
      ? effectiveSpeakerBusGain(vol, muted, speakerBusGain, trim)
      : preset !== 'off'
        ? effectiveSpeakerBusGain(
            vol,
            muted,
            getSpeakerDefaultBusGain(preset),
            trim,
          )
        : effectiveSpeakerGain(vol, muted, true)
  const theoreticalHeadphoneBusGain = effectiveHeadphoneGain(vol, muted)

  let estimatedLinearProduct: number | null = null
  if (routed && nodes) {
    estimatedLinearProduct = busSnapshot.value
    for (const g of [...passthroughGains, ...enhancerGains, ...masteringGains]) {
      estimatedLinearProduct *= g.value
    }
  }

  let ctxState: string | null = null
  try {
    ctxState = nodes?.source.context?.state ?? primePlaybackAudioContextSync().state
  } catch {
    ctxState = nodes?.source.context?.state ?? null
  }

  return {
    kind: 'take',
    elementId: elementLabel(el),
    routedViaWebAudio: routed,
    elementVolume: el.volume,
    elementMuted: el.muted,
    audioContextState: ctxState,
    outputRoute: headphones ? 'headphones' : 'speaker',
    speakerLoudnessPreset: preset,
    audioEnhancerEnabled: enhancerOn,
    speakerMasteringActive: masteringActive,
    chainMode,
    busGain: busSnapshot,
    passthroughGains,
    enhancerGains,
    masteringGains,
    masteringDynamics,
    normalizationGain: speakerBusGain,
    speakerBusGain,
    maxGainCap,
    targetRMS: presetLimits?.rmsTargetDb ?? null,
    limiterTrim: preset !== 'off' ? trim : null,
    finalPreLimiterGain: theoreticalBusGain,
    measuredPeak: measurement?.peak ?? null,
    measuredRMS: measurement?.rms ?? null,
    configuredLegacyNativeMultiplier: Capacitor.isNativePlatform()
      ? PLAYBACK_GAIN_NATIVE
      : PLAYBACK_GAIN_WEB,
    theoreticalBusGain,
    theoreticalHeadphoneBusGain,
    estimatedLinearProduct,
  }
}

export function snapshotYoutubePlaybackGain(uiVolume: number): YoutubePlaybackGainAudit {
  return {
    kind: 'youtube',
    uiVolume,
    iframeApiVolume: youtubeVolumeFromUiSlider(uiVolume),
    path: 'youtube-iframe-api',
    bypassesWebAudio: true,
    bypassesSpeakerMastering: true,
    bypassesAudioEnhancer: true,
    volumeFloor: YOUTUBE_VOLUME_FLOOR,
    volumeBoost: YOUTUBE_VOLUME_BOOST,
    note:
      'YouTube audio never enters the Web Audio take bus. Loudness is iframe setVolume (0–100) × device hardware volume only.',
  }
}

export function formatTakePlaybackGainAudit(audit: TakePlaybackGainAudit): Record<string, unknown> {
  const presetParams =
    audit.speakerLoudnessPreset !== 'off'
      ? SPEAKER_LOUDNESS_PRESETS[audit.speakerLoudnessPreset]
      : null

  return {
    element: audit.elementId,
    routedViaWebAudio: audit.routedViaWebAudio,
    audioContextState: audit.audioContextState,
    outputRoute: audit.outputRoute,
    elementVolume: audit.elementVolume,
    elementMuted: audit.elementMuted,
    speakerLoudnessPreset: audit.speakerLoudnessPreset,
    audioEnhancerEnabled: audit.audioEnhancerEnabled,
    speakerMasteringActive: audit.speakerMasteringActive,
    chainMode: audit.chainMode,
    busGainActual: audit.busGain.value,
    selectedPreset: audit.speakerLoudnessPreset,
    maxGainCap: audit.maxGainCap,
    measuredRMS: audit.measuredRMS,
    measuredPeak: audit.measuredPeak,
    calculatedNormalizationGain: audit.speakerBusGain,
    finalGainNodeValue: audit.busGain.value,
    normalizationGain: audit.normalizationGain,
    speakerBusGain: audit.speakerBusGain,
    targetRMS: audit.targetRMS,
    limiterTrim: audit.limiterTrim,
    finalPreLimiterGain: audit.finalPreLimiterGain,
    theoreticalBusGainSpeaker: audit.theoreticalBusGain,
    theoreticalBusGainHeadphones: audit.theoreticalHeadphoneBusGain,
    configuredPresetMakeupDb: presetParams?.makeupGainDb ?? null,
    legacyNativeMultiplierIfPresetOff: audit.configuredLegacyNativeMultiplier,
    playbackGainMaxCap: PLAYBACK_GAIN_MAX,
    headphoneGainRange: `${PLAYBACK_GAIN_HEADPHONES}–${PLAYBACK_GAIN_HEADPHONES_MAX}`,
    passthroughGains: audit.passthroughGains,
    enhancerGains: audit.enhancerGains,
    masteringGains: audit.masteringGains,
    masteringDynamics: audit.masteringDynamics,
    estimatedLinearGainProduct: audit.estimatedLinearProduct,
    activePreset: getSpeakerLoudnessPreset(),
  }
}

/** Log loudness staging fields (always on) — skips until post-DSP signal is present. */
export function logPlaybackGainAuditLoudness(audio: HTMLMediaElement): void {
  const nodes = getTakePlaybackSpeakerNodes(audio)
  const routed = hasTakePlaybackSpeakerRoute(audio) && nodes
  if (!routed) return

  const preset = getSpeakerLoudnessPreset()
  if (preset === 'off' || isHeadphoneOutputActive()) return

  const measurement = nodes.loudnessMeasurement
  const mastering = nodes.speakerMastering
  const liveMeters =
    mastering && !audio.paused && !audio.ended
      ? readSpeakerLoudnessMeters(mastering)
      : null

  if (!liveMeters || liveMeters.postDSPRMS <= 0) {
    return
  }

  const finalGain = nodes.gain.gain.value
  const fixedBusGain =
    isFixedBusGainPreset(preset) ? getFixedSpeakerBusGain(preset) : null

  console.log('[PlaybackGainAudit] loudness')
  console.log('selectedPreset =', preset)
  if (fixedBusGain !== null) {
    console.log('fixedBusGain =', fixedBusGain)
  }
  console.log('recordedRMS =', measurement?.rms ?? '(pending)')
  console.log('postDSP_RMS =', liveMeters.postDSPRMS)
  console.log('postDSP_Peak =', liveMeters.postDSPPeak)
  console.log('finalGain =', finalGain)
  console.log(
    'compressorReduction =',
    `${liveMeters.compressorReduction.toFixed(1)} dB`,
  )
  console.log(
    'limiterReduction =',
    `${liveMeters.limiterReduction.toFixed(1)} dB`,
  )
  console.log('limiterTooHot =', liveMeters.limiterTooHot)
}

const playbackLoudnessPollTimers = new WeakMap<HTMLMediaElement, number>()

const LOUDNESS_METER_DELAY_MS = 1350

/** Poll post-DSP meters after audio has been flowing (~1.2–1.5s). */
export function scheduleSpeakerLoudnessPlaybackAudit(
  audio: HTMLMediaElement,
  delayMs = LOUDNESS_METER_DELAY_MS,
): void {
  const existing = playbackLoudnessPollTimers.get(audio)
  if (existing !== undefined) {
    window.clearTimeout(existing)
  }

  const timerId = window.setTimeout(() => {
    playbackLoudnessPollTimers.delete(audio)
    if (audio.paused || audio.ended) return
    logPlaybackGainAuditLoudness(audio)
  }, delayMs)

  playbackLoudnessPollTimers.set(audio, timerId)
}

/** Log the standard Web Inspector audit block when take playback actually starts. Always on. */
export function logPlaybackGainAuditOnStart(audio: HTMLMediaElement): void {
  const nodes = getTakePlaybackSpeakerNodes(audio)
  const routed = hasTakePlaybackSpeakerRoute(audio) && nodes

  if (!routed) {
    console.log('[PlaybackGainAudit] bypassing WebAudio')
    return
  }

  const audioContext = nodes.source.context as AudioContext
  const preset = getSpeakerLoudnessPreset()
  const headphones = isHeadphoneOutputActive()
  const measurement = nodes.loudnessMeasurement
  const maxGainCap =
    preset !== 'off' && !headphones ? getSpeakerMaxBusGain(preset) : null
  const calculatedBusGain =
    preset !== 'off' && !headphones
      ? (nodes.speakerBusGain ?? getSpeakerDefaultBusGain(preset))
      : null

  console.log('[PlaybackGainAudit]')
  console.log('HTMLMediaElement.volume =', audio.volume)
  console.log('HTMLMediaElement.muted =', audio.muted)
  console.log('AudioContext.state =', audioContext.state)
  console.log('GainNode.value =', nodes.gain.gain.value)
  console.log('MediaElementSource connected =', true)
  console.log('Destination =', audioContext.destination.channelCount)
  if (!headphones && preset !== 'off') {
    const fixedBusGain = isFixedBusGainPreset(preset)
      ? getFixedSpeakerBusGain(preset)
      : null
    console.log('selectedPreset =', preset)
    if (fixedBusGain !== null) {
      console.log('fixedBusGain =', fixedBusGain)
    } else {
      console.log('maxGainCap =', maxGainCap)
      console.log('recordedRMS =', measurement?.rms ?? '(pending)')
      console.log('recordedPeak =', measurement?.peak ?? '(pending)')
      console.log('calculatedBusGain =', calculatedBusGain)
    }
    console.log('finalGain =', nodes.gain.gain.value)
    scheduleSpeakerLoudnessPlaybackAudit(audio)
  }
}

/** YouTube iframe playback never enters the take Web Audio bus. */
export function logPlaybackGainAuditYoutubeStart(): void {
  console.log('[PlaybackGainAudit] bypassing WebAudio')
}

function logTakeAudit(el: HTMLMediaElement, reason: string): void {
  if (!readDebugEnabled()) return
  const audit = snapshotTakePlaybackGain(el)
  console.info(`[PlaybackGainAudit:take] ${reason}`, formatTakePlaybackGainAudit(audit))
}

function logYoutubeAudit(uiVolume: number, reason: string): void {
  if (!readDebugEnabled()) return
  const audit = snapshotYoutubePlaybackGain(uiVolume)
  console.info(`[PlaybackGainAudit:youtube] ${reason}`, audit)
}

/** Call after routing or gain changes on a take media element. */
export function maybeLogTakePlaybackGain(el: HTMLMediaElement, reason: string): void {
  logTakeAudit(el, reason)
}

/** Call when YouTube iframe volume is applied. */
export function maybeLogYoutubePlaybackGain(uiVolume: number, reason: string): void {
  logYoutubeAudit(uiVolume, reason)
}

/** Snapshot every registered take route (best-effort via caller-supplied elements). */
export function auditTakePlaybackElements(
  elements: Iterable<HTMLMediaElement>,
): TakePlaybackGainAudit[] {
  return [...elements].map((el) => snapshotTakePlaybackGain(el))
}

/** Log full path summary once — useful from devtools. */
export function logPlaybackGainPathSummary(): void {
  console.info('[PlaybackGainAudit] Take playback signal path:', {
    chain:
      'MediaElement(volume≈1) → MediaElementSource → bus GainNode (measured norm) → [Enhancer?] → [SpeakerMastering?] → destination',
    busGainSpeaker:
      'RMS-first bus gain (Clear≤20× Loud≤32× Max≤52× Phone≤72×) + quiet boost, EQ/comp/limiter -1 dBFS',
    busGainHeadphones: `effectiveHeadphoneGain: ${PLAYBACK_GAIN_HEADPHONES}× capped ${PLAYBACK_GAIN_HEADPHONES_MAX}`,
    masteringNote:
      'EQ → compressor → makeup → limiter (-1 dBFS). Bus normalization does loudness staging; limiter catches peaks.',
    youtube:
      'iframe postMessage setVolume only — no Web Audio, no speaker mastering, no enhancer',
    normalizeLogs: `localStorage.setItem('sessionmirror:speaker-loudness-debug', '1')`,
    enableLogs: `localStorage.setItem('${DEBUG_STORAGE_KEY}', '1')`,
  })
}

let intervalId: number | null = null
const intervalElements = new Set<HTMLMediaElement>()

/** Poll actual GainNode values during playback (2s) while audit flag is on. */
export function trackTakePlaybackGainPolling(el: HTMLMediaElement, active: boolean): void {
  if (active) {
    intervalElements.add(el)
  } else {
    intervalElements.delete(el)
  }

  if (!readDebugEnabled() || intervalElements.size === 0) {
    if (intervalId !== null) {
      window.clearInterval(intervalId)
      intervalId = null
    }
    return
  }

  if (intervalId !== null) return

  intervalId = window.setInterval(() => {
    if (!readDebugEnabled()) {
      if (intervalId !== null) window.clearInterval(intervalId)
      intervalId = null
      intervalElements.clear()
      return
    }
    for (const media of intervalElements) {
      if (media.paused && media.ended) continue
      logTakeAudit(media, 'poll')
    }
  }, 2000)
}

/** Expose nodes for deep inspection from devtools. */
export function getTakePlaybackNodesForAudit(
  el: HTMLMediaElement,
): TakeSpeakerNodes | undefined {
  return getTakePlaybackSpeakerNodes(el)
}

declare global {
  interface Window {
    __playbackGainAudit?: {
      enable: () => void
      disable: () => void
      logSummary: () => void
      snapshotTake: (el: HTMLMediaElement) => TakePlaybackGainAudit
      snapshotYoutube: (uiVolume: number) => YoutubePlaybackGainAudit
    }
  }
}

if (typeof window !== 'undefined') {
  window.__playbackGainAudit = {
    enable: () => setPlaybackGainAuditLogging(true),
    disable: () => setPlaybackGainAuditLogging(false),
    logSummary: logPlaybackGainPathSummary,
    snapshotTake: snapshotTakePlaybackGain,
    snapshotYoutube: snapshotYoutubePlaybackGain,
  }
}
