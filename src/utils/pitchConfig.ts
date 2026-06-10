/** Pitch detection bounds — instruments + singing voice (A440). */

/** Low bass voice / double bass ≈ 65 Hz. */
export const MIN_INSTRUMENT_HZ = 65

/** Upper singing voice / violin upper range. */
export const MAX_INSTRUMENT_HZ = 1100

export type TunerInstrument = 'voice' | 'strings' | 'brass'

export interface PitchTunerProfile {
  label: string
  description: string
  minHz: number
  maxHz: number
  clarityMin: number
  clarityMinMic: number
  frameSize: number
  frameSizeMic: number
  rmsGateDbMedia: number
  rmsGateDbMic: number
  attackFrames: number
  outlierCents: number
  holdMs: number
  holdMsMic: number
  smoothAlpha: number
  needleSmoothAlpha: number
  noteChangeSmoothAlpha: number
  graphSmoothWindow: number
  noteHysteresisCents: number
  /** Per-frame cap on trace vertical movement (reduces spikes). */
  traceStepLimitCents: number
  /** Exponential smoothing for the scrolling trace line. */
  traceSmoothAlpha: number
}

const VOICE_TUNER_PROFILE: PitchTunerProfile = {
  label: 'Voice',
  description: 'Softer gate and wider range for singing and speech.',
  minHz: 65,
  maxHz: 1100,
  clarityMin: 0.72,
  clarityMinMic: 0.82,
  frameSize: 4096,
  frameSizeMic: 8192,
  rmsGateDbMedia: -54,
  rmsGateDbMic: -48,
  attackFrames: 2,
  outlierCents: 18,
  holdMs: 320,
  holdMsMic: 480,
  smoothAlpha: 0.26,
  needleSmoothAlpha: 0.34,
  noteChangeSmoothAlpha: 0.48,
  graphSmoothWindow: 5,
  noteHysteresisCents: 28,
  traceStepLimitCents: 7,
  traceSmoothAlpha: 0.2,
}

const STRINGS_TUNER_PROFILE: PitchTunerProfile = {
  label: 'Strings',
  description: 'Stable tracking for violin, viola, cello, and bass — resists harmonic jumps.',
  minHz: 82,
  maxHz: 1400,
  clarityMin: 0.78,
  clarityMinMic: 0.88,
  frameSize: 8192,
  frameSizeMic: 16384,
  rmsGateDbMedia: -52,
  rmsGateDbMic: -44,
  attackFrames: 3,
  outlierCents: 14,
  holdMs: 380,
  holdMsMic: 520,
  smoothAlpha: 0.2,
  needleSmoothAlpha: 0.28,
  noteChangeSmoothAlpha: 0.38,
  graphSmoothWindow: 7,
  noteHysteresisCents: 34,
  traceStepLimitCents: 5,
  traceSmoothAlpha: 0.16,
}

const BRASS_TUNER_PROFILE: PitchTunerProfile = {
  label: 'Brass',
  description: 'Loud-signal profile for trumpet, trombone, horn, and tuba with vibrato tolerance.',
  minHz: 58,
  maxHz: 988,
  clarityMin: 0.75,
  clarityMinMic: 0.8,
  frameSize: 4096,
  frameSizeMic: 8192,
  rmsGateDbMedia: -50,
  rmsGateDbMic: -40,
  attackFrames: 2,
  outlierCents: 24,
  holdMs: 340,
  holdMsMic: 460,
  smoothAlpha: 0.3,
  needleSmoothAlpha: 0.4,
  noteChangeSmoothAlpha: 0.52,
  graphSmoothWindow: 5,
  noteHysteresisCents: 22,
  traceStepLimitCents: 9,
  traceSmoothAlpha: 0.22,
}

export const TUNER_INSTRUMENTS: TunerInstrument[] = ['voice', 'strings', 'brass']

export function getTunerProfile(instrument: TunerInstrument): PitchTunerProfile {
  switch (instrument) {
    case 'strings':
      return STRINGS_TUNER_PROFILE
    case 'brass':
      return BRASS_TUNER_PROFILE
    default:
      return VOICE_TUNER_PROFILE
  }
}

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
