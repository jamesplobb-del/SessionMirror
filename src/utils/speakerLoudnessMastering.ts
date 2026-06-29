/**
 * Speaker-only loudness / mastering chain for iPhone built-in speakers.
 * Bypassed entirely when headphones or Bluetooth output is active.
 *
 * Bus gain is set via measured normalization (speakerLoudnessNormalization.ts).
 * This chain handles EQ, compression, makeup, and peak limiting only.
 */

export type SpeakerLoudnessPreset =
  | 'off'
  | 'clear'
  | 'loud'
  | 'max'
  | 'phone'
  | 'extreme'
  | 'insane'

export interface SpeakerLoudnessPresetParams {
  highPassHz: number
  highPass24dB: boolean
  mudCutDb: number
  mudCutHz: number
  mudCutQ: number
  presenceDb: number
  presenceHz: number
  presenceQ: number
  airDb: number
  airHz: number
  compressorThreshold: number
  compressorKnee: number
  compressorRatio: number
  compressorAttack: number
  compressorRelease: number
  makeupGainDb: number
  limiterCeilingDb: number
  limiterRatio: number
}

export const SPEAKER_LOUDNESS_PRESETS: Record<
  Exclude<SpeakerLoudnessPreset, 'off'>,
  SpeakerLoudnessPresetParams
> = {
  clear: {
    highPassHz: 160,
    highPass24dB: false,
    mudCutDb: -3,
    mudCutHz: 320,
    mudCutQ: 1.15,
    presenceDb: 2.5,
    presenceHz: 3000,
    presenceQ: 0.85,
    airDb: 1,
    airHz: 8000,
    compressorThreshold: -22,
    compressorKnee: 12,
    compressorRatio: 3,
    compressorAttack: 0.004,
    compressorRelease: 0.24,
    makeupGainDb: 3,
    limiterCeilingDb: -1,
    limiterRatio: 20,
  },
  loud: {
    highPassHz: 170,
    highPass24dB: true,
    mudCutDb: -4,
    mudCutHz: 380,
    mudCutQ: 1.2,
    presenceDb: 3.5,
    presenceHz: 3500,
    presenceQ: 0.9,
    airDb: 1.5,
    airHz: 9000,
    compressorThreshold: -20,
    compressorKnee: 16,
    compressorRatio: 3.5,
    compressorAttack: 0.003,
    compressorRelease: 0.2,
    makeupGainDb: 6.5,
    limiterCeilingDb: -1,
    limiterRatio: 12,
  },
  max: {
    highPassHz: 180,
    highPass24dB: true,
    mudCutDb: -5,
    mudCutHz: 420,
    mudCutQ: 1.25,
    presenceDb: 4.5,
    presenceHz: 4200,
    presenceQ: 0.95,
    airDb: 2,
    airHz: 10000,
    compressorThreshold: -28,
    compressorKnee: 10,
    compressorRatio: 4.5,
    compressorAttack: 0.003,
    compressorRelease: 0.2,
    makeupGainDb: 5.5,
    limiterCeilingDb: -1,
    limiterRatio: 20,
  },
  /** Aggressive iPhone speaker audibility — less natural, louder than musician presets. */
  phone: {
    highPassHz: 180,
    highPass24dB: true,
    mudCutDb: -5,
    mudCutHz: 350,
    mudCutQ: 1.2,
    presenceDb: 5,
    presenceHz: 3500,
    presenceQ: 0.9,
    airDb: 2,
    airHz: 8000,
    compressorThreshold: -30,
    compressorKnee: 15,
    compressorRatio: 5.5,
    compressorAttack: 0.003,
    compressorRelease: 0.18,
    makeupGainDb: 8,
    limiterCeilingDb: -1,
    limiterRatio: 20,
  },
  /** Test preset — fixed 64× bus, no per-take RMS normalization. */
  extreme: {
    highPassHz: 170,
    highPass24dB: true,
    mudCutDb: -4,
    mudCutHz: 350,
    mudCutQ: 1.2,
    presenceDb: 4,
    presenceHz: 3500,
    presenceQ: 0.85,
    airDb: 1.5,
    airHz: 8000,
    compressorThreshold: -30,
    compressorKnee: 12,
    compressorRatio: 6,
    compressorAttack: 0.003,
    compressorRelease: 0.15,
    makeupGainDb: 8,
    limiterCeilingDb: -1,
    limiterRatio: 12,
  },
  /** Debug test preset — fixed 96× bus; may distort. */
  insane: {
    highPassHz: 180,
    highPass24dB: true,
    mudCutDb: -4,
    mudCutHz: 350,
    mudCutQ: 1.2,
    presenceDb: 4,
    presenceHz: 3500,
    presenceQ: 0.85,
    airDb: 1.5,
    airHz: 8000,
    compressorThreshold: -30,
    compressorKnee: 12,
    compressorRatio: 6,
    compressorAttack: 0.003,
    compressorRelease: 0.15,
    makeupGainDb: 8,
    limiterCeilingDb: -1,
    limiterRatio: 12,
  },
}

