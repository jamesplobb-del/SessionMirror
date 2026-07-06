/**
 * Measured loudness normalization for iPhone speaker playback.
 * Bus GainNode staging = clamped total gain (pre-mastering), then limiter trim.
 */

import type { SpeakerLoudnessPreset } from './speakerLoudnessMastering'
import { readSpeakerLoudnessMeters, type SpeakerLoudnessNodes } from './speakerLoudnessMastering'

const DEBUG_STORAGE_KEY = 'sessionmirror:speaker-loudness-debug'
const MAX_ANALYSIS_SECONDS = 45
/** If limiter GR exceeds this, trim pre-limiter bus gain (see speakerLoudnessMastering). */
export const LIMITER_OVERLOAD_DB = 6
const LIMITER_TRIM_STEP = 0.88
const LIMITER_TRIM_FLOOR = 0.55
/**
 * RMS below this (dBFS) triggers optional quiet-recording playback boost.
 * Phone vocals often land around -38 to -50 dBFS in the raw file.
 */
export const LOW_RECORDING_RMS_THRESHOLD_DB = -36
/** Peak guard into mastering input — output limiter still -1 dBFS. */
function preMasteringInputPeakCeilingDb(
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): number {
  switch (preset) {
    case 'phone':
      return 14
    case 'max':
      return 10
    default:
      return 8
  }
}

export interface LoudnessMeasurement {
  peak: number
  rms: number
  peakDb: number
  rmsDb: number
  /** RMS-based loudness proxy (dBFS). */
  lufsEstimateDb: number
}

export interface NormalizationPresetLimits {
  rmsTargetDb: number
  peakCeilingDb: number
  /** Extra bus gain (dB) when file RMS is very low (speaker playback only). */
  quietRecordingBoostDb: number
}

/** Hard ceiling on the bus GainNode per preset (pre-mastering, pre-trim). */
export const SPEAKER_MAX_BUS_GAIN: Record<
  Exclude<SpeakerLoudnessPreset, 'off'>,
  number
> = {
  clear: 20,
  loud: 32,
  max: 52,
  phone: 72,
  extreme: 64,
  insane: 96,
}

/** Starting bus gain before per-take analysis completes. */
export const SPEAKER_DEFAULT_BUS_GAIN: Record<
  Exclude<SpeakerLoudnessPreset, 'off'>,
  number
> = {
  clear: 14,
  loud: 18,
  max: 38,
  phone: 48,
  extreme: 64,
  insane: 96,
}

/** Floor on measured bus gain — avoids silence on very hot takes. */
export const SPEAKER_MIN_BUS_GAIN: Record<
  Exclude<SpeakerLoudnessPreset, 'off'>,
  number
> = {
  clear: 6,
  loud: 10,
  max: 12,
  phone: 14,
  extreme: 64,
  insane: 96,
}

/** Fixed bus gain for test presets — bypasses per-take RMS analysis. */
export const FIXED_SPEAKER_BUS_GAIN: Record<'extreme' | 'insane', number> = {
  extreme: 64,
  insane: 96,
}

export function isFixedBusGainPreset(
  preset: SpeakerLoudnessPreset,
): preset is 'extreme' | 'insane' {
  return preset === 'extreme' || preset === 'insane'
}

export function getFixedSpeakerBusGain(
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): number | null {
  if (preset === 'extreme' || preset === 'insane') {
    return FIXED_SPEAKER_BUS_GAIN[preset]
  }
  return null
}

export const NORMALIZATION_PRESET_LIMITS: Record<
  Exclude<SpeakerLoudnessPreset, 'off'>,
  NormalizationPresetLimits
> = {
  clear: {
    rmsTargetDb: -14,
    peakCeilingDb: -1,
    quietRecordingBoostDb: 0,
  },
  loud: {
    rmsTargetDb: -12,
    peakCeilingDb: -1,
    quietRecordingBoostDb: 3,
  },
  max: {
    rmsTargetDb: -9.5,
    peakCeilingDb: -1,
    quietRecordingBoostDb: 4,
  },
  phone: {
    rmsTargetDb: -8,
    peakCeilingDb: -1,
    quietRecordingBoostDb: 6,
  },
  extreme: {
    rmsTargetDb: -8,
    peakCeilingDb: -1,
    quietRecordingBoostDb: 0,
  },
  insane: {
    rmsTargetDb: -8,
    peakCeilingDb: -1,
    quietRecordingBoostDb: 0,
  },
}

