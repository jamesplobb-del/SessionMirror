export type TunerInputAdvice = 'quiet' | 'loud' | 'unpitched' | null
export function tunerInputAdvice(rmsDb: number, gateDb: number, frequency: number, clarity: number, clarityMin = 0.7): TunerInputAdvice {
  if (!Number.isFinite(rmsDb)) return null
  if (rmsDb >= gateDb + 3 && (!(frequency > 0) || clarity < clarityMin)) return 'unpitched'
  if (rmsDb > -9) return 'loud'
  if (frequency > 0 && clarity >= 0.7 && rmsDb < gateDb + 3) return 'quiet'
  return null
}

export interface TunerAdvicePrompt {
  message: string
  /** The tuner setting most likely to fix it, offered as a one-tap switch. */
  switchTo?: 'voice' | 'strings' | 'winds'
}

/**
 * What to tell a player once the tuner has struggled for a few seconds.
 * Voice has the lowest loudness floor (hears soft playing best); Winds accepts
 * the least clean waveform (breathy or reedy tone); Strings is the strictest.
 */
export function tunerAdvicePrompt(
  advice: TunerInputAdvice,
  current: 'voice' | 'strings' | 'winds',
): TunerAdvicePrompt | null {
  switch (advice) {
    case 'unpitched':
      if (current === 'winds') return { message: 'Sound detected, but no steady pitch. Singing? Try Voice.', switchTo: 'voice' }
      if (current === 'voice') return { message: 'Sound detected, but no steady pitch. Playing an instrument? Try Winds.', switchTo: 'winds' }
      return { message: 'No steady pitch yet. Voice gives a more forgiving reading.', switchTo: 'voice' }
    case 'quiet':
      if (current !== 'voice') return { message: 'Your note is coming in quietly. Voice hears softer playing, or move a little closer.', switchTo: 'voice' }
      return { message: 'Your note is coming in quietly. Move a little closer to the mic.' }
    case 'loud':
      return { message: 'The input is very loud. Move back a little from the mic.' }
    default:
      return null
  }
}

/**
 * Real detection trouble flickers: a noisy room or a breathy tone gives a clean
 * frame every so often, and a quiet player breathes between notes. Judging
 * "the same problem for 5 s without a break" therefore almost never fires, so
 * the advice looks at the share of recent frames instead.
 */
export interface AdviceWindow { samples: { t: number; kind: TunerInputAdvice }[]; shown: TunerInputAdvice }
export const createAdviceWindow = (): AdviceWindow => ({ samples: [], shown: null })
const ADVICE_WINDOW_MS = 5000
const ADVICE_SHOW_SHARE = 0.45
const ADVICE_CLEAR_SHARE = 0.15

/** Feed one analysis frame. Returns the advice to publish, or undefined for no change. */
export function updateAdviceWindow(window: AdviceWindow, kind: TunerInputAdvice, now: number): TunerInputAdvice | undefined {
  window.samples.push({ t: now, kind })
  while (window.samples.length && now - window.samples[0].t > ADVICE_WINDOW_MS) window.samples.shift()
  const total = window.samples.length
  const share = (k: TunerInputAdvice) => window.samples.filter(sample => sample.kind === k).length / total
  if (window.shown) {
    if (share(window.shown) >= ADVICE_CLEAR_SHARE) return undefined
    window.shown = null
    return null
  }
  if (now - window.samples[0].t < ADVICE_WINDOW_MS * 0.9) return undefined
  const top = (['unpitched', 'quiet', 'loud'] as const)
    .map(k => ({ k, s: share(k) })).sort((a, b) => b.s - a.s)[0]
  if (top.s < ADVICE_SHOW_SHARE) return undefined
  window.shown = top.k
  return top.k
}
