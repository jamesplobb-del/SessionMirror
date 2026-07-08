import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from '../../utils/audioSessionRoute'
import { getAudioOutputLatencyMs } from '../../utils/nativeCameraTest'

/**
 * WKWebView HTMLMediaElement audio reaches the speaker later than Web Audio
 * scheduled clicks, even after play() resolves and currentTime advances.
 */
export const WEBKIT_MEDIA_RENDER_OVERHEAD_MS = 240

/**
 * AVAudioSession outputLatency ignores most Bluetooth A2DP codec delay.
 */
export const BLUETOOTH_A2DP_EXTRA_LATENCY_MS = 200

/** Extra head start after pipeline estimate — reference should lead beat 1, not lag it. */
export const METRONOME_SETTLE_AFTER_REFERENCE_MS = 340

async function getBluetoothExtraLatencyMs(): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0
  try {
    const profile = await BestTakeAudioPlugin.getPlaybackOutputProfile()
    if (profile.usesA2DPOutput || profile.usesBluetoothOutput) {
      return BLUETOOTH_A2DP_EXTRA_LATENCY_MS
    }
    const port = profile.outputPort ?? profile.portType ?? ''
    if (port.includes('Bluetooth') || port.includes('A2DP')) {
      return BLUETOOTH_A2DP_EXTRA_LATENCY_MS
    }
  } catch {
    /* read-only probe */
  }
  return 0
}

/** Used by getMetronomeCountInDelaySec when reference takes are playing. */
export async function getMetronomeDelayAfterReferenceSec(): Promise<number> {
  const [outputMs, btExtra] = await Promise.all([
    getAudioOutputLatencyMs(),
    getBluetoothExtraLatencyMs(),
  ])
  return (
    WEBKIT_MEDIA_RENDER_OVERHEAD_MS +
    outputMs +
    btExtra +
    METRONOME_SETTLE_AFTER_REFERENCE_MS
  ) / 1000
}

/**
 * Delay before count-in click 1. Full pipeline compensation when reference
 * takes and/or backing are playing; shorter route settle for the first empty box.
 */
export async function getMetronomeCountInDelaySec(options: {
  hasAudibleReferences: boolean
}): Promise<number> {
  if (options.hasAudibleReferences) {
    return getMetronomeDelayAfterReferenceSec()
  }
  const outputMs = await getAudioOutputLatencyMs()
  return (outputMs + 250) / 1000
}
