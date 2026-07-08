import type { CSSProperties } from 'react'

/** Shared iOS-style motion tokens for framer-motion. */

/** Promote animated surfaces to their own compositor layer (transform/opacity only). */
export const motionGpuLayer: CSSProperties = {
  willChange: 'transform, opacity',
}

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
