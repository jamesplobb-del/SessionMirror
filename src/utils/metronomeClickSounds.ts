import type { MetronomeClickTier } from './metronomeConfig'

export type MetronomeSoundId = 'classic' | 'woodblock' | 'soft' | 'electronic'

// Match BestTakeClickSound in MetronomeEngine.swift. All paths use the same
// voices and envelope, including the native multitrack count-in.
export const CLICK_ATTACK_SEC = 0.0008
export const CLICK_OUTPUT_GAIN = 0.85

const TIER_CLASSIC: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 2150, peak: 1.0, decaySec: 0.03 },
  macro: { hz: 1800, peak: 0.72, decaySec: 0.027 },
  beat: { hz: 1650, peak: 0.52, decaySec: 0.023 },
  subdivision: { hz: 1500, peak: 0.34, decaySec: 0.019 },
}

const TIER_WOODBLOCK: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 1950, peak: 1.0, decaySec: 0.022 },
  macro: { hz: 1620, peak: 0.7, decaySec: 0.02 },
  beat: { hz: 1480, peak: 0.5, decaySec: 0.017 },
  subdivision: { hz: 1350, peak: 0.32, decaySec: 0.015 },
}

const TIER_SOFT: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 1700, peak: 0.6, decaySec: 0.045 },
  macro: { hz: 1450, peak: 0.42, decaySec: 0.04 },
  beat: { hz: 1320, peak: 0.3, decaySec: 0.034 },
  subdivision: { hz: 1200, peak: 0.19, decaySec: 0.028 },
}

const TIER_ELECTRONIC: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 2400, peak: 0.95, decaySec: 0.026 },
  macro: { hz: 1950, peak: 0.6, decaySec: 0.022 },
  beat: { hz: 1770, peak: 0.43, decaySec: 0.02 },
  subdivision: { hz: 1600, peak: 0.28, decaySec: 0.017 },
}

export function normalizeMetronomeSoundId(id: string): MetronomeSoundId {
  return id === 'woodblock' || id === 'soft' || id === 'electronic' ? id : 'classic'
}

export function metronomeClickProfile(tier: MetronomeClickTier, soundId: string) {
  switch (normalizeMetronomeSoundId(soundId)) {
    case 'woodblock': return TIER_WOODBLOCK[tier]
    case 'soft': return TIER_SOFT[tier]
    case 'electronic': return TIER_ELECTRONIC[tier]
    default: return TIER_CLASSIC[tier]
  }
}

/** Smooth, zero-ended clicks. Modal sines give each voice its own character
 * without the buzzy overtones and aliasing of a hard square wave. */
export function metronomeClickSample(time: number, tier: MetronomeClickTier, soundId: string): number {
  const { hz, peak, decaySec } = metronomeClickProfile(tier, soundId)
  if (time <= 0 || time >= decaySec) return 0
  const attack = Math.min(1, time / CLICK_ATTACK_SEC)
  const release = Math.min(1, (decaySec - time) / 0.002)
  const envelope = Math.sin(attack * Math.PI / 2) ** 2 *
    Math.exp(-6 * Math.max(0, time - CLICK_ATTACK_SEC) / (decaySec - CLICK_ATTACK_SEC)) *
    Math.sin(release * Math.PI / 2) ** 2
  const phase = 2 * Math.PI * hz * time
  let wave: number
  switch (normalizeMetronomeSoundId(soundId)) {
    case 'woodblock': wave = 0.72 * Math.sin(phase) + 0.28 * Math.sin(phase * 1.48); break
    case 'soft': wave = Math.sin(phase); break
    case 'electronic': wave = 0.85 * Math.sin(phase) + 0.15 * Math.sin(phase * 2); break
    default: wave = 0.8 * Math.sin(phase) + 0.2 * Math.sin(phase * 2.7)
  }
  return wave * envelope * peak * CLICK_OUTPUT_GAIN
}

const clickBuffers = new WeakMap<AudioContext, Map<string, AudioBuffer>>()

export function scheduleMetronomeClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  outputNode: AudioNode,
  muted: boolean,
  soundId: string,
): void {
  if (muted) return
  const sound = normalizeMetronomeSoundId(soundId)
  let buffers = clickBuffers.get(ctx)
  if (!buffers) { buffers = new Map(); clickBuffers.set(ctx, buffers) }
  const key = `${sound}:${tier}`
  let buffer = buffers.get(key)
  if (!buffer) {
    const duration = metronomeClickProfile(tier, sound).decaySec
    buffer = ctx.createBuffer(1, Math.ceil(duration * ctx.sampleRate) + 1, ctx.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = metronomeClickSample(i / ctx.sampleRate, tier, sound)
    buffers.set(key, buffer)
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(outputNode)
  source.addEventListener('ended', () => source.disconnect(), { once: true })
  source.start(when)
}
