import type { MetronomeClickTier } from './metronomeConfig'

export type MetronomeSoundId = 'classic' | 'woodblock' | 'soft' | 'electronic'

const CLICK_ATTACK_SEC = 0.0015

/*
 * Electronic was the only voice that cut through, because it was the only one
 * pitched high enough — 1800 Hz against 220–1000 Hz for the other three, which
 * sat right where a loud instrument masks them completely. So the other three
 * are lifted into Electronic's register (1.7–2.4 kHz, the band the ear is most
 * sensitive to) and Electronic itself moves only slightly, staying the
 * brightest of the set and recognisably itself.
 *
 * Decays are short across the board so every click reads as a transient rather
 * than a pitched tone, and the three tiers stay far enough apart in level that
 * the downbeat is unmistakable.
 */

/* Each voice steps down in both pitch and level across the four tiers, so the
 * hierarchy downbeat > accent > beat > offbeat is audible without counting. */

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

/** Still the gentlest of the four, but no longer a dull thud — it keeps the
 * high fundamental and simply rings longer and quieter. */
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

  // WebKit can retain ended nodes that remain connected to a long-lived
  // destination graph. A continuous metronome creates thousands of these
  // short voices, so explicitly detach each one as soon as it finishes.
  osc.addEventListener(
    'ended',
    () => {
      try {
        osc.disconnect()
        gain.disconnect()
      } catch {
        /* graph may already have been released during a route transition */
      }
    },
    { once: true },
  )

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

  // Waveform separates the four voices now that they share a register:
  // sine = pure, triangle = bright, square = cutting.
  switch (sound) {
    case 'woodblock':
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_WOODBLOCK, 'square')
      return
    case 'soft':
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_SOFT, 'sine')
      return
    case 'electronic':
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_ELECTRONIC, 'square')
      return
    default:
      scheduleOscillatorClick(ctx, when, tier, outputNode, muted, TIER_CLASSIC, 'triangle')
  }
}