export interface SpeakerLoudnessMeterSnapshot {
  preDSPPeak: number
  preDSPRMS: number
  postDSPPeak: number
  postDSPRMS: number
  gainReductionEstimate: number
  compressorReduction: number
  limiterReduction: number
  limiterEngaged: boolean
  limiterTooHot: boolean
}

export interface SpeakerLoudnessNodes {
  input: GainNode
  output: GainNode
  preAnalyser: AnalyserNode
  postAnalyser: AnalyserNode
  highPass1: BiquadFilterNode
  highPass2: BiquadFilterNode
  mudCut: BiquadFilterNode
  presence: BiquadFilterNode
  airShelf: BiquadFilterNode
  compressor: DynamicsCompressorNode
  limiter: DynamicsCompressorNode
  makeup: GainNode
  preset: Exclude<SpeakerLoudnessPreset, 'off'>
}

const DEBUG_STORAGE_KEY = 'sessionmirror:speaker-loudness-debug'

/** Limiter GR above this triggers bus/makeup pullback. */
export const LIMITER_HOT_THRESHOLD_DB = 6
export const TARGET_COMPRESSOR_REDUCTION_DB = { min: 3, max: 8 }
export const TARGET_LIMITER_REDUCTION_DB = { min: 0, max: 3 }

let meterIntervalId: number | null = null
let meterChain: SpeakerLoudnessNodes | null = null

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

function readDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function measureAnalyser(analyser: AnalyserNode): { peak: number; rms: number } {
  const buffer = new Float32Array(analyser.fftSize)
  analyser.getFloatTimeDomainData(buffer)
  let peak = 0
  let sumSq = 0
  for (let i = 0; i < buffer.length; i++) {
    const sample = buffer[i] ?? 0
    const abs = Math.abs(sample)
    if (abs > peak) peak = abs
    sumSq += sample * sample
  }
  const rms = Math.sqrt(sumSq / Math.max(1, buffer.length))
  return { peak, rms }
}

function readDynamicsReductionDb(node: DynamicsCompressorNode): number {
  const reduction = node.reduction
  if (!Number.isFinite(reduction)) return 0
  return Math.max(0, -reduction)
}

