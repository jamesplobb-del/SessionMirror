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
 * Swift still refuses the route while camera preview or recording is active.
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
  nativeStereoPermanentlySkipped = true
  console.warn(
    '[AudioRoute] Native stereo route disabled after failure; Web Audio playback unchanged.',
    error,
  )
}

/**
 * Refcounted hold for playback sessions. On built-in speaker this is a JS-only refcount —
 * no AVAudioSession category change.
 */
export function engageStereoPlayback(): void {
  if (!Capacitor.isNativePlatform()) return

  holdCount += 1
  if (holdCount > 1) return
  if (!shouldAttemptNativeStereoRoute()) return

  void (async () => {
    if (await isCameraSessionActive()) {
      nativeRouteEngaged = false
      console.info('[AudioRoute] Native stereo route skipped while camera preview is active')
      return
    }
    if (holdCount <= 0) return

    return BestTakeAudioPlugin.enableStereoPlayback()
  })()
    .then((snapshot) => {
      if (!snapshot) return
      nativeRouteEngaged = snapshot.routeApplied !== false
      if (snapshot.routeApplied === false) {
        console.info('[AudioRoute] Web playback route unchanged', snapshot)
      }
    })
    .catch((error) => {
      markNativeStereoUnavailable(error)
    })
}

/** Re-apply native Web playback route while a YouTube/playback hold is active. */
export function refreshStereoPlaybackRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (holdCount <= 0) return
  if (!shouldAttemptNativeStereoRoute()) return

  void (async () => {
    if (await isCameraSessionActive()) {
      nativeRouteEngaged = false
      console.info('[AudioRoute] Native stereo route refresh skipped while camera preview is active')
      return
    }
    if (holdCount <= 0) return

    return BestTakeAudioPlugin.enableStereoPlayback()
  })()
    .then((snapshot) => {
      if (!snapshot) return
      nativeRouteEngaged = snapshot.routeApplied !== false
      if (snapshot.routeApplied === false) {
        console.info('[AudioRoute] Web playback route unchanged', snapshot)
      }
    })
    .catch((error) => {
      markNativeStereoUnavailable(error)
    })
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
