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
  Brass: { preset: 'Brass', eq: { low: 2, mid: -1, high: -3 }, compression: 60, reverb: 30 },
  Strings: { preset: 'Strings', eq: { low: 1, mid: 2, high: 1 }, compression: 40, reverb: 60 },
  Woodwinds: { preset: 'Woodwinds', eq: { low: 0, mid: 3, high: -1 }, compression: 30, reverb: 40 },
  Voice: { preset: 'Voice', eq: { low: -2, mid: 1, high: 3 }, compression: 50, reverb: 45 },
  Percussion: { preset: 'Percussion', eq: { low: 3, mid: -2, high: 2 }, compression: 80, reverb: 10 },
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

export function applyAudioEnhancerSettings(
  nodes: AudioEnhancerNodes,
  settings: AudioEnhancerSettings,
): void {
  const eq = settings.eq
  nodes.lowShelf.gain.value = clampDb(eq.low)
  nodes.midPeaking.gain.value = clampDb(eq.mid)
  nodes.highShelf.gain.value = clampDb(eq.high)

  const comp = clampPercent(settings.compression) / 100
  nodes.compressor.threshold.value = -6 - comp * 30
  nodes.compressor.ratio.value = 1 + comp * 11
  nodes.compressor.attack.value = 0.003 + (1 - comp) * 0.01
  nodes.compressor.release.value = 0.08 + comp * 0.22
  nodes.compressor.knee.value = 18

  const reverbMix = clampPercent(settings.reverb) / 100
  nodes.reverbSend.gain.value = reverbMix
  nodes.dryGain.gain.value = 1
  nodes.wetGain.gain.value = 0.35 + reverbMix * 0.55
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

  compressor.connect(dryGain)
  compressor.connect(reverbSend)
  reverbSend.connect(convolver)
  convolver.connect(wetGain)

  dryGain.connect(output)
  wetGain.connect(output)

  const nodes: AudioEnhancerNodes = {
    input,
    output,
    lowShelf,
    midPeaking,
    highShelf,
    compressor,
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
