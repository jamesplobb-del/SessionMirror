import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isPlaybackRouteHoldActive } from './playbackRouteCoordinator'

/** JS-side mirror of the last synced preview state — lets the pitch tracker
 * know the native capture session (and its audio tap) is available without a
 * round-trip to the plugin. */
let nativeCameraPreviewActive = false
/** Native audio-only AVCaptureSession (pre-roll / recording) without camera preview. */
let nativeAudioCaptureActive = false
let lastSyncedCameraSessionStateKey: string | null = null

const nativeCaptureSessionListeners = new Set<() => void>()

function notifyNativeCaptureSessionListeners(): void {
  for (const listener of nativeCaptureSessionListeners) {
    listener()
  }
}

function pitchCaptureSessionActive(): boolean {
  return nativeCameraPreviewActive || nativeAudioCaptureActive
}

export function isNativeCameraPreviewActive(): boolean {
  return nativeCameraPreviewActive
}

/** True when the native AVCapture audio tap can feed the pitch widget. */
export function isNativeCaptureSessionActive(): boolean {
  return pitchCaptureSessionActive()
}

export function setNativeAudioCaptureActive(active: boolean): void {
  if (nativeAudioCaptureActive === active) return
  nativeAudioCaptureActive = active
  notifyNativeCaptureSessionListeners()
}

export function subscribeNativeCaptureSessionActive(listener: () => void): () => void {
  nativeCaptureSessionListeners.add(listener)
  return () => nativeCaptureSessionListeners.delete(listener)
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
  const nextPreviewActive = options.previewActive || options.recordingActive
  if (nativeCameraPreviewActive !== nextPreviewActive) {
    nativeCameraPreviewActive = nextPreviewActive
    notifyNativeCaptureSessionListeners()
  }

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
