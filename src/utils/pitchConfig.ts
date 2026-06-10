/** Pitch detection bounds for common wind and string instruments (A440). */

/** Double bass low E ≈ 41 Hz; practical floor with some headroom. */
export const MIN_INSTRUMENT_HZ = 40

/** Violin/piccolo upper practical range with headroom. */
export const MAX_INSTRUMENT_HZ = 2800

/** McLeod pitch method clarity gate (0–1). */
export const PITCH_CLARITY_MIN = 0.76

/** Analysis frame — larger window improves low-note stability. */
export const PITCH_FRAME_SIZE = 8192

/** Minimum RMS in dB before attempting pitch (quiet passages). */
export const PITCH_MIN_VOLUME_DB = -57

/** Hold last reading through brief gaps (ms). */
export const PITCH_HOLD_MS = 320

/** Smoothing factor for live frequency (0–1). */
export const PITCH_SMOOTH_ALPHA = 0.28

/** Smoothing for displayed cents needle (0–1). */
export const PITCH_CENTS_SMOOTH_ALPHA = 0.2

/** Note label sticks when still close to the previous note (cents from that pitch). */
export const NOTE_HYSTERESIS_CENTS = 38

/** UI readout refresh interval (ms). */
export const PITCH_READOUT_INTERVAL_MS = 100

/** Round displayed cents to this step. */
export const CENTS_DISPLAY_STEP = 2

/** Pitch history sample interval (ms). */
export const PITCH_HISTORY_INTERVAL_MS = 90

export const INSTRUMENT_RANGE_LABEL = 'A0–F7 · winds & strings'
