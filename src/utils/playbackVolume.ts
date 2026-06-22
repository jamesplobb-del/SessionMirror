import { Capacitor } from '@capacitor/core'

/** Web Audio speaker-bus multiplier — iOS element routing is much quieter than native. */
export const PLAYBACK_GAIN_NATIVE = 8
export const PLAYBACK_GAIN_WEB = 2.75
export const PLAYBACK_GAIN_MAX = 12

/** YouTube IFrame API volume is 0–100; proxy audio needs extra headroom. */
export const YOUTUBE_VOLUME_BOOST = 2.85

export function effectiveSpeakerGain(volume: number, muted: boolean): number {
  if (muted) return 0
  const multiplier = Capacitor.isNativePlatform() ? PLAYBACK_GAIN_NATIVE : PLAYBACK_GAIN_WEB
  return Math.min(Math.max(0, volume) * multiplier, PLAYBACK_GAIN_MAX)
}

/** Map a 0–1 UI slider to boosted YouTube IFrame API volume (0–100). */
export function youtubeVolumeFromUiSlider(uiVolume: number): number {
  return Math.round(Math.min(100, Math.max(0, uiVolume * 100 * YOUTUBE_VOLUME_BOOST)))
}
