export type AudioEnhancerPreset =
  | 'Brass'
  | 'Strings'
  | 'Woodwinds'
  | 'Voice'
  | 'Percussion'
  | 'Custom'

export interface AudioEnhancerEq {
  low: number
  mid: number
  high: number
}

export interface AudioEnhancerSettings {
  preset: AudioEnhancerPreset
  eq: AudioEnhancerEq
  compression: number
  reverb: number
}

export const AUDIO_ENHANCER_PRESETS: Record<
  Exclude<AudioEnhancerPreset, 'Custom'>,
  AudioEnhancerSettings
> = {
  Brass: { preset: 'Brass', eq: { low: 1, mid: -2, high: -1 }, compression: 46, reverb: 12 },
  Strings: { preset: 'Strings', eq: { low: 0, mid: 3, high: 2 }, compression: 34, reverb: 22 },
  Woodwinds: { preset: 'Woodwinds', eq: { low: -1, mid: 4, high: 1 }, compression: 32, reverb: 18 },
  Voice: { preset: 'Voice', eq: { low: -3, mid: 2, high: 4 }, compression: 48, reverb: 16 },
  Percussion: { preset: 'Percussion', eq: { low: 3, mid: -3, high: 3 }, compression: 68, reverb: 6 },
}

/**
 * Deep copy. Preset entries are module constants and their `eq` object would
 * otherwise be shared by every settings object spread from them — one stray
 * mutation would rewrite the preset table for the rest of the session.
 */
export function cloneAudioEnhancerSettings(
  settings: AudioEnhancerSettings,
): AudioEnhancerSettings {
  return {
    preset: settings.preset,
    eq: { ...settings.eq },
    compression: settings.compression,
    reverb: settings.reverb,
  }
}

export const DEFAULT_AUDIO_ENHANCER_PRESET: Exclude<AudioEnhancerPreset, 'Custom'> = 'Voice'

/**
 * The enhancer ships in the state its chip claims: the values ARE the Voice
 * preset. A flat/zero default under a preset name means turning the enhancer
 * on does almost nothing while the UI insists a mode is active.
 */
export const DEFAULT_AUDIO_ENHANCER_SETTINGS: AudioEnhancerSettings = cloneAudioEnhancerSettings(
  AUDIO_ENHANCER_PRESETS[DEFAULT_AUDIO_ENHANCER_PRESET],
)

type EnhancerProfileTuning = {
  lowHz: number
  midHz: number
  midQ: number
  highHz: number
  makeupDb: number
}

const DEFAULT_PROFILE_TUNING: EnhancerProfileTuning = {
  lowHz: 180,
  midHz: 1200,
  midQ: 0.9,
  highHz: 4200,
  makeupDb: 1.2,
}

const PROFILE_TUNING: Record<AudioEnhancerPreset, EnhancerProfileTuning> = {
  Voice: { lowHz: 150, midHz: 1800, midQ: 0.95, highHz: 5200, makeupDb: 1.5 },
  Brass: { lowHz: 170, midHz: 900, midQ: 1.1, highHz: 3600, makeupDb: 1.1 },
  Strings: { lowHz: 140, midHz: 2400, midQ: 0.85, highHz: 6200, makeupDb: 1.0 },
  Woodwinds: { lowHz: 160, midHz: 1900, midQ: 0.9, highHz: 5000, makeupDb: 1.0 },
  Percussion: { lowHz: 120, midHz: 650, midQ: 1.25, highHz: 6200, makeupDb: 0.8 },
  Custom: DEFAULT_PROFILE_TUNING,
}

export function settingsFromPreset(
  preset: Exclude<AudioEnhancerPreset, 'Custom'>,
): AudioEnhancerSettings {
  return cloneAudioEnhancerSettings(AUDIO_ENHANCER_PRESETS[preset])
}

/**
 * True when the sliders still hold the named preset's values. Editing a slider
 * deliberately keeps the preset selected — the preset also picks the filter
 * frequencies, so switching to "Custom" mid-edit would jump the EQ centres and
 * change the tone from an unrelated control. The UI labels the difference
 * instead.
 */
