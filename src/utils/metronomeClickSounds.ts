import type { MetronomeClickTier } from './metronomeConfig'

export type MetronomeSoundId = 'classic' | 'woodblock' | 'soft' | 'electronic'

const CLICK_ATTACK_SEC = 0.0015

const TIER_CLASSIC: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 1000, peak: 1.0, decaySec: 0.045 },
  macro: { hz: 800, peak: 0.75, decaySec: 0.045 },
  subdivision: { hz: 600, peak: 0.35, decaySec: 0.028 },
}

const TIER_WOODBLOCK: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 320, peak: 0.95, decaySec: 0.032 },
  macro: { hz: 260, peak: 0.55, decaySec: 0.028 },
  subdivision: { hz: 220, peak: 0.18, decaySec: 0.022 },
}

const TIER_SOFT: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 660, peak: 0.34, decaySec: 0.085 },
  macro: { hz: 540, peak: 0.22, decaySec: 0.072 },
  subdivision: { hz: 440, peak: 0.08, decaySec: 0.052 },
}

const TIER_ELECTRONIC: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }> = {
  downbeat: { hz: 1800, peak: 0.9, decaySec: 0.03 },
  macro: { hz: 1500, peak: 0.5, decaySec: 0.026 },
  subdivision: { hz: 1300, peak: 0.22, decaySec: 0.02 },
}

export function normalizeMetronomeSoundId(id: string): MetronomeSoundId {
  if (id === 'woodblock' || id === 'soft' || id === 'electronic') return id
  return 'classic'
}

function scheduleOscillatorClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  outputNode: AudioNode,
  muted: boolean,
  profile: Record<MetronomeClickTier, { hz: number; peak: number; decaySec: number }>,
  wave: OscillatorType,
): void {
  const { hz, peak, decaySec } = profile[tier]
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = wave
  osc.frequency.value = hz

  const effectivePeak = muted ? 0.0001 : Math.max(peak, 0.0002)

  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(effectivePeak, when + CLICK_ATTACK_SEC)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + decaySec)

  osc.connect(gain)
  gain.connect(outputNode)

  osc.start(when)
  osc.stop(when + decaySec + 0.01)
}

export function scheduleMetronomeClick(
  ctx: AudioContext,
  when: number,
  tier: MetronomeClickTier,
  outputNode: AudioNode,
  muted: boolean,
  soundId: string,
): void {
  const sound = normalizeMetronomeSoundId(soundId)

  switch (sound) {
    case 'woodblock':
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_WOODBLOCK, 'triangle')
      return
    case 'soft':
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_SOFT, 'sine')
      return
    case 'electronic':
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_ELECTRONIC, 'square')
      return
    default:
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_CLASSIC, 'sine')
  }
}
