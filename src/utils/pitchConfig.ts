/** Pitch detection bounds for common wind and string instruments (A440). */

/** Double bass low E ≈ 41 Hz; practical floor with some headroom. */
export const MIN_INSTRUMENT_HZ = 40

/** Violin/piccolo upper practical range with headroom. */
export const MAX_INSTRUMENT_HZ = 2800

/** McLeod pitch method clarity gate (0–1). Higher = fewer false detections. */
export const PITCH_CLARITY_MIN = 0.8

/** Analysis frame — larger window improves low-note stability. */
export const PITCH_FRAME_SIZE = 8192

/** Minimum RMS in dB before attempting pitch (quiet passages). */
export const PITCH_MIN_VOLUME_DB = -56

/** Hold last reading through brief gaps (ms). */
export const PITCH_HOLD_MS = 420

/** Smoothing factor for live frequency (0–1, lower = steadier note tracking). */
export const PITCH_SMOOTH_ALPHA = 0.16

/** Smoothing for displayed cents needle (0–1, lower = less jitter). */
export const PITCH_CENTS_SMOOTH_ALPHA = 0.11

/** Minimum time before the note label can change (ms). */
export const NOTE_MIN_HOLD_MS = 320

/** Note label sticks until cents drift toward the next semitone boundary. */
export const NOTE_HYSTERESIS_CENTS = 52

/** UI readout refresh interval (ms) — avoids flickering digits. */
export const PITCH_READOUT_INTERVAL_MS = 140

/** Round displayed cents to this step for musician-friendly readout. */
export const CENTS_DISPLAY_STEP = 3

/** Pitch history sample interval (ms) — smoother spectrogram trace. */
export const PITCH_HISTORY_INTERVAL_MS = 100

export const INSTRUMENT_RANGE_LABEL = 'A0–F7 · winds & strings'
