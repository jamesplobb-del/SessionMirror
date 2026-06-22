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
  stiffness: 400,
  damping: 36,
  mass: 0.95,
}

export const iosSpringTap = {
  type: 'spring' as const,
  stiffness: 560,
  damping: 30,
  mass: 0.75,
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
  duration: 0.36,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

/** Milliseconds — matches iosSheetPremium duration for deferred drawer content. */
export const iosSheetPremiumDurationMs = Math.round(iosSheetPremium.duration * 1000)

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
export const motionTapIcon = { scale: 0.92 }
