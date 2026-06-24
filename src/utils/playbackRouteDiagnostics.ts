import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { getPlaybackOutputProfile } from './audioOutputProfile'
import { effectiveSpeakerGain } from './playbackVolume'

/**
 * Diagnostic-only: compare cached output profile + gain tier against live AVAudioSession route.
 * Does not change routing or gain values.
 */
export function logPlaybackStartRouteDiagnostics(
  trigger: string,
  options: { volume?: number; muted?: boolean } = {},
): void {
  if (!Capacitor.isNativePlatform()) return

  const volume = options.volume ?? 1
  const muted = options.muted ?? false
  const outputProfile = getPlaybackOutputProfile()
  const gain = effectiveSpeakerGain(volume, muted, true)

  console.info(
    `[PlaybackRouteDiag] ${trigger} SYNC`,
    JSON.stringify({
      outputProfile,
      effectiveSpeakerGain: gain,
      volume,
      muted,
    }),
  )

  void BestTakeAudioPlugin.getPlaybackOutputProfile()
    .then((live) => {
      const currentRouteInput = live.inputPort
      const currentRouteOutput = live.outputPort
      const bluetoothA2DP = live.usesA2DPOutput || currentRouteOutput === 'BluetoothA2DP'
      const bluetoothHFP = currentRouteOutput === 'BluetoothHFP'
      const headphonesConnected = Boolean(live.usesHeadphones)
      const staleProfileSuspected =
        outputProfile === 'speaker' && (headphonesConnected || bluetoothA2DP || bluetoothHFP)
      const speakerProfileWithA2DP = outputProfile === 'speaker' && bluetoothA2DP

      const payload = {
        trigger,
        outputProfile,
        effectiveSpeakerGain: gain,
        currentRouteInput,
        currentRouteOutput,
        bluetoothA2DP,
        bluetoothHFP,
        headphonesConnected,
        splitRoute: live.splitRouteAchieved,
        staleProfileSuspected,
        speakerProfileWithA2DP,
      }

      if (speakerProfileWithA2DP) {
        console.warn('[PlaybackRouteDiag] STALE CACHE SUSPECTED', JSON.stringify(payload))
      } else {
        console.info('[PlaybackRouteDiag] LIVE', JSON.stringify(payload))
      }
    })
    .catch((error: unknown) => {
      console.warn(`[PlaybackRouteDiag] ${trigger} live route read failed`, error)
    })
}
