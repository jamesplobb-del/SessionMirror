import { Capacitor } from '@capacitor/core'
import { isHeadphoneOutputActive } from './headphoneOutput'
import { getSpeakerDefaultBusGain } from './speakerLoudnessNormalization'
import type { SpeakerLoudnessPreset } from './speakerLoudnessMastering'

/** Legacy brute-force bus multiplier when speaker mastering preset is Off. */
export const PLAYBACK_GAIN_NATIVE = 48
export const PLAYBACK_GAIN_WEB = 7
export const PLAYBACK_GAIN_MAX = 58

/** YouTube IFrame API volume is 0–100; peg non-zero slider values to API max. */
export const YOUTUBE_VOLUME_BOOST = 12
/** Minimum non-zero YouTube API volume — reference playback stays at API max. */
export const YOUTUBE_VOLUME_FLOOR = 100

let activeSpeakerLoudnessPreset: SpeakerLoudnessPreset = 'phone'

export function setActiveSpeakerLoudnessPreset(preset: SpeakerLoudnessPreset): void {
  activeSpeakerLoudnessPreset = preset
}

export function getActiveSpeakerLoudnessPreset(): SpeakerLoudnessPreset {
  return activeSpeakerLoudnessPreset
}

/**
 * Legacy speaker bus gain — only when Speaker Loudness preset is Off.
 * Clear/Loud/Max use measured normalization instead (see speakerLoudnessNormalization).
 */
export function effectiveSpeakerGain(
  volume: number,
  muted: boolean,
  forWebAudioBus = true,
): number {
  if (muted) return 0
  if (!forWebAudioBus) {
    return Math.min(1, Math.max(0, volume))
  }

  if (activeSpeakerLoudnessPreset !== 'off') {
    return 0
  }

  const multiplier = Capacitor.isNativePlatform() ? PLAYBACK_GAIN_NATIVE : PLAYBACK_GAIN_WEB
  return Math.min(Math.max(0, volume) * multiplier, PLAYBACK_GAIN_MAX)
}

/** Measured-normalization bus gain: totalBusGain × volume × limiterTrim. */
export function effectiveSpeakerBusGain(
  volume: number,
  muted: boolean,
  busGain: number,
  limiterTrim = 1,
): number {
  if (muted) return 0
  return Math.max(0, volume) * busGain * limiterTrim
}

/** @deprecated Use effectiveSpeakerBusGain — kept for legacy Off preset path. */
export function effectiveNormalizedSpeakerGain(
  volume: number,
  muted: boolean,
  baseGain: number,
  normalizationGain: number,
  limiterTrim = 1,
): number {
  if (muted) return 0
  return Math.max(0, volume) * baseGain * normalizationGain * limiterTrim
}

/**
 * Web Audio bus multiplier for HEADPHONE output only. The big speaker multiplier
 * brute-forces loudness on the weak iPhone speaker by clipping hard against the
 * destination — inaudible as distortion on the speaker, but harsh on headphones.
 * Headphones get a clean, near-unity gain so peaks don't clip (no brashness).
 */
export const PLAYBACK_GAIN_HEADPHONES = 1.5
export const PLAYBACK_GAIN_HEADPHONES_MAX = 1.9

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

/** Extra bus gain so metronome clicks are clearly audible on the iPhone speaker. */
export const METRONOME_MASTER_GAIN = 3.25

/** Web Audio metronome bus — moderate default when mastering on; legacy when Off. */
export function metronomeSpeakerGain(muted: boolean): number {
  if (muted) return 0
  let base: number
  if (isHeadphoneOutputActive()) {
    base = effectiveHeadphoneGain(1, false)
  } else {
    const preset = activeSpeakerLoudnessPreset
    if (preset === 'off') {
      base = effectiveSpeakerGain(1, false)
    } else if (preset === 'phone' || preset === 'extreme' || preset === 'insane') {
      base = getSpeakerDefaultBusGain('loud')
    } else {
      base = getSpeakerDefaultBusGain(preset)
    }
  }
  return Math.min(base * METRONOME_MASTER_GAIN, PLAYBACK_GAIN_MAX)
}
