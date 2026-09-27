import type { Transition } from 'framer-motion'

export type MotionSurface = 'screen' | 'panel' | 'popover' | 'backdrop' | 'widget' | 'control'

/** Premium arrivals run 10% shorter than the original concept, with the same easing.
 * Presentation timing only: audio and action callbacks are never delayed. */
export function premiumMotion(fallback: Transition, surface: MotionSurface): Transition {
  if (typeof document === 'undefined' || document.documentElement.dataset.gameConcept) return fallback
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { duration: .1 }
  if (surface === 'widget') return { type: 'spring', duration: .594, bounce: .07 }
  const duration = { screen: .684, panel: .648, popover: .504, backdrop: .378, control: .414 }[surface]
  return { duration, ease: [.16, 1, .3, 1] }
}
