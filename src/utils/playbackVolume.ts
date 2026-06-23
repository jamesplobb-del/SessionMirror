import { Capacitor } from '@capacitor/core'

/** Web Audio speaker-bus multiplier — iOS element routing is much quieter than native. */
export const PLAYBACK_GAIN_NATIVE = 40
export const PLAYBACK_GAIN_WEB = 6
export const PLAYBACK_GAIN_MAX = 46

/** YouTube IFrame API volume is 0–100; peg non-zero slider values to API max. */
export const YOUTUBE_VOLUME_BOOST = 12
/** Minimum non-zero YouTube API volume — reference playback stays at API max. */
export const YOUTUBE_VOLUME_FLOOR = 100

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
  const v = Math.min(1, Math.max(0, uiVolume))
  if (v <= 0) return 0
  const boosted = v * 100 * YOUTUBE_VOLUME_BOOST
  return Math.round(Math.min(100, Math.max(YOUTUBE_VOLUME_FLOOR, boosted)))
}

export const METRONOME_GAIN_NATIVE = 56
export const METRONOME_GAIN_WEB = 10
export const METRONOME_GAIN_MAX = 62

/** Web Audio metronome bus — louder than take playback for audible clicks. */
export function metronomeSpeakerGain(muted: boolean): number {
  if (muted) return 0
  const multiplier = Capacitor.isNativePlatform() ? METRONOME_GAIN_NATIVE : METRONOME_GAIN_WEB
  return Math.min(multiplier, METRONOME_GAIN_MAX)
}
