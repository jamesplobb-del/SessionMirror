import { Capacitor, registerPlugin } from '@capacitor/core'

interface AudioSessionPlugin {
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
}

export const CustomAudioSession = registerPlugin<AudioSessionPlugin>('AudioSessionPlugin')

const isNative = Capacitor.isNativePlatform()

/** Take Vault open — route playback through both iPhone speakers. */
export async function enableStereoPlaybackForVault(): Promise<void> {
  if (!isNative) return
  try {
    await CustomAudioSession.enableStereoPlayback()
  } catch (error) {
    console.warn('Failed to enable stereo playback for vault', error)
  }
}

/** Take Vault close — restore recording/camera capture route. */
export async function enableRecordingRouteForVault(): Promise<void> {
  if (!isNative) return
  try {
    await CustomAudioSession.enableRecordingRoute()
  } catch (error) {
    console.warn('Failed to restore recording route after vault', error)
  }
}