export function readSpeakerLoudnessMeters(
  nodes: SpeakerLoudnessNodes,
): SpeakerLoudnessMeterSnapshot {
  const pre = measureAnalyser(nodes.preAnalyser)
  const post = measureAnalyser(nodes.postAnalyser)
  const compressorReduction = readDynamicsReductionDb(nodes.compressor)
  const limiterReduction = readDynamicsReductionDb(nodes.limiter)
  const gainReductionEstimate = Math.max(
    0,
    20 * Math.log10(Math.max(pre.peak, 1e-8) / Math.max(post.peak, 1e-8)),
  )
  const ceiling = dbToLinear(-1)
  const limiterEngaged = post.peak >= ceiling * 0.92

  return {
    preDSPPeak: pre.peak,
    preDSPRMS: pre.rms,
    postDSPPeak: post.peak,
    postDSPRMS: post.rms,
    gainReductionEstimate,
    compressorReduction,
    limiterReduction,
    limiterEngaged,
    limiterTooHot: limiterReduction > LIMITER_HOT_THRESHOLD_DB,
  }
}

export function applyMasteringMakeupTrim(
  nodes: SpeakerLoudnessNodes,
  trimDb: number,
): void {
  const baseDb = SPEAKER_LOUDNESS_PRESETS[nodes.preset].makeupGainDb
  const clampedTrim = Math.max(-5, Math.min(2, trimDb))
  nodes.makeup.gain.value = dbToLinear(baseDb + clampedTrim)
}

function logMeterSnapshot(snapshot: SpeakerLoudnessMeterSnapshot, preset: string): void {
  if (!readDebugEnabled()) return
  console.info('[SpeakerLoudness]', preset, {
    preDSPPeak: snapshot.preDSPPeak.toFixed(4),
    preDSPRMS: snapshot.preDSPRMS.toFixed(4),
    postDSPPeak: snapshot.postDSPPeak.toFixed(4),
    postDSPRMS: snapshot.postDSPRMS.toFixed(4),
    compressorReduction: `${snapshot.compressorReduction.toFixed(1)} dB`,
    limiterReduction: `${snapshot.limiterReduction.toFixed(1)} dB`,
    gainReductionEstimate: `${snapshot.gainReductionEstimate.toFixed(1)} dB`,
    limiterEngaged: snapshot.limiterEngaged,
  })
}

