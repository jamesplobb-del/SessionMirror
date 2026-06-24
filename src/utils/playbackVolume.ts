import { Capacitor } from '@capacitor/core'
import { getPlaybackOutputProfile } from './audioOutputProfile'

/** Web Audio speaker-bus multiplier — iOS element routing is much quieter than native. */
export const PLAYBACK_GAIN_NATIVE_SPEAKER = 40
export const PLAYBACK_GAIN_NATIVE_HEADPHONES = 6
export const PLAYBACK_GAIN_WEB = 6
export const PLAYBACK_GAIN_MAX_SPEAKER = 46
export const PLAYBACK_GAIN_MAX_HEADPHONES = 10

/** YouTube IFrame API volume is 0–100; peg non-zero slider values to API max on speaker. */
export const YOUTUBE_VOLUME_BOOST = 12
/** Minimum non-zero YouTube API volume when routed to the phone speaker. */
export const YOUTUBE_VOLUME_FLOOR_SPEAKER = 100

function usesHeadphoneOutput(): boolean {
  return Capacitor.isNativePlatform() && getPlaybackOutputProfile() === 'headphones'
}

/** Gain for Web Audio speaker bus. Native-direct playback uses element volume instead. */
export function effectiveSpeakerGain(
  volume: number,
  muted: boolean,
  forWebAudioBus = true,
): number {
  if (muted) return 0
  if (!forWebAudioBus) {
    return Math.min(1, Math.max(0, volume))
  }

  const headphones = usesHeadphoneOutput()
  const multiplier = Capacitor.isNativePlatform()
    ? headphones
      ? PLAYBACK_GAIN_NATIVE_HEADPHONES
      : PLAYBACK_GAIN_NATIVE_SPEAKER
    : PLAYBACK_GAIN_WEB
  const maxGain = headphones ? PLAYBACK_GAIN_MAX_HEADPHONES : PLAYBACK_GAIN_MAX_SPEAKER
  return Math.min(Math.max(0, volume) * multiplier, maxGain)
}

/** Map a 0–1 UI slider to YouTube IFrame API volume (0–100). */
export function youtubeVolumeFromUiSlider(uiVolume: number): number {
  const v = Math.min(1, Math.max(0, uiVolume))
  if (v <= 0) return 0

  if (usesHeadphoneOutput()) {
    return Math.round(v * 100)
  }

  const boosted = v * 100 * YOUTUBE_VOLUME_BOOST
  return Math.round(Math.min(100, Math.max(YOUTUBE_VOLUME_FLOOR_SPEAKER, boosted)))
}

/** Web Audio metronome bus — match take playback loudness on native. */
export function metronomeSpeakerGain(muted: boolean): number {
  return effectiveSpeakerGain(1, muted)
}
