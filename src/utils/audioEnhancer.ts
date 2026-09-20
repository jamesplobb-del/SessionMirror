// Legacy names remain readable in older saved desks/projects. Settings migrate
// to Natural; the colored presets are never stacked onto a rendered take.
export type AudioEnhancerPreset = 'Natural' | 'Brass' | 'Strings' | 'Woodwinds' | 'Voice' | 'Percussion' | 'Custom'
export interface AudioEnhancerEq { low: number; mid: number; high: number }
export interface AudioEnhancerSettings {
  preset: AudioEnhancerPreset
  version?: 2
  amount?: number
  matchOriginalLevel?: boolean
  /** Legacy serialized fields; retained for compatibility, not processing. */
  eq: AudioEnhancerEq
  compression: number
  reverb: number
}
export const DEFAULT_AUDIO_ENHANCER_PRESET = 'Natural' as const
export const DEFAULT_AUDIO_ENHANCER_SETTINGS: AudioEnhancerSettings = {
  version: 2, preset: 'Natural', amount: 60, matchOriginalLevel: false,
  eq: { low: 0, mid: 0, high: 0 }, compression: 0, reverb: 0,
}
export function cloneAudioEnhancerSettings(settings: AudioEnhancerSettings): AudioEnhancerSettings {
  return { ...settings, eq: { ...settings.eq } }
}
export function parseAudioEnhancerSettings(value: unknown): AudioEnhancerSettings {
  const base = cloneAudioEnhancerSettings(DEFAULT_AUDIO_ENHANCER_SETTINGS)
  if (!value || typeof value !== 'object') return base
  const parsed = value as Partial<AudioEnhancerSettings>
  if (parsed.version !== 2) return base
  return { ...base, amount: typeof parsed.amount === 'number' && Number.isFinite(parsed.amount)
    ? Math.min(100, Math.max(0, parsed.amount)) : 60,
    matchOriginalLevel: parsed.matchOriginalLevel === true }
}
export function buildNativeEnhancerParams(settings: AudioEnhancerSettings): Record<string, number> {
  const normalized = parseAudioEnhancerSettings(settings)
  return { version: 2, amount: normalized.amount! / 100, matchOriginalLevel: normalized.matchOriginalLevel ? 1 : 0 }
}

// Native analysis/rendering is authoritative for iPhone/iPad playback and saved
// copies. The browser bus is transparent rather than approximating that result
// with an unrelated compressor, reverb or random stereo impulse response.
export interface AudioEnhancerNodes { input: GainNode; output: GainNode }
export function createAudioEnhancerChain(ctx: AudioContext, _settings: AudioEnhancerSettings): AudioEnhancerNodes {
  const input = ctx.createGain(), output = ctx.createGain()
  input.connect(output)
  return { input, output }
}
export function updateAudioEnhancerChain(_nodes: AudioEnhancerNodes, _settings: AudioEnhancerSettings): void {}
export function disposeAudioEnhancerChain(nodes: AudioEnhancerNodes): void {
  nodes.input.disconnect()
  nodes.output.disconnect()
}
