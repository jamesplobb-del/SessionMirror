import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isPlaybackRouteHoldActive } from './playbackRouteCoordinator'

/** JS-side mirror of the last synced preview state — lets the pitch tracker
 * know the native capture session (and its audio tap) is available without a
 * round-trip to the plugin. */
let nativeCameraPreviewActive = false
let lastSyncedCameraSessionStateKey: string | null = null

export function isNativeCameraPreviewActive(): boolean {
  return nativeCameraPreviewActive
}

export async function syncNativeCameraSessionState(options: {
  previewActive: boolean
  recordingActive: boolean
  recordingMode?: 'video' | 'audio'
  youtubePlayAlongActive?: boolean
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return
  nativeCameraPreviewActive = options.previewActive || options.recordingActive
  if (isPlaybackRouteHoldActive()) return

  const stateKey = JSON.stringify({
    previewActive: options.previewActive,
    recordingActive: options.recordingActive,
    recordingMode: options.recordingMode ?? null,
    youtubePlayAlongActive: options.youtubePlayAlongActive ?? null,
  })
  if (stateKey === lastSyncedCameraSessionStateKey) return

  try {
    await BestTakeAudioPlugin.setCameraSessionState(options)
    lastSyncedCameraSessionStateKey = stateKey
  } catch (error) {
    console.warn('[AudioRoute] failed to sync camera session state', error)
  }
}
