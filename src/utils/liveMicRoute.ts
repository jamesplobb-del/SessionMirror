import { Capacitor } from '@capacitor/core'
import type { MicInputPreference } from './appSettings'
import { isHeadphoneOutputActive } from './headphoneOutput'
import BestTakeAudioPlugin, { applyMicInputPreference } from './audioSessionRoute'

/**
 * Live pitch/tuner capture should mirror the no-headphones path: built-in mic
 * while output stays on headphones/A2DP. The headset HFP mic is unreliable for
 * pitch analysis and is not what users expect when monitoring on wired/BT cans.
 */
export function resolveMicPreferenceForLiveCapture(
  preference: MicInputPreference,
): MicInputPreference {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return preference
  }
  if (!isHeadphoneOutputActive()) {
    return preference
  }
  return 'iphone'
}

/** Restore playAndRecord and pin the built-in mic before live WebKit capture. */
export async function prepareLiveMicCaptureRoute(
  preference: MicInputPreference,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return

  try {
    await BestTakeAudioPlugin.enableRecordingRoute()
  } catch (error) {
    console.warn('[AudioRoute] enableRecordingRoute failed before live mic capture', error)
  }

  await applyMicInputPreference(resolveMicPreferenceForLiveCapture(preference))
}