export interface SpeakerNormalizationSnapshot {
  measuredPeak: number
  measuredRMS: number
  measuredPeakDb: number
  measuredRmsDb: number
  lufsEstimateDb: number
  maxGainCap: number
  targetRMS: number
  calculatedBusGain: number
  limiterTrim: number
  finalPreLimiterGain: number
  finalBusGain: number
  limiterReductionEstimate: number | null
  preset: SpeakerLoudnessPreset
}

const analysisCache = new Map<string, LoudnessMeasurement>()

function readDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function linearToDb(value: number): number {
  return 20 * Math.log10(Math.max(value, 1e-8))
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function getSpeakerMaxBusGain(
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): number {
  return SPEAKER_MAX_BUS_GAIN[preset]
}

export function getSpeakerDefaultBusGain(
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): number {
  return SPEAKER_DEFAULT_BUS_GAIN[preset]
}

/** @deprecated Use getSpeakerDefaultBusGain */
export function getSpeakerBaseGain(
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): number {
  return getSpeakerDefaultBusGain(preset)
}

export function mediaLoudnessCacheKey(el: HTMLMediaElement): string {
  return el.currentSrc || el.src || ''
}

export function clearMediaLoudnessCache(): void {
  analysisCache.clear()
}

function measureBuffer(buffer: AudioBuffer): LoudnessMeasurement {
  const maxSamples = Math.min(
    buffer.length,
    Math.floor(buffer.sampleRate * MAX_ANALYSIS_SECONDS),
  )

  let peak = 0
  let sumSq = 0
  let count = 0

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch)
    for (let i = 0; i < maxSamples; i++) {
      const sample = data[i] ?? 0
      const abs = Math.abs(sample)
      if (abs > peak) peak = abs
      sumSq += sample * sample
      count++
    }
  }

  const rms = Math.sqrt(sumSq / Math.max(1, count))
  const rmsDb = linearToDb(rms)

  return {
    peak,
    rms,
    peakDb: linearToDb(peak),
    rmsDb,
    lufsEstimateDb: rmsDb,
  }
}

/** Decode take audio and measure peak / RMS (cached by media URL). */
export async function analyzeMediaLoudness(
  el: HTMLMediaElement,
  decodeContext?: AudioContext,
): Promise<LoudnessMeasurement | null> {
  const key = mediaLoudnessCacheKey(el)
  if (!key) return null

  const cached = analysisCache.get(key)
  if (cached) return cached

  let ownsContext = false
  let ctx = decodeContext
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext()
    ownsContext = true
  }

  try {
    const response = await fetch(key)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
    const measurement = measureBuffer(buffer)
    analysisCache.set(key, measurement)
    return measurement
  } catch {
    return null
  } finally {
    if (ownsContext) {
      await ctx.close().catch(() => {})
    }
  }
}

/**
 * Total bus GainNode value — RMS-first average loudness, then soft peak guard.
 * Peak ceiling at output remains -1 dBFS via the mastering limiter.
 */
export function computeTotalBusGain(
  measurement: LoudnessMeasurement,
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): number {
  const limits = NORMALIZATION_PRESET_LIMITS[preset]
  const maxGain = SPEAKER_MAX_BUS_GAIN[preset]
  const minGain = SPEAKER_MIN_BUS_GAIN[preset]

  // Primary: lift average level toward preset RMS target
  let gainDb = limits.rmsTargetDb - measurement.rmsDb

  // Quiet phone vocals — extra playback normalization (speaker only)
  if (measurement.rmsDb < LOW_RECORDING_RMS_THRESHOLD_DB) {
    gainDb += limits.quietRecordingBoostDb
  }

  // Soft guard into EQ/compressor (not output); limiter handles -1 dBFS out
  const peakLimitedGainDb =
    preMasteringInputPeakCeilingDb(preset) - measurement.peakDb
  gainDb = Math.min(gainDb, peakLimitedGainDb)

  return clamp(dbToLinear(gainDb), minGain, maxGain)
}

