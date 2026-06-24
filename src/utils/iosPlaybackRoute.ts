import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'

/** Switch AVAudioSession to .playback + .moviePlayback for full iPhone stereo (top + bottom). */
export async function enableIosStereoPlaybackRoute(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await BestTakeAudioPlugin.enableStereoPlayback()
  } catch (error) {
    console.warn('Failed to enable iOS stereo playback route:', error)
  }
}

/** Restore playAndRecord routing after playback ends. */
export async function enableIosRecordingRoute(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    await BestTakeAudioPlugin.enableRecordingRoute()
  } catch (error) {
    console.warn('Failed to restore iOS recording route:', error)
  }
}