export function matchesPresetDefaults(settings: AudioEnhancerSettings): boolean {
  if (settings.preset === 'Custom') return false
  const preset = AUDIO_ENHANCER_PRESETS[settings.preset]
  return (
    settings.eq.low === preset.eq.low &&
    settings.eq.mid === preset.eq.mid &&
    settings.eq.high === preset.eq.high &&
    settings.compression === preset.compression &&
    settings.reverb === preset.reverb
  )
}

export interface AudioEnhancerNodes {
  input: GainNode
  output: GainNode
  lowShelf: BiquadFilterNode
  midPeaking: BiquadFilterNode
  highShelf: BiquadFilterNode
  compressor: DynamicsCompressorNode
  makeup: GainNode
  limiter: DynamicsCompressorNode
  reverbSend: GainNode
  dryGain: GainNode
  wetGain: GainNode
  convolver: ConvolverNode
}

const IMPULSE_SECONDS = 1.4
const PRE_DELAY_SECONDS = 0.018

/**
 * Discrete early reflections (seconds after the pre-delay, gain). They give the
 * tail a room signature; without them a convolved noise burst reads as a hiss
 * cloud rather than a space.
 */
const EARLY_REFLECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0.0113, 0.72],
  [0.0197, -0.55],
  [0.0281, 0.46],
  [0.0353, -0.34],
  [0.0461, 0.27],
  [0.0592, -0.19],
]

/**
 * One impulse response per AudioContext. Generating it costs ~130k random
 * samples per channel, and every routed media element used to build its own.
 */
const impulseCache = new WeakMap<BaseAudioContext, AudioBuffer>()

/**
 * A small room: pre-delay so note attacks stay clear, early reflections, then a
 * diffuse tail that decays exponentially and loses its highs as it goes (real
 * rooms absorb treble fastest). ConvolverNode.normalize keeps the wet level
 * independent of the shape, so tuning this does not change how loud reverb is.
 */
function makeImpulseResponse(ctx: BaseAudioContext): AudioBuffer {
  const cached = impulseCache.get(ctx)
  if (cached) return cached

  const sampleRate = ctx.sampleRate
  const length = Math.max(2, Math.floor(sampleRate * IMPULSE_SECONDS))
  const preDelay = Math.min(length - 1, Math.floor(sampleRate * PRE_DELAY_SECONDS))
  const tailLength = Math.max(1, length - preDelay)
  // Reach −60 dB exactly at the buffer end so the tail fades out, not cuts off.
  const decayPerSample = Math.log(0.001) / tailLength

  const impulse = ctx.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    // Skewing one channel decorrelates the two tails, which is what makes the
    // reverb sound wide instead of centred.
    const skew = channel === 0 ? 1 : 1.037
    let lowpassState = 0

    for (let i = preDelay; i < length; i++) {
      const envelope = Math.exp(decayPerSample * (i - preDelay) * skew)
      // One-pole lowpass that closes as the tail decays: bright early, dark late.
      const cutoff = 0.3 + 0.55 * envelope
      lowpassState += cutoff * (Math.random() * 2 - 1 - lowpassState)
      data[i] = lowpassState * envelope
    }

    for (const [seconds, gain] of EARLY_REFLECTIONS) {
      const index = preDelay + Math.floor(seconds * sampleRate * skew)
      if (index < length) data[index] += gain * (channel === 0 ? 1 : -0.92)
    }
  }

  impulseCache.set(ctx, impulse)
  return impulse
}

