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

export const DEFAULT_AUDIO_ENHANCER_SETTINGS: AudioEnhancerSettings = {
  preset: 'Voice',
  eq: { low: 0, mid: 0, high: 0 },
  compression: 0,
  reverb: 0,
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
  return { ...AUDIO_ENHANCER_PRESETS[preset] }
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

function makeImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds))
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay)
    }
  }

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

export function applyAudioEnhancerSettings(
  nodes: AudioEnhancerNodes,
  settings: AudioEnhancerSettings,
): void {
  const eq = settings.eq
  const tuning = PROFILE_TUNING[settings.preset] ?? DEFAULT_PROFILE_TUNING
  nodes.lowShelf.frequency.value = tuning.lowHz
  nodes.midPeaking.frequency.value = tuning.midHz
  nodes.midPeaking.Q.value = tuning.midQ
  nodes.highShelf.frequency.value = tuning.highHz

  nodes.lowShelf.gain.value = clampDb(eq.low)
  nodes.midPeaking.gain.value = clampDb(eq.mid)
  nodes.highShelf.gain.value = clampDb(eq.high)

  const comp = clampPercent(settings.compression) / 100
  nodes.compressor.threshold.value = -12 - comp * 24
  nodes.compressor.ratio.value = 1.5 + comp * 6.5
  nodes.compressor.attack.value = 0.004 + (1 - comp) * 0.014
  nodes.compressor.release.value = 0.09 + comp * 0.2
  nodes.compressor.knee.value = 20
  nodes.makeup.gain.value = dbToLinear(tuning.makeupDb + comp * 2.4)
  nodes.limiter.threshold.value = -1
  nodes.limiter.knee.value = 0
  nodes.limiter.ratio.value = 20
  nodes.limiter.attack.value = 0.001
  nodes.limiter.release.value = 0.075

  const reverbMix = clampPercent(settings.reverb) / 100
  nodes.reverbSend.gain.value = reverbMix * 0.55
  nodes.dryGain.gain.value = 1
  nodes.wetGain.gain.value = 0.22 + reverbMix * 0.42
}

export function createAudioEnhancerChain(
  ctx: AudioContext,
  settings: AudioEnhancerSettings,
): AudioEnhancerNodes {
  const input = ctx.createGain()
  const output = ctx.createGain()

  const lowShelf = ctx.createBiquadFilter()
  lowShelf.type = 'lowshelf'
  lowShelf.frequency.value = 180

  const midPeaking = ctx.createBiquadFilter()
  midPeaking.type = 'peaking'
  midPeaking.frequency.value = 1200
  midPeaking.Q.value = 0.9

  const highShelf = ctx.createBiquadFilter()
  highShelf.type = 'highshelf'
  highShelf.frequency.value = 4200

  const compressor = ctx.createDynamicsCompressor()
  const makeup = ctx.createGain()
  const limiter = ctx.createDynamicsCompressor()

  const dryGain = ctx.createGain()
  const wetGain = ctx.createGain()
  const reverbSend = ctx.createGain()
  const convolver = ctx.createConvolver()
  convolver.buffer = makeImpulseResponse(ctx, 1.6, 2.4)
  convolver.normalize = true

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

  applyAudioEnhancerSettings(nodes, settings)
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

export function parseAudioEnhancerSettings(value: unknown): AudioEnhancerSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_AUDIO_ENHANCER_SETTINGS }
  }

  const parsed = value as Partial<AudioEnhancerSettings>
  const eq = parsed.eq
  return {
    preset: parsePreset(parsed.preset),
    eq: {
      low: clampEqBand(eq?.low),
      mid: clampEqBand(eq?.mid),
      high: clampEqBand(eq?.high),
    },
    compression: clampPercent(Number(parsed.compression) || 0),
    reverb: clampPercent(Number(parsed.reverb) || 0),
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

function clampEqBand(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(12, Math.max(-12, Math.round(n)))
}
