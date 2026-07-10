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

/** Recording mode must reach native even while metronome holds playbackRouteActive. */
export async function forceNativeRecordingMode(mode: 'video' | 'audio'): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return
  try {
    await BestTakeAudioPlugin.setCameraSessionState({
      previewActive: false,
      recordingActive: false,
      recordingMode: mode,
    })
  } catch (error) {
    console.warn('[AudioRoute] failed to force native recording mode', error)
  }
}

export async function syncNativeCameraSessionState(options: {
  previewActive: boolean
  recordingActive: boolean
  recordingMode?: 'video' | 'audio'
  youtubePlayAlongActive?: boolean
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return
  nativeCameraPreviewActive = options.previewActive || options.recordingActive

  const stateKey = JSON.stringify({
    previewActive: options.previewActive,
    recordingActive: options.recordingActive,
    recordingMode: options.recordingMode ?? null,
    youtubePlayAlongActive: options.youtubePlayAlongActive ?? null,
  })

  const playbackHold = isPlaybackRouteHoldActive()

  if (playbackHold) {
    // While metronome owns playback, still sync mode + promote live camera flags.
    // Skipping entirely left native stuck in Audio Mode and blocked the bridge.
    try {
      await BestTakeAudioPlugin.setCameraSessionState({
        previewActive: options.previewActive,
        recordingActive: options.recordingActive,
        recordingMode: options.recordingMode,
        youtubePlayAlongActive: options.youtubePlayAlongActive,
      })
      lastSyncedCameraSessionStateKey = stateKey
    } catch (error) {
      console.warn('[AudioRoute] failed to sync camera session during playback hold', error)
    }
    return
  }

  if (stateKey === lastSyncedCameraSessionStateKey) return

  try {
    await BestTakeAudioPlugin.setCameraSessionState(options)
    lastSyncedCameraSessionStateKey = stateKey
  } catch (error) {
    console.warn('[AudioRoute] failed to sync camera session state', error)
  }
}