function clampDb(value: number): number {
  return Math.min(12, Math.max(-12, value))
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

/** Time constant for live parameter moves — long enough to hide zipper noise. */
const PARAM_GLIDE_SECONDS = 0.02

/**
 * Assigning `param.value` mid-playback steps the coefficient in one block,
 * which clicks audibly while a slider is being dragged. Glide instead, except
 * when the chain is still being built and nothing is listening yet.
 */
function setParam(
  param: AudioParam,
  value: number,
  ctx: BaseAudioContext,
  immediate: boolean,
): void {
  if (!Number.isFinite(value)) return
  if (immediate) {
    param.value = value
    return
  }
  try {
    param.setTargetAtTime(value, ctx.currentTime, PARAM_GLIDE_SECONDS)
  } catch {
    param.value = value
  }
}

export function applyAudioEnhancerSettings(
  nodes: AudioEnhancerNodes,
  settings: AudioEnhancerSettings,
  immediate = false,
): void {
  const ctx = nodes.input.context
  const eq = settings.eq
  const tuning = PROFILE_TUNING[settings.preset] ?? DEFAULT_PROFILE_TUNING

  setParam(nodes.lowShelf.frequency, tuning.lowHz, ctx, immediate)
  setParam(nodes.midPeaking.frequency, tuning.midHz, ctx, immediate)
  setParam(nodes.midPeaking.Q, tuning.midQ, ctx, immediate)
  setParam(nodes.highShelf.frequency, tuning.highHz, ctx, immediate)

  setParam(nodes.lowShelf.gain, clampDb(eq.low), ctx, immediate)
  setParam(nodes.midPeaking.gain, clampDb(eq.mid), ctx, immediate)
  setParam(nodes.highShelf.gain, clampDb(eq.high), ctx, immediate)

  const comp = clampPercent(settings.compression) / 100
  setParam(nodes.compressor.threshold, -12 - comp * 24, ctx, immediate)
  setParam(nodes.compressor.ratio, 1.5 + comp * 6.5, ctx, immediate)
  setParam(nodes.compressor.attack, 0.004 + (1 - comp) * 0.014, ctx, immediate)
  setParam(nodes.compressor.release, 0.09 + comp * 0.2, ctx, immediate)
  setParam(nodes.compressor.knee, 20, ctx, immediate)
  setParam(nodes.makeup.gain, dbToLinear(tuning.makeupDb + comp * 2.4), ctx, immediate)

  // Fixed brickwall; never glided, it is the safety net for everything above.
  nodes.limiter.threshold.value = -1
  nodes.limiter.knee.value = 0
  nodes.limiter.ratio.value = 20
  nodes.limiter.attack.value = 0.001
  nodes.limiter.release.value = 0.075

  const reverbMix = clampPercent(settings.reverb) / 100
  setParam(nodes.reverbSend.gain, reverbMix * 0.55, ctx, immediate)
  setParam(nodes.dryGain.gain, 1, ctx, immediate)
  setParam(nodes.wetGain.gain, 0.22 + reverbMix * 0.42, ctx, immediate)
}

export function createAudioEnhancerChain(
  ctx: AudioContext,
  settings: AudioEnhancerSettings,
): AudioEnhancerNodes {
  const input = ctx.createGain()
  const output = ctx.createGain()

  const lowShelf = ctx.createBiquadFilter()
  lowShelf.type = 'lowshelf'

  const midPeaking = ctx.createBiquadFilter()
  midPeaking.type = 'peaking'

  const highShelf = ctx.createBiquadFilter()
  highShelf.type = 'highshelf'

  const compressor = ctx.createDynamicsCompressor()
  const makeup = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()

  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  const reverbSend = ctx.createGain()
  const convolver = ctx.createConvolver()
  convolver.normalize = true
  convolver.buffer = makeImpulseResponse(ctx)

  input.connect(lowShelf)
  lowShelf.connect(midPeaking)
  midPeaking.connect(highShelf)
  highShelf.connect(compressor)
  compressor.connect(makeup)

  makeup.connect(dryGain)
  makeup.connect(reverbSend)
  reverbSend.connect(convolver)
  convolver.connect(wetGain)

  dryGain.connect(limiter)
  wetGain.connect(limiter)
  limiter.connect(output)

  const nodes: AudioEnhancerNodes = {
    input,
    output,
    lowShelf,
    midPeaking,
    highShelf,
    compressor,
    makeup,
    limiter,
    reverbSend,
    dryGain,
    wetGain,
    convolver,
  }

  applyAudioEnhancerSettings(nodes, settings, true)
  return nodes
}

export function updateAudioEnhancerChain(
  nodes: AudioEnhancerNodes,
  settings: AudioEnhancerSettings,
): void {
  applyAudioEnhancerSettings(nodes, settings)
}

/** Tear down enhancer nodes when bypassing the chain. */
export function disposeAudioEnhancerChain(nodes: AudioEnhancerNodes): void {
  const disconnect = (node: AudioNode) => {
    try {
      node.disconnect()
    } catch {
      /* already disconnected */
    }
  }

  disconnect(nodes.input)
  disconnect(nodes.lowShelf)
  disconnect(nodes.midPeaking)
  disconnect(nodes.highShelf)
  disconnect(nodes.compressor)
  disconnect(nodes.makeup)
  disconnect(nodes.limiter)
  disconnect(nodes.dryGain)
  disconnect(nodes.reverbSend)
  disconnect(nodes.convolver)
  disconnect(nodes.wetGain)
  disconnect(nodes.output)
}

/**
 * Flatten enhancer settings into the parameter dict the native offline
 * renderer (AudioEnhancerRenderer.swift) consumes when baking the enhancement
 * into a recorded take. Mirrors applyAudioEnhancerSettings above — keep the
 * two in sync so what you hear in playback preview matches what gets baked.
 */
export function buildNativeEnhancerParams(
  settings: AudioEnhancerSettings,
): Record<string, number> {
  const tuning = PROFILE_TUNING[settings.preset] ?? DEFAULT_PROFILE_TUNING
  const comp = clampPercent(settings.compression) / 100
  const reverbMix = clampPercent(settings.reverb) / 100

  return {
    lowHz: tuning.lowHz,
    lowGainDb: clampDb(settings.eq.low),
    midHz: tuning.midHz,
    midQ: tuning.midQ,
    midGainDb: clampDb(settings.eq.mid),
    highHz: tuning.highHz,
    highGainDb: clampDb(settings.eq.high),
    thresholdDb: -12 - comp * 24,
    ratio: 1.5 + comp * 6.5,
    attackSec: 0.004 + (1 - comp) * 0.014,
    releaseSec: 0.09 + comp * 0.2,
    makeupDb: tuning.makeupDb + comp * 2.4,
    // Product of the JS reverbSend gain × wetGain — the native graph applies
    // it as a single wet-path gain after a wet-only reverb.
    reverbWetLevel: reverbMix * 0.55 * (0.22 + reverbMix * 0.42),
  }
}

export function parseAudioEnhancerSettings(value: unknown): AudioEnhancerSettings {
  if (!value || typeof value !== 'object') {
    return cloneAudioEnhancerSettings(DEFAULT_AUDIO_ENHANCER_SETTINGS)
  }

  const parsed = value as Partial<AudioEnhancerSettings>
  const preset = parsePreset(parsed.preset)
  const eq = parsed.eq

  // A stored preset with no slider payload is a preset selection, not a flat
  // EQ — fall back to that preset's own values rather than to zeros.
  const fallback =
    preset === 'Custom' ? DEFAULT_AUDIO_ENHANCER_SETTINGS : AUDIO_ENHANCER_PRESETS[preset]

  return {
    preset,
    eq: {
      low: clampEqBand(eq?.low, fallback.eq.low),
      mid: clampEqBand(eq?.mid, fallback.eq.mid),
      high: clampEqBand(eq?.high, fallback.eq.high),
    },
    compression: clampStoredPercent(parsed.compression, fallback.compression),
    reverb: clampStoredPercent(parsed.reverb, fallback.reverb),
  }
}

function parsePreset(value: unknown): AudioEnhancerPreset {
  const presets: AudioEnhancerPreset[] = [
    'Brass',
    'Strings',
    'Woodwinds',
    'Voice',
    'Percussion',
    'Custom',
  ]
  return presets.includes(value as AudioEnhancerPreset)
    ? (value as AudioEnhancerPreset)
    : DEFAULT_AUDIO_ENHANCER_SETTINGS.preset
}

function clampEqBand(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(12, Math.max(-12, Math.round(n)))
}

function clampStoredPercent(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return clampPercent(n)
}