export function setSpeakerLoudnessDebugLogging(enabled: boolean): void {
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

function stopMeterInterval(): void {
  if (meterIntervalId !== null) {
    window.clearInterval(meterIntervalId)
    meterIntervalId = null
  }
  meterChain = null
}

function startMeterInterval(nodes: SpeakerLoudnessNodes): void {
  if (!readDebugEnabled()) {
    stopMeterInterval()
    return
  }
  meterChain = nodes
  if (meterIntervalId !== null) return
  meterIntervalId = window.setInterval(() => {
    if (!meterChain) return
    logMeterSnapshot(readSpeakerLoudnessMeters(meterChain), meterChain.preset)
  }, 2000)
}

export function applySpeakerLoudnessPreset(
  nodes: SpeakerLoudnessNodes,
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): void {
  const params = SPEAKER_LOUDNESS_PRESETS[preset]
  nodes.preset = preset

  nodes.input.gain.value = 1

  nodes.highPass1.type = 'highpass'
  nodes.highPass1.frequency.value = params.highPassHz
  nodes.highPass1.Q.value = 0.707

  if (params.highPass24dB) {
    nodes.highPass2.type = 'highpass'
    nodes.highPass2.frequency.value = params.highPassHz
    nodes.highPass2.Q.value = 0.707
    nodes.highPass2.gain.value = 0
  } else {
    nodes.highPass2.type = 'peaking'
    nodes.highPass2.frequency.value = 1000
    nodes.highPass2.Q.value = 0.001
    nodes.highPass2.gain.value = 0
  }

  nodes.mudCut.type = 'peaking'
  nodes.mudCut.frequency.value = params.mudCutHz
  nodes.mudCut.Q.value = params.mudCutQ
  nodes.mudCut.gain.value = params.mudCutDb

  nodes.presence.type = 'peaking'
  nodes.presence.frequency.value = params.presenceHz
  nodes.presence.Q.value = params.presenceQ
  nodes.presence.gain.value = params.presenceDb

  nodes.airShelf.type = 'highshelf'
  nodes.airShelf.frequency.value = params.airHz
  nodes.airShelf.gain.value = params.airDb

  nodes.compressor.threshold.value = params.compressorThreshold
  nodes.compressor.knee.value = params.compressorKnee
  nodes.compressor.ratio.value = params.compressorRatio
  nodes.compressor.attack.value = params.compressorAttack
  nodes.compressor.release.value = params.compressorRelease

  nodes.makeup.gain.value = dbToLinear(params.makeupGainDb)

  nodes.limiter.threshold.value = params.limiterCeilingDb
  nodes.limiter.knee.value = 0
  nodes.limiter.ratio.value = params.limiterRatio
  nodes.limiter.attack.value = 0.001
  nodes.limiter.release.value = 0.08

  nodes.output.gain.value = 1

  startMeterInterval(nodes)
}

export function createSpeakerLoudnessChain(
  ctx: AudioContext,
  preset: Exclude<SpeakerLoudnessPreset, 'off'>,
): SpeakerLoudnessNodes {
  const input = ctx.createGain()
  const output = ctx.createGain()

  const preAnalyser = ctx.createAnalyser()
  preAnalyser.fftSize = 2048
  preAnalyser.smoothingTimeConstant = 0.65

  const postAnalyser = ctx.createAnalyser()
  postAnalyser.fftSize = 2048
  postAnalyser.smoothingTimeConstant = 0.65

  const highPass1 = ctx.createBiquadFilter()
  const highPass2 = ctx.createBiquadFilter()
  const mudCut = ctx.createBiquadFilter()
  const presence = ctx.createBiquadFilter()
  const airShelf = ctx.createBiquadFilter()
  const compressor = ctx.createDynamicsCompressor()
  const limiter = ctx.createDynamicsCompressor()
  const makeup = ctx.createGain()

  input.connect(preAnalyser)
  preAnalyser.connect(highPass1)
  highPass1.connect(highPass2)
  highPass2.connect(mudCut)
  mudCut.connect(presence)
  presence.connect(airShelf)
  airShelf.connect(compressor)
  compressor.connect(makeup)
  makeup.connect(limiter)
  limiter.connect(postAnalyser)
  postAnalyser.connect(output)

  const nodes: SpeakerLoudnessNodes = {
    input,
    output,
    preAnalyser,
    postAnalyser,
    highPass1,
    highPass2,
    mudCut,
    presence,
    airShelf,
    compressor,
    limiter,
    makeup,
    preset,
  }

  applySpeakerLoudnessPreset(nodes, preset)
  return nodes
}

export function disposeSpeakerLoudnessChain(nodes: SpeakerLoudnessNodes): void {
  if (meterChain === nodes) {
    stopMeterInterval()
  }
  const disconnect = (node: AudioNode) => {
    try {
      node.disconnect()
    } catch {
      /* already disconnected */
    }
  }

  disconnect(nodes.input)
  disconnect(nodes.preAnalyser)
  disconnect(nodes.highPass1)
  disconnect(nodes.highPass2)
  disconnect(nodes.mudCut)
  disconnect(nodes.presence)
  disconnect(nodes.airShelf)
  disconnect(nodes.compressor)
  disconnect(nodes.limiter)
  disconnect(nodes.makeup)
  disconnect(nodes.postAnalyser)
  disconnect(nodes.output)
}

export function parseSpeakerLoudnessPreset(value: unknown): SpeakerLoudnessPreset {
  if (
    value === 'off' ||
    value === 'clear' ||
    value === 'loud' ||
    value === 'max' ||
    value === 'phone' ||
    value === 'extreme' ||
    value === 'insane'
  ) {
    return value
  }
  return 'phone'
}

export function isFixedBusGainTestPreset(
  preset: SpeakerLoudnessPreset,
): preset is 'extreme' | 'insane' {
  return preset === 'extreme' || preset === 'insane'
}
