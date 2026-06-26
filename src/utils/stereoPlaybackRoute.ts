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
 * Native moviePlayback route is only attempted for external outputs (headphones/AirPlay).
 * Built-in speaker playback uses the stable playAndRecord + defaultToSpeaker session and
 * the Web Audio mastering bus — never AVAudioSession category churn.
 */
function shouldAttemptNativeStereoRoute(): boolean {
  if (!Capacitor.isNativePlatform()) return false
  if (nativeStereoPermanentlySkipped) return false
  if (!isHeadphoneOutputActive()) return false
  return true
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

  void BestTakeAudioPlugin.enableStereoPlayback()
    .then(() => {
      nativeRouteEngaged = true
    })
    .catch((error) => {
      markNativeStereoUnavailable(error)
    })
}

/** Re-apply native stereo only when it was previously engaged for an external output. */
export function refreshStereoPlaybackRoute(): void {
  if (!Capacitor.isNativePlatform()) return
  if (holdCount <= 0) return
  if (!nativeRouteEngaged) return
  if (!shouldAttemptNativeStereoRoute()) return

  void BestTakeAudioPlugin.enableStereoPlayback().catch((error) => {
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
