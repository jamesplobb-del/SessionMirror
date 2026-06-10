/** Pitch detection bounds — instruments + singing voice (A440). */

/** Low bass voice / double bass ≈ 65 Hz. */
export const MIN_INSTRUMENT_HZ = 65

/** Upper singing voice / violin upper range. */
export const MAX_INSTRUMENT_HZ = 1100

/** McLeod pitch method clarity gate (0–1). */
export const PITCH_CLARITY_MIN = 0.72

/** Analysis frame — larger window improves low-note stability. */
export const PITCH_FRAME_SIZE = 8192

/** Minimum RMS in dB before attempting pitch. */
export const PITCH_MIN_VOLUME_DB = -58

/** Hold last reading through brief gaps (ms). */
export const PITCH_HOLD_MS = 280

/** Smoothing factor for live frequency (0–1, higher = snappier). */
export const PITCH_SMOOTH_ALPHA = 0.28

/** Needle / numeric readout smoothing (0–1, higher = snappier). */
export const PITCH_NEEDLE_SMOOTH_ALPHA = 0.24

/** Extra smoothing on note changes so cents do not snap. */
export const PITCH_NOTE_CHANGE_SMOOTH_ALPHA = 0.1

/** Continuous pitch trace smoothing (fractional MIDI). */
export const PITCH_TRACE_MIDI_ALPHA = 0.11

/** Slow anchor so the trace scrolls smoothly through large intervals. */
export const PITCH_ANCHOR_MIDI_ALPHA = 0.035

/** Moving-average radius applied when drawing the trace curve. */
export const PITCH_GRAPH_SMOOTH_WINDOW = 8

/** Round displayed cents to this step. */
export const CENTS_DISPLAY_STEP = 1

/** UI cents readout refresh interval (ms). */
export const PITCH_READOUT_INTERVAL_MS = 66

/** Note label sticks until cents drift toward the next semitone boundary. */
export const NOTE_HYSTERESIS_CENTS = 32

export const INSTRUMENT_RANGE_LABEL = 'Voice · winds · strings'

export type PitchCanvasTheme = 'glass' | 'solid'
