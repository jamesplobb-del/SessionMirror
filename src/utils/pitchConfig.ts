/** Pitch detection bounds for common wind and string instruments (A440). */

/** Double bass low E ≈ 41 Hz; practical floor with some headroom. */
export const MIN_INSTRUMENT_HZ = 40

/** Violin/piccolo upper practical range with headroom. */
export const MAX_INSTRUMENT_HZ = 2800

/** McLeod pitch method clarity gate (0–1). Slightly relaxed for bowed/air tone. */
export const PITCH_CLARITY_MIN = 0.74

/** Analysis frame — larger window improves low-note stability. */
export const PITCH_FRAME_SIZE = 8192

/** Minimum RMS in dB before attempting pitch (quiet passages). */
export const PITCH_MIN_VOLUME_DB = -58

/** Hold last reading through brief gaps (ms). */
export const PITCH_HOLD_MS = 280

/** Smoothing factor for live frequency (0–1, higher = snappier). */
export const PITCH_SMOOTH_ALPHA = 0.38

/** Note label sticks until cents drift toward the next semitone boundary. */
export const NOTE_HYSTERESIS_CENTS = 32

export const INSTRUMENT_RANGE_LABEL = 'A0–F7 · winds & strings'
