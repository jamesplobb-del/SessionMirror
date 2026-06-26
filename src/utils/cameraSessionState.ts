import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isPlaybackRouteHoldActive } from './playbackRouteCoordinator'

export async function syncNativeCameraSessionState(options: {
  previewActive: boolean
  recordingActive: boolean
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return
  if (isPlaybackRouteHoldActive()) return

  try {
    await BestTakeAudioPlugin.setCameraSessionState(options)
  } catch (error) {
    console.warn('[AudioRoute] failed to sync camera session state', error)
  }
}
