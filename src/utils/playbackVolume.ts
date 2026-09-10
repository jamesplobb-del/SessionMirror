import { Capacitor } from '@capacitor/core'
import { isHeadphoneOutputActive } from './headphoneOutput'

/**
 * Playback is deliberately FLAT.
 *
 * Takes used to run through a speaker-loudness master (EQ, 5.5:1 compression,
 * limiter) and measured loudness normalization. Both are gone: a hidden
 * compressor flattens exactly the dynamic differences you record in order to
 * hear, and it made playback sound unlike the Camera app. What is left is the
 * Web Audio route itself — which exists only because iOS PlayAndRecord sends
 * element audio to the quiet earpiece — plus a clean makeup gain.
 *
 * Audio Enhancer is now the only thing that shapes playback, and it is opt-in.
 */

/**
 * Clean makeup gain for the built-in speaker.
 *
 * The old path multiplied by 48 and clipped hard against the destination —
 * loud, but distorted. These values stay in headroom so peaks survive intact.
 * This is the one number to tune by ear: raise it if takes play too quietly,
 * but stop before peaks start clipping.
 */
export const PLAYBACK_GAIN_SPEAKER = 2.4
export const PLAYBACK_GAIN_SPEAKER_MAX = 3

/**
 * Headphones need less than the speaker and are far less forgiving of clipping,
 * so they stay nearer unity.
 */
export const PLAYBACK_GAIN_HEADPHONES = 1.5
export const PLAYBACK_GAIN_HEADPHONES_MAX = 1.9

/** YouTube IFrame API volume is 0–100; peg non-zero slider values to API max. */
export const YOUTUBE_VOLUME_BOOST = 12
/** Minimum non-zero YouTube API volume — reference playback stays at API max. */
export const YOUTUBE_VOLUME_FLOOR = 100

/** Clean speaker bus gain. `forWebAudioBus` false means the element's own volume. */
export function effectiveSpeakerGain(
  volume: number,
  muted: boolean,
  forWebAudioBus = true,
): number {
  if (muted) return 0
  if (!forWebAudioBus) {
    return Math.min(1, Math.max(0, volume))
  }
  return Math.min(
    Math.max(0, volume) * PLAYBACK_GAIN_SPEAKER,
    PLAYBACK_GAIN_SPEAKER_MAX,
  )
}

/** Clean (non-clipping) gain for the Web Audio bus when output is headphones. */
export function effectiveHeadphoneGain(volume: number, muted: boolean): number {
  if (muted) return 0
  return Math.min(
    Math.max(0, volume) * PLAYBACK_GAIN_HEADPHONES,
    PLAYBACK_GAIN_HEADPHONES_MAX,
  )
}

/** Map a 0–1 UI slider to boosted YouTube IFrame API volume (0–100). */
export function youtubeVolumeFromUiSlider(uiVolume: number): number {
  const v = Math.min(1, Math.max(0, uiVolume))
  if (v <= 0) return 0
  const boosted = v * 100 * YOUTUBE_VOLUME_BOOST
  return Math.round(Math.min(100, Math.max(YOUTUBE_VOLUME_FLOOR, boosted)))
}

/**
 * Metronome clicks stay in WKWebView rather than the native engine, and a click
 * has no dynamics worth protecting, so it can sit above take-playback gain
 * without the clipping that would spoil a recording.
 */
export const METRONOME_GAIN_SPEAKER = 6
export const METRONOME_GAIN_SPEAKER_WEB = 3

export function metronomeSpeakerGain(muted: boolean): number {
  if (muted) return 0
  if (isHeadphoneOutputActive()) {
    return effectiveHeadphoneGain(1, false)
  }
  return Capacitor.isNativePlatform()
    ? METRONOME_GAIN_SPEAKER
    : METRONOME_GAIN_SPEAKER_WEB
}
