import type { CSSProperties } from 'react'

/** Shared iOS-style motion tokens for framer-motion. */

/**
 * Promote animated surfaces to their own compositor layer (transform/opacity only).
 *
 * Emptying this was tried on 2026-09-10 against the blink seen on the homepage,
 * workspace, Settings and drone, on the theory that a permanently pinned layer
 * is expensive to tear down. It changed nothing, so it was put back rather than
 * left as an unexplained diff. Don't spend another pass on it.
 *
 * What that ruled out is useful: the blink lands at the end of the *opening*
 * animation as well as the closing one, so it is not unmount teardown and not
 * `will-change` demotion — with this hint present the surface stays promoted
 * throughout and still blinks. Stripping `filter: drop-shadow` off the drone's
 * animated element didn't help either; that element is promoted by its own drag
 * transform regardless. Which property does the promoting is not the issue.
 *
 * The surviving theory is the re-rasterisation a composited layer does when an
 * animation settles: on a surface carrying gradients, large-blur shadows or
 * backdrop filters that final repaint costs more than a frame, and the stale
 * frame is the blink. Untested — see the flicker notes before changing this.
 */
export const motionGpuLayer: CSSProperties = {
  willChange: 'transform, opacity',
}

/**
 * Pin the last exit frame so it cannot paint at stylesheet opacity.
 *
 * After an exit, motion drops the inline `opacity` it was driving and the
 * node paints once more at CSS before React removes it. Overlay scrims rest
 * at opacity 1 in the stylesheet, so that stray frame is a full-strength
 * blink. `display: none` lands on the same frame the animation finishes,
 * before that paint.
 */
export const motionExitHide = { display: 'none' } as const

export const iosSpring = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 38,
  mass: 0.9,
}

export const iosSpringSnappy = {
  type: 'spring' as const,
  stiffness: 520,
  damping: 32,
  mass: 0.85,
}

export const iosSpringSheet = {
  type: 'spring' as const,
  stiffness: 430,
  damping: 38,
  mass: 0.9,
}

export const iosSpringTap = {
  type: 'spring' as const,
  stiffness: 560,
  damping: 30,
  mass: 0.75,
}

export const iosPressTransition = {
  type: 'spring' as const,
  stiffness: 680,
  damping: 34,
  mass: 0.55,
}

export const iosDragGhostTransition = {
  type: 'spring' as const,
  stiffness: 720,
  damping: 42,
  mass: 0.45,
}

/** Draggable widget release-to-rest spring (metronome/pitch floating widgets). */
export const iosDragRelease = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 32,
}

export const iosSheetDragTransition = {
  bounceStiffness: 520,
  bounceDamping: 42,
}

export const iosEaseOut = {
  duration: 0.28,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
}

export const iosFade = {
  duration: 0.22,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
}

/** Full-screen surfaces (review, compare). */
export const iosScreenEnter = {
  duration: 0.34,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

export const iosScreenExit = {
  duration: 0.26,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
}

/** HUD dim when sheets / review stack over the camera. */
export const iosHudDim = {
  duration: 0.3,
  ease: [0.32, 0.72, 0, 1] as [number, number, number, number],
}

/** Bottom sheets — smooth ease (GPU-friendly, no spring layout cost). */
export const iosSheetPremium = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 34,
  mass: 0.9,
}

/** Milliseconds — matches iosSheetPremium duration for deferred drawer content. */
export const iosSheetPremiumDurationMs = 420

export const iosSheetBackdrop = {
  duration: 0.3,
  ease: 'easeOut' as const,
}

export const nativeGlideEase = {
  duration: 0.3,
  ease: 'easeOut' as const,
}

export const motionTap = { scale: 0.96 }
export const motionTapSoft = { scale: 0.98 }
export const motionTapIcon = { scale: 0.94 }
