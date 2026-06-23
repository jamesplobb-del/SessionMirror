import { Capacitor } from '@capacitor/core'

/** Web Audio speaker-bus multiplier — iOS element routing is much quieter than native. */
export const PLAYBACK_GAIN_NATIVE = 40
export const PLAYBACK_GAIN_WEB = 6
export const PLAYBACK_GAIN_MAX = 46

/** YouTube IFrame API volume is 0–100; proxy audio needs extra headroom. */
export const YOUTUBE_VOLUME_BOOST = 4

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
  const multiplier = Capacitor.isNativePlatform() ? PLAYBACK_GAIN_NATIVE : PLAYBACK_GAIN_WEB
  return Math.min(Math.max(0, volume) * multiplier, PLAYBACK_GAIN_MAX)
}

/** Map a 0–1 UI slider to boosted YouTube IFrame API volume (0–100). */
export function youtubeVolumeFromUiSlider(uiVolume: number): number {
  return Math.round(Math.min(100, Math.max(0, uiVolume * 100 * YOUTUBE_VOLUME_BOOST)))
}
