import { Capacitor } from '@capacitor/core'
import BestTakeAudioPlugin from './audioSessionRoute'
import { isHeadphoneOutputActive } from './headphoneOutput'

export interface CameraLikePlaybackSessionSnapshot {
  category: string
  mode: string
  inputRoute: string
  outputRoute: string
}

/** Apply camera-app AVAudioSession before speaker playback — session only, no capture. */
export async function prepareCameraLikePlaybackSessionIfSpeaker(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return
  if (isHeadphoneOutputActive()) return

  try {
    await BestTakeAudioPlugin.prepareCameraLikePlaybackSession()
  } catch (error) {
    console.warn('[CameraLikePlayback] failed to apply session', error)
  }
}
