import { Capacitor } from '@capacitor/core'
import type { MicInputPreference } from './appSettings'
import { isHeadphoneOutputActive } from './headphoneOutput'
import { applyMicInputPreference } from './audioSessionRoute'

/** Built-in mic for native AVCapture split-route (mic in, headphones/A2DP out). */
export function resolveNativeBridgeMicPreference(
  preference: MicInputPreference,
): MicInputPreference {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return preference
  }
  // Headphones connected: never request HFP headset mic on the native bridge.
  if (isHeadphoneOutputActive()) {
    return 'iphone'
  }
  // Without HFP inputs available, .headphone falls back to Auto and undoes the
  // profile's built-in mic pin on the next session reconfigure.
  if (preference === 'headphone') {
    return 'iphone'
  }
  return preference
}

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

/** Input-only route prep for live WebKit capture — never reconfigures session category. */
export async function prepareLiveMicCaptureRoute(
  preference: MicInputPreference,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await applyMicInputPreference(resolveMicPreferenceForLiveCapture(preference))
}
