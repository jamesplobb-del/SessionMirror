/** Pitch detection bounds — instruments + singing voice (A440). */

/** Low bass voice / double bass ≈ 65 Hz. */
export const MIN_INSTRUMENT_HZ = 65

/** Upper singing voice / violin upper range. */
export const MAX_INSTRUMENT_HZ = 1100

/** McLeod pitch method clarity gate (0–1). */
export const PITCH_CLARITY_MIN = 0.74

/** Stricter clarity for live microphone (rejects room noise). */
export const PITCH_CLARITY_MIN_MIC = 0.86

/** Analysis frame — playback (lower latency). */
export const PITCH_FRAME_SIZE = 4096

/** Live mic — larger window for stability. */
export const PITCH_FRAME_SIZE_MIC = 8192

/** Minimum RMS in dB before attempting pitch. */
export const PITCH_MIN_VOLUME_DB = -58

/** RMS gate for playback analysis — ignore very quiet passages. */
export const PITCH_RMS_GATE_DB_MEDIA = -54

/** RMS gate for live mic — must be clearly above room noise. */
export const PITCH_RMS_GATE_DB_MIC = -46

/** Consecutive good frames required before showing pitch from silence. */
export const PITCH_ATTACK_FRAMES = 2

/** Reject same-note cents jumps larger than this (noise spikes). */
export const PITCH_OUTLIER_CENTS = 20

/** Hold last reading through brief gaps (ms). */
export const PITCH_HOLD_MS = 320

/** Longer hold for live mic when signal drops. */
export const PITCH_HOLD_MS_MIC = 480

/** Smoothing factor for live frequency (0–1, higher = snappier). */
export const PITCH_SMOOTH_ALPHA = 0.32

/** Needle / numeric readout smoothing while holding the same note. */
export const PITCH_NEEDLE_SMOOTH_ALPHA = 0.38

/** Snap toward new note cents quickly on note changes. */
export const PITCH_NOTE_CHANGE_SMOOTH_ALPHA = 0.62

/** Moving-average radius when drawing the trace curve (lower = sharper per-note). */
export const PITCH_GRAPH_SMOOTH_WINDOW = 2

/** Round displayed cents to this step. */
export const CENTS_DISPLAY_STEP = 1

/** UI cents readout refresh interval (ms). */
export const PITCH_READOUT_INTERVAL_MS = 36

/** Trace sample pushed each frame while live mic hears no pitch (chart floor). */
export const PITCH_SILENCE_FLOOR_CENTS = -50

/** Note label sticks until cents drift toward the next semitone boundary. */
export const NOTE_HYSTERESIS_CENTS = 24

export const INSTRUMENT_RANGE_LABEL = 'Voice · winds · strings'

export type PitchCanvasTheme = 'glass' | 'solid'