/** @deprecated Alias — returns total bus gain, not a separate multiplier. */
export function computeNormalizationGain(
  measurement: LoudnessMeasurement,
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): number {
  return computeTotalBusGain(measurement, preset)
}

export function computeSpeakerBusGain(
  volume: number,
  muted: boolean,
  busGain: number,
  limiterTrim = 1,
): number {
  if (muted) return 0
  return Math.max(0, volume) * busGain * limiterTrim
}

export function buildNormalizationSnapshot(
  preset: SpeakerLoudnessPreset,
  measurement: LoudnessMeasurement | null,
  calculatedBusGain: number,
  volume: number,
  muted: boolean,
  limiterTrim: number,
  mastering?: SpeakerLoudnessNodes | null,
): SpeakerNormalizationSnapshot {
  const activePreset = preset === 'off' ? 'loud' : preset
  const limits = NORMALIZATION_PRESET_LIMITS[activePreset]
  const maxGainCap = SPEAKER_MAX_BUS_GAIN[activePreset]

  let limiterReductionEstimate: number | null = null
  if (mastering) {
    const meters = readSpeakerLoudnessMeters(mastering)
    limiterReductionEstimate = meters.gainReductionEstimate
  }

  const finalPreLimiterGain = computeSpeakerBusGain(
    volume,
    muted,
    calculatedBusGain,
    limiterTrim,
  )

  return {
    measuredPeak: measurement?.peak ?? 0,
    measuredRMS: measurement?.rms ?? 0,
    measuredPeakDb: measurement?.peakDb ?? -Infinity,
    measuredRmsDb: measurement?.rmsDb ?? -Infinity,
    lufsEstimateDb: measurement?.lufsEstimateDb ?? -Infinity,
    maxGainCap,
    targetRMS: limits.rmsTargetDb,
    calculatedBusGain,
    limiterTrim,
    finalPreLimiterGain,
    finalBusGain: finalPreLimiterGain,
    limiterReductionEstimate,
    preset,
  }
}

export function logSpeakerNormalization(
  reason: string,
  snapshot: SpeakerNormalizationSnapshot,
): void {
  if (!readDebugEnabled()) return
  console.info('[SpeakerNormalize]', reason, {
    preset: snapshot.preset,
    maxGainCap: snapshot.maxGainCap.toFixed(1),
    measuredRMS: snapshot.measuredRMS.toFixed(5),
    measuredRMSDb: `${snapshot.measuredRmsDb.toFixed(1)} dBFS`,
    measuredPeak: snapshot.measuredPeak.toFixed(5),
    targetRMS: `${snapshot.targetRMS} dBFS`,
    calculatedBusGain: snapshot.calculatedBusGain.toFixed(3),
    limiterTrim: snapshot.limiterTrim.toFixed(3),
    finalPreLimiterGain: snapshot.finalPreLimiterGain.toFixed(3),
    finalBusGain: snapshot.finalBusGain.toFixed(3),
    limiterReductionEstimate:
      snapshot.limiterReductionEstimate !== null
        ? `${snapshot.limiterReductionEstimate.toFixed(1)} dB`
        : null,
  })
}

/** Reduce bus gain when the limiter GR exceeds the hot threshold. */
export function maybeTrimPreLimiterBusGain(
  mastering: SpeakerLoudnessNodes,
  currentBusGain: number,
  currentTrim: number,
): {
  busGain: number
  trim: number
  trimmed: boolean
  limiterTooHot: boolean
} {
  const meters = readSpeakerLoudnessMeters(mastering)
  const limiterTooHot = meters.limiterTooHot

  if (!limiterTooHot) {
    return { busGain: currentBusGain, trim: currentTrim, trimmed: false, limiterTooHot: false }
  }

  const nextTrim = Math.max(LIMITER_TRIM_FLOOR, currentTrim * LIMITER_TRIM_STEP)
  if (nextTrim >= currentTrim) {
    return { busGain: currentBusGain, trim: currentTrim, trimmed: false, limiterTooHot: true }
  }

  const busGain = currentBusGain * LIMITER_TRIM_STEP
  return { busGain, trim: nextTrim, trimmed: true, limiterTooHot: true }
}
