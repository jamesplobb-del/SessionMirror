import { Capacitor, registerPlugin } from '@capacitor/core'

/**
 * Native bridge to the iOS AVAudioSession route.
 *
 * `.playAndRecord` (camera/mic live) only outputs the single bottom loudspeaker.
 * `.playback` engages the iPhone's STEREO speakers (bottom + earpiece) like every
 * other media app. We switch to stereo for focused take playback, then restore the
 * recording route so capture keeps working. No-op on web.
 */
interface AudioSessionPlugin {
  enableStereoPlayback(): Promise<void>
  enableRecordingRoute(): Promise<void>
}

const AudioSession = registerPlugin<AudioSessionPlugin>('AudioSession')

const isNative = Capacitor.isNativePlatform()

/** Route playback through both stereo speakers (focused playback only). */
export async function enableStereoPlaybackRoute(): Promise<void> {
  if (!isNative) return
  try {
    await AudioSession.enableStereoPlayback()
  } catch (error) {
    console.warn('Failed to switch to stereo playback route', error)
  }
}

/** Restore the recording-capable route (camera/mic capture + bottom speaker). */
export async function enableRecordingAudioRoute(): Promise<void> {
  if (!isNative) return
  try {
    await AudioSession.enableRecordingRoute()
  } catch (error) {
    console.warn('Failed to restore recording audio route', error)
  }
}
