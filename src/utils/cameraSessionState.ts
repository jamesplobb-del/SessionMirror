import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isPlaybackRouteHoldActive } from './playbackRouteCoordinator'

/** JS-side mirror of the last synced preview state — lets the pitch tracker
 * know the native capture session (and its audio tap) is available without a
 * round-trip to the plugin. */
let nativeCameraPreviewActive = false

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

  try {
    await BestTakeAudioPlugin.setCameraSessionState(options)
  } catch (error) {
    console.warn('[AudioRoute] failed to sync camera session state', error)
  }
}
