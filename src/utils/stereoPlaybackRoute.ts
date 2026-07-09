import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'

let holdCount = 0
let nativeRouteEngaged = false
let nativeStereoPermanentlySkipped = false
let recordingRouteRestoredHandler: (() => void) | null = null

export function registerRecordingRouteRestoredHandler(handler: () => void): void {
  recordingRouteRestoredHandler = handler
}

/**
 * Native Web playback route is attempted for both speaker and external output.
 * With a live camera preview, a coexistent speaker override is used instead.
 */
function shouldAttemptNativeStereoRoute(): boolean {
  if (!Capacitor.isNativePlatform()) return false
  if (nativeStereoPermanentlySkipped) return false
  return true
}

async function isCameraSessionActive(): Promise<boolean> {
  try {
    const snapshot = await BestTakeAudioPlugin.getCameraSessionState()
    return snapshot.previewActive === true || snapshot.recordingActive === true
  } catch {
    return false
  }
}

function markNativeStereoUnavailable(error: unknown): void {
  console.warn(
    '[AudioRoute] Native stereo route apply failed; Web Audio playback unchanged.',
    error,
  )
}

function snapshotIndicatesNativeRouteEngaged(snapshot: {
  routeApplied?: boolean
  playbackRouteStyle?: string
}): boolean {
  if (snapshot.playbackRouteStyle === 'coexistent' || snapshot.playbackRouteStyle === 'full') {
    return true
  }
  return snapshot.routeApplied !== false
}

/** In-flight native route apply — concurrent callers (YouTube + take play) share one. */
let engageInFlight: Promise<void> | null = null

async function ensureNativeStereoRouteEngaged(): Promise<void> {
  if (!shouldAttemptNativeStereoRoute()) return
  if (nativeRouteEngaged && !engageInFlight) return

  if (!engageInFlight) {
    engageInFlight = (async () => {
      const snapshot = await BestTakeAudioPlugin.enableStereoPlayback()
      nativeRouteEngaged = snapshotIndicatesNativeRouteEngaged(snapshot)
      if ('routeApplied' in snapshot && snapshot.routeApplied === false) {
        console.info('[AudioRoute] Web playback route unchanged', snapshot)
      }
    })().catch((error) => {
      markNativeStereoUnavailable(error)
    }).finally(() => {
      engageInFlight = null
    })
  }

  await engageInFlight
}

/**
 * Refcounted hold for playback sessions. On built-in speaker this is a JS-only refcount —
 * no AVAudioSession category change.
 */
export function engageStereoPlayback(): void {
  if (!Capacitor.isNativePlatform()) return

  holdCount += 1
  if (!shouldAttemptNativeStereoRoute()) return
  void ensureNativeStereoRouteEngaged()
}

/** Awaitable variant — callers that start AVPlayer / media.play() must use this. */
export async function engageStereoPlaybackAsync(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  holdCount += 1
  if (!shouldAttemptNativeStereoRoute()) return
  await ensureNativeStereoRouteEngaged()
}

/** Re-apply native Web playback route while a YouTube/playback hold is active. */
export function refreshStereoPlaybackRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (holdCount <= 0) return
  if (!shouldAttemptNativeStereoRoute()) return
  // Coexistent speaker route is stable while camera + YouTube are both live.
  // Re-applying setActive during iframe playback interrupts the YouTube player.
  if (nativeRouteEngaged) return

  void ensureNativeStereoRouteEngaged()
}

/** Restore recording route only when native stereo was actually engaged. */
export async function releaseStereoPlayback(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  if (holdCount <= 0) return

  holdCount -= 1
  if (holdCount > 0) return

  const wasNativeEngaged = nativeRouteEngaged
  nativeRouteEngaged = false

  if (!wasNativeEngaged) return

  const cameraActive = await isCameraSessionActive()
  if (cameraActive) {
    // Camera preview owns the session — restoring a generic recording route
    // would stomp the live capture profile and can pause YouTube mid-playback.
    recordingRouteRestoredHandler?.()
    return
  }

  try {
    await BestTakeAudioPlugin.enableRecordingRoute()
    recordingRouteRestoredHandler?.()
  } catch (error) {
    console.warn('Failed to release stereo playback route:', error)
  }
}

export function isStereoPlaybackEngaged(): boolean {
  return holdCount > 0
}

export function isNativeStereoRouteEngaged(): boolean {
  return nativeRouteEngaged
}

export function resetStereoPlaybackRouteForTests(): void {
  holdCount = 0
  nativeRouteEngaged = false
  nativeStereoPermanentlySkipped = false
}
