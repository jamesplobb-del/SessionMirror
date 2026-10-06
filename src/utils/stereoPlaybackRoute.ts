import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isHeadphoneOutputActive } from './headphoneOutput'

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
    if (snapshot.previewActive === true || snapshot.recordingActive === true) {
      return true
    }
    // Bridge acquire can take hundreds of ms — never stomp with enableRecordingRoute
    // while native is switching into camera/video mode.
    return snapshot.recordingMode === 'video'
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
let restoreInFlight: Promise<void> | null = null

async function ensureNativeStereoRouteEngaged(): Promise<void> {
  // A new player must not start while the previous final release restores capture.
  if (restoreInFlight) await restoreInFlight
  if (holdCount <= 0 || !shouldAttemptNativeStereoRoute()) return
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
  if (holdCount <= 0) {
    await restoreInFlight
    return
  }

  holdCount -= 1
  if (holdCount > 0) return

  if (!restoreInFlight) {
    const pendingApply = engageInFlight
    const restore = (async () => {
      // Cancellation can arrive before native apply reports its result.
      await pendingApply
      if (holdCount > 0 || !nativeRouteEngaged) return

      const cameraActive = await isCameraSessionActive()
      // A new playback hold can arrive while the camera snapshot is pending.
      if (holdCount > 0) return
      nativeRouteEngaged = false

      if (isHeadphoneOutputActive() || cameraActive) {
        // External output and live camera capture keep their own session profile.
        recordingRouteRestoredHandler?.()
        return
      }

      try {
        await BestTakeAudioPlugin.enableRecordingRoute()
        recordingRouteRestoredHandler?.()
      } catch (error) {
        console.warn('Failed to release stereo playback route:', error)
      }
    })()
    const settled = restore.finally(() => {
      if (restoreInFlight === settled) restoreInFlight = null
    })
    restoreInFlight = settled
  }
  await restoreInFlight
}

export function isStereoPlaybackEngaged(): boolean {
  return holdCount > 0
}

export function isNativeStereoRouteEngaged(): boolean {
  return nativeRouteEngaged
}

/** Reset settled test fixtures only; pending native work must finish first. */
export function resetStereoPlaybackRouteForTests(): void {
  if (engageInFlight || restoreInFlight) {
    throw new Error('Await native stereo route transitions before resetting the test fixture.')
  }
  holdCount = 0
  nativeRouteEngaged = false
  nativeStereoPermanentlySkipped = false
}
